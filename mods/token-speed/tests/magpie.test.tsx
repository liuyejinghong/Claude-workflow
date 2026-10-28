import { test, expect } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'
import { localOrigin, measured, queryRows, uniqueMatches, rememberEvidence, AVG_WINDOW_MS, MAX_EVIDENCE } from '../hooks/magpie'
import type { Evidence, GatewayRow } from '../hooks/magpie'
import { START, PROBE, req, result, usage, gateway, setup, command, state, consume, json, certifiedSample, curlResponse } from './magpie-fixture'

const OPTIONS = { plugins: [PROBE] }
const BAND = { hasSurvey: false, isWorking: true, maxRows: 4, bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 4 }, view: {} }
const base = { status: 200, out: 149, ms: 2294, ttft_ms: 1000 }
for (const [label, row, expected] of [
  ['observed 149/1294', base, { tokens: 149, ms: 1294 }],
  ['638 total, 454 reasoning, 1673ms answer', { ...base, out: 638, reasoning: 454, ms: 3673, first_text_ms: 2000 }, { tokens: 184, ms: 1673 }],
  ['paced visible reasoning', { ...base, out: 300, reasoning: 200, first_reasoning_ms: 1100, ms: 3100, flow_ms: 1900 }, { tokens: 300, ms: 2000 }],
  ['hidden with known text', { ...base, reasoning_hidden: true, first_text_ms: 1000 }, { tokens: 149, ms: 1294 }],
  ['hidden without text', { ...base, reasoning_hidden: true }, null],
  ['unpaced reasoning', { ...base, reasoning: 10 }, null],
  ['flow burst', { ...base, flow_ms: 100 }, null],
  ['reasoning burst', { ...base, out: 550, reasoning: 22, ms: 11736, first_text_ms: 11500 }, null],
  ['too fast', { ...base, out: 10001, ms: 2000 }, null],
  ['100ms inclusive', { ...base, out: 1000, ms: 1100 }, { tokens: 1000, ms: 100 }],
  ['99ms excluded', { ...base, ms: 1099 }, null],
  ['failed', { ...base, status: 503 }, null],
  ['cancelled/truncated', { ...base, err: 'stream ended early' }, null],
  ['zero output', { ...base, out: 0 }, null],
  ['missing status', { out: 149, ms: 2294, ttft_ms: 1000 }, null],
  ['missing output', { status: 200, ms: 2294, ttft_ms: 1000 }, null],
  ['missing duration', { status: 200, out: 149, ttft_ms: 1000 }, null],
  ['missing ttft', { status: 200, out: 149, ms: 2294 }, null],
] as const) test(`Magpie measured ${label}`, async () => { expect(measured(row)).toEqual(expected) })

for (const value of ['http://example.com', 'http://127.1', 'http://127.0.0.1.evil',
  'http://localhost@remote', 'http://user:pass@localhost', 'http://[::ffff:127.0.0.1]',
  'file:///tmp/magpie', 'http://localhost:0', 'http://localhost:65536', 'http://localhost/?token=secret',
  'http://localhost\\@evil', ' http://localhost', 'http://2130706433']) {
  test(`reject endpoint ${value}`, async () => { expect(localOrigin(value)).toBeNull() })
}
for (const [value, expected] of [['http://127.0.0.1:3425/v1', 'http://127.0.0.1:3425'],
  ['https://localhost:443/', 'https://localhost:443'], ['http://[::1]:1234', 'http://[::1]:1234']]) {
  test(`accept explicit loopback ${value}`, async () => { expect(localOrigin(value)).toBe(expected) })
}

