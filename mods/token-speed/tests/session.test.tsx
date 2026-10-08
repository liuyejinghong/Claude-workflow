import { test, expect, mock } from 'claude-code/testing'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import type { AgentInfo, HookStream, On, RenderPropsOf, SessionRepo, SessionUsage, TurnStepChunk, TurnStepInput, TurnStepResult } from 'claude-code'
import type { TokenSpeedRow, TokenSpeedSnapshot } from '../types'

const START = { cwd: '/test', surface: 'terminal', isInteractive: true } as const
const BAND: RenderPropsOf['AbovePrompt'] = { hasSurvey: false, isWorking: true, maxRows: 4,
  bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const DAY = 24 * 60 * 60 * 1000
const REPO: SessionRepo = { root: '/repos/Claude-workflow', remote: null, internal: false, name: 'liuyejinghong/Claude-workflow' }

interface Setup { usage?: SessionUsage; repo?: SessionRepo | null; root?: string; git?: { exitCode: number; stdout: string } }
const info = (id: string, status: AgentInfo['status'] = 'running'): AgentInfo => ({ id, status, description: `task ${id}`, type: 'worker' })
const request = (model = 'codex/gpt-6.1-sol:high', effort?: TurnStepInput['effort'], index = 0): TurnStepInput => ({
  model, index, turnId: 'turn', messageCount: 1, ...(effort === undefined ? {} : { effort }),
})
const result = (e: TurnStepInput, count = 100): TurnStepResult => ({ turnId: e.turnId, index: e.index,
  answer: 'answer', stopReason: 'end_turn', toolUses: [], usage: { model: 'gpt-6.1-sol', output_tokens: count,
    input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
const PROBE: Plugin = { name: 'session-probe', register(on) {
  on('command.run', { command: 'session-probe' }, async $ =>
    ({ text: JSON.stringify((await $.state.get({ plugin: 'token-speed', key: 'snapshot' })).value) }))
} }
const OPTIONS = { plugins: [PROBE] }
async function command($: Engine, args = '') {
  return $.command.run({ command: 'tok-speed', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
}
async function state($: Engine): Promise<TokenSpeedSnapshot> {
  const held = await $.command.run({ command: 'session-probe', args: '', origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 } })
  return JSON.parse(held.text ?? '{}') as TokenSpeedSnapshot
}
async function main($: Engine): Promise<TokenSpeedRow> {
  const held = await state($)
  const r = held.rows.find(r => r.id === 'main')
  if (!r) throw new Error('Missing main')
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
async function finishAt(clock: MockClock, pending: ReturnType<typeof consume>, ms: number) {
  await clock.settle()
  await clock.advance(ms)
  return pending
}
function setup(on: On, held: Setup = {}, roster: () => Promise<AgentInfo[]> = async () => []): MockClock {
  const clock = mock.clock(on)
  on('agent.list', async () => ({ value: await roster() }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('turn.complete', async (_$, e) => ({ text: e.answer, usage: e.usage }))
  if (held.usage) { const usage = held.usage; on('session.usage', async () => ({ value: usage })) }
  if (held.repo !== undefined) { const repo = held.repo; on('session.repo', async () => ({ value: repo })) }
  if (held.root) { const root = held.root; on('session.root', async () => ({ value: root })) }
  if (held.git) { const git = held.git; on('process.run', async () => ({ value: { exitCode: git.exitCode, stdout: git.stdout,
    stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })) }
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="rest">rest band</Text>
  })
  return clock
}

test('session line shows effort tier colour and a segmented context bar', OPTIONS, async ($, on) => {
  const clock = setup(on, { usage: { startedAt: 0, context: { tokens: 122400, window: 272000, percent: 45 }, rateLimits: [] } })
  on('turn.step', async function* (_$, e) { await clock.sleep(1000); return result(e) })
  await $.session.start(START)
  const pending = consume($.turn.step(request(undefined, 'max')))
  await finishAt(clock, pending, 1000)
  await clock.advance(750) // Reaches the usage poll cadence at ticks % 4 === 2.
  expect((await main($)).effort).toBe('max')
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const line = await ui.find({ type: 'Text', text: /gpt-6\.1-sol · max/ })
  expect(line?.text).toMatch('codex/gpt-6.1-sol · max ·')
  expect(line?.text).toMatch('█████░░░░░ 45%/272k')
  const filled = (await ui.findAll({ type: 'Text', text: '█' })).filter(node => node.text === '█')
  expect(filled.map(cell => cell.props.color)).toEqual(['success', 'success', 'success', 'success', 'warning'])
  const hollow = (await ui.findAll({ type: 'Text', text: '░' })).filter(node => node.text === '░')
  expect(hollow.map(cell => cell.props.color)).toEqual(Array<string>(5).fill('inactive'))
  await ui.unmount()
})

test('context before the first response renders an empty bar with an em dash', OPTIONS, async ($, on) => {
  const clock = setup(on, { usage: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] } })
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request())), 500)
  await clock.advance(750)
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const line = await ui.find({ type: 'Text', text: /gpt-6\.1-sol ·/ })
  expect(line?.text).toMatch('░░░░░░░░░░ —/1.0M')
  expect((await ui.findAll({ type: 'Text', text: '█' })).filter(node => node.text === '█')).toEqual([])
  await ui.unmount()
})

test('workspace line shows repository name on current branch', OPTIONS, async ($, on) => {
  const clock = setup(on, { repo: REPO, git: { exitCode: 0, stdout: 'feat/token-speed\n' } })
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request())), 500)
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const line = await ui.find({ type: 'Text', text: '⌂' })
  expect(line?.text).toMatch('⌂ Claude-workflow on feat/token-speed')
  await ui.unmount()
})

