import { atom, read, update } from 'claude-code'
import { fallbackRegistry, lookupWindow, registryLoader } from './context-registry'
import type { AgentInfo, EngineInterface, Register, ThemeKey, Timer, TurnStepChunk, TurnStepResult } from 'claude-code'
import type { TokenSpeedActive, TokenSpeedContextInfo, TokenSpeedEffort, TokenSpeedModelStats, TokenSpeedRow,
  TokenSpeedSample, TokenSpeedSessionInfo, TokenSpeedSnapshot, TokenSpeedStatus, TokenSpeedWorkspace } from '../types'

const WINDOW_MS = 3000
const TICK_MS = 250
// Avg rolls over the last day; sample timestamps are clock epoch ms, so no timezone applies.
const AVG_WINDOW_MS = 24 * 60 * 60 * 1000
const loadRegistry = registryLoader()
let registry = fallbackRegistry()
function childContext(model: string | null, tokens: number | null = null): TokenSpeedContextInfo {
  const reading = lookupWindow(registry, model === null ? null : canonical(model))
  const window = reading.window
  return { tokens, window, percent: tokens === null || window === 0 ? null : Math.round(tokens * 100 / window),
    source: reading.source === 'configured' ? 'cli-input-window-config'
      : reading.source === 'official-default' ? 'cli-input-official-default'
        : reading.source === 'official-capacity' ? 'cli-input-official-capacity' : tokens === null ? 'unknown' : 'cli-input' }
}
const emptyContext = (): TokenSpeedContextInfo => ({ tokens: null, window: 0, percent: null, source: 'unknown' })
const row = (id: string): TokenSpeedRow => ({ id, description: '', running: false, currentModel: null,
  models: [], active: null, live: null, status: 'idle', seen: false, turnId: null, revision: 0,
  effort: null, effortSource: 'unknown', context: emptyContext() })
const emptySession = (): TokenSpeedSessionInfo => ({ context: emptyContext(), workspace: null })
const empty = (): TokenSpeedSnapshot => ({ version: 2, rows: [row('main')], session: emptySession() })
const snapshot = atom({ plugin: 'token-speed', key: 'snapshot' } as const, empty())

type LiveRequest = TokenSpeedActive & {
  loopId: string
  epoch: number
  chunks: { at: number; tokens: number }[]
  hasContent: boolean
}

// Only stream accumulators and lifecycle guards are local. Drawings read host state.
const liveRequests = new Map<string, LiveRequest>()
let timer: Timer | null = null
let tickBusy = false
let listBusy = false
let usageBusy = false
let repoBusy = false
let ticks = 0
let sequence = 0
let revision = 0
let epoch = 0