test('real hook observes the request, preserves stream/result, then asynchronously shows 115.1 measured without Live', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  const chunks = [{ kind: 'text' as const, index: 0, text: 'answer', ref: 7 },
    { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: usage(), ref: 9 }]
  let calls = 0
  on('turn.step', async function* (_$, e) { calls++; for (const chunk of chunks) yield chunk; await clock.sleep(2294); return result(e) })
  data.rows = [gateway(), gateway(0, { session: 'another', native_session: 'another', route_id: 2 }),
    gateway(0, { session: 'session-extra', native_session: 'session-extra', route_id: 3 })]
  await $.session.start(START)
  const pending = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(2294)
  const held = await pending
  expect(held.chunks).toEqual(chunks); expect(held.result).toEqual(result(req())); expect(calls).toBe(1)
  expect(data.calls.length).toBe(0)
  expect((await state($)).rows[0]?.models[0]?.lastApi).toBeNull()
  await clock.advance(1706)
  expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 1, outputTokens: 149, durationMs: 1294 })
  const text = (await command($)).text ?? ''
  expect(text).toMatch('Last 115.1 tok/s · Avg 115.1 tok/s')
  expect(text).not.toMatch(/Live|~115/)
  expect(data.calls.length).toBe(2)
  expect(data.calls[0]).toMatch('via=through'); expect(data.calls[0]).toMatch('q=session')
  expect(data.calls[0]).not.toMatch('period=all')
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  for (const columns of [24, 32, 49, 80, 120]) {
    await ui.redraw({ ...BAND, bodyColumns: columns })
    const line = (await ui.findAll({ type: 'Text' })).find(node => node.props.wrap === 'truncate-end')?.text ?? ''
    expect(line).toMatch(/(?:Last\s+|L)115\.1/); expect(line).toMatch(/(?:Avg\s+|A)115\.1/)
    expect(line).not.toMatch(/Live|~/)
  }
  await ui.unmount()
})

test('weighted answer tokens/window sum, failure clears only Last and turn totals do not add a sample', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  on('turn.step', async function* (_$, e) {
    const start = e.index === 0 ? 0 : e.index === 1 ? 4294 : 9967
    await clock.sleep(e.index === 0 ? 2294 : e.index === 1 ? 3673 : 1000)
    if (e.index < 2) data.rows.push(gateway(start, e.index === 0 ? {} :
      { route_id: 2, out: 638, reasoning: 454, ms: 3673, first_text_ms: 2000 }))
    return e.index === 2 ? { ...result(e), stopReason: null } : result(e, e.index === 0 ? 149 : 638)
  })
  await $.session.start(START)
  for (const [index, ms] of [[0, 2294], [1, 3673], [2, 1000]]) {
    const pending = consume($.turn.step(req(index)))
    await clock.settle(); await clock.advance(ms!); await pending; await clock.advance(2000)
  }
  const bucket = (await state($)).rows[0]?.models[0]
  expect(bucket).toMatchObject({ outputTokens: 333, durationMs: 2967, samples: 2, lastApi: null })
  expect((await command($)).text).toMatch('Avg 112.2 tok/s')
  await $.turn.complete({ turnId: 'turn-2', answer: '', isAborted: false, reason: 'answer', durationMs: 100, usage: usage(99999) })
  expect((await state($)).rows[0]?.models[0]).toEqual(bucket)
})

test('main and two same-model concurrent agents use one flight and separate strictly owned samples', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  on('turn.step', async function* (_$, e) {
    await clock.sleep(2294)
    data.rows.push(gateway(0, { route_id: e.agentId === 'a' ? 2 : e.agentId === 'b' ? 3 : 1, subagent: e.agentId ?? '', out: e.agentId === 'a' ? 298 : 149 }))
    return result(e, e.agentId === 'a' ? 298 : 149)
  })
  await $.session.start(START)
  const pending = [req(), req(0, 'channel/model', 'a'), req(0, 'channel/model', 'b')].map(e => consume($.turn.step(e)))
  await clock.settle(); await clock.advance(2294); await Promise.all(pending); await clock.advance(1706)
  const rows = (await state($)).rows
  expect(rows.map(row => row.models[0]?.outputTokens)).toEqual([149, 298, 149])
  expect(data.maximum).toBe(1); expect(data.calls.length).toBe(2)
})