test('workspace without a repository falls back to the session folder name', OPTIONS, async ($, on) => {
  const clock = setup(on, { repo: null, root: '/work/BTCKDJ/' })
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request())), 500)
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const line = await ui.find({ type: 'Text', text: '⌂' })
  expect(line?.text).toMatch('⌂ BTCKDJ')
  expect(line?.text).not.toMatch(' on ')
  await ui.unmount()
})

test('parallel rows align their label and model columns; a lone row stays natural', OPTIONS, async ($, on) => {
  const clock = setup(on, {}, async () => [info('long-identifier-child')])
  on('turn.step', async function* (_$, e) { await clock.sleep(2000); return result(e) })
  await $.session.start(START)
  const pending = [consume($.turn.step(request())), consume($.turn.step({ ...request('glm-5.3[1m]'), agentId: 'long-identifier-child' }))]
  await clock.settle()
  await clock.advance(250)
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const lines = await ui.findAll({ type: 'Text', text: / · Live / })
  expect(lines.length).toBe(2)
  expect(lines[0]?.text).toMatch(/⚡ main\s+· codex\/gpt-6\.1-sol\s+· Live/)
  expect(lines[1]?.text).toMatch('↳ long-ide · glm-5.3')
  expect(lines[0]?.text.indexOf('·')).toBe(lines[1]?.text.indexOf('·'))
  expect(lines[0]?.text.indexOf('Live')).toBe(lines[1]?.text.indexOf('Live'))
  await ui.unmount()
  await clock.advance(1750)
  await Promise.all(pending)
})

