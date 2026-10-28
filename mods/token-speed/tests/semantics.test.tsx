import { test, expect } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, EngineInterface } from 'claude-code'
import { queryRows } from '../hooks/magpie'
import { START, PROBE, req, result, gateway, setup, command, state, consume, json, certifiedSample, curlResponse } from './magpie-fixture'

const OPTIONS = { plugins: [PROBE] }
const BAND = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 160,
  scroll: { offset: 0, bodyRows: 10 }, view: {} }

for (const mode of ['pending', 'failed', 'usage', 'truncated', 'hidden', 'query-failed', 'ambiguous'] as const) {
  test(`Last remains during waiting/streaming and after ${mode}, latest state is separate`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    on('turn.step', async function* (_$, e) {
      await clock.sleep(100)
      yield { kind: 'text', index: 0, text: 'answer' }
      await clock.sleep(2194)
      if (e.index === 1 && mode === 'failed') throw new Error('request failed')
      return e.index !== 1 ? result(e) : mode === 'usage' ? { ...result(e), usage: null }
        : mode === 'truncated' ? { ...result(e), stopReason: 'max_tokens' } : result(e)
    })
    data.rows = [gateway()]
    await $.session.start(START)
    const first = consume($.turn.step(req()))
    await clock.settle(); await clock.advance(4000); await first
    expect((await state($)).rows[0]?.models[0]?.lastApi).toBe(149000 / 1294)
    const second = consume($.turn.step(req(1))).catch(() => null)
    await clock.settle()
    expect((await command($)).text).toMatch('latest waiting')
    expect((await command($)).text).toMatch('Last 115.1 tok/s')
    await clock.advance(100)
    expect((await command($)).text).toMatch('latest streaming')
    const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    expect((await ui.find({ type: 'Text', text: / · Last / }))?.text).toMatch(/Last\s+115\.1/)
    await ui.unmount()
    await clock.advance(2194); await second
    expect((await state($)).rows[0]?.models[0]?.lastApi).toBe(149000 / 1294)
    if (mode === 'hidden' || mode === 'ambiguous') data.rows.push(gateway(4000, { route_id: 2,
      ...(mode === 'hidden' ? { reasoning_hidden: true } : {}) }))
    if (mode === 'ambiguous') data.rows.push(gateway(4000, { route_id: 3, kind: 'title' }))
    if (mode === 'query-failed') data.response = async () => json({}, 503)
    if (mode === 'pending') expect((await command($)).text).toMatch('latest pending')
    else {
      await clock.advance(1706)
      const expected = mode === 'failed' ? 'failed' : mode === 'usage' || mode === 'truncated' || mode === 'hidden'
        ? 'unmeasurable' : mode === 'ambiguous' ? 'ambiguous' : 'unavailable'
      expect((await command($)).text).toMatch(`latest ${expected}`)
      await $.turn.complete({ turnId: 'turn-1', answer: '', reason: mode === 'failed' ? 'error' : 'answer',
        isAborted: false, durationMs: 2294 })
      expect((await command($)).text).toMatch(`latest ${expected}`)
    }
    expect((await command($)).text).toMatch('Last 115.1 tok/s')
    expect((await command($)).text).toMatch('Last 来自此前可测速请求')
  })
}

test('late accounting of an older completion cannot replace newer Last or its latest status', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e, e.index === 0 ? 149 : 298) })
  await $.session.start(START)
  const old = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(4000); await old
  data.rows = [gateway(4000, { route_id: 2, out: 298 })]
  const recent = consume($.turn.step(req(1)))
  await clock.settle(); await clock.advance(4000); await recent
  expect((await state($)).rows[0]?.models[0]?.lastApi).toBe(298000 / 1294)
  data.rows.push(gateway())
  await clock.advance(5000)
  expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 2, lastApi: 298000 / 1294, latestStatus: 'measured' })
  expect((await command($)).text).toMatch('Last 230.3 tok/s')
})