for (const kind of ['title', 'model-channel', 'served-model', 'deferred-output', 'missing-input', 'missing-usage', 'zero-usage', 'native-override', 'wrong-agent', 'failed', 'hidden'] as const) {
  test(`${kind} cannot supply a guessed measurement`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    const row = gateway()
    if (kind === 'title') data.rows.push(gateway(0, { route_id: 2 }))
    if (kind === 'model-channel') row.req = 'another/model'
    if (kind === 'served-model') { delete row.req; row.served = 'channel/model' }
    if (kind === 'deferred-output') row.out = 150
    if (kind === 'missing-input') delete row.in
    if (kind === 'native-override') row.native_session = 'different'
    if (kind === 'wrong-agent') row.subagent = 'other'
    if (kind === 'failed') row.status = 503
    if (kind === 'hidden') row.reasoning_hidden = true
    data.rows.push(row)
    on('turn.step', async function* (_$, e) { await clock.sleep(2294); return { ...result(e),
      usage: kind === 'missing-usage' ? null : kind === 'zero-usage' ? usage(0) : usage() } })
    await $.session.start(START)
    const pending = consume($.turn.step(req()))
    await clock.settle(); await clock.advance(2294); await pending; await clock.advance(3706)
    expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 0, lastApi: null })
  })
}

test('one row matching two overlapping observed steps is rejected in both directions', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  data.rows = [gateway()]
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const a = consume($.turn.step(req(0))), b = consume($.turn.step(req(1)))
  await clock.settle(); await clock.advance(2294); await Promise.all([a, b]); await clock.advance(1706)
  expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 0, lastApi: null })
})

test('delayed accounting retries finitely and a later match is added once', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const pending = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(4000); await pending
  expect(data.calls.length).toBe(2)
  expect((await state($)).rows[0]?.models[0]?.lastApi).toBeNull()
  data.rows = [gateway()]
  await clock.advance(5000)
  expect((await state($)).rows[0]?.models[0]?.samples).toBe(1)
  const calls = data.calls.length
  await clock.advance(10000)
  expect(data.calls.length).toBe(calls)
  expect((await state($)).rows[0]?.models[0]?.samples).toBe(1)
})

for (const mode of ['reset', 'clear', 'timeout', '503', 'non-magpie'] as const) {
  test(`${mode} late HTTP cannot revive samples or block the real stream`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    let release: (() => void) | undefined
    data.response = async () => {
      await new Promise<void>(resolve => { release = resolve })
      return mode === '503' ? json({}, 503) : mode === 'non-magpie' ? json({ hello: 'world' })
        : json({ offset: 0, total: 1, rows: [gateway()] })
    }
    on('turn.step', async function* (_$, e) { yield { kind: 'text', index: 0, text: 'untouched', ref: 3 }; await clock.sleep(2294); return result(e) })
    await $.session.start(START)
    const pending = consume($.turn.step(req()))
    await clock.settle(); await clock.advance(2294)
    expect((await pending).result).toEqual(result(req()))
    await clock.advance(1706)
    expect(data.calls.length).toBe(1)
    if (mode === 'reset') expect((await command($, 'reset')).text).toMatch('已重置')
    if (mode === 'clear') await $.session.end({ reason: 'clear', sessionId: 'session', resume: { id: 'next' } })
    if (mode === 'timeout') await clock.advance(5000)
    release?.(); await clock.settle()
    expect((await state($)).rows[0]?.models.reduce((n, b) => n + b.samples, 0)).toBe(0)
    expect(data.maximum).toBe(1)
    if (mode === 'reset' || mode === 'clear' || mode === 'timeout') expect(data.calls.length).toBe(1)
  })
}

for (const fault of ['total', 'duplicates', 'same-total-drift', 'overflow'] as const) {
  test(`pagination rejects ${fault} without accepting a partial set`, async () => {
    const rows = Array.from({ length: 501 }, (_, i) => gateway(1000 - i, { route_id: i + 1 }))
    let calls = 0
    const fake = { process: { run: async (argv: readonly string[]) => {
      const url = argv[argv.length - 1]!
      calls++
      const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
      let pageRows = rows.slice(offset, offset + 500)
      let total = rows.length
      if (fault === 'total' && calls === 2) total++
      if (fault === 'duplicates' && offset > 0) pageRows = [rows[499]!]
      if (fault === 'same-total-drift' && calls === 3) pageRows = [gateway(1001), ...pageRows.slice(1)]
      if (fault === 'overflow') total = 2001
      return curlResponse(argv, json({ offset, total, rows: pageRows }))
    } } } as unknown as EngineInterface
    let rejected = false
    try { await queryRows(fake, 'http://localhost', 'session', 0, 2000) } catch { rejected = true }
    expect(rejected).toBe(true)
  })
}

