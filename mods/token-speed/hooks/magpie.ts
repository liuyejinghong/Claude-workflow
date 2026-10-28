import type { EngineInterface, TurnUsage } from 'claude-code'

export const MAGPIE_METRIC = 'magpie-measured-v1' as const
export const AVG_WINDOW_MS = 24 * 60 * 60 * 1000
export const MAX_EVIDENCE = 4096
export const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const count = (n: unknown): n is number => finite(n) && Number.isSafeInteger(n) && n >= 0

/** Configuration suffixes only; channel prefixes are part of the request identity. */
export function requestModel(model: string): string {
  let value = model.trim()
  for (;;) {
    const next = value.replace(/(?:\[1m\]|\((?:low|medium|high|xhigh|max)\)|:(?:low|medium|high|xhigh|max))$/i, '').trim()
    if (next === value) return value || 'unknown'
    value = next
  }
}

/** Deliberately accept only these literal authorities, without credentials or URL normalization. */
export function localOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^(https?):\/\/(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?(?:\/[^\s?#\\]*)?\/?$/i)
  if (!match || (match[3] !== undefined && (Number(match[3]) < 1 || Number(match[3]) > 65535))) return null
  return `${match[1]!.toLowerCase()}://${match[2]!.toLowerCase()}${match[3] ? `:${match[3]}` : ''}`
}
export async function magpieOrigin($: EngineInterface): Promise<string | null> {
  let value: unknown
  try { value = await $.env.get('ANTHROPIC_BASE_URL') } catch { /* Settings can supply an absent environment. */ }
  // An explicitly configured remote/invalid URL must never fall back to another endpoint.
  if (value !== undefined && value !== null && value !== '') return localOrigin(value)
  try { const settings = await $.settings.read(); return localOrigin(object(settings.env) ? settings.env.ANTHROPIC_BASE_URL : null) }
  catch { return null }
}

export type Counts = { input: number; write: number; output: number; read: number }
export function usageCounts(usage: TurnUsage | null): Counts | null {
  if (!usage || !count(usage.input_tokens) || !count(usage.cache_creation_input_tokens)
    || !count(usage.output_tokens) || usage.output_tokens <= 0 || !count(usage.cache_read_input_tokens)) return null
  return { input: usage.input_tokens, write: usage.cache_creation_input_tokens,
    output: usage.output_tokens, read: usage.cache_read_input_tokens }
}
export type Evidence = {
  id: string
  loopId: string
  model: string
  startedAt: number
  finishedAt: number
  counts: Counts
  /** The gateway key once certified; absent while still pending. Reload restores it. */
  key?: string
}
export type GatewayRow = { key: string; startedAt: number; finishedAt: number; session: string; subagent: string;
  model: string; counts: Counts | null; measured: { tokens: number; ms: number } | null; eligible: boolean }

/** Exactly the gateway's measured ledDecode, without the session-log floor. */
export function measured(value: unknown): { tokens: number; ms: number } | null {
  if (!object(value) || !count(value.status) || value.status < 200 || value.status >= 300 || value.err
    || value.stop === 'max_tokens' || value.stop === 'length' || value.stop === 'model_context_window_exceeded'
    || !count(value.out) || !count(value.ms) || !count(value.ttft_ms) || value.ttft_ms <= 0) return null
  const optional = (name: string): number | null => value[name] === undefined ? 0 : count(value[name]) ? value[name] : null
  const reasoning = optional('reasoning'), text = optional('first_text_ms'), first = optional('first_reasoning_ms'), flow = optional('flow_ms')
  if (reasoning === null || text === null || first === null || flow === null
    || (value.reasoning_hidden !== undefined && typeof value.reasoning_hidden !== 'boolean')
    || (value.reasoning_hidden && text <= 0)) return null
  const visible = reasoning > 0 && text <= 0 && first >= value.ttft_ms && flow > 0 && reasoning <= value.out
  const tokens = reasoning > 0 && !visible ? value.out - reasoning : value.out
  const from = visible ? first : reasoning > 0 ? text : value.ttft_ms
  const ms = value.ms - from
  if (!(tokens > 0 && from > 0 && ms >= 100 && tokens * 1000 <= 10000 * ms)) return null
  if (flow > 0 && flow * 4 < ms) return null
  if (reasoning > 0 && text > 0 && tokens * (text - value.ttft_ms) > 20 * reasoning * ms) return null
  return { tokens, ms }
}
/** Absent provenance fields are the gateway defaults; any present field must be text. */
function optionalText(value: unknown): string | null {
  if (value === undefined) return ''
  return typeof value === 'string' ? value : null
}
const CLAUDE_AGENTS = new Set(['claude', 'claude-code', 'cc'])
function gatewayRow(value: unknown): GatewayRow | null {
  if (!object(value) || typeof value.t !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value.t)
    || !count(value.ms) || typeof value.req !== 'string'
    || (value.route_id !== undefined && !count(value.route_id))) return null
  const source = optionalText(value.source)
  const agent = optionalText(value.agent)
  const kind = optionalText(value.kind)
  const via = optionalText(value.via)
  const computer = optionalText(value.computer)
  if (source === null || agent === null || kind === null || via === null || computer === null
    || (value.session !== undefined && typeof value.session !== 'string')
    || (value.native_session !== undefined && typeof value.native_session !== 'string')
    || (value.subagent !== undefined && typeof value.subagent !== 'string')) return null
  if (['status', 'in', 'cache_write', 'out', 'cache_read', 'ttft_ms', 'reasoning', 'first_text_ms',
    'first_reasoning_ms', 'flow_ms'].some(name => value[name] !== undefined && !count(value[name]))
    || (value.reasoning_hidden !== undefined && typeof value.reasoning_hidden !== 'boolean')
    || (value.stop !== undefined && typeof value.stop !== 'string')
    || (value.err !== undefined && typeof value.err !== 'string')
    || ['handed_on', 'rejected'].some(name => value[name] !== undefined && typeof value[name] !== 'boolean')) return null
  const startedAt = Date.parse(value.t)
  if (!finite(startedAt) || !finite(startedAt + value.ms)) return null
  const counts = count(value.in) && count(value.cache_write) && count(value.out) && count(value.cache_read)
    ? { input: value.in, write: value.cache_write, output: value.out, read: value.cache_read } : null
  // No account, credential, upstream request id, session, agent id or error body is retained.
  // The key is a local measurement tuple: route id when present plus the
  // timing and usage/measurement fields. Session and subagent are query/association facts,
  // not key material; identical tuples stay duplicates and fail the batch rather than merge.
  const key = JSON.stringify([value.route_id ?? null, value.t, value.ms, value.status,
    !!value.err, value.stop ?? '', value.in, value.cache_write, value.out, value.cache_read, value.ttft_ms,
    value.reasoning, value.first_text_ms, value.first_reasoning_ms, value.flow_ms, value.reasoning_hidden])
  // A turn must come from this computer's Claude path and carry no auxiliary purpose.
  const eligible = CLAUDE_AGENTS.has(agent) && kind === '' && via === '' && computer === '' && source === ''
    && value.handed_on !== true && value.rejected !== true
  return { key, startedAt, finishedAt: startedAt + value.ms, session: String(value.native_session || value.session || ''),
    subagent: String(value.subagent || ''), model: requestModel(value.req), counts, measured: measured(value), eligible }
}
export function corresponds(step: Evidence, row: GatewayRow): boolean {
  const c = row.counts
  return row.subagent === (step.loopId === 'main' ? '' : step.loopId) && row.model === step.model
    && row.startedAt >= step.startedAt && row.startedAt <= step.finishedAt
    && Math.abs(row.finishedAt - step.finishedAt) <= 2000 && c !== null
    // Magpie's matchedBlocks triple; splitting input/cache-write differs across clients.
    && c.input + c.write === step.counts.input + step.counts.write
    && c.output === step.counts.output && c.read === step.counts.read
}
function associationKey(loopId: string, model: string, counts: Counts): string {
  return JSON.stringify([loopId, model, counts.input + counts.write, counts.output, counts.read])
}
/** Candidate indexing changes cost, not eligibility or either direction of uniqueness. */
export function matchCandidates(steps: Evidence[], rows: GatewayRow[]): Map<string, GatewayRow[]> {
  const indexed = new Map<string, GatewayRow[]>()
  for (const row of rows) {
    if (!row.counts) continue
    const key = associationKey(row.subagent || 'main', row.model, row.counts)
    const group = indexed.get(key)
    if (group) group.push(row)
    else indexed.set(key, [row])
  }
  return new Map(steps.map(step => [step.id,
    (indexed.get(associationKey(step.loopId, step.model, step.counts)) ?? []).filter(row => corresponds(step, row))]))
}
export function uniqueMatches(steps: Evidence[], rows: GatewayRow[], candidates = matchCandidates(steps, rows)): Map<string, GatewayRow> {
  const uses = new Map<string, number>()
  for (const set of candidates.values()) for (const row of set) uses.set(row.key, (uses.get(row.key) ?? 0) + 1)
  const result = new Map<string, GatewayRow>()
  for (const step of steps) {
    const set = candidates.get(step.id) ?? [], row = set[0]
    // Ineligible rows still make a candidate set ambiguous; they just never certify.
    if (set.length === 1 && row && row.eligible && uses.get(row.key) === 1) result.set(step.id, row)
  }
  return result
}

/** Two step finishes sharing one gateway row can differ by at most 2 * 2000ms. */
export const SHARED_FINISH_MS = 4000
/** Last lives in host state, not in this bounded working index. Keep other old
 * evidence while a pending/new completion could still share its gateway row.
 * Return a retirement watermark so a later clock rollback cannot invent uniqueness.
 */
export function pruneEvidence(evidence: Map<string, Evidence>,
  pending: Map<string, { attempts: number; due: number }>, now: number,
  retained = new Set<string>(), incoming?: Evidence): number {
  const finishes = [...pending.keys()].flatMap(id => evidence.has(id) ? [evidence.get(id)!.finishedAt] : [])
  if (incoming) finishes.push(incoming.finishedAt)
  let retiredThrough = -Infinity
  for (const [id, held] of evidence) {
    if (pending.has(id) || held.finishedAt > now - AVG_WINDOW_MS) continue
    if (!retained.has(id) && finishes.some(finish => Math.abs(finish - held.finishedAt) <= SHARED_FINISH_MS)) continue
    evidence.delete(id)
    retiredThrough = Math.max(retiredThrough, held.finishedAt)
  }
  return retiredThrough
}
export function rememberEvidence(evidence: Map<string, Evidence>,
  pending: Map<string, { attempts: number; due: number }>, step: Evidence, now: number): boolean {
  if (evidence.size >= MAX_EVIDENCE) return false
  evidence.set(step.id, step)
  pending.set(step.id, { attempts: 0, due: now + 750 })
  return true
}

const PAGE_SIZE = 500
const MAX_PAGES = 8
const CURL_CONNECT_TIMEOUT = '1'
const CURL_MAX_TIME = '2'
const CURL_RUN_TIMEOUT_MS = 2500
const MAX_PAGE_JSON = 8_000_000
/** Safely read one page: curl without redirects, proxies or user configuration. */
async function fetchPage($: EngineInterface, url: string): Promise<unknown> {
  // A random marker separates the local body from curl's status suffix, so body
  // text cannot impersonate a 200. curl exits 0 on 3xx, so status is authoritative.
  const marker = `\n__token_speed_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}:`
  const argv = ['curl', '-q', '--silent', '--show-error', '--globoff', '--noproxy', '*',
    '--proto', '=http,https', '--connect-timeout', CURL_CONNECT_TIMEOUT, '--max-time', CURL_MAX_TIME,
    '--max-redirs', '0', '--write-out', `${marker}%{http_code}`, url]
  const response = await $.process.run(argv, { timeoutMs: CURL_RUN_TIMEOUT_MS })
  if (response.exitCode !== 0 || response.isStdoutTruncated || response.stdout.length > MAX_PAGE_JSON) {
    throw new Error('usage unavailable')
  }
  const at = response.stdout.lastIndexOf(marker)
  if (at < 0) throw new Error('usage unavailable')
  const status = response.stdout.slice(at + marker.length)
  if (!/^[0-9]{3}$/.test(status) || status !== '200') throw new Error('usage unavailable')
  try { return JSON.parse(response.stdout.slice(0, at)) } catch { throw new Error('usage unavailable') }
}
/** A stable complete prefix proves coverage only at/after coveredFrom.
 * Older evidence still participates in matching, but absence outside this range
 * says nothing about its certification. A strict earlier boundary includes all ties.
 */
export type QueryRows = { rows: GatewayRow[]; coveredFrom: number }
export async function queryRows($: EngineInterface, origin: string, session: string, earliest: number, now: number,
  current: () => boolean = () => true): Promise<QueryRows> {
  const endpoint = localOrigin(origin)
  if (endpoint === null || !finite(earliest) || !finite(now) || earliest > now) throw new Error('usage unavailable')
  // Relative periods move between calls. A minute of margin covers the four-second
  // batch budget and ordinary local clock skew; the returned timestamp boundary is
  // also required, so a moving lower bound never silently proves an incomplete set.
  const seconds = Math.max(60, Math.ceil((now - earliest + 60_000) / 1000))
  const base = `${endpoint}/v1/magpie/usage/requests?period=${encodeURIComponent(`last:${seconds}s`)}&q=${encodeURIComponent(session)}&via=through&computer=this&limit=${PAGE_SIZE}`
  const scan = async (): Promise<{ rows: GatewayRow[]; signature: string; coveredFrom: number }> => {
    let total: number | null = null
    const rows: GatewayRow[] = [], keys = new Set<string>()
    let previous = Infinity
    for (let index = 0; index < MAX_PAGES; index++) {
      const offset = index * PAGE_SIZE
      if (!current()) throw new Error('expired query')
      const page: unknown = await fetchPage($, `${base}&offset=${offset}`)
      if (!current()) throw new Error('expired query')
      if (!object(page) || !Array.isArray(page.rows) || !count(page.total)
        || page.offset !== offset || (total !== null && total !== page.total)) throw new Error('unstable page')
      total = page.total
      if (page.rows.length !== Math.min(PAGE_SIZE, Math.max(0, total - offset))) throw new Error('incomplete page')
      for (const raw of page.rows) {
        const row = gatewayRow(raw)
        if (!row || keys.has(row.key) || row.startedAt > previous) throw new Error('unstable rows')
        previous = row.startedAt; keys.add(row.key); rows.push(row)
      }
      // Finish the whole page before accepting an earlier boundary. All rows at
      // earliest must precede it in the verified descending sequence.
      if (previous < earliest || rows.length === total) return { rows,
        coveredFrom: rows.length === total ? now - seconds * 1000 + 4000 : previous + 1,
        signature: JSON.stringify([total, rows]) }
    }
    throw new Error('query budget exceeded')
  }
  const first = await scan(), second = await scan()
  if (first.signature !== second.signature) throw new Error('usage changed')
  return { rows: second.rows.filter(row => row.session === session), coveredFrom: second.coveredFrom }
}