test('reliable revocation falls back to previous measured sample while latest reports ambiguity', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e, e.index === 1 ? 298 : 149) })
  await $.session.start(START)
  for (let index = 0; index < 2; index++) {
    data.rows.push(gateway(index * 4000, { route_id: index + 1, out: index === 1 ? 298 : 149 }))
    const step = consume($.turn.step(req(index)))
    await clock.settle(); await clock.advance(4000); await step
  }
  data.rows.push(gateway(4000, { route_id: 3, out: 298, kind: 'title' }), gateway(8000, { route_id: 4, req: 'other/model' }))
  const trigger = consume($.turn.step(req(2, 'other/model')))
  await clock.settle(); await clock.advance(4000); await trigger
  const bucket = (await state($)).rows[0]?.models.find(bucket => bucket.model === 'channel/model')
  expect(bucket).toMatchObject({ samples: 1, lastApi: 149000 / 1294, latestStatus: 'ambiguous' })
  expect(bucket?.last?.at).toBe(2294)
})

test('same-model Avg weights main and ended children; a fresh child has unknown Last and inherited Avg', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  let roster: AgentInfo[] = []
  data.agents = async () => roster
  on('agent.spawn', async () => ({ agentId: 'fresh', model: 'channel/model' }))
  on('turn.step', async function* (_$, e) {
    await clock.sleep(e.agentId ? 3294 : 2294)
    data.rows.push(gateway(e.agentId ? 4000 : 0, { route_id: e.agentId ? 2 : 1, subagent: e.agentId ?? '',
      ms: e.agentId ? 3294 : 2294, out: e.agentId ? 100 : 149 }))
    return result(e, e.agentId ? 100 : 149)
  })
  await $.session.start(START)
  const main = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(4000); await main
  const child = consume($.turn.step(req(1, 'channel/model', 'ended')))
  await clock.settle(); await clock.advance(5000); await child
  await $.turn.complete({ agentId: 'ended', turnId: 'turn-1', answer: '', reason: 'answer', isAborted: false, durationMs: 3294 })
  roster = [{ id: 'fresh', type: 'worker', description: 'new', status: 'running' }]
  const spawn: AgentSpawnInput = { description: 'new', tool_use_id: 'new', prompt: 'synthetic', subagentType: 'worker',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'channel/model', background: true, fork: false }
  await $.agent.spawn(spawn)
  const text = (await command($)).text ?? ''
  expect(text).toMatch('agent:ended')
  expect(text).toMatch('Avg 69.4 tok/s') // 249000 / (1294+2294), not the mean of the rates.
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const lines = await ui.findAll({ type: 'Text', text: / · Last / })
  expect(lines.length).toBe(2)
  expect(lines.some(line => line.text.includes('ended'))).toBe(false)
  expect(lines.find(line => line.text.includes('fresh'))?.text).toMatch(/Last\s+—\s+· Avg\s+69\.4/)
  expect(lines[0]?.text).toMatch(/Avg\s+69\.4/)
  await ui.unmount()
  await $.session.end({ reason: 'clear', sessionId: 'session', resume: { id: 'new-session' } })
  data.session = async () => 'new-session'
  await $.session.start(START)
  expect((await command($)).text).toMatch('尚无本会话统计')
})