test('query period reaches before an observed request older than 48h, including completion inside 24h', async () => {
  const now = 100 * 86400000, start = now - 3 * 86400000
  const urls: string[] = []
  const fake = { process: { run: async (argv: readonly string[]) => {
    urls.push(argv[argv.length - 1]!)
    return curlResponse(argv, json({ offset: 0, total: 1,
      rows: [gateway(start, { ms: now - start - 1000, ttft_ms: 1000 })] }))
  } } } as unknown as EngineInterface
  const rows = await queryRows(fake, 'http://localhost', 'session', start, now)
  expect(rows.length).toBe(1)
  expect(urls[0]).toMatch('last%3A4321m')
  expect(rows[0]?.finishedAt).toBe(now - 1000)
})

test('a valid row cannot match another model route or another agent even with the same token counts', async () => {
  const counts = { input: 100, write: 20, output: 149, read: 30 }
  const evidence: Evidence[] = [{ id: 'step', loopId: 'a', model: 'one/model', startedAt: 0, finishedAt: 2294, counts }]
  const row: GatewayRow = { key: 'row', model: 'two/model', subagent: 'a', session: 'session', startedAt: 0,
    finishedAt: 2294, counts, measured: { tokens: 149, ms: 1294 }, eligible: true }
  expect(uniqueMatches(evidence, [row]).size).toBe(0)
  expect(uniqueMatches(evidence, [{ ...row, model: 'one/model', subagent: 'b' }]).size).toBe(0)
  expect(uniqueMatches([...evidence, { ...evidence[0]!, id: 'second' }], [{ ...row, model: 'one/model' }]).size).toBe(0)
})


test('five empty-accounting retries stop and never rescan indefinitely', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const pending = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(2294); await pending
  await clock.advance(60000)
  expect(data.calls.length).toBe(10) // two stable scans per attempt
  await clock.advance(60000)
  expect(data.calls.length).toBe(10)
  expect((await state($)).rows[0]?.models[0]?.lastApi).toBeNull()
})

test('five slow 501-row batches stop after fifteen curls despite every batch expiring', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  data.rows = [gateway(), ...Array.from({ length: 500 }, (_, i) => gateway(-1000 - i,
    { route_id: i + 2, req: 'other/model' }))]
  data.response = async url => {
    await clock.sleep(1400)
    const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
    return json({ offset, total: data.rows.length, rows: data.rows.slice(offset, offset + 500) })
  }
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const step = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(2294); await step
  await clock.advance(60000)
  expect(data.calls.length).toBe(15) // two pages, then the first page of the verification scan times out
  expect(data.calls.map(url => Number(url.match(/offset=(\d+)/)?.[1]))).toEqual(
    Array.from({ length: 5 }, () => [0, 500, 0]).flat())
  await clock.advance(60000)
  expect(data.calls.length).toBe(15)
  expect(data.active).toBe(0); expect(data.maximum).toBe(1)
  expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 0, lastApi: null })
  expect((await command($)).text).toMatch('Last — · Avg —')
})