test('Avg keeps fresh samples and drops ones older than the rolling day window', OPTIONS, async ($, on) => {
  const clock = setup(on)
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    // A synthetic finish timestamp; negative anchors a sample older than any window.
    const migrated = { version: 2, rows: [{ id: 'main', description: '', running: false,
      currentModel: 'm', models: [{ model: 'm', outputTokens: 200, durationMs: 1000, samples: 1, lastApi: 200,
        log: [{ at: 500, tokens: 200, ms: 1000 }] }], active: null, live: null,
      status: 'idle', seen: true, turnId: null, revision: 0, effort: null }],
      session: { context: { tokens: null, window: 0, percent: null }, workspace: null } }
    return next({ ...e, value: migrated as unknown as TokenSpeedSnapshot })
  })
  on('turn.step', async function* (_$, e) { await clock.sleep(3000); return result(e, 300) })
  await $.session.start(START)
  let text = (await command($)).text
  expect(text).toMatch('Avg 200.0 tok/s')
  expect(text).toMatch('24h 1 个请求')
  await finishAt(clock, consume($.turn.step(request('m'))), 3000)
  text = (await command($)).text
  expect(text).toMatch('Last 100.0 tok/s')
  expect(text).toMatch('Avg 125.0 tok/s') // 200 + 300 tokens over 1s + 3s.
  expect(text).toMatch('24h 2 个请求')
})

test('expired samples leave the window and no longer weigh the average', OPTIONS, async ($, on) => {
  const clock = setup(on)
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    const migrated = { version: 2, rows: [{ id: 'main', description: '', running: false,
      currentModel: 'm', models: [{ model: 'm', outputTokens: 200, durationMs: 1000, samples: 1, lastApi: 200,
        log: [{ at: -100 * DAY, tokens: 200, ms: 1000 }] }], active: null, live: null,
      status: 'idle', seen: true, turnId: null, revision: 0, effort: null }],
      session: { context: { tokens: null, window: 0, percent: null }, workspace: null } }
    return next({ ...e, value: migrated as unknown as TokenSpeedSnapshot })
  })
  on('turn.step', async function* (_$, e) { await clock.sleep(3000); return result(e, 300) })
  await $.session.start(START)
  let text = (await command($)).text
  expect(text).toMatch('Avg —')
  expect(text).toMatch('24h 0 个请求')
  await finishAt(clock, consume($.turn.step(request('m'))), 3000)
  text = (await command($)).text
  expect(text).toMatch('Avg 100.0 tok/s')
  expect(text).toMatch('24h 1 个请求')
  expect(text).not.toMatch('Avg 200.0 tok/s')
})

test('migrated v0.2 buckets fall back to the aggregate average until a new request', OPTIONS, async ($, on) => {
  const clock = setup(on)
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    const migrated = { version: 2, rows: [{ id: 'main', description: '', running: false,
      currentModel: 'codex/gpt-6.1-sol', models: [{ model: 'codex/gpt-6.1-sol', outputTokens: 400,
        durationMs: 4000, samples: 2, lastApi: 50 }], active: null, live: null, status: 'idle',
      seen: true, turnId: null, revision: 0, effort: null }],
      session: { context: { tokens: null, window: 0, percent: null }, workspace: null } }
    return next({ ...e, value: migrated as unknown as TokenSpeedSnapshot })
  })
  on('turn.step', async function* (_$, e) { await clock.sleep(1000); return result(e, 200) })
  await $.session.start(START)
  let text = (await command($)).text
  expect(text).toMatch('Avg 100.0 tok/s')
  expect(text).toMatch('累计 2 个有效请求')
  await finishAt(clock, consume($.turn.step(request())), 1000)
  text = (await command($)).text
  expect(text).toMatch('Avg 200.0 tok/s')
  expect(text).toMatch('24h 1 个请求')
})

test('band budget drops the workspace line before the session line', OPTIONS, async ($, on) => {
  const clock = setup(on, { usage: { startedAt: 0, context: { tokens: 122400, window: 272000, percent: 45 }, rateLimits: [] },
    repo: REPO, git: { exitCode: 0, stdout: 'main\n' } })
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request())), 500)
  await clock.advance(750)
  for (const [maxRows, session, workspace] of [[2, true, false], [3, true, true], [1, false, false]] as const) {
    const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, maxRows } })
    expect(Boolean(await ui.find({ type: 'Text', text: '45%/272k' }))).toBe(session)
    expect(Boolean(await ui.find({ type: 'Text', text: '⌂' }))).toBe(workspace)
    expect((await ui.findAll({ type: 'Text', text: / · Live / })).length).toBe(1)
    await ui.unmount()
  }
})
