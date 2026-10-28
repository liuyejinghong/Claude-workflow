import { atom, read, update } from 'claude-code'
import { fallbackRegistry, lookupWindow, registryLoader } from './context-registry'
import { MAGPIE_METRIC, magpieOrigin, queryRows, requestModel, matchCandidates, uniqueMatches, usageCounts, rememberEvidence, pruneEvidence, SHARED_FINISH_MS } from './magpie'
import type { Evidence } from './magpie'
import type { AgentInfo, EngineInterface, Register, ThemeKey, Timer, TurnStepChunk, TurnStepResult } from 'claude-code'
import type { TokenSpeedActive, TokenSpeedContextInfo, TokenSpeedEffort, TokenSpeedMeasurementStatus, TokenSpeedModelStats, TokenSpeedRow,
  TokenSpeedSample, TokenSpeedSessionInfo, TokenSpeedSnapshot, TokenSpeedStatus, TokenSpeedWorkspace } from '../types'

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
  models: [], active: null, status: 'idle', seen: false, turnId: null, revision: 0,
  effort: null, effortSource: 'unknown', context: emptyContext() })
const emptySession = (): TokenSpeedSessionInfo => ({ context: emptyContext(), workspace: null })
const empty = (): TokenSpeedSnapshot => ({ version: 2, rows: [row('main')], session: emptySession() })
const snapshot = atom({ plugin: 'token-speed', key: 'snapshot' } as const, empty())

type ObservedRequest = TokenSpeedActive & {
  loopId: string
  epoch: number
  streaming: boolean
  cancelled: boolean
}

// Only stream accumulators and lifecycle guards are local. Drawings read host state.
const activeRequests = new Map<string, ObservedRequest>()
let timer: Timer | null = null
let listBusy = false
let usageBusy = false
let repoBusy = false
let ticks = 0
let sequence = 0
let revision = 0
let epoch = 0
let observationGeneration: string | null = null