test('an expired fifth batch cannot remove fresh pending after clear and a new session', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  const rows = [gateway(), ...Array.from({ length: 500 }, (_, i) => gateway(-1000 - i,
    { route_id: i + 2, req: 'other/model' }))]
  let release: (() => void) | undefined
  data.response = async url => {
    await clock.sleep(1400)
    if (data.calls.length === 15) await new Promise<void>(resolve => { release = resolve })
    const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
    return json({ offset, total: rows.length, rows: rows.slice(offset, offset + 500) })
  }
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const old = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(2294); await old
  await clock.advance(40000)
  expect(data.calls.length).toBe(15); expect(release).not.toBeUndefined()
  await $.session.end({ reason: 'clear', sessionId: 'session', resume: { id: 'fresh' } })
  data.session = async () => 'fresh'
  await $.session.start(START)
  const startedAt = clock.now()
  const fresh = consume($.turn.step(req(1)))
  await clock.settle(); await clock.advance(2294); await fresh; await clock.advance(2000)
  expect(data.calls.length).toBe(15); expect(data.active).toBe(1)
  data.rows = [gateway(startedAt, { session: 'fresh', native_session: 'fresh' })]
  data.response = null
  release?.(); await clock.settle()
  expect((await state($)).rows[0]?.models[0]?.samples).toBe(0)
  await clock.advance(2000)
  expect(data.calls.length).toBe(17)
  expect(data.calls.slice(15).every(url => url.includes('q=fresh'))).toBe(true)
  expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 1, lastApi: 149000 / 1294 })
  await clock.advance(60000)
  expect(data.calls.length).toBe(17)
  expect(data.active).toBe(0); expect(data.maximum).toBe(1)
})

test('reload preserves certified samples, aborts stale active and excludes prior metrics; exact completion cutoff expires Avg', OPTIONS, async ($, on) => {
  const { clock } = setup(on)
  const day = 86400000
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    return next({ ...e, value: { ...e.value, rows: e.value.rows.map(r => ({ ...r,
      currentModel: 'channel/model', seen: true, effort: 'max', effortSource: 'request',
      active: { id: 'stale', turnId: 'old', model: 'channel/model', startedAt: -2000 },
      models: [{ model: 'channel/model', metric: 'magpie-measured-v1', outputTokens: 286, durationMs: 10000,
        samples: 1, lastApi: 28.6, latestStep: `step-${-day + 1000}`, log: [certifiedSample(286, 10000, -day + 1000)] }],
    })) } })
  })
  await $.session.start(START)
  await $.session.start(START)
  let row = (await state($)).rows[0]
  expect(row?.status).toBe('aborted'); expect(row?.active).toBeNull(); expect(row?.effort).toBe('max')
  expect(row?.models[0]).toMatchObject({ samples: 1, lastApi: null })
  expect((await command($)).text).toMatch('Avg 28.6 tok/s')
  await clock.advance(999)
  expect((await command($)).text).toMatch('24h 1 个请求')
  await clock.advance(1)
  expect((await command($)).text).toMatch('Avg — · 24h 0 个请求')
})

test('a replaced host lease alone rejects an old asynchronous result without reset', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  let release: (() => void) | undefined, replace = false
  let model = 'channel/model'
  on('session.model', async () => ({ value: model }))
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) =>
    next(replace ? { ...e, value: { ...e.value, session: { ...e.value.session, observationGeneration: 'replacement-module' } } } : e))
  data.response = async () => { await new Promise<void>(resolve => { release = resolve });
    return json({ offset: 0, total: 1, rows: [gateway()] }) }
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const pending = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(4000); await pending
  replace = true; model = 'different/model'
  await clock.advance(500)
  expect((await state($)).session.observationGeneration).toBe('replacement-module')
  release?.(); await clock.settle()
  expect((await state($)).session.observationGeneration).toBe('replacement-module')
  expect((await state($)).rows[0]?.models[0]?.samples).toBe(0)
})

for (const mode of ['remote-env', 'settings-fallback'] as const) test(`endpoint source ${mode}`, OPTIONS, async ($, on) => {
  const { clock, data } = setup(on, mode === 'remote-env' ? { ANTHROPIC_BASE_URL: 'https://remote.invalid' } : {})
  on('settings.read', async () => ({ value: { env: { ANTHROPIC_BASE_URL: 'http://localhost:3456/v1', secret: 'never-store' } } }))
  data.rows = [gateway()]
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const pending = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(4000); await pending
  expect(data.calls.length).toBe(mode === 'remote-env' ? 0 : 2)
  if (mode === 'settings-fallback') expect(data.calls[0]).toMatch('http://localhost:3456/v1/magpie/')
  expect(JSON.stringify(await state($))).not.toMatch('never-store')
})