async function observe(work: () => Promise<unknown>): Promise<void> {
  try { await work() } catch { /* Meter failures never interrupt or repeat the actual request. */ }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const status = (value: unknown): TokenSpeedStatus => value === 'waiting' || value === 'streaming'
  || value === 'aborted' || value === 'error' || value === 'usage unavailable' ? value : 'idle'
function requestLog(value: unknown): TokenSpeedSample[] {
  if (!Array.isArray(value)) return []
  const log: TokenSpeedSample[] = []
  for (const item of value) {
    if (!object(item) || !finite(item.at) || !finite(item.tokens) || item.tokens < 0 || !finite(item.ms) || item.ms <= 0) continue
    log.push({ at: item.at, tokens: item.tokens, ms: item.ms })
  }
  return log
}
function stats(value: unknown, legacy = false): TokenSpeedModelStats[] {
  if (!Array.isArray(value)) return []
  const buckets: TokenSpeedModelStats[] = []
  for (const item of value) {
    if (!object(item) || typeof item.model !== 'string' || !finite(item.outputTokens) || item.outputTokens < 0
      || !finite(item.durationMs) || item.durationMs < 0 || !finite(item.samples) || item.samples < 0) continue
    // A v0.2 bucket carries no log; its average falls back to the aggregates until a new request.
    buckets.push({ model: item.model, outputTokens: item.outputTokens, durationMs: item.durationMs,
      samples: item.samples, lastApi: finite(item.lastApi) && item.lastApi >= 0 ? item.lastApi : null,
      ...(legacy || item.legacy === true ? { legacy: true as const }
        : Array.isArray(item.log) ? { log: requestLog(item.log) } : {}) })
  }
  return buckets
}
function activeValue(value: unknown): TokenSpeedActive | null {
  return object(value) && typeof value.id === 'string' && typeof value.turnId === 'string'
    && typeof value.model === 'string' && finite(value.startedAt)
    ? { id: value.id, turnId: value.turnId, model: value.model, startedAt: value.startedAt } : null
}
function effortValue(value: unknown): TokenSpeedEffort | null {
  if (typeof value === 'string' && ['low', 'medium', 'high', 'xhigh', 'max'].includes(value)) return value as TokenSpeedEffort
  return finite(value) && value >= 0 ? value : null
}
function contextInfo(value: unknown): TokenSpeedContextInfo {
  const held = object(value) ? value : {}
  return { tokens: finite(held.tokens) && held.tokens >= 0 ? held.tokens : null,
    window: finite(held.window) && held.window > 0 ? held.window : 0,
    percent: finite(held.percent) && held.percent >= 0 ? held.percent : null,
    source: held.source === 'session' || held.source === 'cli-input' || held.source === 'cli-input-window-config'
      || held.source === 'cli-input-official-default' || held.source === 'cli-input-official-capacity' ? held.source : 'unknown' }
}
function workspaceValue(value: unknown): TokenSpeedWorkspace | null {
  if (!object(value) || typeof value.name !== 'string' || !value.name) return null
  return { name: value.name, branch: typeof value.branch === 'string' && value.branch ? value.branch : null }
}
function sessionInfo(value: unknown): TokenSpeedSessionInfo {
  const held = object(value) ? value : {}
  return { context: contextInfo(held.context), workspace: workspaceValue(held.workspace) }
}
// Runtime validation also admits the v0.1 shape; response-model averages stay legacy buckets.
function normalize(value: unknown): TokenSpeedSnapshot {
  if (!object(value)) return empty()
  if (value.version !== 2 || !Array.isArray(value.rows)) {
    const main = row('main')
    main.models = stats(value.models, true)
    main.currentModel = typeof value.currentModel === 'string' ? value.currentModel : null
    main.active = activeValue(value.active)
    main.live = finite(value.live) ? value.live : null
    main.status = status(value.status)
    main.seen = value.seen === true || main.models.length > 0 || main.active !== null
    main.turnId = main.active?.turnId ?? null
    return { version: 2, rows: [main], session: sessionInfo(value.session) }
  }
  const rows: TokenSpeedRow[] = []
  for (const item of value.rows) {
    if (!object(item) || typeof item.id !== 'string' || rows.some(r => r.id === item.id)) continue
    rows.push({ id: item.id, description: typeof item.description === 'string' ? item.description : '',
      running: item.running === true, currentModel: typeof item.currentModel === 'string' ? item.currentModel : null,
      models: stats(item.models), active: activeValue(item.active), live: finite(item.live) ? item.live : null,
      status: status(item.status), seen: item.seen === true,
      turnId: typeof item.turnId === 'string' ? item.turnId : null,
      revision: finite(item.revision) ? item.revision : 0,
      effort: effortValue(item.effort),
      effortSource: item.effortSource === 'configured' || item.effortSource === 'request' || item.effortSource === 'applied'
        ? item.effortSource : 'unknown',
      context: item.id === 'main' ? contextInfo(item.context)
        : childContext(typeof item.currentModel === 'string' ? item.currentModel : null, contextInfo(item.context).tokens) })
  }
  return { version: 2, rows: [rows.find(r => r.id === 'main') ?? row('main'), ...rows.filter(r => r.id !== 'main')],
    session: sessionInfo(value.session) }
}
async function mutate($: EngineInterface, heldEpoch: number, change: (state: TokenSpeedSnapshot) => TokenSpeedSnapshot): Promise<void> {
  await update($, snapshot, raw => heldEpoch === epoch ? change(normalize(raw)) : normalize(raw))
}
const readState = async ($: EngineInterface): Promise<TokenSpeedSnapshot> => normalize(await read($, snapshot))
function changeRow(state: TokenSpeedSnapshot, id: string, change: (held: TokenSpeedRow) => TokenSpeedRow): TokenSpeedSnapshot {
  const present = state.rows.some(r => r.id === id)
  return { version: 2, session: state.session,
    rows: present ? state.rows.map(r => r.id === id ? change(r) : r) : [...state.rows, change(row(id))] }
}

// Only known configuration suffixes are removed; an existing provider prefix is evidence.
function canonical(model: string, previous: string | null = null): string {
  let normalized = model.trim()
  for (;;) {
    const trimmed = normalized.replace(/(?:\[1m\]|\((?:low|medium|high|xhigh|max)\)|:(?:low|medium|high|xhigh|max))$/i, '').trim()
    if (trimmed === normalized) break
    normalized = trimmed
  }
  if (!normalized) return 'unknown'
  if (!normalized.includes('/') && previous?.includes('/') && previous.slice(previous.lastIndexOf('/') + 1) === normalized) return previous
  return normalized
}
function suffixEffort(model: string): TokenSpeedEffort | null {
  // Only an explicit effort suffix is evidence; [1m] says nothing about effort/window.
  const match = model.trim().replace(/\[1m\]$/i, '').match(/(?:\((low|medium|high|xhigh|max)\)|:(low|medium|high|xhigh|max))$/i)
  return effortValue((match?.[1] ?? match?.[2])?.toLowerCase())
}
async function configuredEffort($: EngineInterface, model: string): Promise<TokenSpeedEffort | null> {
  try {
    const settings = await $.settings.read()
    const models = object(settings.modelSettings) ? settings.modelSettings : {}
    const selected = models[model] ?? models[canonical(model)]
    return effortValue(object(selected) ? selected.effortLevel : undefined)
      ?? effortValue(settings.effortLevel) ?? suffixEffort(model)
  } catch { return suffixEffort(model) }
}
const sameContext = (a: TokenSpeedContextInfo, b: TokenSpeedContextInfo): boolean =>
  a.tokens === b.tokens && a.window === b.window && a.percent === b.percent && a.source === b.source
async function refreshMain($: EngineInterface, heldEpoch: number): Promise<void> {
  const before = (await readState($)).rows.find(r => r.id === 'main') ?? row('main')
  let fullModel = before.currentModel
  try { fullModel = await $.session.model() } catch { /* Keep the observed request model when the host has none. */ }
  if (!fullModel || heldEpoch !== epoch) return
  const model = canonical(fullModel, before.currentModel)
  const effort = await configuredEffort($, fullModel)
    ?? (model === before.currentModel && before.effortSource === 'configured' ? before.effort : null)
  const expected = before.currentModel === model && (before.effortSource === 'request' || before.effortSource === 'applied')
    ? { effort: before.effort, source: before.effortSource } : { effort, source: effort === null ? 'unknown' : 'configured' }
  if (before.currentModel === model && before.effort === expected.effort && before.effortSource === expected.source && before.seen) return
  await mutate($, heldEpoch, state => changeRow(state, 'main', r => {
    if (r.revision !== before.revision) return r
    const changedModel = r.currentModel !== model
    const retained = !changedModel && (r.effortSource === 'request' || r.effortSource === 'applied')
    const value = retained ? r.effort : effort
    const source = retained ? r.effortSource : value === null ? 'unknown' : 'configured'
    if (!changedModel && r.effort === value && r.effortSource === source && r.seen) return r
    return { ...r, currentModel: model, effort: value, effortSource: source, seen: true }
  }))
}
const owns = (active: LiveRequest): boolean => active.epoch === epoch && liveRequests.get(active.loopId) === active
function stopTimer(): void {
  try { timer?.cancel() } catch { /* Disposal is observational too. */ }
  timer = null
  ticks = 0
}

async function reconcile($: EngineInterface, adoptExisting = false): Promise<void> {
  if (listBusy) return
  listBusy = true
  const heldEpoch = epoch
  try {
    const before = await readState($)
    const guards = new Map(before.rows.map(r => [r.id, r.revision]))
    const agents = await $.agent.list() // A rejected list must not finish any row.
    if (heldEpoch !== epoch) return
    const ended: { id: string; requestId: string | undefined }[] = []
    await mutate($, heldEpoch, state => {
      ended.length = 0 // update may retry after a version collision.
      let changed = state
      for (const agent of agents) {
        const held = changed.rows.find(r => r.id === agent.id)
        if (held && held.revision !== guards.get(agent.id)) continue
        if (agent.status === 'running') {
          changed = changeRow(changed, agent.id, r => ({ ...r, description: agent.description,
            running: held ? (adoptExisting ? true : r.running) : true,
            seen: true }))
        } else if (held && (agent.status === 'completed' || agent.status === 'failed' || agent.status === 'killed')) {
          ended.push({ id: agent.id, requestId: held.active?.id })
          changed = changeRow(changed, agent.id, r => ({ ...r, description: agent.description, running: false,
            active: null, live: null, status: agent.status === 'failed' ? 'error' : agent.status === 'killed' ? 'aborted' : 'idle' }))
        }
      }
      // Absence never finishes a newly spawned loop: only explicit terminal entries do.
      return changed
    })
    for (const item of ended) {
      if (liveRequests.get(item.id)?.id === item.requestId) liveRequests.delete(item.id)
    }
  } finally { listBusy = false }
}
function ensureTimer($: EngineInterface): void {
  if (timer) return
  timer = $.clock.every(TICK_MS, () => {
    ticks++
    if (ticks % 4 === 0) void observe(() => reconcile($))
    if (ticks % 4 === 2) void observe(() => pollUsage($))
    if (ticks % 20 === 10) void observe(() => refreshWorkspace($))
    if (tickBusy || liveRequests.size === 0) return
    tickBusy = true
    void observe(async () => {
      const active = [...liveRequests.values()]
      const heldEpoch = epoch
      const now = await $.clock.now() // One timestamp for every active loop in this batch.
      const values = new Map<string, { id: string; live: number | null; status: TokenSpeedStatus }>()
      for (const request of active) {
        if (!owns(request)) continue
        request.chunks = request.chunks.filter(chunk => chunk.at > now - WINDOW_MS)
        const elapsed = Math.min(WINDOW_MS, now - request.startedAt)
        values.set(request.loopId, { id: request.id,
          live: elapsed < TICK_MS ? null : request.chunks.reduce((sum, chunk) => sum + chunk.tokens, 0) * 1000 / elapsed,
          status: request.hasContent ? 'streaming' : 'waiting' })
      }
      await mutate($, heldEpoch, state => ({ version: 2, session: state.session, rows: state.rows.map(r => {
        const value = values.get(r.id)
        return value && r.active?.id === value.id ? { ...r, live: value.live, status: value.status } : r
      }) }))
    }).finally(() => { tickBusy = false })
  })
}
async function pollUsage($: EngineInterface): Promise<void> {
  if (usageBusy) return
  usageBusy = true
  const heldEpoch = epoch
  try {
    await observe(() => refreshMain($, heldEpoch))
    const held = (await $.session.usage()).context
    if (heldEpoch !== epoch || !object(held) || !finite(held.window) || held.window <= 0) return
    const tokens = finite(held.tokens) && held.tokens >= 0 ? held.tokens : null
    const measured = tokens !== null
    const read: TokenSpeedContextInfo = { tokens, window: held.window,
      percent: finite(held.percent) && held.percent >= 0 ? held.percent : null, source: 'session' }
    const before = await readState($)
    const current = (before.rows.find(r => r.id === 'main') ?? row('main')).context
    // A partial session reading must not erase a known measurement for the same window.
    const next = !measured && current.tokens !== null && current.window === held.window ? current : read
    if (sameContext(before.session.context, next) && sameContext(current, next)) return
    await mutate($, heldEpoch, state => {
      const changed = changeRow(state, 'main', r => sameContext(r.context, next) ? r : { ...r, context: next })
      return sameContext(state.session.context, next) ? changed : { ...changed, session: { ...state.session, context: next } }
    })
  } finally { usageBusy = false }
}
async function refreshWorkspace($: EngineInterface): Promise<void> {
  if (repoBusy) return
  repoBusy = true
  const heldEpoch = epoch
  try {
    let name: string
    let branch: string | null = null
    const repo = await $.session.repo()
    if (repo && repo.root) {
      name = folderName(repo.root)
      try {
        const git = await $.process.run(['git', 'branch', '--show-current'], { cwd: repo.root, timeoutMs: 2000 })
        if (git.exitCode === 0) branch = git.stdout.trim() || null // Empty output is a detached HEAD.
      } catch { /* A missing git never hides the workspace name. */ }
    } else {
      name = folderName(await $.session.root())
    }
    if (heldEpoch !== epoch) return
    const next: TokenSpeedWorkspace = { name, branch }
    await mutate($, heldEpoch, state => {
      const held = state.session.workspace
      return held?.name === next.name && held.branch === next.branch ? state
        : { version: 2, rows: state.rows, session: { ...state.session, workspace: next } }
    })
  } finally { repoBusy = false }
}

// Unicode code points, never UTF-16 units. Deliberately not a tokenizer.
function estimate(text: string): number {
  let tokens = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    const cjk = (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff)
      || (code >= 0xf900 && code <= 0xfaff) || (code >= 0x20000 && code <= 0x323af)
    tokens += cjk ? 1 : 0.25
  }
  return tokens
}
async function observeChunk($: EngineInterface, active: LiveRequest, chunk: TurnStepChunk): Promise<void> {
  const text = chunk.kind === 'text' || chunk.kind === 'thinking' ? chunk.text : chunk.kind === 'input' ? chunk.json : ''
  if (!text || !owns(active)) return
  const at = await $.clock.now()
  if (!owns(active)) return
  active.hasContent = true
  active.chunks = active.chunks.filter(item => item.at > at - WINDOW_MS)
  active.chunks.push({ at, tokens: estimate(text) })
}
function bucketFor(r: TokenSpeedRow, model: string): TokenSpeedModelStats {
  return r.models.find(bucket => bucket.model === model && !bucket.legacy)
    ?? { model, outputTokens: 0, durationMs: 0, samples: 0, lastApi: null }
}
async function finish($: EngineInterface, active: LiveRequest, result: TurnStepResult): Promise<void> {
  const endedAt = await $.clock.now()
  const durationMs = endedAt - active.startedAt
  const tokens = result.usage?.output_tokens
  const validUsage = typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0
  const completed = result.stopReason !== null
  const valid = completed && validUsage && Number.isFinite(durationMs) && durationMs > 0
  const inputs = result.usage && [result.usage.input_tokens, result.usage.cache_read_input_tokens,
    result.usage.cache_creation_input_tokens]
  const inputTokens = completed && inputs && inputs.every(n => finite(n) && n >= 0)
    ? inputs.reduce((sum, n) => sum + n, 0) : null
  await mutate($, active.epoch, state => changeRow(state, active.loopId, r => {
    if (r.active?.id !== active.id) return r
    const old = bucketFor(r, active.model)
    // The log prunes to the rolling day window; the aggregates stay all-time.
    const bucket = valid
      ? { ...old, log: withinWindow([...(old.log ?? []), { at: endedAt, tokens, ms: durationMs }], endedAt),
          outputTokens: old.outputTokens + tokens, durationMs: old.durationMs + durationMs, samples: old.samples + 1,
          lastApi: tokens * 1000 / durationMs }
      : { ...old, lastApi: null }
    return { ...r, models: [...r.models.filter(item => item.legacy || item.model !== active.model), bucket],
      context: active.loopId === 'main' ? r.context
        : childContext(active.model, inputTokens !== null && finite(inputTokens) ? inputTokens : null),
      active: null, live: null, status: valid ? 'idle' : 'usage unavailable' }
  }))
}
async function failed($: EngineInterface, active: LiveRequest, failure: TokenSpeedStatus): Promise<void> {
  await mutate($, active.epoch, state => changeRow(state, active.loopId, r => {
    if (r.active?.id !== active.id) return r
    const old = bucketFor(r, active.model)
    return { ...r, active: null, live: null, status: failure,
      models: [...r.models.filter(bucket => bucket.legacy || bucket.model !== active.model), { ...old, lastApi: null }] }
  }))
}
const rate = (value: number | null | undefined): string => value == null ? '—' : `${value.toFixed(1)} tok/s`
const average = (tokens: number, ms: number): number | null => ms > 0 ? tokens * 1000 / ms : null
function withinWindow(log: TokenSpeedSample[], now: number): TokenSpeedSample[] {
  return log.filter(sample => sample.at > now - AVG_WINDOW_MS)
}
function windowedAverage(bucket: TokenSpeedModelStats, now: number): number | null {
  // A migrated v0.2 bucket has no timestamps; its aggregates stand in until a new request.
  if (bucket.log === undefined) return average(bucket.outputTokens, bucket.durationMs)
  const held = withinWindow(bucket.log, now)
  const tokens = held.reduce((sum, sample) => sum + sample.tokens, 0)
  const ms = held.reduce((sum, sample) => sum + sample.ms, 0)
  return ms > 0 ? tokens * 1000 / ms : null
}
async function safeNow($: EngineInterface): Promise<number> {
  try { return await $.clock.now() } catch { return Number.MAX_SAFE_INTEGER }
}
const folderName = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || path
}
function shortId(id: string, rows: TokenSpeedRow[]): string {
  let length = Math.min(8, id.length)
  while (length < id.length && rows.some(r => r.id !== id && r.id.slice(0, length) === id.slice(0, length))) length++
  return id.slice(0, length)
}
const role = (r: TokenSpeedRow, rows: TokenSpeedRow[]): string => r.id === 'main' ? 'main' : `agent:${shortId(r.id, rows)}`
const statusColors: Record<TokenSpeedStatus, ThemeKey> = {
  waiting: 'inactive', streaming: 'inactive', idle: 'inactive',
  aborted: 'warning', error: 'error', 'usage unavailable': 'warning',
}

