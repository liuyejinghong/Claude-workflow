import { test, expect, mock } from 'claude-code/testing'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, HookStream, On, RenderPropsOf, TurnStepChunk, TurnStepInput, TurnStepResult } from 'claude-code'
import type { TokenSpeedSnapshot, TokenSpeedRow } from '../types'

const START = { cwd: '/test', surface: 'terminal', isInteractive: true } as const
const BAND: RenderPropsOf['AbovePrompt'] = { hasSurvey: false, isWorking: true, maxRows: 4,
  bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const info = (id: string, status: AgentInfo['status'] = 'running'): AgentInfo => ({ id, status, description: `task ${id}`, type: 'worker' })
const request = (id?: string, model = 'codex/gpt-6.1-sol:high', index = 0, turnId = 'turn'): TurnStepInput => ({
  ...(id ? { agentId: id } : {}), model, index, turnId, messageCount: 1,
})
const result = (e: TurnStepInput, count = 100): TurnStepResult => ({ turnId: e.turnId, index: e.index,
  answer: 'answer', stopReason: 'end_turn', toolUses: [], usage: { model: 'gpt-6.1-sol', output_tokens: count,
    input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
const spawnInput = (description: string): AgentSpawnInput => ({ description, tool_use_id: description,
  prompt: 'synthetic task', subagentType: 'worker', provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'codex/gpt-6.1-sol', background: true, fork: false })
const PROBE: Plugin = { name: 'agents-probe', register(on) {
  on('command.run', { command: 'agents-probe' }, async $ => ({ text: JSON.stringify((await $.state.get({ plugin: 'token-speed', key: 'snapshot' })).value) }))
} }
const OPTIONS = { plugins: [PROBE] }
async function command($: Engine, args = '', name = 'tok-speed') {
  return $.command.run({ command: name, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
}
async function state($: Engine): Promise<TokenSpeedSnapshot> {
  return JSON.parse((await command($, '', 'agents-probe')).text ?? '{}') as TokenSpeedSnapshot
}
async function loop($: Engine, id = 'main'): Promise<TokenSpeedRow> {
  const r = (await state($)).rows.find(r => r.id === id)
  if (!r) throw new Error(`Missing ${id}`)
  return r
}
async function consume(stream: HookStream<TurnStepChunk, TurnStepResult>) {
  const chunks: TurnStepChunk[] = []
  for (;;) {
    const item = await stream.next()
    if (item.done) return { chunks, result: item.value }
    chunks.push(item.value)
  }
}
function setup(on: On, list: () => Promise<AgentInfo[]> = async () => []): MockClock {
  const clock = mock.clock(on)
  on('agent.list', async () => ({ value: await list() }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('turn.complete', async (_$, e) => ({ text: e.answer, usage: e.usage }))
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="rest">other mod</Text>
  })
  return clock
}
async function complete($: Engine, id: string, turnId = 'turn') {
  return $.turn.complete({ agentId: id, turnId, answer: '', durationMs: 1000, isAborted: false, reason: 'answer' })
}

test('main plus three simultaneous children have four live rows in all views and separate same-model weighted buckets', OPTIONS, async ($, on) => {
  const ids = ['abcdefg1-child', 'abcdefg2-child', 'third-child']
  const clock = setup(on, async () => ids.map(id => info(id)))
  const requests = [request(), ...ids.map(id => request(id))]
  let writes = 0
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => { writes++; return next(e) })
  on('turn.step', async function* (_$, e) {
    yield { kind: 'text', index: 0, text: e.agentId === ids[0] ? '中文中文' : '中' }
    await clock.sleep(e.index === 1 ? 3000 : 2000)
    return result(e, e.index === 1 ? 300 : e.agentId === ids[0] ? 200 : 100)
  })
  await $.session.start(START)
  const pending = requests.map(e => consume($.turn.step(e)))
  await clock.settle()
  const before = writes
  await clock.advance(250)
  expect(writes - before).toBe(1) // All live values published in one atomic tick.
  const held = await state($)
  expect(held.version).toBe(2)
  expect(held.rows.map(r => r.id)).toEqual(['main', ...ids])
  expect(held.rows.every(r => r.active !== null && r.live !== null)).toBe(true)
  expect((await loop($, ids[0])).live).toBe(16)
  expect((await loop($, ids[1])).live).toBe(4)
  for (const view of [{}, { agentId: ids[1] }]) {
    const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, view } })
    const lines = await ui.findAll({ type: 'Text', text: /Live/ })
    expect(lines.length).toBe(4)
    expect(lines[0]?.text).toMatch(/⚡ main\s+· codex\/gpt-6\.1-sol/)
    expect(lines[1]?.text).toMatch('↳ abcdefg1')
    expect(lines[2]?.text).toMatch('↳ abcdefg2')
    expect((await ui.find({ type: 'Text', text: 'other mod' }))?.text).toBe('other mod')
    await ui.unmount()
  }
  expect((await command($, 'reset')).text).toMatch('无法 reset')
  await clock.advance(1750)
  await Promise.all(pending)
  expect((await loop($)).models[0]?.outputTokens).toBe(100)
  expect((await loop($, ids[0])).models[0]?.outputTokens).toBe(200)
  expect((await loop($, ids[1])).models[0]?.outputTokens).toBe(100)
  const more = consume($.turn.step(request(ids[1], 'gpt-6.1-sol(high)[1m]', 1)))
  await clock.settle()
  await clock.advance(3000)
  await more
  expect((await loop($, ids[1])).models).toMatchObject([{ model: 'codex/gpt-6.1-sol', outputTokens: 400, durationMs: 5000, samples: 2, lastApi: 100 }])
  expect((await loop($, ids[0])).models[0]?.durationMs).toBe(2000)
})

test('canonical request models clean repeated suffixes, keep proven prefix and ignore bare response models', OPTIONS, async ($, on) => {
  const clock = setup(on)
  on('turn.step', async function* (_$, e) { await clock.sleep(1000); return result(e) })
  await $.session.start(START)
  const names = [' codex/gpt-6.1-sol(high)[1m] ', 'gpt-6.1-sol:high', 'glm-5.3-flash[1m]:max', 'other:variant(high)', 'codex/gpt-6.1-sol:high[1m](max)']
  for (let index = 0; index < names.length; index++) {
    const pending = consume($.turn.step(request(undefined, names[index], index)))
    await clock.settle(); await clock.advance(1000); await pending
  }
  const main = await loop($)
  expect(main.currentModel).toBe('codex/gpt-6.1-sol')
  expect(main.models.map(b => b.model)).toEqual(['glm-5.3-flash', 'other:variant', 'codex/gpt-6.1-sol'])
  expect(main.models.find(b => b.model === 'codex/gpt-6.1-sol')?.samples).toBe(3)
  expect(main.models.some(b => b.model.includes('zhipu'))).toBe(false)
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 80 } })
  const line = await ui.find({ type: 'Text', text: /Live/ })
  expect(line?.text).toMatch('main · codex/gpt-6.1-sol · Live')
  expect(line?.text).toMatch('Avg')
  expect(line?.text).not.toMatch('Last ')
  await ui.unmount()
})