for (const stopReason of ['max_tokens', 'model_context_window_exceeded'] as const) {
  test(`CLI ${stopReason} truncation cannot create a sample despite gateway 200`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    data.rows = [gateway()]
    on('turn.step', async function* (_$, e) { await clock.sleep(2294); return { ...result(e), stopReason } })
    await $.session.start(START)
    const pending = consume($.turn.step(req()))
    await clock.settle(); await clock.advance(4000); await pending
    expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 0, lastApi: null })
    expect(data.calls.length).toBe(0)
  })
}

for (const mode of ['late-candidate', 'missing', 'different-key', 'normal', 'failed-query'] as const) {
  test(`certified A revalidation on later B: ${mode}`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    data.rows = [gateway()]
    on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
    await $.session.start(START)
    const a = consume($.turn.step(req()))
    await clock.settle(); await clock.advance(4000); await a
    expect((await state($)).rows[0]?.models[0]?.samples).toBe(1)
    const calls = data.calls.length
    await clock.advance(20000)
    expect(data.calls.length).toBe(calls) // No polling without pending evidence.
    if (mode === 'late-candidate') data.rows.push(gateway(0, { route_id: 2, kind: 'title' }))
    if (mode === 'missing') data.rows = []
    if (mode === 'different-key') data.rows = [gateway(0, { route_id: 2 })]
    if (mode === 'failed-query') data.response = async () => json({}, 503)
    data.rows.push(gateway(24000, { route_id: 3, req: 'other/model' }))
    const b = consume($.turn.step(req(1, 'other/model')))
    await clock.settle(); await clock.advance(4000); await b
    const buckets = (await state($)).rows[0]!.models
    const keep = mode === 'normal' || mode === 'failed-query'
    expect(buckets.find(bucket => bucket.model === 'channel/model')).toMatchObject({ samples: keep ? 1 : 0,
      lastApi: keep ? 149000 / 1294 : null })
    expect(buckets.find(bucket => bucket.model === 'other/model')?.samples).toBe(mode === 'failed-query' ? 0 : 1)
    expect(data.calls[calls]).toMatch('last%3A15m')
  })
}

test('restored certification rechecks both ambiguity directions and covers its older start', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  const start = -20 * 60000
  const aRow = gateway(start, { route_id: 1 })
  const fake = { process: { run: async (argv: readonly string[]) => curlResponse(argv,
    json({ offset: 0, total: 1, rows: [aRow] })) } } as unknown as EngineInterface
  const key = (await queryRows(fake, 'http://localhost', 'session', start, 0))[0]!.key
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    return next({ ...e, value: { ...e.value, rows: e.value.rows.map(r => ({ ...r, currentModel: 'channel/model',
      models: [{ model: 'channel/model', metric: 'magpie-measured-v1', outputTokens: 149, durationMs: 1294,
        samples: 1, lastApi: 149000 / 1294, latestStep: 'restored', log: [{ key, step: 'restored', tokens: 149, ms: 1294,
          at: start + 2294, startedAt: start, finishedAt: start + 2294,
          counts: { input: 100, write: 20, output: 149, read: 30 } }] }] })) } })
  })
  data.rows = [aRow, gateway(start, { route_id: 2 }), gateway(0, { route_id: 3, req: 'other/model' })]
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const step = consume($.turn.step(req(1, 'other/model')))
  await clock.settle(); await clock.advance(4000); await step
  expect(data.calls[0]).toMatch('last%3A22m')
  expect((await state($)).rows[0]?.models.find(bucket => bucket.model === 'channel/model')).toMatchObject({ samples: 0, lastApi: null })
  expect((await state($)).rows[0]?.models.find(bucket => bucket.model === 'other/model')?.samples).toBe(1)
})