test('model aggregates isolate full channels, reject future/duplicate samples and count equal tuples for distinct owners', OPTIONS, async ($, on) => {
  setup(on)
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    const base = e.value.rows[0]!
    const sample = certifiedSample(100, 1000, 0)
    return next({ ...e, value: { ...e.value, rows: [
      { ...base, currentModel: 'channel/model', seen: true, models: [{ model: 'channel/model', metric: 'magpie-measured-v1',
        log: [sample, sample, certifiedSample(1000, 1000, 1000)], lastApi: 999, outputTokens: 0, durationMs: 0, samples: 0 }] },
      { ...base, id: 'child', currentModel: 'channel/model', seen: true, running: true, models: [{ model: 'channel/model', metric: 'magpie-measured-v1',
        log: [sample], lastApi: 999, outputTokens: 0, durationMs: 0, samples: 0 }] },
      { ...base, id: 'bare', currentModel: 'model', seen: true, running: true, models: [{ model: 'model', metric: 'magpie-measured-v1',
        log: [certifiedSample(500, 1000, 0)], lastApi: 999, outputTokens: 0, durationMs: 0, samples: 0 }] },
      { ...base, id: 'other', currentModel: 'other/model', seen: true, running: true, models: [{ model: 'other/model', metric: 'magpie-measured-v1',
        log: [certifiedSample(200, 1000, 0)], lastApi: 999, outputTokens: 0, durationMs: 0, samples: 0 }] },
    ] } })
  })
  await $.session.start(START)
  const text = (await command($)).text ?? ''
  expect(text).toMatch('channel/model · Last 100.0 tok/s · Avg 100.0 tok/s · 24h 2 个请求 · 200 tokens / 2.000s')
  expect(text).toMatch('model · Last 500.0 tok/s · Avg 500.0 tok/s')
  expect(text).toMatch('other/model · Last 200.0 tok/s · Avg 200.0 tok/s')
})

for (const history of [0, 5000]) test(`recent request with ${history} historical rows uses two pages and certifies`, OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  data.rows = [gateway(), ...Array.from({ length: history }, (_, index) => gateway(-120000 - index,
    { route_id: index + 2, req: 'old/model' }))]
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const step = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(4000); await step
  expect((await state($)).rows[0]?.models[0]?.samples).toBe(1)
  expect(data.calls.length).toBe(2)
  expect(data.maximum).toBe(1)
})

test('same-time prefix over 2000 reads all ties; an over-budget old group cannot block a recent group', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  data.rows = [gateway(), ...Array.from({ length: 2500 }, (_, index) => gateway(0,
    { route_id: index + 2, req: 'other/model' })), gateway(-1, { route_id: 3000, req: 'other/model' })]
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const step = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(4000); await step
  expect((await state($)).rows[0]?.models[0]?.samples).toBe(1)
  expect(data.calls.length).toBe(12) // 2502 rows, six pages in each stable scan.
  expect(data.maximum).toBe(1)
  await command($, 'reset')
  data.calls.length = 0
  // Another group starts much earlier and has more than the per-scan 4000-row budget.
  const oldStart = clock.now()
  const old = consume($.turn.step(req(1, 'long/model')))
  await clock.settle(); await clock.advance(2294); await old
  data.rows = Array.from({ length: 4500 }, (_, index) => gateway(oldStart,
    { route_id: index + 1, req: 'noise/model' }))
  await clock.advance(2000)
  expect(data.calls.length).toBe(8)
  expect((await state($)).rows[0]?.models.find(bucket => bucket.model === 'long/model')?.samples).toBe(0)
  await clock.advance(6000)
  const start = clock.now()
  data.rows.push(gateway(start, { route_id: 6000 }))
  const recent = consume($.turn.step(req(2)))
  await clock.settle(); await clock.advance(5000); await recent
  expect((await state($)).rows[0]?.models.find(bucket => bucket.model === 'channel/model')?.samples).toBe(1)
  expect(data.maximum).toBe(1)
})

test('close concurrent starts share one two-page flight instead of one flight per millisecond', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  on('turn.step', async function* (_$, e) {
    const start = clock.now()
    await clock.sleep(2294)
    data.rows.push(gateway(start, { route_id: (e.index + 1), subagent: e.agentId ?? '' }))
    return result(e)
  })
  await $.session.start(START)
  const steps = []
  for (let index = 0; index < 8; index++) {
    steps.push(consume($.turn.step(req(index, 'channel/model', `child-${index}`))))
    await clock.settle(); await clock.advance(2)
  }
  await clock.advance(4000); await Promise.all(steps)
  expect((await state($)).rows.filter(r => r.id !== 'main').every(r => r.models[0]?.samples === 1)).toBe(true)
  expect(data.calls.length).toBe(2)
  expect(data.maximum).toBe(1)
})

