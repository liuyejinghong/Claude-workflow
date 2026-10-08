import { test, expect, mock } from 'claude-code/testing'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import type { HookStream, On, TurnStepChunk, TurnStepInput, TurnStepResult, TurnUsage, RenderPropsOf, AgentInfo, AgentSpawnInput } from 'claude-code'
import type { TokenSpeedRow, TokenSpeedSnapshot, TokenSpeedLegacySnapshot } from '../types'

const REF = { plugin: 'token-speed', key: 'snapshot' } as const
const START = { cwd: '/test', surface: 'terminal', isInteractive: true } as const
const BAND: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false, isWorking: true, maxRows: 4, bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 4 }, view: {},
}
const request = (model = 'requested', index = 0): TurnStepInput => ({ turnId: 'turn', index, model, messageCount: 1 })
const usage = (output_tokens: number, model = 'actual'): TurnUsage => ({
  output_tokens, model, input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
})
const result = (e: TurnStepInput, count: number | null = 100, model = 'actual'): TurnStepResult => ({
  turnId: e.turnId, index: e.index, answer: 'same final answer', toolUses: [], stopReason: 'end_turn',
  usage: count === null ? null : usage(count, model),
})
// testing.Engine exposes dispatches, not the host's state helpers. Probe through a hook.
const PROBE: Plugin = {
  name: 'snapshot-probe',
  register(on) {
    on('command.run', { command: 'snapshot-probe' }, async ($, e) => {
      const ref = { plugin: 'token-speed', key: 'snapshot' } as const
      return { text: JSON.stringify((await $.state.get(ref)).value) }
    })
  },
}
const OPTIONS = { plugins: [PROBE] }
async function snapshotState($: Engine): Promise<TokenSpeedSnapshot> {
  const held = await command($, '', 'snapshot-probe')
  if (!held.text) throw new Error('Expected host snapshot')
  return JSON.parse(held.text) as TokenSpeedSnapshot
}
async function state($: Engine, id = 'main'): Promise<TokenSpeedRow> {
  const r = (await snapshotState($)).rows.find(r => r.id === id)
  if (!r) throw new Error(`Missing loop ${id}`)
  return r
}
async function consume(stream: HookStream<TurnStepChunk, TurnStepResult>) {
  const chunks: TurnStepChunk[] = []
  // The testing dispatch returns an AsyncGenerator; its runtime has no .result.
  for (;;) {
    const item = await stream.next()
    if (item.done) return { chunks, result: item.value }
    chunks.push(item.value)
  }
}
async function command($: Engine, args = '', name = 'tok-speed') {
  return $.command.run({ command: name, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
}
function setup(on: On, roster: () => Promise<AgentInfo[]> = async () => []): MockClock {
  const clock = mock.clock(on)
  on('fs.read', async () => ({ value: JSON.stringify({ version: 1, models: [], overrides: [
    { id: 'gpt-6.1-sol', aliases: [], window: 272000, reason: 'Test override' },
    { id: 'glm-5.3', aliases: [], window: 1000000, reason: 'Test override' },
    { id: 'glm-5.3-flash', aliases: [], window: 1000000, reason: 'Test override' },
  ] }) }))
  on('agent.list', async () => ({ value: await roster() }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('turn.complete', async (_$, e) => ({ text: e.answer, usage: e.usage }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="rest">underlying band</Text>
  })
  return clock
}
async function finishAt(clock: MockClock, pending: ReturnType<typeof consume>, ms: number) {
  await clock.settle()
  await clock.advance(ms)
  return pending
}

test('main hook passes every chunk/ref, original request and final result with one downstream request; live updates before end', OPTIONS, async ($, on) => {
  const clock = setup(on)
  let calls = 0
  let received: TurnStepInput | undefined
  const chunks: TurnStepChunk[] = [
    { kind: 'text', index: 0, text: '中文abcd', ref: 92 },
    { kind: 'thinking', index: 1, text: '思考', ref: 93 },
    { kind: 'tool', index: 2, name: 'Read', id: 'use', ref: 94 },
    { kind: 'input', index: 2, json: '{"x":1}', ref: 95 },
    { kind: 'stop', stopReason: 'end_turn', usage: usage(100), ref: 96 },
  ]
  on('turn.step', async function* (_$, e) {
    calls++; received = e
    for (const chunk of chunks) yield chunk
    await clock.sleep(2000)
    return result(e)
  })
  await $.session.start(START)
  const e = request()
  const pending = consume($.turn.step(e))
  await clock.settle()
  expect((await state($)).status).toBe('waiting')
  expect((await state($)).live).toBeNull()
  await clock.advance(250)
  expect((await state($)).status).toBe('streaming')
  // 3 text + 2 thinking + 1.75 JSON; tool/engine/stop contribute nothing.
  expect((await state($)).live).toBe(27)
  expect((await state($)).models.length).toBe(0)
  await clock.advance(1750)
  const observed = await pending
  expect(calls).toBe(1)
  expect(received).toEqual(e)
  expect(observed.chunks).toEqual(chunks)
  expect(observed.result).toEqual(result(e))
  expect((await state($)).models[0]?.lastApi).toBe(50)
  expect((await state($)).live).toBeNull()
})

test('waiting, 3 second decay and mixed Unicode code point weights; 250ms snapshots avoid per-chunk state writes', OPTIONS, async ($, on) => {
  const clock = setup(on)
  let writes = 0
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => { writes++; return next(e) })
  on('turn.step', async function* (_$, e) {
    yield { kind: 'tool', index: 0, name: 'Read', id: 'waiting' }
    await clock.sleep(500)
    // Supplementary CJK is 1, emoji one code point is .25, not .5.
    for (let i = 0; i < 20; i++) yield { kind: 'text', index: 0, text: '中𠀀🙂a' }
    await clock.sleep(3750)
    return result(e)
  })
  await $.session.start(START)
  const pending = consume($.turn.step(request()))
  await clock.settle()
  await clock.advance(250)
  expect((await state($)).status).toBe('waiting')
  expect((await state($)).live).toBe(0)
  const before = writes
  await clock.advance(500)
  expect((await state($)).status).toBe('streaming')
  expect((await state($)).live).toBe(50 / .75)
  expect(writes - before).toBeLessThanOrEqual(2)
  await clock.advance(3000)
  expect((await state($)).live).toBe(0)
  expect((await state($)).active).not.toBeNull()
  await clock.advance(500)
  await pending
})

test('API average weights request durations, excludes tool gaps, ignores turn totals and switches request models', OPTIONS, async ($, on) => {
  const clock = setup(on)
  on('turn.step', async function* (_$, e) {
    await clock.sleep(e.index === 0 ? 2000 : 3000)
    return result(e, e.index === 0 ? 100 : 300, 'unrelated-response')
  })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request('request-a', 0))), 2000)
  await clock.advance(20_000)
  await finishAt(clock, consume($.turn.step(request('request-a', 1))), 3000)
  const bucket = (await state($)).models.find(item => item.model === 'request-a')
  expect(bucket).toMatchObject({ model: 'request-a', outputTokens: 400, durationMs: 5000, samples: 2, lastApi: 100 })
  expect(bucket?.log?.length).toBe(2)
  expect((await command($)).text).toMatch('Avg 80.0 tok/s')
  await $.turn.complete({ answer: 'whole turn', durationMs: 25_000, isAborted: false, turnId: 'turn', reason: 'answer', usage: usage(400) })
  expect((await state($)).models.find(item => item.model === 'request-a')).toEqual(bucket)
  await finishAt(clock, consume($.turn.step(request('request-b', 2))), 3000)
  expect((await state($)).currentModel).toBe('request-b')
  expect((await state($)).models.length).toBe(2)
})