test('restored row matching a newly observed overlapping step revokes the prior sample too', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  data.rows = [gateway()]
  const fake = { process: { run: async (argv: readonly string[]) => curlResponse(argv,
    json({ offset: 0, total: 1, rows: data.rows })) } } as unknown as EngineInterface
  const key = (await queryRows(fake, 'http://localhost', 'session', 0, 0))[0]!.key
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    return next({ ...e, value: { ...e.value, rows: e.value.rows.map(r => ({ ...r, currentModel: 'channel/model',
      models: [{ model: 'channel/model', metric: 'magpie-measured-v1', outputTokens: 149, durationMs: 1294,
        samples: 1, lastApi: 149000 / 1294, latestStep: 'restored', log: [{ key, step: 'restored', tokens: 149, ms: 1294,
          at: 2294, startedAt: -1000, finishedAt: 2294,
          counts: { input: 100, write: 20, output: 149, read: 30 } }] }] })) } })
  })
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const step = consume($.turn.step(req(1)))
  await clock.settle(); await clock.advance(4000); await step
  expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 0, lastApi: null })
})

for (const label of ['claude', 'claude-code', 'cc', 'defaults'] as const) {
  test(`real Claude provenance ${label} certifies and stores no identity in key`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    const raw = gateway(0, { agent: label === 'defaults' ? 'claude' : label, tries: 2,
      account: 'private-account', upstream_id: 'private-upstream' })
    if (label === 'defaults') { delete raw.kind; delete raw.via; delete raw.computer }
    data.rows = [raw]
    on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
    await $.session.start(START)
    const step = consume($.turn.step(req()))
    await clock.settle(); await clock.advance(4000); await step
    const sample = (await state($)).rows[0]?.models[0]?.log?.[0]
    expect(sample?.tokens).toBe(149)
    expect(sample?.key).not.toMatch(/session|private-account|private-upstream|claude/)
    expect(data.calls[0]).toMatch('computer=this')
  })
}

for (const patch of [{ kind: 'title' }, { kind: 'summary' }, { agent: 'codex' }, { agent: '' },
  { computer: 'another-machine' }, { via: 'magpie' }, { source: 'sync' }, { handed_on: true }, { rejected: true },
  { agent: null }, { computer: 1 }, { kind: {} }, { err: {} }, { status: '200' }, { reasoning: '0' }] as const) {
  test(`ineligible or malformed provenance ${JSON.stringify(patch)} never supplies a sample`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    data.rows = [gateway(0, patch)]
    on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
    await $.session.start(START)
    const step = consume($.turn.step(req()))
    await clock.settle(); await clock.advance(4000); await step
    expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 0, lastApi: null })
  })
}

for (const patch of [{ kind: 'title' }, { agent: 'codex' }, { computer: 'remote' }, { via: 'magpie' }, { handed_on: true }]) {
  test(`conflicting candidate ${JSON.stringify(patch)} cannot manufacture uniqueness`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    data.rows = [gateway(), gateway(0, { route_id: 2, ...patch })]
    on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
    await $.session.start(START)
    const step = consume($.turn.step(req()))
    await clock.settle(); await clock.advance(4000); await step
    expect((await state($)).rows[0]?.models[0]?.samples).toBe(0)
  })
}

for (const fault of ['redirect', '503', 'exit', 'truncated', 'invalid-json', 'bad-suffix', 'missing-curl', 'timeout'] as const) {
  test(`safe curl rejects ${fault} and preserves the real stream`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    data.process = async argv => {
      if (fault === 'missing-curl' || fault === 'timeout') throw new Error(fault)
      const held = curlResponse(argv, json({ total: 1, offset: 0, rows: [gateway()] }, fault === 'redirect' ? 302 : fault === '503' ? 503 : 200))
      if (fault === 'exit') held.exitCode = 7
      if (fault === 'truncated') held.isStdoutTruncated = true
      if (fault === 'invalid-json') held.stdout = 'invalid' + held.stdout.slice(held.stdout.lastIndexOf('\n__token_speed_'))
      if (fault === 'bad-suffix') held.stdout += 'junk'
      return held
    }
    on('turn.step', async function* (_$, e) { yield { kind: 'text', index: 0, text: 'unchanged', ref: 42 };
      await clock.sleep(2294); return result(e) })
    await $.session.start(START)
    const step = consume($.turn.step(req()))
    await clock.settle(); await clock.advance(4000)
    expect((await step).chunks).toEqual([{ kind: 'text', index: 0, text: 'unchanged', ref: 42 }])
    expect((await state($)).rows[0]?.models[0]?.samples).toBe(0)
    const argv = data.argv[0]!
    expect(argv.slice(0, 2)).toEqual(['curl', '-q'])
    expect(argv[argv.indexOf('--noproxy') + 1]).toBe('*')
    expect(argv[argv.indexOf('--proto') + 1]).toBe('=http,https')
    expect(argv[argv.indexOf('--max-redirs') + 1]).toBe('0')
    expect(argv.includes('--location')).toBe(false); expect(argv.includes('-L')).toBe(false)
    expect(Number(argv[argv.indexOf('--connect-timeout') + 1])).toBeGreaterThan(0)
    expect(Number(argv[argv.indexOf('--max-time') + 1]) * 1000).toBeLessThan(data.init[0]!.timeoutMs!)
    expect(data.init[0]!.timeoutMs!).toBeLessThan(4000)
  })
}