async function appliedEffort($: EngineInterface, heldEpoch: number, id: string, value: unknown): Promise<void> {
  const effort = effortValue(value)
  if (effort === null || heldEpoch !== epoch) return
  await mutate($, heldEpoch, state => changeRow(state, id, r => ({ ...r, effort, effortSource: 'applied' })))
}
const humanWindow = (window: number): string =>
  window >= 1e6 ? `${(window / 1e6).toFixed(1)}M` : window >= 1e3 ? `${Math.round(window / 1e3)}k` : `${window}`
const contextLabel = (context: TokenSpeedContextInfo): string => context.window > 0
  ? `${context.percent === null ? '—' : Math.round(context.percent)}%/${humanWindow(context.window)}`
  : context.tokens === null ? '—/?' : `${(context.tokens / 1000).toFixed(1)}k/?`
const displayModel = (model: string | null): string => model?.slice(model.lastIndexOf('/') + 1) ?? 'unknown'
// Terminal cells, not UTF-16 length. Combining marks/ZWJ consume no extra cell;
// the common East Asian and emoji ranges are wide (including ⚡).
function cellWidth(text: string): number {
  let width = 0
  let joined = false
  for (const char of text) {
    const n = char.codePointAt(0)!
    if (n === 0x200d) { joined = true; continue }
    if (/\p{Mark}/u.test(char) || n === 0xfe0f || n < 32 || n === 127) continue
    if (joined) { joined = false; continue }
    width += n >= 0x1100 && (n <= 0x115f || n === 0x2329 || n === 0x232a
      || (n >= 0x2e80 && n <= 0xa4cf && n !== 0x303f) || (n >= 0xac00 && n <= 0xd7a3)
      || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xfe10 && n <= 0xfe19)
      || (n >= 0xfe30 && n <= 0xfe6f) || (n >= 0xff00 && n <= 0xff60)
      || (n >= 0xffe0 && n <= 0xffe6) || (n >= 0x1f000 && n <= 0x1faff)
      || (n >= 0x20000 && n <= 0x3fffd)) || n === 0x26a1 ? 2 : 1
  }
  return width
}
const padEndTo = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - cellWidth(text)))
const padStartTo = (text: string, width: number): string => ' '.repeat(Math.max(0, width - cellWidth(text))) + text
function fitText(text: string, width: number): string {
  if (cellWidth(text) <= width) return text
  if (width <= 0) return ''
  let fitted = ''
  for (const char of text) {
    if (cellWidth(fitted + char) > width - 1) break
    fitted += char
  }
  return fitted + '…'
}

