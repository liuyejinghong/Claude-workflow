import { mock } from 'claude-code/testing'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import type { HookStream, On, ProcessRunInit, ProcessRunResult, TurnStepChunk, TurnStepInput, TurnStepResult, TurnUsage } from 'claude-code'
import type { TokenSpeedSnapshot } from '../types'

export const START = { cwd: '/test', surface: 'terminal', isInteractive: true } as const
export const PROBE: Plugin = { name: 'magpie-probe', register(on) {
  on('command.run', { command: 'magpie-probe' }, async $ =>
    ({ text: JSON.stringify((await $.state.get({ plugin: 'token-speed', key: 'snapshot' })).value) }))
} }
export const req = (index = 0, model = 'channel/model', agentId?: string): TurnStepInput =>
  ({ turnId: `turn-${index}`, index, model, messageCount: 1, ...(agentId ? { agentId } : {}) })
export const usage = (output = 149): TurnUsage => ({ model: 'served-model', input_tokens: 100,
  cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: output })
export const result = (e: TurnStepInput, tokens = 149): TurnStepResult => ({ turnId: e.turnId,
  index: e.index, stopReason: 'end_turn', usage: usage(tokens), answer: 'answer', toolUses: [] })
export type Raw = Record<string, unknown>
export function gateway(start = 0, patch: Raw = {}): Raw {
  return { route_id: start + 1, t: new Date(start).toISOString(), ms: 2294, ttft_ms: 1000,
    session: 'session', native_session: 'session', req: 'channel/model', agent: 'claude', kind: '', via: '', computer: '', status: 200,
    in: 100, cache_write: 20, cache_read: 30, out: 149, ...patch }
}
export function setup(on: On, env: Record<string, string> = { ANTHROPIC_BASE_URL: 'http://127.0.0.1:3425' }) {
  const clock = mock.clock(on)
  mock.env(on, env)
  on('fs.read', async () => ({ value: '{"version":1,"models":[],"overrides":[]}' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('agent.list', async () => ({ value: [] }))
  on('turn.complete', async (_$, e) => ({ text: e.answer, usage: e.usage }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="rest">rest band</Text>
  })
  const data = { rows: [] as Raw[], calls: [] as string[], active: 0, maximum: 0,
    session: async () => 'session',
    argv: [] as string[][], init: [] as (ProcessRunInit | undefined)[],
    process: null as null | ((argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>),
    response: null as null | ((url: string) => Promise<{ status: number; text: string }>) }
  on('session.id', async () => ({ value: await data.session() }))
  on('http.fetch', async () => { throw new Error('meter must use safe process GET') })
  on('process.run', async (_$, e, next) => {
    if (e.argv[0] !== 'curl') return next(e) // Git remains a separate host call.
    const url = e.argv[e.argv.length - 1]!
    data.calls.push(url); data.argv.push([...e.argv]); data.init.push(e.init)
    data.active++; data.maximum = Math.max(data.maximum, data.active)
    try {
      if (data.process) return { value: await data.process(e.argv, e.init) }
      const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
      const rows = [...data.rows].sort((a, b) => Date.parse(String(b.t)) - Date.parse(String(a.t)))
      const response = data.response ? await data.response(url)
        : json({ total: rows.length, offset, rows: rows.slice(offset, offset + 500) })
      return { value: curlResponse(e.argv, response) }
    } finally { data.active-- }
  })
  return { clock, data }
}
export function curlResponse(argv: readonly string[], response: { status: number; text: string },
  patch: Partial<ProcessRunResult> = {}): ProcessRunResult {
  const format = argv[argv.indexOf('--write-out') + 1] ?? ''
  return { exitCode: 0, stdout: response.text + format.replace('%{http_code}', String(response.status)),
    stderr: '', isStdoutTruncated: false, isStderrTruncated: false, ...patch }
}
export const json = (value: unknown, status = 200) => ({ status, ok: status >= 200 && status < 300,
  headers: { 'content-type': 'application/json' }, text: JSON.stringify(value) })
export const command = ($: Engine, args = '', name = 'tok-speed') => $.command.run({ command: name,
  args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
export async function state($: Engine): Promise<TokenSpeedSnapshot> {
  return JSON.parse((await command($, '', 'magpie-probe')).text ?? '{}') as TokenSpeedSnapshot
}
export async function consume(stream: HookStream<TurnStepChunk, TurnStepResult>) {
  const chunks: TurnStepChunk[] = []
  for (;;) { const item = await stream.next(); if (item.done) return { chunks, result: item.value }; chunks.push(item.value) }
}
/** Stream timing remains useful for lifecycle tests; it has no measurement role. */
export async function* uniform(clock: MockClock, ms: number, text = 'abcd'): AsyncGenerator<TurnStepChunk> {
  yield { kind: 'text', index: 0, text }
  await clock.sleep(ms / 2)
  yield { kind: 'text', index: 0, text }
  await clock.sleep(ms / 2)
}
export function certifiedSample(tokens = 286, ms = 10000, at = 0) {
  return { at, tokens, ms, key: `certified-${at}`, step: `step-${at}`, startedAt: at - ms,
    finishedAt: at, counts: { input: 1, write: 0, output: tokens, read: 0 } }
}