test('evidence capacity recovers after 24h even with no pending poll', async () => {
  const evidence = new Map<string, Evidence>()
  const pending = new Map<string, { attempts: number; due: number }>()
  const base: Evidence = { id: 'next', loopId: 'main', model: 'm', startedAt: 0, finishedAt: 0,
    counts: { input: 1, write: 0, output: 1, read: 0 } }
  for (let i = 0; i < MAX_EVIDENCE; i++) evidence.set(String(i), { ...base, id: String(i) })
  expect(rememberEvidence(evidence, pending, base, AVG_WINDOW_MS - 1)).toBe(false)
  expect(rememberEvidence(evidence, pending, { ...base, finishedAt: AVG_WINDOW_MS }, AVG_WINDOW_MS)).toBe(true)
  expect(evidence.size).toBe(1); expect(pending.size).toBe(1)
})

for (const mode of ['old-step', 'old-session-start'] as const) {
  test(`${mode} waiting for session.id cannot overwrite a fresh session`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    let block = false, release: (() => void) | undefined, sid = 'old'
    data.session = async () => {
      const held = sid
      if (block) { block = false; await new Promise<void>(resolve => { release = resolve }) }
      return held
    }
    on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
    await $.session.start(START)
    block = true
    const old = mode === 'old-step' ? consume($.turn.step(req())) : $.session.start(START)
    await clock.settle()
    expect(release).not.toBeUndefined()
    await $.session.end({ reason: 'clear', sessionId: 'old', resume: { id: 'new' } })
    sid = 'new'
    data.rows = [gateway(0, { session: 'new', native_session: 'new' })]
    const fresh = consume($.turn.step(req(1)))
    await clock.settle()
    release?.(); await clock.settle()
    await clock.advance(4000); await old; await fresh
    expect(data.calls.every(url => url.includes('q=new'))).toBe(true)
    expect(data.calls.length).toBe(2)
    expect((await state($)).rows[0]?.models[0]?.samples).toBe(1)
  })
}

for (const mode of ['callback-delayed', 'state-set-delayed'] as const) {
  test(`${mode} beyond batch deadline stays pending and recovers on the next batch`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    data.rows = [gateway()]
    let arm = false, release: (() => void) | undefined
    if (mode === 'callback-delayed') on('state.get', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
      const held = await next(e)
      if (arm && data.calls.length === 2) { arm = false; await new Promise<void>(resolve => { release = resolve }) }
      return held
    })
    else on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
      if (arm && e.value.rows.some(r => r.models.some(bucket => bucket.validationBatch))) {
        arm = false; await new Promise<void>(resolve => { release = resolve })
      }
      return next(e)
    })
    on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
    await $.session.start(START)
    const step = consume($.turn.step(req()))
    await clock.settle(); await clock.advance(2294); await step
    arm = true
    await clock.advance(1706)
    expect(release).not.toBeUndefined()
    await clock.advance(4000)
    release?.(); await clock.settle()
    expect((await state($)).rows[0]?.models[0]?.samples).toBe(0)
    await clock.advance(2000)
    expect((await state($)).rows[0]?.models[0]?.samples).toBe(1)
  })
}