test('already-running agents are adopted with unknown model, tool gaps retain rows, reset preserves metadata and terminal entries remove', OPTIONS, async ($, on) => {
  let roster: AgentInfo[] = [info('already-running'), info('idle-teammate', 'idle')]
  const clock = setup(on, async () => roster)
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  expect((await loop($, 'already-running')).currentModel).toBeNull()
  expect((await loop($, 'already-running')).live).toBeNull()
  expect((await state($)).rows.some(r => r.id === 'idle-teammate')).toBe(false)
  let ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect((await ui.findAll({ type: 'Text', text: /Live/ })).length).toBe(2)
  expect((await ui.find({ type: 'Text', text: /↳/ }))?.text).toMatch(/unknown · Live\s+—/)
  await ui.unmount()
  const pending = consume($.turn.step(request('already-running', 'glm-5.3[1m]')))
  await clock.settle(); await clock.advance(500); await pending
  expect((await loop($, 'already-running')).running).toBe(true)
  expect((await loop($, 'already-running')).status).toBe('idle')
  expect((await command($, 'reset')).text).toMatch('已重置')
  expect((await loop($, 'already-running')).models).toEqual([])
  expect((await loop($, 'already-running')).description).toBe('task already-running')
  expect((await loop($, 'already-running')).running).toBe(true)
  roster = [info('already-running', 'waiting')]
  await clock.advance(500)
  expect((await loop($, 'already-running')).running).toBe(true)
  roster = []
  await clock.advance(1000)
  expect((await loop($, 'already-running')).running).toBe(true) // Absence cannot race a spawn.
  roster = [info('already-running', 'killed')]
  await clock.advance(1000)
  expect((await loop($, 'already-running')).running).toBe(false)
  ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect((await ui.findAll({ type: 'Text', text: /↳/ })).length).toBe(0)
  await ui.unmount()
})