test('CPA unavailable/invalid usage never becomes zero; valid zero counts and zero duration cannot produce Infinity', OPTIONS, async ($, on) => {
  const clock = setup(on)
  const counts = [100, null, NaN, -1, Infinity, 0, 100] as const
  on('turn.step', async function* (_$, e) {
    if (e.index !== 6) await clock.sleep(1000)
    // Missing output_tokens/model simulates a gateway outside the typed API contract.
    const r = result(e, counts[e.index] ?? null, 'actual')
    if (e.index === 1) r.usage = { input_tokens: 0 } as TurnUsage
    return r
  })
  await $.session.start(START)
  for (let index = 0; index < counts.length; index++) {
    await finishAt(clock, consume($.turn.step(request('fallback', index))), index === 6 ? 0 : 1000)
    const held = await state($)
    if (index >= 1 && index <= 4) {
      expect(held.status).toBe('usage unavailable')
      expect(held.models.find(bucket => bucket.model === 'fallback')?.samples).toBe(1)
      expect(held.models.find(bucket => bucket.model === held.currentModel)?.lastApi).toBeNull()
    }
    if (index === 1) expect(held.currentModel).toBe('fallback')
  }
  const bucket = (await state($)).models.find(item => item.model === 'fallback')
  expect(bucket).toMatchObject({ model: 'fallback', outputTokens: 100, durationMs: 2000, samples: 2, lastApi: null })
  expect(bucket?.log?.map(sample => sample.tokens)).toEqual([100, 0])
  expect((await command($)).text).toMatch('Avg 50.0 tok/s')
  expect((await command($)).text).not.toMatch('Infinity')
})