type CompactPart = { text: string; color: ThemeKey; bold?: boolean }
function compactParts(r: TokenSpeedRow, label: string, narrowLabel: string, model: string, effort: string,
  context: string, live: string, effortColor: ThemeKey, columns: number): CompactPart[] {
  let modelCells = cellWidth(model)
  let showModel = true
  let showEffort = true
  let showLive = true
  const parts = (): CompactPart[] => [
    { text: label, color: r.id === 'main' ? 'claude' : 'inactive', bold: r.id === 'main' },
    ...(showModel ? [{ text: fitText(model, modelCells), color: 'text' as const }] : []),
    ...(showEffort ? [{ text: effort, color: effortColor }] : []),
    { text: `C${context}`, color: r.context.window > 0 && r.context.percent !== null ? 'text' : 'inactive' },
    ...(showLive ? [{ text: `L${live}`, color: r.live === null ? 'inactive' as const : 'text' as const,
      bold: r.live !== null }] : []),
  ]
  const width = (): number => cellWidth(parts().map(part => part.text).join(' '))
  if (width() > columns) modelCells = Math.max(Math.min(4, modelCells), modelCells - (width() - columns))
  if (width() > columns) showModel = false
  if (width() > columns) showEffort = false
  if (width() > columns) context = r.context.window > 0
    ? `${r.context.percent === null ? '—' : Math.round(r.context.percent)}%` : '?'
  if (width() > columns && columns < 32) label = narrowLabel
  // Unusually long readings and tiny terminals may omit Live before clipping the essentials.
  if (width() > columns) showLive = false
  let remaining = columns
  return parts().map((part, index) => {
    const gap = index > 0 && remaining > 0 ? ' ' : ''
    const text = gap + fitText(part.text, Math.max(0, remaining - gap.length))
    remaining -= cellWidth(text)
    return { ...part, text }
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const rest = await next(e)
    await observe(async () => {
      registry = await loadRegistry(() => $.fs.read(`${$.plugin.root}/data/model-contexts.json`))
      await $.command.register({ name: 'tok-speed', description: '各代理独立按请求模型统计；主控 first，reset 清空本会话统计', argumentHint: '[reset]' }).catch(() => {})
      await mutate($, epoch, state => ({ version: 2, session: state.session, rows: state.rows.map(r => {
        revision = Math.max(revision, r.revision)
        return r.active && r.active.id !== liveRequests.get(r.id)?.id ? { ...r, active: null, live: null, status: 'aborted' } : r
      }) }))
      ensureTimer($)
      await reconcile($, true)
      await observe(() => refreshMain($, epoch))
      await observe(() => refreshWorkspace($))
    })
    return rest
  })
  on('session.end', async ($, e, next) => {
    epoch++
    liveRequests.clear()
    stopTimer()
    await observe(() => update($, snapshot, empty))
    return next(e)
  })
  on('agent.spawn', async ($, e, next) => {
    const heldEpoch = epoch
    const rest = await next(e) // Once only; metadata failure must not repeat a spawn.
    await observe(async () => {
      if (rest.deny !== undefined || !rest.agentId || heldEpoch !== epoch) return
      const id = rest.agentId
      // Remote workflow agents have no local list/loop. Do not invent rows for them.
      const agents: AgentInfo[] = await $.agent.list()
      const local = agents.find(agent => agent.id === id)
      await mutate($, heldEpoch, state => {
        const existing = state.rows.find(r => r.id === id)
        if (!existing && local?.status !== 'running') return state
        return changeRow(state, id, r => ({ ...r, description: e.description,
          currentModel: r.currentModel ?? canonical(rest.model),
          context: r.currentModel === null ? childContext(rest.model) : r.context,
          effort: r.currentModel === null ? suffixEffort(rest.model) : r.effort,
          effortSource: r.currentModel === null ? suffixEffort(rest.model) === null ? 'unknown' : 'configured' : r.effortSource,
          running: existing ? r.running : true, seen: true }))
      })
      ensureTimer($)
    })
    return rest
  })
  on('turn.step', async function* ($, e, next) {
    const heldEpoch = epoch
    const loopId = e.agentId ?? 'main'
    const startedRevision = ++revision
    let active: LiveRequest | null = null
    let completed = false
    let failureStatus: TokenSpeedStatus = 'aborted'
    await observe(async () => {
      // Even when clock.now fails, retain loop metadata, but never invent Live.
      let model = canonical(e.model)
      const requested = effortValue(e.effort)
      const fallback = requested === null
        ? loopId === 'main' ? await configuredEffort($, e.model) : suffixEffort(e.model) : null
      await mutate($, heldEpoch, state => changeRow(state, loopId, r => {
        model = canonical(e.model, r.currentModel)
        const effort = requested ?? fallback
        return { ...r, running: true, currentModel: model, seen: true, turnId: e.turnId,
          context: loopId === 'main' || model === r.currentModel ? r.context : childContext(model),
          revision: startedRevision, active: null, live: null, status: 'waiting', effort,
          effortSource: requested !== null ? 'request' : effort !== null ? 'configured' : 'unknown' }
      }))
      const startedAt = await $.clock.now()
      if (heldEpoch !== epoch) return
      const request: LiveRequest = { id: `${e.turnId}:${e.index}:${++sequence}`, turnId: e.turnId,
        model, startedAt, loopId, epoch: heldEpoch, chunks: [], hasContent: false }
      active = request
      liveRequests.set(loopId, request)
      await mutate($, heldEpoch, state => changeRow(state, loopId, r => r.revision !== startedRevision ? r : { ...r,
        active: { id: request.id, turnId: e.turnId, model: request.model, startedAt } }))
      ensureTimer($)
    })
    try {
      const stream = next(e)
      for await (const chunk of stream) {
        if (active) await observe(() => observeChunk($, active!, chunk))
        yield chunk
      }
      const result = await stream.result
      if (active) {
        if (next.signal.aborted) await observe(() => failed($, active!, 'aborted'))
        else {
          try { await finish($, active, result) }
          catch { await observe(() => failed($, active!, 'usage unavailable')) }
        }
      }
      completed = true
      return result
    } catch (error) {
      failureStatus = next.signal.aborted || (error instanceof Error && error.name === 'AbortError') ? 'aborted' : 'error'
      throw error
    } finally {
      if (active) {
        if (owns(active)) liveRequests.delete(loopId)
        if (!completed) await observe(() => failed($, active!, failureStatus))
      }
    }
  })
  on('turn.complete', async ($, e, next) => {
    const heldEpoch = epoch
    const rest = await next(e)
    await observe(async () => {
      const id = e.agentId ?? 'main'
      const active = liveRequests.get(id)
      if (active?.turnId === e.turnId) liveRequests.delete(id)
      const endedRevision = ++revision
      await mutate($, heldEpoch, state => {
        const held = state.rows.find(r => r.id === id)
        if (!held || (held.turnId !== e.turnId && !(id !== 'main' && held.turnId === null && held.running))) return state
        return changeRow(state, id, r => ({ ...r, running: false, active: null, live: null,
          turnId: e.turnId, revision: endedRevision,
          status: e.reason === 'error' ? 'error' : e.reason === 'aborted' ? 'aborted' : 'idle' }))
      })
    })
    // Turn usage is a turn total, never another request sample.
    return rest
  })
  on('classic.PostToolUse', async ($, e, next) => {
    const heldEpoch = epoch
    const rest = await next(e)
    await observe(() => appliedEffort($, heldEpoch, e.agent_id ?? 'main', e.effort?.level))
    return rest
  })
  on('classic.Stop', async ($, e, next) => {
    const heldEpoch = epoch
    const rest = await next(e)
    await observe(() => appliedEffort($, heldEpoch, e.agent_id ?? 'main', e.effort?.level))
    return rest
  })
  on('session.compact', async ($, e, next) => {
    const heldEpoch = epoch
    const rest = await next(e)
    if (e.trigger !== 'precompute' && !('skip' in rest)) await observe(() => mutate($, heldEpoch, state => {
      const changed = changeRow(state, e.agentId ?? 'main', r => ({ ...r,
        context: e.agentId === undefined ? emptyContext() : childContext(r.currentModel) }))
      return e.agentId === undefined ? { ...changed, session: { ...state.session, context: emptyContext() } } : changed
    }))
    return rest
  })
  on('command.run', { command: 'tok-speed' }, async ($, e) => {
    const args = e.args.trim()
    if (args && args !== 'reset') return { text: '用法：/tok-speed 或 /tok-speed reset' }
    if (args === 'reset') {
      let refused = liveRequests.size > 0
      await mutate($, epoch, state => {
        refused = refused || state.rows.some(r => r.active !== null)
        if (refused) return state
        return { version: 2, session: state.session, rows: state.rows.filter(r => r.id === 'main' || r.running).map(r => ({ ...r,
          models: [], active: null, live: null, seen: r.running, status: r.running ? 'waiting' : 'idle' })) }
      })
      return { text: refused ? '仍有代理请求在进行，无法 reset；请在请求结束后重试。' : '已重置本会话 token-speed 统计。' }
    }
    const state = await readState($)
    const now = await safeNow($)
    const provenance = state.rows.filter(r => r.id !== 'main').flatMap(r => {
      const reading = lookupWindow(registry, r.currentModel)
      return reading.sourceURL ? [`${role(r, state.rows)} · context source ${reading.sourceURL} · checked ${reading.date}`] : []
    })
    const lines = state.rows.flatMap(r => [
      `${role(r, state.rows)} · ${r.description || (r.id === 'main' ? '主控' : '代理')} · ${r.running ? 'running' : 'ended'} · ${r.currentModel ?? 'unknown'} · effort ${r.effort ?? '—'} (${r.effortSource}) · Ctx ${contextLabel(r.context)} (${r.context.source}) · Live ${r.live === null ? '—' : `~${rate(r.live)}`} · ${r.status}`,
      ...r.models.map(bucket => {
        const held = bucket.log === undefined ? null : withinWindow(bucket.log, now)
        const scope = held === null
          ? `累计 ${bucket.samples} 个有效请求 · ${bucket.outputTokens} tokens / ${(bucket.durationMs / 1000).toFixed(3)}s`
          : `24h ${held.length} 个请求 · ${held.reduce((sum, sample) => sum + sample.tokens, 0)} tokens / ${(held.reduce((sum, sample) => sum + sample.ms, 0) / 1000).toFixed(3)}s`
        return `${role(r, state.rows)} · ${bucket.model}${bucket.legacy ? ' [legacy v0.1 response model]' : ''} · Last ${rate(bucket.lastApi)} · Avg ${rate(windowedAverage(bucket, now))} · ${scope}`
      }),
    ])
    return { text: [
      'token-speed 0.3.2 · 各代理独立累计 · 主控 first',
      '各代理同一行显示模型、effort、Ctx、Live/Last/Avg（tok/s 只标一次）；工作区最后一行。effort 来源：request 为 turn.step 请求，applied 为 classic 实际档位，configured 为主控配置或明确模型后缀，unknown 为 —。主控 Ctx 来自 session.usage；子代理输入来自最近 CLI uncached+cache读写总量，窗口从 data/model-contexts.json 精确匹配模型尾名/aliases，明确 override 优先官方 default，来源分别 cli-input-window-config、cli-input-official-default 与 cli-input-official-capacity，均不冒充 API 实测窗口；未匹配模型显示 k/?。暗底块状条固定 10 格，每格 8 档共 80 视觉档位（相邻整数百分比可能落在同一档，数字仍为整数 1%），填充固定使用 theme `rate_limit_fill`，轨道为 `rate_limit_empty`，窄屏可省条；无占用读数显示 —%。',
      `context registry v${registry.version}${registry.fallback ? ' (load failed: confirmed overrides only)' : ''} · 优先实际 session 窗口、明确 override、官方 default（未给默认时明确 capacity）、未知；官方 max 仅元数据，不因 [1m] 自动选择。`,
      ...provenance,
      ...lines,
      ...(state.rows.some(r => r.models.length) ? [] : ['Last — · Avg — · 尚无本会话统计']),
      'Live：最近 3 秒收到的文本、thinking、工具 JSON 参数估算；CJK 每 Unicode code point 1 token，其余 0.25。分母 min(3 秒, 请求已耗时)，不足 250ms 为 —；停流 3 秒后为 0。~ 非 tokenizer 精确计数。无法观察的代理流为 —，不推算速度。',
      'Last/Avg：CLI usage.output_tokens / 请求全程耗时，包含 TTFT、thinking、网络与请求内停顿；排除请求之间的工具/用户空闲，非纯解码速度。Last 为该代理该模型最近一次有效请求；Avg 为最近 24 小时滚动窗口内该模型的有效 token 总数 / 有效耗时总和，按请求完成时间戳（clock epoch ms）判窗，与本地时区无关，出窗即弃。迁移自 v0.2 的无时间戳桶在首个新请求前退回全程累计口径；失败/中断、无有效 usage、耗时不大于 0 不入统计；有效 0 计入。CPA 缺字段可能被 CLI 归零，无法确认其来源；turn.complete usage 不重复累计。',
      '模型名：以请求 model 为准，去除末尾 [1m]、(high) 或 :high 等配置后缀；统计桶与命令保留已知渠道，UI 仅隐藏最后 / 之前的渠道，不推断渠道。同代理 bare 模型与已知渠道模型尾名相同时沿用渠道；usage.model 不改变标签或桶。旧 v0.1 response-model 均值标为 legacy，保留且不混入新的请求模型均值。',
      'UI 主控始终第一，活跃子代理按首次观察顺序每个一行；切换 view 不过滤。工具间隙保留行，Live —；结束立即隐藏，命令可查看历史。reload 保留统计、清除无法接管的旧流，以本 session agent.list 同步元数据；/clear 清空，reset 任意 active 请求时拒绝、工具间隙保留活跃代理元数据。',
    ].join('\n') }
  })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    const state = await readState($)
    if (e.props.hasSurvey || e.props.maxRows <= 0 || !state.rows.some(r => r.seen || r.running)) return rest
    const visible = state.rows.filter(r => r.id === 'main' || r.running)
    const { Box, Text } = $.ui.resolve(e)
    const now = await safeNow($)
    const budget = e.props.maxRows - visible.length
    const effortColors: Record<Exclude<TokenSpeedEffort, number>, ThemeKey> =
      { low: 'success', medium: 'planMode', high: 'warning', xhigh: 'error', max: 'error' }
    const workspace = state.session.workspace
    const labels = visible.map(r => r.id === 'main' ? '⚡ main' : `🌳 ${shortId(r.id, state.rows)}`)
    const models = visible.map(r => displayModel(r.currentModel))
    const efforts = visible.map(r => r.effort === null ? '—' : String(r.effort))
    const contexts = visible.map(r => contextLabel(r.context))
    const buckets = visible.map(r => r.models.find(item => item.model === r.currentModel && !item.legacy))
    const averages = buckets.map(bucket => bucket ? windowedAverage(bucket, now) : null)
    const number = (n: number | null | undefined): string => n == null ? '—' : n.toFixed(1)
    const lives = visible.map(r => r.live === null ? '—' : `~${number(r.live)}`)
    const lasts = buckets.map(bucket => number(bucket?.lastApi))
    const avgs = averages.map(number)
    const maxWidth = (values: string[], minimum = 0): number => Math.max(minimum, ...values.map(cellWidth))
    const multi = visible.length > 1
    const labelWidth = maxWidth(labels)
    let modelWidth = maxWidth(models)
    const originalModelWidth = modelWidth
    const effortWidth = maxWidth(efforts)
    const contextWidth = maxWidth(contexts)
    const liveWidth = maxWidth(lives, 5)
    const lastWidth = maxWidth(lasts, 5)
    const avgWidth = maxWidth(avgs, 5)
    const statusWidth = maxWidth(visible.map(r => r.status))
    const columns = Math.max(1, e.props.bodyColumns)
    let showStatus = true
    let showLast = true
    // Fixed 10-cell bar: 80 eighth-cell steps; no widening on wide terminals.
    let cells = 10
    const width = (bar: number): number => labelWidth + 3 + modelWidth + 3 + effortWidth
      + 7 + contextWidth + (bar ? bar + 1 : 0)
      + 8 + liveWidth + (showLast ? 8 + lastWidth : 0) + 7 + avgWidth + 6
      + (showStatus ? 3 + statusWidth : 0)
    // Keep a usable compact meter first; discard status, then Last, before the bar.
    if (width(cells) > columns) showStatus = false
    if (width(cells) > columns) showLast = false
    if (width(cells) > columns) cells = 0
    if (width(cells) > columns) modelWidth = Math.max(1, modelWidth - (width(cells) - columns))
    const compact = modelWidth < Math.min(4, originalModelWidth) || width(cells) > columns
    const workspaceLine = budget >= 1 && workspace
      ? <Text key="token-speed-workspace" color="inactive" wrap="truncate-end">
          {fitText(compact
            ? `⌂ ${workspace.branch ?? workspace.name}`
            : `⌂ ${workspace.name}${workspace.branch ? ` on ${workspace.branch}` : ''}`, e.props.bodyColumns)}
        </Text>
      : null
    const compactLabels = visible.map(r => r.id === 'main' ? '⚡ main' : `🌳 ${shortId(r.id, state.rows)}`)
    const narrowMain = visible.some(r => r.id === 'm') ? 'main' : 'm'
    const narrowLabels = visible.map(r => {
      if (r.id === 'main') return narrowMain
      const chars = Array.from(r.id)
      let length = 1
      while (length < chars.length && visible.some(other => other.id !== r.id
        && (other.id === 'main' ? narrowMain : other.id).startsWith(chars.slice(0, length).join('')))) length++
      return `🌳 ${chars.slice(0, length).join('')}`
    })
    const aligned = (text: string, size: number): string => multi ? padEndTo(text, size) : text
    return <Box flexDirection="column">
      {visible.map((r, index) => {
        const percent = r.context.percent
        const known = r.context.window > 0 && percent !== null
        const eighths = known ? Math.max(0, Math.min(cells * 8, Math.round(percent * cells * 8 / 100))) : 0
        const full = Math.floor(eighths / 8)
        const partial = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'][eighths % 8] ?? ''
        const fill = '█'.repeat(full) + partial
        const track = ' '.repeat(cells - full - (partial ? 1 : 0))
        const effortColor = r.effort === null ? 'inactive' : typeof r.effort === 'number' ? 'subtle' : effortColors[r.effort]
        if (compact) {
          const parts = compactParts(r, compactLabels[index] ?? '', narrowLabels[index] ?? '', models[index] ?? '',
            efforts[index] ?? '—', contexts[index] ?? '—/?', lives[index] ?? '—', effortColor, columns)
          return <Text key={`token-speed-${r.id}`} color="inactive" wrap="truncate-end">
            {parts.map((part, partIndex) => <Text key={`compact-${partIndex}`} color={part.color} bold={part.bold}>{part.text}</Text>)}
          </Text>
        }
        return <Text key={`token-speed-${r.id}`} color="inactive" wrap="truncate-end">
          <Text color={r.id === 'main' ? 'claude' : 'inactive'} bold={r.id === 'main'}>{aligned(labels[index] ?? '', labelWidth)}</Text>
          {' · '}<Text color="text">{aligned(fitText(models[index] ?? '', modelWidth), modelWidth)}</Text>
          {' · '}<Text color={effortColor}>{aligned(efforts[index] ?? '—', effortWidth)}</Text>
          {' · Ctx '}{cells === 0 ? null : <Text><Text key={`context-meter-${r.id}`} backgroundColor="rate_limit_empty"><Text color="rate_limit_fill">{fill}</Text>{track}</Text>{' '}</Text>}
          <Text color={known ? 'text' : 'inactive'}>{aligned(contexts[index] ?? '—/?', contextWidth)}</Text>
          {' · Live '}<Text color={r.live === null ? 'inactive' : 'text'} bold={r.live !== null}>{padStartTo(lives[index] ?? '—', liveWidth)}</Text>
          {showLast ? <Text>{' · Last '}<Text color={buckets[index]?.lastApi == null ? 'inactive' : 'text'}>{padStartTo(lasts[index] ?? '—', lastWidth)}</Text></Text> : null}
          {' · Avg '}<Text color={averages[index] == null ? 'inactive' : 'text'}>{padStartTo(avgs[index] ?? '—', avgWidth)}</Text>{' tok/s'}
          {showStatus ? <Text>{' · '}<Text color={statusColors[r.status]}>{r.status}</Text></Text> : null}
        </Text>
      })}
      {workspaceLine}
      {rest}
    </Box>
  })
}