test('list rejection leaves active rows untouched and UI render never queries the roster', OPTIONS, async ($, on) => {
  let calls = 0
  let reject = false
  const clock = setup(on, async () => { calls++; if (reject) throw new Error('list unavailable'); return [info('kept')] })
  on('turn.step', async function* (_$, e) { yield { kind: 'text', index: 0, text: '中' }; await clock.sleep(3000); return result(e) })
  await $.session.start(START)
  const pending = consume($.turn.step(request('kept')))
  await clock.settle()
  reject = true
  await clock.advance(1000)
  expect((await loop($, 'kept')).running).toBe(true)
  expect((await loop($, 'kept')).active).not.toBeNull()
  const before = calls
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect((await ui.findAll({ type: 'Text', text: /Live/ })).length).toBe(2)
  expect(calls).toBe(before)
  await ui.unmount()
  await clock.advance(2000); await pending
})

test('spawn metadata resolves after a finished step without overwriting stats or resurrecting the child', OPTIONS, async ($, on) => {
  const clock = setup(on, async () => [{ ...info('late-spawn'), description: 'late description' }])
  let spawnCalls = 0
  on('agent.spawn', async () => { spawnCalls++; await clock.sleep(2000); return { agentId: 'late-spawn', model: 'glm-5.3[1m]' } })
  on('turn.step', async function* (_$, e) { yield { kind: 'text', index: 0, text: '中' }; await clock.sleep(500); return result(e) })
  await $.session.start(START)
  const spawning = $.agent.spawn(spawnInput('late description'))
  const pending = consume($.turn.step(request('late-spawn', 'codex/gpt-6.1-sol:high')))
  await clock.settle(); await clock.advance(500); await pending
  await complete($, 'late-spawn')
  await clock.advance(1500); await spawning
  const held = await loop($, 'late-spawn')
  expect(spawnCalls).toBe(1)
  expect(held.description).toBe('late description')
  expect(held.running).toBe(false)
  expect(held.currentModel).toBe('codex/gpt-6.1-sol')
  expect(held.models[0]?.samples).toBe(1)
})

