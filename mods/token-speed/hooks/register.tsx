import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register, ThemeKey, Timer, TurnStepChunk, TurnStepResult } from 'claude-code'
import type { TokenSpeedActive, TokenSpeedContextInfo, TokenSpeedEffort, TokenSpeedModelStats, TokenSpeedRow,
  TokenSpeedSample, TokenSpeedSessionInfo, TokenSpeedSnapshot, TokenSpeedStatus, TokenSpeedWorkspace } from '../types'

const WINDOW_MS = 3000
const TICK_MS = 250
// Avg rolls over the last day; sample timestamps are clock epoch ms, so no timezone applies.
const AVG_WINDOW_MS = 24 * 60 * 60 * 1000
const row = (id: string): TokenSpeedRow => ({ id, description: '', running: false, currentModel: null,
  models: [], active: null, live: null, status: 'idle', seen: false, turnId: null, revision: 0, effort: null })
const emptyContext = (): TokenSpeedContextInfo => ({ tokens: null, window: 0, percent: null })
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
  return finite(value) ? value : null
}
function contextInfo(value: unknown): TokenSpeedContextInfo {
  const held = object(value) ? value : {}
  return { tokens: finite(held.tokens) ? held.tokens : null,
    window: finite(held.window) && held.window > 0 ? held.window : 0,
    percent: finite(held.percent) ? held.percent : null }
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
      effort: effortValue(item.effort) })
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
    const held = (await $.session.usage()).context
    if (heldEpoch !== epoch || !object(held) || !finite(held.window) || held.window <= 0) return
    const next: TokenSpeedContextInfo = { tokens: finite(held.tokens) ? held.tokens : null,
      window: held.window, percent: finite(held.percent) ? held.percent : null }
    await mutate($, heldEpoch, state => {
      const heldContext = state.session.context
      return heldContext.tokens === next.tokens && heldContext.window === next.window && heldContext.percent === next.percent
        ? state : { version: 2, rows: state.rows, session: { ...state.session, context: next } }
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
  waiting: 'warning', streaming: 'planMode', idle: 'inactive',
  aborted: 'warning', error: 'error', 'usage unavailable': 'warning',
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const rest = await next(e)
    await observe(async () => {
      await $.command.register({ name: 'tok-speed', description: '各代理独立按请求模型统计；主控 first，reset 清空本会话统计', argumentHint: '[reset]' }).catch(() => {})
      await mutate($, epoch, state => ({ version: 2, session: state.session, rows: state.rows.map(r => {
        revision = Math.max(revision, r.revision)
        return r.active && r.active.id !== liveRequests.get(r.id)?.id ? { ...r, active: null, live: null, status: 'aborted' } : r
      }) }))
      ensureTimer($)
      await reconcile($, true)
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
      await mutate($, heldEpoch, state => changeRow(state, loopId, r => {
        model = canonical(e.model, r.currentModel)
        return { ...r, running: true, currentModel: model, seen: true, turnId: e.turnId,
          revision: startedRevision, active: null, live: null, status: 'waiting', effort: e.effort ?? null }
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
    const lines = state.rows.flatMap(r => [
      `${role(r, state.rows)} · ${r.description || (r.id === 'main' ? '主控' : '代理')} · ${r.running ? 'running' : 'ended'} · ${r.currentModel ?? 'unknown'} · Live ${r.live === null ? '—' : `~${rate(r.live)}`} · ${r.status}`,
      ...r.models.map(bucket => {
        const held = bucket.log === undefined ? null : withinWindow(bucket.log, now)
        const scope = held === null
          ? `累计 ${bucket.samples} 个有效请求 · ${bucket.outputTokens} tokens / ${(bucket.durationMs / 1000).toFixed(3)}s`
          : `24h ${held.length} 个请求 · ${held.reduce((sum, sample) => sum + sample.tokens, 0)} tokens / ${(held.reduce((sum, sample) => sum + sample.ms, 0) / 1000).toFixed(3)}s`
        return `${role(r, state.rows)} · ${bucket.model}${bucket.legacy ? ' [legacy v0.1 response model]' : ''} · Last ${rate(bucket.lastApi)} · Avg ${rate(windowedAverage(bucket, now))} · ${scope}`
      }),
    ])
    return { text: [
      'token-speed 0.3.0 · 各代理独立累计 · 主控 first',
      '会话行：主控模型 · effort 档位（turn.step 事件原样）· 上下文进度（$.session.usage() 状态栏口径：最近响应输入 tokens/会话窗口）；工作区行：项目名 on git 分支。',
      ...lines,
      ...(state.rows.some(r => r.models.length) ? [] : ['Last — · Avg — · 尚无本会话统计']),
      'Live：最近 3 秒收到的文本、thinking、工具 JSON 参数估算；CJK 每 Unicode code point 1 token，其余 0.25。分母 min(3 秒, 请求已耗时)，不足 250ms 为 —；停流 3 秒后为 0。~ 非 tokenizer 精确计数。无法观察的代理流为 —，不推算速度。',
      'Last/Avg：CLI usage.output_tokens / 请求全程耗时，包含 TTFT、thinking、网络与请求内停顿；排除请求之间的工具/用户空闲，非纯解码速度。Last 为该代理该模型最近一次有效请求；Avg 为最近 24 小时滚动窗口内该模型的有效 token 总数 / 有效耗时总和，按请求完成时间戳（clock epoch ms）判窗，与本地时区无关，出窗即弃。迁移自 v0.2 的无时间戳桶在首个新请求前退回全程累计口径；失败/中断、无有效 usage、耗时不大于 0 不入统计；有效 0 计入。CPA 缺字段可能被 CLI 归零，无法确认其来源；turn.complete usage 不重复累计。',
      '模型名：以请求 model 为准，去除末尾 [1m]、(high) 或 :high 等配置后缀；保留已知渠道，不推断渠道。同代理 bare 模型与已知渠道模型尾名相同时沿用渠道；usage.model 不改变标签或桶。旧 v0.1 response-model 均值标为 legacy，保留且不混入新的请求模型均值。',
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
    const main = state.rows.find(r => r.id === 'main') ?? row('main')
    const budget = e.props.maxRows - visible.length
    const effortColors: Record<Exclude<TokenSpeedEffort, number>, ThemeKey> =
      { low: 'success', medium: 'planMode', high: 'warning', xhigh: 'error', max: 'error' }
    const barCell = (index: number): ThemeKey => (index + 1) / 10 < 0.5 ? 'success' : (index + 1) / 10 < 0.8 ? 'warning' : 'error'
    const percentColor = (percent: number | null): ThemeKey =>
      percent === null ? 'inactive' : percent < 50 ? 'success' : percent < 80 ? 'warning' : 'error'
    const humanWindow = (window: number): string =>
      window >= 1e6 ? `${(window / 1e6).toFixed(1)}M` : window >= 1e3 ? `${Math.round(window / 1e3)}k` : `${window}`
    const context = state.session.context
    const showContext = context.window > 0
    const filled = context.percent === null ? 0 : Math.max(0, Math.min(10, Math.round(context.percent / 10)))
    // Speed rows come first in the budget; the workspace line drops before the session line.
    const sessionLine = budget >= 1 && main.currentModel
      ? <Text key="token-speed-session" color="subtle" wrap="truncate-end">
          <Text color="planMode" bold>{main.currentModel}</Text>
          {main.effort === null ? null : <Text>{' · '}<Text
            color={typeof main.effort === 'number' ? 'subtle' : effortColors[main.effort]}>{String(main.effort)}</Text></Text>}
          {!showContext ? null : <Text>{' · '}
            {e.props.bodyColumns < 90 ? null : Array.from({ length: 10 }, (_, index) =>
              <Text key={`bar-${index}`} color={index < filled ? barCell(index) : 'inactive'}>{index < filled ? '█' : '░'}</Text>)}
            {' '}<Text color={percentColor(context.percent)}>{context.percent === null ? '—' : `${Math.round(context.percent)}%`}</Text>
            {`/${humanWindow(context.window)}`}</Text>}
        </Text>
      : null
    const workspace = state.session.workspace
    const workspaceLine = budget >= 2 && workspace
      ? <Text key="token-speed-workspace" color="subtle" wrap="truncate-end">
          {'⌂ '}<Text color="claude">{workspace.name}</Text>
          {workspace.branch ? <Text>{' on '}<Text color="planMode">{workspace.branch}</Text></Text> : null}
        </Text>
      : null
    const labels = visible.map(r => r.id === 'main' ? '⚡ main' : `↳ ${shortId(r.id, state.rows)}`)
    const models = visible.map(r => r.currentModel ?? 'unknown')
    // Only parallel rows need fixed columns; a lone row keeps its natural width.
    const multi = visible.length > 1
    const labelWidth = multi ? Math.max(...labels.map(label => label.length)) : 0
    const modelWidth = multi ? Math.max(...models.map(model => model.length)) : 0
    const liveWidth = multi ? 12 : 0
    const rateWidth = multi ? 11 : 0
    const padEndTo = (text: string, width: number): string => text.length >= width ? text : text + ' '.repeat(width - text.length)
    const padStartTo = (text: string, width: number): string => text.length >= width ? text : ' '.repeat(width - text.length) + text
    return <Box flexDirection="column">
      {sessionLine}
      {workspaceLine}
      {visible.map((r, index) => {
        const bucket = r.models.find(item => item.model === r.currentModel && !item.legacy)
        const avg = bucket ? windowedAverage(bucket, now) : null
        return <Text key={`token-speed-${r.id}`} color="subtle" wrap="truncate-end">
          <Text color="planMode" bold={r.id === 'main'}>{padEndTo(labels[index] ?? '', labelWidth)}</Text>
          {' · '}<Text color="planMode">{padEndTo(models[index] ?? '', modelWidth)}</Text>
          {' · Live '}<Text color={r.live === null ? 'inactive' : 'success'} bold={r.live !== null}>{padStartTo(r.live === null ? '—' : `~${rate(r.live)}`, liveWidth)}</Text>
          {e.props.bodyColumns < 110 ? null : <Text>{' · Last '}<Text color="inactive">{padStartTo(rate(bucket?.lastApi), rateWidth)}</Text></Text>}
          {' · Avg '}<Text color={avg === null ? 'inactive' : 'success'}>{padStartTo(rate(avg), rateWidth)}</Text>
          {' · '}<Text color={statusColors[r.status]}>{r.status}</Text>
        </Text>
      })}
      {rest}
    </Box>
  })
}