async function observe(work: () => Promise<unknown>): Promise<void> {
  try { await work() } catch { /* Meter failures never interrupt or repeat the actual request. */ }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const status = (value: unknown): TokenSpeedStatus => value === 'waiting' || value === 'streaming'
  || value === 'aborted' || value === 'error' || value === 'usage unavailable' ? value : 'idle'
function requestLog(value: unknown): TokenSpeedSample[] {
  if (!Array.isArray(value)) return []
  const keys = new Set<string>(), steps = new Set<string>()
  return value.filter((item): item is TokenSpeedSample => {
    if (!(object(item) && finite(item.at) && finite(item.tokens) && Number.isSafeInteger(item.tokens)
      && item.tokens > 0 && finite(item.ms) && item.ms >= 100 && item.tokens * 1000 / item.ms <= 10000
      && typeof item.key === 'string' && !!item.key && typeof item.step === 'string' && !!item.step && finite(item.startedAt)
      && finite(item.finishedAt) && item.finishedAt >= item.startedAt && Math.abs(item.at - item.finishedAt) <= 2000
      && object(item.counts) && ['input', 'write', 'output', 'read'].every(key =>
        finite((item.counts as Record<string, unknown>)[key]) && Number.isSafeInteger((item.counts as Record<string, unknown>)[key])
        && ((item.counts as Record<string, unknown>)[key] as number) >= 0)
      && (item.counts.output as number) > 0 && item.tokens <= (item.counts.output as number))) return false
    if (keys.has(item.key) || steps.has(item.step)) return false
    keys.add(item.key); steps.add(item.step)
    return true
  })
}
const measurementStatuses = new Set<TokenSpeedMeasurementStatus>(['waiting', 'streaming', 'pending', 'measured',
  'failed', 'unmeasurable', 'ambiguous', 'unavailable'])
function latestSample(samples: TokenSpeedSample[], now = Infinity): TokenSpeedSample | undefined {
  return samples.reduce<TokenSpeedSample | undefined>((last, sample) => sample.at <= now
    && (!last || sample.at > last.at || sample.at === last.at && (sample.finishedAt ?? 0) > (last.finishedAt ?? 0)) ? sample : last, undefined)
}
function sampleRate(sample: TokenSpeedSample | undefined): number | null {
  return sample ? sample.tokens * 1000 / sample.ms : null
}
function stats(value: unknown): TokenSpeedModelStats[] {
  if (!Array.isArray(value)) return []
  // Earlier estimated metrics and unattested scalar Last values cannot be migrated.
  return value.flatMap(item => {
    if (!object(item) || typeof item.model !== 'string' || item.metric !== MAGPIE_METRIC) return []
    const log = requestLog(item.log)
    const last = requestLog([item.last])[0] ?? latestSample(log)
    return [{ model: item.model, metric: MAGPIE_METRIC, log, last,
      outputTokens: log.reduce((n, sample) => n + sample.tokens, 0),
      durationMs: log.reduce((n, sample) => n + sample.ms, 0), samples: log.length,
      latestStep: typeof item.latestStep === 'string' ? item.latestStep : undefined,
      latestStatus: measurementStatuses.has(item.latestStatus as TokenSpeedMeasurementStatus)
        ? item.latestStatus as TokenSpeedMeasurementStatus : log.some(sample => sample.step === item.latestStep) ? 'measured' : undefined,
      validationBatch: typeof item.validationBatch === 'string' ? item.validationBatch : undefined,
      lastApi: sampleRate(last) }]
  })
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
  return { context: contextInfo(held.context), workspace: workspaceValue(held.workspace),
    ...(typeof held.observationGeneration === 'string' ? { observationGeneration: held.observationGeneration } : {}),
    ...(finite(held.evidenceRetiredThrough) ? { evidenceRetiredThrough: held.evidenceRetiredThrough } : {}),
    ...(typeof held.configuredModel === 'string' ? { configuredModel: held.configuredModel } : {}) }
}
// Earlier state retains metadata, but only certified Magpie samples survive.
function normalize(value: unknown): TokenSpeedSnapshot {
  if (!object(value)) return empty()
  if (value.version !== 2 || !Array.isArray(value.rows)) {
    const main = row('main')
    main.models = stats(value.models)
    main.currentModel = typeof value.currentModel === 'string' ? value.currentModel : null
    main.active = activeValue(value.active)
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
      models: stats(item.models), active: activeValue(item.active),
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
const holdsLease = (state: TokenSpeedSnapshot): boolean => observationGeneration === null
  || state.session.observationGeneration === undefined || state.session.observationGeneration === observationGeneration
async function mutate($: EngineInterface, heldEpoch: number, change: (state: TokenSpeedSnapshot) => TokenSpeedSnapshot): Promise<void> {
  await update($, snapshot, raw => {
    const state = normalize(raw)
    return heldEpoch === epoch && holdsLease(state)
      ? change(observationGeneration ? { ...state, session: { ...state.session, observationGeneration } } : state) : state
  })
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
  // A session-pinned effort environment is live configuration the saved settings cannot see.
  // Read alone, in its own guard: an unreadable environment must not skip the settings.
  try {
    const envEffort = effortValue(await $.env.get('CLAUDE_CODE_EFFORT_LEVEL'))
    if (envEffort !== null) return envEffort
  } catch { /* Fall through: the saved settings are still the configuration of record. */ }
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
  const before = await readState($)
  const held = before.rows.find(r => r.id === 'main') ?? row('main')
  let fullModel: string
  try { fullModel = await $.session.model() } catch { return }
  if (!fullModel || heldEpoch !== epoch) return
  const configured = before.session.configuredModel
  const changed = configured !== undefined && configured !== fullModel
  // Only an actual configuration change overrides a request/fallback model.
  // On first observation, retain an already observed request (including reload).
  const model = changed || held.currentModel === null ? requestModel(fullModel) : held.currentModel
  const effort = await configuredEffort($, changed || model === requestModel(fullModel) ? fullModel : model)
    ?? (model === held.currentModel && held.effortSource === 'configured' ? held.effort : null)
  const retainsEffort = !changed && (held.effortSource === 'request' || held.effortSource === 'applied')
  if (configured === fullModel && held.currentModel === model && held.seen
    && (retainsEffort || held.effort === effort && held.effortSource === (effort === null ? 'unknown' : 'configured'))) return
  await mutate($, heldEpoch, state => {
    if (state.session.configuredModel !== configured) return state
    const main = state.rows.find(r => r.id === 'main') ?? row('main')
    if (main.revision !== held.revision) return state
    const updated = changeRow(state, 'main', r => {
      const retained = !changed && r.currentModel === model && (r.effortSource === 'request' || r.effortSource === 'applied')
      const value = retained ? r.effort : effort
      const source = retained ? r.effortSource : value === null ? 'unknown' : 'configured'
      return { ...r, currentModel: model, effort: value, effortSource: source, seen: true }
    })
    return { ...updated, session: { ...updated.session, configuredModel: fullModel } }
  })
}
const owns = (active: ObservedRequest): boolean => active.epoch === epoch && activeRequests.get(active.loopId) === active
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
            models: r.active ? requestStatus(r, r.active.model, r.active.id, 'failed') : r.models,
            active: null, status: agent.status === 'failed' ? 'error' : agent.status === 'killed' ? 'aborted' : 'idle' }))
        }
      }
      // Absence never finishes a newly spawned loop: only explicit terminal entries do.
      return changed
    })
    for (const item of ended) {
      if (activeRequests.get(item.id)?.id === item.requestId) {
        activeRequests.get(item.id)!.cancelled = true
        activeRequests.delete(item.id); evidenceRevision++
      }
    }
  } finally { listBusy = false }
}
function ensureTimer($: EngineInterface): void {
  if (timer) return
  timer = $.clock.every(TICK_MS, () => {
    ticks++
    if (ticks % 4 === 0) {
      void observe(() => reconcile($))
      void observe(() => pollMagpie($))
    }
    if (ticks % 4 === 2) void observe(() => pollUsage($))
    if (ticks % 20 === 10) void observe(() => refreshWorkspace($))
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

function bucketFor(r: TokenSpeedRow, model: string): TokenSpeedModelStats {
  return r.models.find(bucket => bucket.model === model && bucket.metric === MAGPIE_METRIC)
    ?? { model, metric: MAGPIE_METRIC, log: [], outputTokens: 0, durationMs: 0, samples: 0, lastApi: null }
}
function withBucket(r: TokenSpeedRow, bucket: TokenSpeedModelStats): TokenSpeedModelStats[] {
  return [...r.models.filter(item => item.model !== bucket.model), bucket]
}
function requestStatus(r: TokenSpeedRow, model: string | null, id: string | undefined,
  value: TokenSpeedMeasurementStatus): TokenSpeedModelStats[] {
  if (model === null || !id) return r.models
  const bucket = bucketFor(r, model)
  return bucket.latestStep !== id ? r.models : withBucket(r, { ...bucket, latestStatus: value })
}
async function finish($: EngineInterface, active: ObservedRequest, result: TurnStepResult): Promise<void> {
  const endedAt = await $.clock.now()
  const counts = usageCounts(result.usage)
  const completed = result.stopReason !== null
  const truncated = result.stopReason === 'max_tokens' || result.stopReason === 'model_context_window_exceeded'
  const inputs = result.usage && [result.usage.input_tokens, result.usage.cache_read_input_tokens,
    result.usage.cache_creation_input_tokens]
  const inputTokens = completed && inputs && inputs.every(n => finite(n) && n >= 0)
    ? inputs.reduce((sum, n) => sum + n, 0) : null
  const held = await readState($)
  if (active.epoch !== epoch || active.cancelled || !holdsLease(held)) return
  let measurement: TokenSpeedMeasurementStatus = !completed ? 'failed' : 'unmeasurable'
  if (completed && !truncated && counts && finite(endedAt) && endedAt >= active.startedAt) {
    const step = { id: active.id, loopId: active.loopId, model: active.model, startedAt: active.startedAt, finishedAt: endedAt, counts }
    await retireEvidence($, active.epoch, endedAt, step)
    if (active.epoch !== epoch || active.cancelled || !holdsLease(await readState($))) return
    measurement = rememberEvidence(evidence, pending, step, endedAt) ? 'pending' : 'unavailable'
    evidenceRevision++
  }
  await mutate($, active.epoch, state => changeRow(state, active.loopId, r => {
    const models = requestStatus(r, active.model, active.id, measurement)
    if (r.active?.id !== active.id) return models === r.models ? r : { ...r, models }
    return { ...r, models, context: active.loopId === 'main' ? r.context
      : childContext(active.model, inputTokens !== null && finite(inputTokens) ? inputTokens : null),
      active: null, status: !completed ? 'aborted' : counts ? 'idle' : 'usage unavailable' }
  }))
}
async function failed($: EngineInterface, active: ObservedRequest, failure: TokenSpeedStatus): Promise<void> {
  await mutate($, active.epoch, state => changeRow(state, active.loopId, r => {
    const models = requestStatus(r, active.model, active.id, failure === 'usage unavailable' ? 'unavailable' : 'failed')
    if (r.active?.id !== active.id) return models === r.models ? r : { ...r, models }
    return { ...r, active: null, status: failure, models }
  }))
}

const evidence = new Map<string, Evidence>()
const pending = new Map<string, { attempts: number; due: number }>()
let evidenceRevision = 0
let sessionId: string | null = null
let flight: object | null = null
function invalidateMeasurements(): void {
  epoch++; evidenceRevision++
  pending.clear(); evidence.clear(); sessionId = null
  // Keep the physical curl/state flight locked until it settles; lifecycle and
  // lease guards discard stale work even when the host call is already in flight.
}
function retainedLastIds(state: TokenSpeedSnapshot): Set<string> {
  return new Set(state.rows.flatMap(r => r.models.flatMap(bucket => bucket.last?.step ? [bucket.last.step] : [])))
}
/** Save the retirement boundary before forgetting competitors. Failed writes or
 * concurrent observations leave the working index intact, including across reload.
 */
async function retireEvidence($: EngineInterface, heldEpoch: number, now: number, incoming?: Evidence,
  current: () => boolean = () => true): Promise<number | null> {
  const heldRevision = evidenceRevision, removed = new Map<string, Evidence>()
  const valid = (): boolean => heldEpoch === epoch && heldRevision === evidenceRevision && current()
  if (!valid()) return null
  if (![...evidence].some(([id, step]) => !pending.has(id) && step.finishedAt <= now - AVG_WINDOW_MS)) return heldRevision
  let boundary = -Infinity
  await update($, snapshot, raw => {
    removed.clear(); boundary = -Infinity
    const state = normalize(raw)
    // update retries CAS collisions internally. Throw to stop that loop as soon
    // as this attempt expires or loses ownership, before issuing another write.
    if (!valid() || !holdsLease(state)) throw new Error('stale evidence retirement')
    const kept = new Map(evidence)
    boundary = pruneEvidence(kept, pending, now, retainedLastIds(state), incoming)
    for (const [id, step] of evidence) if (!kept.has(id)) removed.set(id, step)
    return finite(boundary) ? { ...state, session: { ...state.session, ...(observationGeneration ? { observationGeneration } : {}),
      evidenceRetiredThrough: Math.max(state.session.evidenceRetiredThrough ?? -Infinity, boundary) } } : state
  })
  if (!valid()) return null
  const committed = await readState($)
  if (!valid() || !holdsLease(committed)
    || (committed.session.evidenceRetiredThrough ?? -Infinity) < boundary) return null
  if (removed.size) {
    for (const [id, step] of removed) if (evidence.get(id) === step && !pending.has(id)) evidence.delete(id)
    evidenceRevision++
  }
  return evidenceRevision
}
/** Use the CAS callback's current host proofs, without restoring old Last into
 * the bounded working index. Out-of-coverage proofs still compete for rows.
 */
function matchingEvidence(state: TokenSpeedSnapshot): Evidence[] {
  const steps = new Map(evidence)
  for (const r of state.rows) for (const bucket of r.models) {
    for (const sample of [...(bucket.log ?? []), ...(bucket.last ? [bucket.last] : [])]) {
      if (sample.step && sample.key && sample.counts && finite(sample.startedAt) && finite(sample.finishedAt) && !steps.has(sample.step)) {
        steps.set(sample.step, { id: sample.step, key: sample.key, loopId: r.id, model: bucket.model,
          startedAt: sample.startedAt, finishedAt: sample.finishedAt, counts: sample.counts })
      }
    }
  }
  return [...steps.values()]
}
const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
async function pollMagpie($: EngineInterface): Promise<void> {
  if (flight || !pending.size || !sessionId) return
  const heldEpoch = epoch, heldSession = sessionId
  const now = await $.clock.now()
  if (!finite(now) || flight || !pending.size || sessionId !== heldSession || heldEpoch !== epoch) return
  // One start-time group per flight. Backoff lets independent recent groups pass
  // an over-budget long request; equal deadlines prefer the most recent group.
  const ready = [...pending].filter(([id, value]) => value.due <= now && evidence.has(id))
    .sort((a, b) => a[1].due - b[1].due || evidence.get(b[0])!.startedAt - evidence.get(a[0])!.startedAt)
  const first = ready[0]
  if (!first) return
  const start = evidence.get(first[0])!.startedAt
  const due = ready.filter(([id]) => Math.abs(evidence.get(id)!.startedAt - start) <= 5000)
  const steps = new Map(due.map(([id]) => [id, evidence.get(id)!]))
  const earliest = Math.min(...[...steps.values()].map(step => step.startedAt))
  const group = new Set(due.map(([id]) => id))
  const token = {}
  let heldRevision = evidenceRevision
  const batch = `${observationGeneration}:${heldEpoch}:${++sequence}`
  flight = token
  let expired = false
  const timeout = $.clock.after(4000, () => { expired = true })
  const current = (): boolean => !expired && heldEpoch === epoch && sessionId === heldSession
    && flight === token && heldRevision === evidenceRevision
    && due.every(([id, value]) => pending.get(id) === value && evidence.get(id) === steps.get(id))
  const changes = new Map<string, { before: TokenSpeedModelStats; after: TokenSpeedModelStats }>()
  let settled = false, wrote = false
  try {
    for (const [, value] of due) { value.attempts++; value.due = now + Math.min(16000, 1000 * 2 ** value.attempts) }
    if (!holdsLease(await readState($)) || !current()) return
    const retiredRevision = await retireEvidence($, heldEpoch, now, undefined, current)
    if (retiredRevision === null) return
    // Only retirement's own deletion may advance this flight's evidence version.
    // Concurrent observations still invalidate it; they never refresh its budget.
    heldRevision = retiredRevision
    if (!current()) return
    const origin = await magpieOrigin($)
    if (!origin || !current()) return
    const queried = await queryRows($, origin, heldSession, earliest, now, current)
    if (!current()) return
    const accepted = new Map<string, string>()
    await mutate($, heldEpoch, state => {
      changes.clear(); accepted.clear(); wrote = false
      if (!current()) return state
      // Synchronous with this CAS snapshot; a collision recomputes all host proofs.
      const steps = matchingEvidence(state), byId = new Map(steps.map(step => [step.id, step]))
      const candidates = matchCandidates(steps, queried.rows)
      const matches = uniqueMatches(steps, queried.rows, candidates)
      const covered = new Set(steps.filter(step => step.startedAt >= queried.coveredFrom && step.finishedAt <= now).map(step => step.id))
      const retiredThrough = state.session.evidenceRetiredThrough ?? -Infinity
      const valid = new Map([...matches].filter(([id, gateway]) => {
        const step = byId.get(id)!
        return covered.has(id) && (!pending.has(id) || step.finishedAt > retiredThrough + SHARED_FINISH_MS)
          && (!step.key || step.key === gateway.key) && gateway.measured !== null && gateway.finishedAt <= now
          && ![...activeRequests.values()].some(active => active.loopId === (gateway.subagent || 'main')
            && active.model === gateway.model && active.startedAt <= gateway.startedAt)
      }))
      const outcome = (id: string): TokenSpeedMeasurementStatus => {
        if (valid.has(id)) return 'measured'
        const set = candidates.get(id) ?? []
        if (!set.length) return 'unavailable'
        if (set.length > 1 || !matches.has(id)) return 'ambiguous'
        return matches.get(id)?.measured === null ? 'unmeasurable' : 'unavailable'
      }
      const additions = new Map<string, TokenSpeedSample[]>()
      for (const [id, gateway] of valid) {
        const step = byId.get(id)!
        if (!group.has(id) || !pending.has(id) || !gateway.measured) continue
        const owner = JSON.stringify([step.loopId, step.model]), samples = additions.get(owner) ?? []
        samples.push({ at: gateway.finishedAt, tokens: gateway.measured.tokens, ms: gateway.measured.ms,
          key: gateway.key, step: id, startedAt: step.startedAt, finishedAt: step.finishedAt, counts: step.counts })
        additions.set(owner, samples); accepted.set(id, gateway.key)
      }
      wrote = true
      return { ...state, rows: state.rows.map(r => ({ ...r, models: r.models.map(bucket => {
        const owner = JSON.stringify([r.id, bucket.model])
        const trustworthy = (sample: TokenSpeedSample): boolean => {
          if (!sample.step || !covered.has(sample.step)) return true
          const step = byId.get(sample.step)
          return !!step && sample.key === step.key && valid.get(step.id)?.key === sample.key
        }
        let log = withinWindow(bucket.log ?? [], now).filter(trustworthy)
        for (const sample of additions.get(owner) ?? []) if (!log.some(held => held.key === sample.key)) log = [...log, sample]
        const last = latestSample([...log, ...(bucket.last && trustworthy(bucket.last) ? [bucket.last] : [])], now)
        const latestStatus = bucket.latestStep && covered.has(bucket.latestStep)
          && (group.has(bucket.latestStep) || bucket.latestStatus === 'measured') ? outcome(bucket.latestStep) : bucket.latestStatus
        const after = { ...bucket, log, last, latestStatus,
          outputTokens: log.reduce((n, s) => n + s.tokens, 0), durationMs: log.reduce((n, s) => n + s.ms, 0),
          samples: log.length, lastApi: sampleRate(last) }
        if (sameValue(after, bucket)) return bucket
        after.validationBatch = batch
        changes.set(owner, { before: bucket, after })
        return after
      }) })) }
    })
    const committed = await readState($)
    if (!current()) {
      await mutate($, heldEpoch, state => ({ ...state, rows: state.rows.map(r => ({ ...r,
        models: r.models.map(bucket => {
          const changed = changes.get(JSON.stringify([r.id, bucket.model]))
          if (!changed || bucket.validationBatch !== batch) return bucket
          const { before, after } = changed
          const restored = { ...bucket, validationBatch: before.validationBatch }
          // Later lifecycle writes may keep our batch tag. Restore only fields
          // this batch changed and which still equal this batch's result.
          for (const key of ['log', 'last', 'outputTokens', 'durationMs', 'samples', 'lastApi', 'latestStatus'] as const) {
            if (key === 'latestStatus' && bucket.latestStep !== after.latestStep) continue
            if (!sameValue(before[key], after[key]) && sameValue(bucket[key], after[key])) Object.assign(restored, { [key]: before[key] })
          }
          return restored
        }) })) }))
      return
    }
    if (!wrote || !holdsLease(committed)) return
    settled = true
    for (const [id, key] of accepted) {
      const step = evidence.get(id)
      if (!step || !committed.rows.some(r => r.id === step.loopId && r.models.some(bucket =>
        bucket.model === step.model && bucket.validationBatch === batch
        && (bucket.log?.some(sample => sample.step === id && sample.key === key)
          || bucket.last?.step === id && bucket.last.key === key)))) continue
      step.key = key
      pending.delete(id); evidenceRevision++
    }
  } finally {
    timeout.cancel()
    try {
      if (heldEpoch === epoch && sessionId === heldSession) {
        for (const [id, value] of due) if (pending.get(id) === value && value.attempts >= 5) { pending.delete(id); evidenceRevision++ }
        if (!settled) await mutate($, heldEpoch, state => ({ ...state, rows: state.rows.map(r => ({ ...r,
          models: r.models.map(bucket => bucket.latestStep && group.has(bucket.latestStep)
            && (bucket.latestStatus === 'pending' || bucket.latestStatus === 'unavailable')
            ? { ...bucket, latestStatus: 'unavailable' } : bucket) })) }))
      }
    } finally { if (flight === token) flight = null }
  }
}
const rate = (value: number | null | undefined): string => value == null ? '—' : `${value.toFixed(1)} tok/s`
function withinWindow(log: TokenSpeedSample[], now: number): TokenSpeedSample[] {
  return log.filter(sample => sample.at > now - AVG_WINDOW_MS && sample.at <= now)
}
type ModelAverage = { tokens: number; ms: number; samples: number }
function modelAverages(state: TokenSpeedSnapshot, now: number): Map<string, ModelAverage> {
  const averages = new Map<string, ModelAverage>(), keys = new Set<string>(), steps = new Set<string>()
  for (const r of state.rows) for (const bucket of r.models) {
    if (bucket.metric !== MAGPIE_METRIC) continue
    for (const sample of withinWindow(bucket.log ?? [], now)) {
      const key = JSON.stringify([r.id, bucket.model, sample.key]), step = JSON.stringify([r.id, bucket.model, sample.step])
      if (!sample.key || !sample.step || keys.has(key) || steps.has(step)) continue
      keys.add(key); steps.add(step)
      const sum = averages.get(bucket.model) ?? { tokens: 0, ms: 0, samples: 0 }
      sum.tokens += sample.tokens; sum.ms += sample.ms; sum.samples++
      averages.set(bucket.model, sum)
    }
  }
  return averages
}
const averageRate = (sum: ModelAverage | undefined): number | null => sum && sum.ms > 0 ? sum.tokens * 1000 / sum.ms : null
const lastRate = (bucket: TokenSpeedModelStats | undefined, now: number): number | null =>
  bucket ? sampleRate(latestSample([...(bucket.log ?? []), ...(bucket.last ? [bucket.last] : [])], now)) : null
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
  context: string, last: string, avg: string, effortColor: ThemeKey, columns: number): CompactPart[] {
  let modelCells = cellWidth(model), showModel = true, showEffort = true, fullNames = true, showRates = true
  const parts = (): CompactPart[] => [
    { text: label, color: r.id === 'main' ? 'claude' : 'inactive', bold: r.id === 'main' },
    ...(showModel ? [{ text: fitText(model, modelCells), color: 'text' as const }] : []),
    ...(showEffort ? [{ text: effort, color: effortColor }] : []),
    { text: `C${context}`, color: r.context.window > 0 && r.context.percent !== null ? 'text' : 'inactive' },
    ...(showRates ? [{ text: `${fullNames ? 'Last ' : 'L'}${last}`, color: last === '—' ? 'inactive' as const : 'text' as const },
      { text: `${fullNames ? 'Avg ' : 'A'}${avg}`, color: avg === '—' ? 'inactive' as const : 'text' as const }] : []),
  ]
  const width = (): number => cellWidth(parts().map(part => part.text).join(' '))
  if (width() > columns) fullNames = false
  if (width() > columns) modelCells = Math.max(Math.min(4, modelCells), modelCells - (width() - columns))
  if (width() > columns) showModel = false
  if (width() > columns) showEffort = false
  if (width() > columns) context = r.context.window > 0
    ? `${r.context.percent === null ? '—' : Math.round(r.context.percent)}%` : '?'
  if (width() > columns && columns < 32) label = narrowLabel
  if (width() > columns && columns < 32 && label.startsWith('🌳 ')) label = label.slice(3)
  if (width() > columns) showRates = false
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
    const heldEpoch = epoch
    const rest = await next(e)
    await observe(async () => {
      if (heldEpoch !== epoch) return
      if (observationGeneration === null) {
        const now = await $.clock.now()
        if (heldEpoch !== epoch) return
        observationGeneration = `${now}:${Math.random()}`
        const lease = observationGeneration
        await update($, snapshot, raw => {
          const state = normalize(raw)
          return { ...state, session: { ...state.session, observationGeneration: lease } }
        })
      }
      registry = await loadRegistry(() => $.fs.read(`${$.plugin.root}/data/model-contexts.json`))
      await $.command.register({ name: 'tok-speed', description: '各代理 Last；本会话同请求模型共享24h Avg；reset 清空统计', argumentHint: '[reset]' }).catch(() => {})
      await mutate($, heldEpoch, state => ({ version: 2, session: state.session, rows: state.rows.map(r => {
        revision = Math.max(revision, r.revision)
        return r.active && r.active.id !== activeRequests.get(r.id)?.id
          ? { ...r, models: requestStatus(r, r.active.model, r.active.id, 'failed'), active: null, status: 'aborted' } : r
      }) }))
      const heldSession = await $.session.id()
      const restored = await readState($)
      if (heldEpoch !== epoch || !holdsLease(restored)) return
      sessionId = heldSession
      const restoredAt = await $.clock.now()
      if (heldEpoch !== epoch || !holdsLease(await readState($))) return
      // Restore proofs before retirement, so its persisted boundary also covers
      // expired log entries/Last which a later host write may supersede.
      for (const r of restored.rows) for (const bucket of r.models) for (const sample of [...(bucket.log ?? []), ...(bucket.last ? [bucket.last] : [])]) {
        if (sample.step && sample.key && sample.counts && finite(sample.startedAt) && finite(sample.finishedAt)
          && !evidence.has(sample.step)) {
          evidence.set(sample.step, { id: sample.step, key: sample.key, loopId: r.id, model: bucket.model,
            startedAt: sample.startedAt, finishedAt: sample.finishedAt, counts: sample.counts })
          evidenceRevision++
        }
      }
      await retireEvidence($, heldEpoch, restoredAt)
      ensureTimer($)
      await reconcile($, true)
      await observe(() => refreshMain($, heldEpoch))
      await observe(() => refreshWorkspace($))
    })
    return rest
  })
  on('session.end', async ($, e, next) => {
    invalidateMeasurements()
    activeRequests.clear()
    stopTimer()
    await observe(() => update($, snapshot, () => { const state = empty();
      return { ...state, session: { ...state.session, ...(observationGeneration ? { observationGeneration } : {}) } } }))
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
    const requestId = `${e.turnId}:${e.index}:${startedRevision}:${++sequence}`
    let active: ObservedRequest | null = null
    let completed = false
    let failureStatus: TokenSpeedStatus = 'aborted'
    await observe(async () => {
      // Preserve metadata even if timing evidence cannot be obtained.
      let model = canonical(e.model)
      const requested = effortValue(e.effort)
      const fallback = requested === null
        ? loopId === 'main' ? await configuredEffort($, e.model) : suffixEffort(e.model) : null
      await mutate($, heldEpoch, state => changeRow(state, loopId, r => {
        model = requestModel(e.model)
        const effort = requested ?? fallback
        return { ...r, running: true, currentModel: model, seen: true, turnId: e.turnId,
          context: loopId === 'main' || model === r.currentModel ? r.context : childContext(model),
          revision: startedRevision, models: withBucket(r, { ...bucketFor(r, model), latestStep: requestId, latestStatus: 'waiting' }), active: null, status: 'waiting', effort,
          effortSource: requested !== null ? 'request' : effort !== null ? 'configured' : 'unknown' }
      }))
      const startedAt = await $.clock.now()
      const heldSession = await $.session.id()
      const held = await readState($)
      if (!finite(startedAt) || heldEpoch !== epoch || !holdsLease(held)
        || held.rows.find(r => r.id === loopId)?.revision !== startedRevision) return
      sessionId = heldSession
      const request: ObservedRequest = { id: requestId, turnId: e.turnId,
        model, startedAt, loopId, epoch: heldEpoch, streaming: false, cancelled: false }
      active = request
      activeRequests.set(loopId, request); evidenceRevision++
      await mutate($, heldEpoch, state => changeRow(state, loopId, r => r.revision !== startedRevision ? r : { ...r,
        models: withBucket(r, { ...bucketFor(r, model), latestStep: request.id, latestStatus: 'waiting' }),
        active: { id: request.id, turnId: e.turnId, model: request.model, startedAt } }))
      ensureTimer($)
    })
    if (!active) await observe(() => mutate($, heldEpoch, state => changeRow(state, loopId, r =>
      r.revision !== startedRevision ? r : { ...r,
        models: requestStatus(r, r.currentModel, requestId, 'unavailable'), status: 'usage unavailable' })))
    try {
      const stream = next(e)
      for await (const chunk of stream) {
        if (active && !(active as ObservedRequest).streaming && owns(active) && (chunk.kind === 'tool' || (chunk.kind === 'text' || chunk.kind === 'thinking') && chunk.text
          || chunk.kind === 'input' && chunk.json)) {
          const held = active as ObservedRequest
          held.streaming = true
          await observe(() => mutate($, held.epoch, state => changeRow(state, held.loopId,
            r => r.active?.id === held.id && r.status === 'waiting' ? { ...r, status: 'streaming',
              models: requestStatus(r, held.model, held.id, 'streaming') } : r)))
        }
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
        if (owns(active)) { activeRequests.delete(loopId); evidenceRevision++ }
        if (!completed) await observe(() => failed($, active!, failureStatus))
      }
    }
  })
  on('turn.complete', async ($, e, next) => {
    const heldEpoch = epoch
    const rest = await next(e)
    await observe(async () => {
      const id = e.agentId ?? 'main'
      const active = activeRequests.get(id)
      if (active?.turnId === e.turnId) { active.cancelled = true; activeRequests.delete(id); evidenceRevision++ }
      const endedRevision = ++revision
      await mutate($, heldEpoch, state => {
        const held = state.rows.find(r => r.id === id)
        if (!held || (held.turnId !== e.turnId && !(id !== 'main' && held.turnId === null && held.running))) return state
        return changeRow(state, id, r => ({ ...r, running: false, active: null,
          turnId: e.turnId, revision: endedRevision,
          models: r.active ? requestStatus(r, r.active.model, r.active.id, 'failed') : r.models,
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
      let refused = activeRequests.size > 0
      await mutate($, epoch, state => {
        refused = refused || state.rows.some(r => r.active !== null)
        if (refused) return state
        return { version: 2, session: state.session, rows: state.rows.filter(r => r.id === 'main' || r.running).map(r => ({ ...r,
          models: [], active: null, seen: r.running, status: r.running ? 'waiting' : 'idle' })) }
      })
      if (!refused) invalidateMeasurements()
      return { text: refused ? '仍有代理请求在进行，无法 reset；请在请求结束后重试。' : '已重置本会话 token-speed 统计。' }
    }
    const state = await readState($)
    const now = await safeNow($)
    const provenance = state.rows.filter(r => r.id !== 'main').flatMap(r => {
      const reading = lookupWindow(registry, r.currentModel)
      return reading.sourceURL ? [`${role(r, state.rows)} · context source ${reading.sourceURL} · checked ${reading.date}`] : []
    })
    const averages = modelAverages(state, now)
    const lines = state.rows.flatMap(r => [
      `${role(r, state.rows)} · ${r.description || (r.id === 'main' ? '主控' : '代理')} · ${r.running ? 'running' : 'ended'} · ${r.currentModel ?? 'unknown'} · effort ${r.effort ?? '—'} (${r.effortSource}) · Ctx ${contextLabel(r.context)} (${r.context.source}) · ${r.status}`,
      ...(r.currentModel !== null && !r.models.some(bucket => bucket.model === r.currentModel)
        ? [bucketFor(r, r.currentModel), ...r.models] : r.models).map(bucket => {
        const sum = averages.get(bucket.model)
        return `${role(r, state.rows)} · ${bucket.model} · Last ${rate(lastRate(bucket, now))} · Avg ${rate(averageRate(sum))} · 24h ${sum?.samples ?? 0} 个请求 · ${sum?.tokens ?? 0} tokens / ${((sum?.ms ?? 0) / 1000).toFixed(3)}s · latest ${bucket.latestStatus ?? 'unavailable'}${bucket.last?.step && bucket.last.step !== bucket.latestStep ? ' · Last 来自此前可测速请求' : ''}`
      }),
    ])
    return { text: [
      'token-speed 0.6.0 · Magpie measured · 本 session、本插件实际观察到的请求 · 各代理 Last、同完整模型共享 Avg',
      'Last：本代理、本完整请求模型最近完成且仍有效的可测速样本；等待、流中、失败或不可测速不清旧值。latest 单独显示最新请求 waiting/streaming/pending/measured/failed/unmeasurable/ambiguous/unavailable，Last 可来自此前请求。Avg：本 session 所有代理（含已结束）同完整请求模型最近 24h 的测速输出 token 总和 / 测速窗口总时长，严格按 Magpie 完成时间判窗，不取速度算术平均，不跨 session。',
      '依赖本地 Magpie 与 curl；优先 ANTHROPIC_BASE_URL 环境，其次 settings.env，只访问明确 loopback。无 shell GET 禁用 curlrc、代理和重定向，仅接受完整 HTTP 200 JSON；失败或缺少 curl 保持未知。只采纳本机普通 Claude 来源，排除用途、同步和远程转发标记；冲突候选仍参与歧义。session、agent、完整请求模型、step 时间窗口及 CLI input+cache_write/output/cache_read 三元组必须双向唯一；usage 缺失/0、deferred/retry 计数不一致为 —。computer=this 不能识别所有 LAN 直连；session id 非完整请求 id。q 不检索 native_session，自定义 X-Magpie-Session 覆盖时查不到则 —。',
      '口径与 Magpie measured Speed 一致：排除 TTFT，已知 reasoning 时使用正文及 first_text，只有有证据的可见 reasoning 才计全输出；hidden 无正文、短窗、burst、失败/取消/截断不计。只复现 Magpie 测量，不保证底层供应商真实推理 token 绝对准确；不使用本地字符估算或旧全程历史。',
      'UI 保留 Last 与 Avg（窄屏 L=Last、A=Avg）；单位 tok/s。主控第一，活跃子代理各一行，工作区最后。effort 来源依次 request、applied、configured；主控 configured 优先 CLAUDE_CODE_EFFORT_LEVEL，其次模型/全局 settings 和明确后缀。Ctx 主控以 session.usage 为准；子代理最近 CLI uncached+cache读写输入，窗口 source 优先实际窗口、明确 override、官方 default/capacity、未知；官方 max 仅元数据。固定 10 格块状条，每格8档、80视觉档，相邻整数百分点可同形，数字保留1%精度。',
      `context registry v${registry.version}${registry.fallback ? ' (load failed: confirmed overrides only)' : ''}`,
      ...provenance, ...lines,
      ...(state.rows.some(r => r.models.length) ? [] : ['Last — · Avg — · 尚无本会话统计']),
      'reload 保留已认证 Magpie 样本及 Last 证据，旧 active 终止；reset active 时拒绝，成功清 samples/pending，/clear 清会话。按待匹配起点分组，单飞、最多5次节流重试、每遍最多8页每页500行、每批4秒；优先到期组，同期优先近期组。双扫校验已读完整前缀，覆盖范围内才复验旧样本，撤销 Last 时回退保留的更早有效样本或未知；范围外不撤销，无 pending 不查询。相对 period 依赖 loopback Magpie 与 CLI 同机墙钟，60秒余量涵盖4秒批次及普通时钟误差；无法核验超过余量的时钟偏差。工作索引最多4096条，保留pending/24h证据及仍可能冲突的过期非Last；完整Last留host参与CAS匹配，过期脱离工作容量。回收先保存单调时间水位；回拨至水位后4秒以内拒绝新认证。查询及CAS检查证据版本，变化放弃本批。宿主已发出的状态写入不可取消，跨截止或版本变化落地后按批次/字段撤销，保留后来请求状态；撤销前可能短暂可读。若恰逢模块重载且旧lease失效，迟到提交可能由新模块保留。',
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
    const sums = modelAverages(state, now)
    const averages = visible.map(r => r.currentModel === null ? null : averageRate(sums.get(r.currentModel)))
    const number = (n: number | null | undefined): string => n == null ? '—' : n.toFixed(1)
    const lasts = buckets.map(bucket => number(lastRate(bucket, now)))
    const avgs = averages.map(number)
    const maxWidth = (values: string[], minimum = 0): number => Math.max(minimum, ...values.map(cellWidth))
    const multi = visible.length > 1
    const labelWidth = maxWidth(labels)
    let modelWidth = maxWidth(models)
    const originalModelWidth = modelWidth
    const effortWidth = maxWidth(efforts)
    const contextWidth = maxWidth(contexts)
    const lastWidth = maxWidth(lasts, 5)
    const avgWidth = maxWidth(avgs, 5)
    const statusWidth = maxWidth(visible.map(r => r.status))
    const columns = Math.max(1, e.props.bodyColumns)
    let showStatus = true
    // Fixed 10-cell bar: 80 eighth-cell steps; no widening on wide terminals.
    let cells = 10
    const width = (bar: number): number => labelWidth + 3 + modelWidth + 3 + effortWidth
      + 7 + contextWidth + (bar ? bar + 1 : 0)
      + 8 + lastWidth + 7 + avgWidth + 6
      + (showStatus ? 3 + statusWidth : 0)
    // Both rates keep priority over status, the bar and model width.
    if (width(cells) > columns) showStatus = false
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
            efforts[index] ?? '—', contexts[index] ?? '—/?', lasts[index] ?? '—', avgs[index] ?? '—', effortColor, columns)
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
          {' · Last '}<Text color={buckets[index]?.lastApi == null ? 'inactive' : 'text'}>{padStartTo(lasts[index] ?? '—', lastWidth)}</Text>
          {' · Avg '}<Text color={averages[index] == null ? 'inactive' : 'text'}>{padStartTo(avgs[index] ?? '—', avgWidth)}</Text>{' tok/s'}
          {showStatus ? <Text>{' · '}<Text color={statusColors[r.status]}>{r.status}</Text></Text> : null}
        </Text>
      })}
      {workspaceLine}
      {rest}
    </Box>
  })
}