test('old roster terminal reply cannot swallow a newly-started turn, and old running reply cannot revive completed turn', OPTIONS, async ($, on) => {
  let reply: AgentInfo[] = [info('racing')]
  let gate: (() => void) | undefined
  let block = false
  const clock = setup(on, async () => {
    const held = reply
    if (block) await new Promise<void>(resolve => { gate = resolve })
    return held
  })
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  block = true; reply = [info('racing', 'completed')]
  await clock.advance(1000)
  expect(gate).not.toBeUndefined()
  const pending = consume($.turn.step(request('racing', 'glm-5.3[1m]', 0, 'new-turn')))
  await clock.settle()
  gate?.(); block = false
  await clock.settle()
  expect((await loop($, 'racing')).running).toBe(true)
  expect((await loop($, 'racing')).active).not.toBeNull()
  await clock.advance(500); await pending
  block = true; reply = [info('racing')]
  await clock.advance(500)
  await complete($, 'racing', 'new-turn')
  gate?.(); block = false
  await clock.settle()
  expect((await loop($, 'racing')).running).toBe(false)
})

test('clear invalidates late child results and spawn metadata, and next child step restarts the timer', OPTIONS, async ($, on) => {
  const clock = setup(on, async () => [info('child')])
  on('agent.spawn', async () => { await clock.sleep(1000); return { agentId: 'child', model: 'glm-5.3' } })
  on('turn.step', async function* (_$, e) { yield { kind: 'text', index: 0, text: '中' }; await clock.sleep(1000); return result(e) })
  await $.session.start(START)
  const spawning = $.agent.spawn(spawnInput('old spawn'))
  const pending = consume($.turn.step(request('child')))
  await clock.settle()
  expect((await command($, 'reset')).text).toMatch('无法 reset')
  await $.session.end({ reason: 'clear', sessionId: 'session', resume: { id: 'session' } })
  const cleared = await state($)
  await clock.advance(1000); await pending; await spawning
  expect(await state($)).toEqual(cleared)
  const next = consume($.turn.step(request('child', 'glm-5.3[1m]', 1, 'next')))
  await clock.settle(); await clock.advance(250)
  expect((await loop($, 'child')).live).toBe(4)
  await clock.advance(750); await next
})

test('hot reload clears stale active per loop, retains every bucket and adopts running roster metadata', OPTIONS, async ($, on) => {
  setup(on, async () => [info('old-child')])
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    const oldRow = (id: string): TokenSpeedRow => ({ id, description: '', running: true, seen: true,
      currentModel: 'codex/gpt-6.1-sol', models: [{ model: 'codex/gpt-6.1-sol', outputTokens: id === 'main' ? 100 : 200,
        durationMs: 2000, samples: 1, lastApi: 50 }], active: { id: `stale-${id}`, turnId: 'old', model: 'codex/gpt-6.1-sol', startedAt: 0 },
      live: 100, status: 'streaming', turnId: 'old', revision: 4, effort: null })
    return next({ ...e, value: { version: 2, rows: [oldRow('main'), oldRow('old-child')],
      session: { context: { tokens: null, window: 0, percent: null }, workspace: null } } })
  })
  await $.session.start(START)
  await $.session.start(START)
  expect((await loop($)).models[0]?.outputTokens).toBe(100)
  expect((await loop($, 'old-child')).models[0]?.outputTokens).toBe(200)
  expect((await state($)).rows.every(r => r.active === null && r.live === null)).toBe(true)
  expect((await loop($, 'old-child')).description).toBe('task old-child')
})

test('no arbitrary four-row limit, immediate completion hides only its child and main remains first', OPTIONS, async ($, on) => {
  const ids = ['child1', 'child2', 'child3', 'child4', 'child5']
  const clock = setup(on, async () => ids.map(id => info(id)))
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  const pending = consume($.turn.step(request('child3')))
  await clock.settle(); await clock.advance(500); await pending
  await complete($, 'child3')
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, view: { agentId: 'child5' } } })
  const lines = await ui.findAll({ type: 'Text', text: /Live/ })
  expect(lines.length).toBe(5)
  expect(lines[0]?.text).toMatch('⚡ main')
  expect(lines.some(line => line.text.includes('child3'))).toBe(false)
  expect(lines.some(line => line.text.includes('child5'))).toBe(true)
  await ui.unmount()
})