test('relative period may move by the four-second budget without losing the earliest candidate', async () => {
  let serviceNow = 100000, calls = 0
  const raw = gateway(97000)
  const fake = { process: { run: async (argv: readonly string[]) => {
    const url = decodeURIComponent(argv[argv.length - 1]!)
    const seconds = Number(url.match(/period=last:(\d+)s/)?.[1])
    const rows = Date.parse(String(raw.t)) >= serviceNow - seconds * 1000 ? [raw] : []
    calls++; serviceNow += 1900
    return curlResponse(argv, json({ offset: 0, total: rows.length, rows }))
  } } } as unknown as EngineInterface
  const queried = await queryRows(fake, 'http://localhost', 'session', 97000, 100000)
  expect(queried.rows.length).toBe(1)
  expect(queried.coveredFrom <= 97000).toBe(true)
  expect(calls).toBe(2)
})

const WRITE_FAULT: Plugin = { name: 'measurement-write-fault', register(on) {
  let denied = false
  on('command.run', { command: 'measurement-write-fault' }, async (_$, e) => { denied = e.args === 'on'; return { text: 'armed' } })
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) =>
    denied ? { deny: 'host write unavailable' } : next(e))
} }

test('failed status writes release single-flight and cannot bypass the five-attempt limit', { plugins: [PROBE, WRITE_FAULT] }, async ($, on) => {
  const { clock, data } = setup(on)
  data.response = async () => json({}, 503)
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const step = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(2294); await step
  await command($, 'on', 'measurement-write-fault')
  await clock.advance(60000)
  expect(data.calls.length).toBe(5)
  await clock.advance(60000)
  expect(data.calls.length).toBe(5)
  await command($, 'off', 'measurement-write-fault')
  data.response = null
  const start = clock.now()
  data.rows = [gateway(start, { route_id: 2 })]
  const fresh = consume($.turn.step(req(1)))
  await clock.settle(); await clock.advance(4000); await fresh
  expect((await state($)).rows[0]?.models[0]?.samples).toBe(1)
  expect(data.calls.length).toBe(7)
  expect(data.maximum).toBe(1)
})

for (const mode of ['delayed-set', 'CAS-conflict'] as const) test(`existing Last survives ${mode} past deadline and next request status is not rolled back`, OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  let arm = false, release: (() => void) | undefined
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (arm && e.value.rows.some(r => r.models.some(bucket => bucket.log?.length === 2))) {
      arm = false
      await new Promise<void>(resolve => { release = resolve })
    }
    return next(e)
  })
  on('turn.step', async function* (_$, e) {
    await clock.sleep(e.index === 2 ? 10000 : 2294)
    return result(e, e.index === 1 ? 298 : 149)
  })
  await $.session.start(START)
  data.rows = [gateway()]
  const first = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(4000); await first
  data.rows.push(gateway(4000, { route_id: 2, out: 298 }))
  const second = consume($.turn.step(req(1)))
  await clock.settle(); await clock.advance(2294); await second
  arm = true
  await clock.advance(1706)
  expect(release).not.toBeUndefined()
  const third = mode === 'CAS-conflict' ? consume($.turn.step(req(2))) : null
  await clock.settle(); await clock.advance(4000)
  release?.(); await clock.settle()
  const bucket = (await state($)).rows[0]?.models[0]
  expect(bucket).toMatchObject({ samples: 1, lastApi: 149000 / 1294 })
  expect(bucket?.last?.at).toBe(2294)
  expect(bucket?.log?.length).toBe(1)
  if (mode === 'CAS-conflict') {
    expect(bucket?.latestStatus).toBe('waiting')
    await clock.advance(6000); await third
  } else {
    await clock.advance(2000)
    expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 2, lastApi: 298000 / 1294, latestStatus: 'measured' })
  }
})