test('subagent completion touches its own row only and the same id may start another turn', OPTIONS, async ($, on) => {
  const clock = setup(on)
  let calls = 0
  on('turn.step', async function* (_$, e) { calls++; yield { kind: 'text', index: 0, text: 'child' }; await clock.sleep(1000); return result(e, 900) })
  await $.session.start(START)
  const before = await state($)
  const e = { ...request('glm-5.3[1m]'), agentId: 'child' }
  const observed = await finishAt(clock, consume($.turn.step(e)), 1000)
  expect((await state($, 'child')).running).toBe(true)
  expect((await state($, 'child')).live).toBeNull()
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: true, turnId: 'turn', agentId: 'child', reason: 'aborted' })
  expect(calls).toBe(1)
  expect(observed.result).toEqual(result(e, 900))
  expect(await state($)).toEqual(before)
  expect((await state($, 'child')).running).toBe(false)
  const pending = consume($.turn.step({ ...e, turnId: 'new-turn' }))
  await clock.settle()
  expect((await state($, 'child')).running).toBe(true)
  await clock.advance(1000)
  await pending
})

test('downstream error is propagated and cleans active/live without adding a sample', OPTIONS, async ($, on) => {
  const clock = setup(on)
  let calls = 0
  on('turn.step', async function* () {
    calls++; yield { kind: 'text', index: 0, text: 'partial' }
    await clock.sleep(500)
    throw new Error('downstream failure')
  })
  await $.session.start(START)
  const pending = consume($.turn.step(request())).catch((error: unknown) => error)
  await clock.settle()
  await clock.advance(500)
  const error = await pending
  // The kit skips a failed bottom hook; this is the downstream engine error the meter sees.
  expect(error instanceof Error ? error.message : error).toBe('no implementation for turn.step')
  expect(calls).toBe(1)
  const held = await state($)
  expect(held.active).toBeNull()
  expect(held.live).toBeNull()
  expect(held.status).toBe('error')
  expect(held.models.reduce((sum, bucket) => sum + bucket.samples, 0)).toBe(0)
})

test('closing an unfinished stream clears live and records aborted without a precise sample', OPTIONS, async ($, on) => {
  setup(on)
  let calls = 0
  on('turn.step', async function* (_$, e) {
    calls++; yield { kind: 'text', index: 0, text: 'partial' }
    yield { kind: 'thinking', index: 1, text: 'pending' }
    return result(e)
  })
  await $.session.start(START)
  const e = request()
  const stream = $.turn.step(e)
  expect((await stream.next()).done).toBe(false)
  expect((await state($)).active).not.toBeNull()
  await stream.return(result(e))
  await $.turn.complete({ answer: 'partial', turnId: 'turn', durationMs: 500, isAborted: true, reason: 'aborted', usage: usage(900) })
  expect(calls).toBe(1)
  const held = await state($)
  expect(held.active).toBeNull()
  expect(held.live).toBeNull()
  expect(held.status).toBe('aborted')
  expect(held.models.reduce((sum, bucket) => sum + bucket.samples, 0)).toBe(0)
})

test('UI preserves downstream drawing, hides during survey/no rows, commands handle empty/reset and clear cancels timers', OPTIONS, async ($, on) => {
  const clock = setup(on)
  let calls = 0
  let writes = 0
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => { writes++; return next(e) })
  on('command.run', { command: 'unrelated' }, async () => ({ text: 'other command' }))
  on('turn.step', async function* (_$, e) { calls++; await clock.sleep(1000); return result(e) })
  await $.session.start(START)
  await $.session.start(START)
  expect((await command($)).text).toMatch('尚无本会话统计')
  expect((await command($, '', 'unrelated')).text).toBe('other command')
  const pending = consume($.turn.step(request()))
  await clock.settle()
  expect((await command($, 'reset')).text).toMatch('无法 reset')
  const before = writes
  await clock.advance(500)
  // One snapshot per 250ms: repeated session.start does not duplicate timers.
  expect(writes - before).toBe(2)
  await clock.advance(500)
  await pending
  expect(calls).toBe(1)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'token-speed', surface, component: 'AbovePrompt', props: BAND })
    const line = await ui.find({ type: 'Text', text: / · Last / })
    expect(line?.text).toMatch('Last 100.0')
    expect(line?.text?.match(/tok\/s/g)?.length).toBe(1)
    expect(line?.props.wrap).toBe('truncate-end')
    expect((await ui.find({ type: 'Text', text: 'underlying band' }))?.text).toBe('underlying band')
    await ui.unmount()
    const narrow = await $.ui.mount({ plugin: 'token-speed', surface, component: 'AbovePrompt', props: { ...BAND, bodyColumns: 80 } })
    const shortLine = await narrow.find({ type: 'Text', text: / · Avg / })
    expect(shortLine?.text).toMatch('main · requested · — · Ctx')
    expect(shortLine?.text).toMatch(/Live\s+—/)
    expect(shortLine?.text).toMatch('Avg 100.0 tok/s')
    expect(shortLine?.text).not.toMatch('Last ')
    await narrow.unmount()
    for (const props of [{ ...BAND, hasSurvey: true }, { ...BAND, maxRows: 0 }]) {
      const hidden = await $.ui.mount({ plugin: 'token-speed', surface, component: 'AbovePrompt', props })
      expect(await hidden.find({ type: 'Text', text: / · Last / })).toBeUndefined()
      expect((await hidden.find({ type: 'Text', text: 'underlying band' }))?.text).toBe('underlying band')
      await hidden.unmount()
    }
  }
  expect((await command($, 'reset')).text).toMatch('已重置')
  expect((await state($)).models).toEqual([])
  const pending2 = consume($.turn.step(request('requested', 1)))
  await clock.settle()
  await $.session.end({ reason: 'clear', sessionId: 'session', resume: { id: 'session' } })
  const held = await state($)
  expect(held.active).toBeNull()
  expect(held.seen).toBe(false)
  await clock.advance(1000)
  await pending2
  expect(await state($)).toEqual(held)
  // /clear has no following session.start: the next request restarts the timer.
  const pending3 = consume($.turn.step(request('after-clear', 2)))
  await clock.settle()
  await clock.advance(250)
  expect((await state($)).live).toBe(0)
  await clock.advance(750)
  await pending3
})

test('session.start discards stale reload active but retains host model statistics', OPTIONS, async ($, on) => {
  setup(on)
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    const legacy: TokenSpeedLegacySnapshot = {
      models: [{ model: 'retained', outputTokens: 200, durationMs: 4000, samples: 2, lastApi: 50 }],
      currentModel: 'retained', seen: true, live: 80, status: 'streaming',
      active: { id: 'old-module', turnId: 'old', model: 'retained', startedAt: 0 },
    }
    // The old host value deliberately violates v2, at this single compatibility boundary.
    return next({ ...e, value: legacy as unknown as TokenSpeedSnapshot })
  })
  // First initialization seeds a host value, just as an older module could have left it.
  await $.session.start(START)
  await $.session.start(START)
  const held = await state($)
  expect(held.models[0]?.outputTokens).toBe(200)
  expect(held.active).toBeNull()
  expect(held.live).toBeNull()
  expect(held.status).toBe('aborted')
  expect(held.models[0]?.legacy).toBe(true)
  expect((await snapshotState($)).version).toBe(2)
  expect((await command($)).text).toMatch('[legacy v0.1 response model]')
})

const FAULT: Plugin = {
  name: 'fault-injector',
  register(on) {
    let failing = ''
    let nowCalls = 0
    on('command.run', { command: 'fault-toggle' }, async (_$, e) => { failing = e.args; nowCalls = 0; return { text: 'armed' } })
    on('clock.now', async (_$, e, next) => {
      nowCalls++
      if (failing === 'finish-once' && nowCalls === 3) { failing = ''; return { deny: 'finish clock unavailable' } }
      return failing === 'clock.now' ? { deny: 'meter unavailable' } : next(e)
    })
    on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) =>
      failing === 'state.set' ? { deny: 'meter unavailable' } : next(e))
  },
}
test('a clock failure only at request finish preserves result, clears live and allows reset', { plugins: [PROBE, FAULT] }, async ($, on) => {
  setup(on)
  let calls = 0
  on('turn.step', async function* (_$, e) { calls++; yield { kind: 'text', text: 'observed', index: 0, ref: 11 }; return result(e) })
  await $.session.start(START)
  await command($, 'finish-once', 'fault-toggle')
  const e = request()
  const observed = await consume($.turn.step(e))
  expect(calls).toBe(1)
  expect(observed.result).toEqual(result(e))
  expect(observed.chunks).toEqual([{ kind: 'text', text: 'observed', index: 0, ref: 11 }])
  const held = await state($)
  expect(held.active).toBeNull()
  expect(held.live).toBeNull()
  expect(held.status).toBe('usage unavailable')
  expect(held.models.reduce((sum, bucket) => sum + bucket.samples, 0)).toBe(0)
  expect((await command($, 'reset')).text).toMatch('已重置')
})

for (const failing of ['clock.now', 'state.set'] as const) {
  test(`instrumentation ${failing} rejection cannot resend, drop or rewrite the real stream`, { plugins: [PROBE, FAULT] }, async ($, on) => {
    setup(on)
    let calls = 0
    const chunks: TurnStepChunk[] = [{ kind: 'text', text: 'survives', index: 0, ref: 23 }]
    on('turn.step', async function* (_$, e) { calls++; for (const chunk of chunks) yield chunk; return result(e) })
    await $.session.start(START)
    await command($, failing, 'fault-toggle')
    const e = request()
    const observed = await consume($.turn.step(e))
    expect(calls).toBe(1)
    expect(observed.chunks).toEqual(chunks)
    expect(observed.result).toEqual(result(e))
  })
}
