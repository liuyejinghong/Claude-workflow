import { test, expect, mock } from 'claude-code/testing'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import type { AgentInfo, HookStream, On, RenderPropsOf, SessionRepo, SessionUsage, TurnStepChunk, TurnStepInput, TurnStepResult } from 'claude-code'
import type { TokenSpeedRow, TokenSpeedSnapshot } from '../types'

const START = { cwd: '/test', surface: 'terminal', isInteractive: true } as const
const BAND: RenderPropsOf['AbovePrompt'] = { hasSurvey: false, isWorking: true, maxRows: 4,
  bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const DAY = 24 * 60 * 60 * 1000
const REPO: SessionRepo = { root: '/repos/Claude-workflow', remote: null, internal: false, name: 'liuyejinghong/Claude-workflow' }

interface Setup { usage?: SessionUsage; repo?: SessionRepo | null; root?: string; git?: { exitCode: number; stdout: string }; model?: string; settings?: Record<string, unknown>; registry?: string; registryRead?: () => void }
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
  on('fs.read', async () => { held.registryRead?.(); return { value: held.registry ?? JSON.stringify({ version: 1, models: [], overrides: [
    { id: 'gpt-6.1-sol', aliases: [], window: 272000, reason: 'Test override' },
    { id: 'glm-5.3', aliases: [], window: 1000000, reason: 'Test override' },
    { id: 'glm-5.3-flash', aliases: [], window: 1000000, reason: 'Test override' },
  ] }) } })
  on('agent.list', async () => ({ value: await roster() }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('turn.complete', async (_$, e) => ({ text: e.answer, usage: e.usage }))
  if (held.model) { const model = held.model; on('session.model', async () => ({ value: model })) }
  if (held.settings) { const settings = held.settings; on('settings.read', async () => ({ value: settings })) }
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

test('agent line shows effort tier colour and a uniform context meter without duplicate model', OPTIONS, async ($, on) => {
  const clock = setup(on, { usage: { startedAt: 0, context: { tokens: 122400, window: 272000, percent: 45 }, rateLimits: [] },
    repo: REPO, git: { exitCode: 0, stdout: 'main\n' } })
  on('turn.step', async function* (_$, e) { await clock.sleep(1000); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request(undefined, 'max'))), 1000)
  await clock.advance(750)
  expect((await main($)).effort).toBe('max')
  expect((await main($)).effortSource).toBe('request')
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const lines = await ui.findAll({ type: 'Text', text: / · Live / })
  expect(lines.length).toBe(1)
  expect(lines[0]?.text).toMatch('gpt-6.1-sol · max · Ctx ')
  expect(lines[0]?.text).not.toMatch('codex/')
  expect(lines[0]?.text).toMatch('45%/272k')
  expect(lines[0]?.text.match(/gpt-6\.1-sol/g)?.length).toBe(1)
  const fill = await ui.find({ type: 'Text', text: /^█[█▏▎▍▌▋▊▉]*$/ })
  expect(fill?.props.color).toBe('rate_limit_fill')
  expect((await ui.find({ type: 'Text', text: /^gpt-6\.1-sol$/ }))?.props.color).toBe('text')
  expect((await ui.find({ type: 'Text', text: /^⚡ main$/ }))?.props.color).toBe('claude')
  const meter = (await ui.findAll({ type: 'Text' })).find(node => node.props.backgroundColor === 'rate_limit_empty')
  expect(meter?.props.backgroundColor).toBe('rate_limit_empty')
  expect(meter?.text.length).toBe(10)
  expect(lines[0]?.text).not.toMatch(/[━─]/)
  expect((await ui.findAll({ type: 'Text', text: /⌂/ })).length).toBe(1)
  expect((await command($)).text).toMatch('codex/gpt-6.1-sol')
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
  expect(line?.text).toMatch('—%/1.0M')
  expect(await ui.find({ type: 'Text', text: /█/ })).toBeUndefined()
  const meter = (await ui.findAll({ type: 'Text' })).find(node => node.props.backgroundColor === 'rate_limit_empty')
  expect(meter?.text).toBe(' '.repeat(10))
  expect(meter?.props.backgroundColor).toBe('rate_limit_empty')
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
  expect(lines[0]?.text).toMatch(/⚡ main\s+· gpt-6\.1-sol\s+· high\s+· Ctx/)
  expect(lines[1]?.text).toMatch(/↳ long-ide · glm-5\.3\s+· —\s+· Ctx/)
  const cells = (text: string): number => Array.from(text).reduce((sum, char) => sum + (char === '⚡' ? 2 : 1), 0)
  const prefix = (text: string, marker: string) => cells(text.slice(0, text.indexOf(marker)))
  expect(prefix(lines[0]?.text ?? '', '·')).toBe(prefix(lines[1]?.text ?? '', '·'))
  expect(prefix(lines[0]?.text ?? '', 'Live')).toBe(prefix(lines[1]?.text ?? '', 'Live'))
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

test('band budget preserves one complete agent line and places workspace last', OPTIONS, async ($, on) => {
  const clock = setup(on, { usage: { startedAt: 0, context: { tokens: 122400, window: 272000, percent: 45 }, rateLimits: [] },
    repo: REPO, git: { exitCode: 0, stdout: 'main\n' } })
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request())), 500)
  await clock.advance(750)
  for (const [maxRows, workspace] of [[2, true], [3, true], [1, false]] as const) {
    const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, maxRows } })
    expect(Boolean(await ui.find({ type: 'Text', text: '45%/272k' }))).toBe(true)
    expect(Boolean(await ui.find({ type: 'Text', text: '⌂' }))).toBe(workspace)
    expect((await ui.findAll({ type: 'Text', text: / · Live / })).length).toBe(1)
    await ui.unmount()
  }
})


test('reload initializes main model-specific configuration effort and classic applied effort is observed once', OPTIONS, async ($, on) => {
  setup(on, { model: 'claude-opus-5-5', settings: { effortLevel: 'high',
    modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } }, env: { privateField: 'never-persist' } } })
  let calls = 0
  on('classic.PostToolUse', async () => { calls++; return {} })
  await $.session.start(START)
  expect((await main($)).effort).toBe('medium')
  expect((await main($)).effortSource).toBe('configured')
  expect(JSON.stringify(await state($))).not.toMatch('never-persist')
  await $.classic.PostToolUse({ tool_name: 'Read', tool_input: {}, tool_response: {}, tool_use_id: 'r', effort: { level: 'max' } })
  expect(calls).toBe(1)
  expect((await main($)).effort).toBe('max')
  expect((await main($)).effortSource).toBe('applied')
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect((await ui.find({ type: 'Text', text: /Live/ }))?.text).toMatch('claude-opus-5-5 · max · Ctx')
  await ui.unmount()
})

test('each child keeps latest CLI inputs and unknown denominator; only installed compaction clears it', OPTIONS, async ($, on) => {
  const clock = setup(on, { usage: { startedAt: 0, context: { tokens: 182240, window: 272000, percent: 67 }, rateLimits: [] } }, async () => [info('child')])
  on('turn.step', async function* (_$, e) {
    await clock.sleep(500)
    const r = result(e)
    if (r.usage) { r.usage.input_tokens = e.index === 0 ? 1000 : 2000; r.usage.cache_read_input_tokens = 3000; r.usage.cache_creation_input_tokens = 500 }
    return r
  })
  let skip = false
  const messages = [{ role: 'user' as const, text: 'compacted summary', toolUses: [] }]
  on('session.compact', async () => skip ? { skip: 'blocked' } : { messages })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step({ ...request('provider/worker:medium', undefined, 0), agentId: 'child' })), 500)
  expect((await state($)).rows.find(r => r.id === 'child')?.context).toEqual({ tokens: 4500, window: 0, percent: null, source: 'cli-input' })
  await finishAt(clock, consume($.turn.step({ ...request('provider/worker', undefined, 1), agentId: 'child' })), 500)
  expect((await state($)).rows.find(r => r.id === 'child')?.context.tokens).toBe(5500)
  expect((await state($)).rows.find(r => r.id === 'child')?.effort).toBeNull()
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 240 } })
  expect((await ui.find({ type: 'Text', text: /↳ child/ }))?.text).toMatch('5.5k/?')
  expect((await ui.find({ type: 'Text', text: /↳ child/ }))?.text).not.toMatch('67%')
  expect((await main($)).context.percent).toBe(67)
  await ui.unmount()
  await $.session.compact({ trigger: 'precompute', agentId: 'child', messages })
  expect((await state($)).rows.find(r => r.id === 'child')?.context.tokens).toBe(5500)
  skip = true
  await $.session.compact({ trigger: 'auto', agentId: 'child', messages })
  expect((await state($)).rows.find(r => r.id === 'child')?.context.tokens).toBe(5500)
  skip = false
  await $.session.compact({ trigger: 'auto', agentId: 'child', messages })
  expect((await state($)).rows.find(r => r.id === 'child')?.context.tokens).toBeNull()
  expect((await main($)).context.percent).toBe(67)
})

test('fixed 10-cell block meter: 67 and 68 share a fill but keep distinct integer labels; aligned rows fit 80/120/240 cells with one unit', OPTIONS, async ($, on) => {
  const usage: SessionUsage = { startedAt: 0, context: { tokens: 182240, window: 272000, percent: 67 }, rateLimits: [] }
  const clock = setup(on, { usage, repo: REPO, git: { exitCode: 0, stdout: 'main\n' } }, async () => [info('child')])
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request(undefined, 'high'))), 500)
  await finishAt(clock, consume($.turn.step({ ...request('provider/中文🙂', 'medium'), agentId: 'child' })), 500)
  const cells = (text: string): number => Array.from(text).reduce((sum, char) => sum + (char === '⚡' || char === '🙂' || /[中⽂文]/u.test(char) ? 2 : 1), 0)
  let compact67 = ''
  let full67 = ''
  for (const columns of [80, 120, 240]) {
    const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: columns } })
    const lines = await ui.findAll({ type: 'Text', text: / · Live / })
    expect(lines.length).toBe(2)
    for (const line of lines) {
      expect(cells(line.text)).toBeLessThanOrEqual(columns)
      expect(line.text.match(/tok\/s/g)?.length).toBe(1)
      expect(line.text).toMatch('Ctx')
      expect(line.text).toMatch('Avg')
      expect(line.text).not.toMatch('provider/')
    }
    const mainLine = lines[0]?.text ?? ''
    expect(mainLine).toMatch('67%/272k')
    if (columns === 240) {
      full67 = mainLine
      const meter = (await ui.findAll({ type: 'Text' })).find(node => node.props.backgroundColor === 'rate_limit_empty')
      expect(meter?.text).toBe('█'.repeat(6) + '▊' + ' '.repeat(3))
      expect(meter?.text.length).toBe(10)
      expect(meter?.props.backgroundColor).toBe('rate_limit_empty')
      expect((await ui.find({ type: 'Text', text: /^█+▊$/ }))?.props.color).toBe('rate_limit_fill')
    }
    if (columns === 120) compact67 = mainLine
    const prefix = (text: string, marker: string) => cells(text.slice(0, text.indexOf(marker)))
    expect(prefix(mainLine, 'Live')).toBe(prefix(lines[1]?.text ?? '', 'Live'))
    expect((await ui.find({ type: 'Text', text: 'rest band' }))?.text).toBe('rest band')
    await ui.unmount()
  }
  usage.context.percent = 68
  await clock.advance(1000)
  for (const columns of [120, 240]) {
    const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: columns } })
    const line = (await ui.findAll({ type: 'Text', text: / · Live / }))[0]?.text ?? ''
    expect(line).toMatch('68%/272k')
    expect(line).not.toBe(columns === 120 ? compact67 : full67)
    if (columns === 240) expect(((await ui.findAll({ type: 'Text' })).find(node => node.props.backgroundColor === 'rate_limit_empty'))?.text).toBe('█'.repeat(6) + '▊' + ' '.repeat(3))
    await ui.unmount()
  }
})


test('all integer percentages 0..100 map to 81 visual 10-cell fills; 0/50/100 shapes and rate_limit_fill colour are fixed', OPTIONS, async ($, on) => {
  const usage: SessionUsage = { startedAt: 0, context: { window: 272000, percent: 0, tokens: 0 }, rateLimits: [] }
  const clock = setup(on, { usage })
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request())), 500)
  const visuals = new Set<string>()
  for (let percent = 0; percent <= 100; percent++) {
    usage.context.percent = percent
    usage.context.tokens = Math.round(272000 * percent / 100)
    await clock.advance(1000)
    const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 240 } })
    const meter = (await ui.findAll({ type: 'Text' })).find(node => node.props.backgroundColor === 'rate_limit_empty')
    expect(meter?.text.length).toBe(10)
    expect(meter?.props.backgroundColor).toBe('rate_limit_empty')
    const text = meter?.text ?? ''
    expect(text).not.toMatch(/[━─]/)
    visuals.add(text)
    if (percent === 0) expect(text).toBe(' '.repeat(10))
    if (percent === 50) {
      expect(text).toBe('█'.repeat(5) + ' '.repeat(5))
      expect((await ui.findAll({ type: 'Text', text: /^█+$/ })).find(node => node.props.color === 'rate_limit_fill')?.text).toBe('█'.repeat(5))
    }
    if (percent === 100) {
      expect(text).toBe('█'.repeat(10))
      expect((await ui.findAll({ type: 'Text', text: /^█+$/ })).find(node => node.props.color === 'rate_limit_fill')?.text).toBe('█'.repeat(10))
    }
    expect((await ui.find({ type: 'Text', text: / · Live / }))?.text).toMatch(`${percent}%/272k`)
    await ui.unmount()
  }
  expect(visuals.size).toBe(81)
})

test('child windows use only configured model tails; latest inputs, model switches and compaction stay independent', OPTIONS, async ($, on) => {
  const clock = setup(on, { usage: { startedAt: 0, context: { window: 500000, tokens: 50000, percent: 10 }, rateLimits: [] } }, async () => [info('child')])
  on('turn.step', async function* (_$, e) {
    await clock.sleep(500)
    const r = result(e)
    if (r.usage) { r.usage.input_tokens = e.index === 3 ? 300000 : 100000; r.usage.cache_read_input_tokens = 25000; r.usage.cache_creation_input_tokens = 11000 }
    return r
  })
  const messages = [{ role: 'user' as const, text: 'summary', toolUses: [] }]
  on('session.compact', async () => ({ messages }))
  await $.session.start(START)
  const sol = consume($.turn.step({ ...request('codex/gpt-6.1-sol:high'), agentId: 'child' }))
  await clock.settle()
  expect((await state($)).rows.find(r => r.id === 'child')?.context).toEqual({ tokens: null, window: 272000, percent: null, source: 'cli-input-window-config' })
  await clock.advance(500); await sol
  expect((await state($)).rows.find(r => r.id === 'child')?.context).toEqual({ tokens: 136000, window: 272000, percent: 50, source: 'cli-input-window-config' })
  for (const model of ['zcode/GLM-5.3[1m]', 'zcode/GLM-5.3-Flash:max[1m]']) {
    const pending = consume($.turn.step({ ...request(model, undefined, 1), agentId: 'child' }))
    await clock.settle()
    expect((await state($)).rows.find(r => r.id === 'child')?.context.percent).toBeNull()
    await clock.advance(500); await pending
    expect((await state($)).rows.find(r => r.id === 'child')?.context).toEqual({ tokens: 136000, window: 1000000, percent: 14, source: 'cli-input-window-config' })
  }
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 240 } })
  expect((await ui.find({ type: 'Text', text: /↳ child/ }))?.text).toMatch('14%/1.0M')
  expect((await main($)).context.window).toBe(500000)
  expect((await command($)).text).toMatch('cli-input-window-config')
  await ui.unmount()
  await $.session.compact({ trigger: 'auto', agentId: 'child', messages })
  expect((await state($)).rows.find(r => r.id === 'child')?.context).toEqual({ tokens: null, window: 1000000, percent: null, source: 'cli-input-window-config' })
  await finishAt(clock, consume($.turn.step({ ...request('codex/gpt-6.1-sol', undefined, 3), agentId: 'child' })), 500)
  expect((await state($)).rows.find(r => r.id === 'child')?.context.percent).toBe(124)
  await finishAt(clock, consume($.turn.step({ ...request('provider/other', undefined, 4), agentId: 'child' })), 500)
  expect((await state($)).rows.find(r => r.id === 'child')?.context).toEqual({ tokens: 136000, window: 0, percent: null, source: 'cli-input' })
})


test('packaged registry loads once per module and official default follows each child latest input while main runtime wins', OPTIONS, async ($, on) => {
  const registry = JSON.stringify({ version: 1, models: [{ id: 'verified-child', aliases: ['verified-alias'], defaultWindow: 200000,
    maxWindow: 1000000, sourceURL: 'https://docs.example.com/models/verified-child', date: '2026-10-09' }],
    overrides: [{ id: 'gpt-6.1-sol', aliases: [], window: 272000, reason: 'Confirmed cap' }] })
  let reads = 0
  const clock = setup(on, { registry, registryRead: () => { reads++ }, model: 'codex/gpt-6.1-sol', usage: { startedAt: 0, context: { tokens: 50000, window: 500000, percent: 10 }, rateLimits: [] } })
  on('turn.step', async function* (_$, e) {
    await clock.sleep(500)
    const r = result(e)
    if (r.usage) r.usage.input_tokens = e.index === 0 ? 100000 : 120000
    return r
  })
  await $.session.start(START)
  await $.session.start(START)
  expect(reads).toBe(1)
  await finishAt(clock, consume($.turn.step({ ...request('provider/verified-alias[1m]', undefined, 0), agentId: 'child' })), 500)
  expect((await state($)).rows.find(r => r.id === 'child')?.context).toEqual({ tokens: 100000, window: 200000, percent: 50, source: 'cli-input-official-default' })
  await finishAt(clock, consume($.turn.step({ ...request('provider/verified-alias', undefined, 1), agentId: 'child' })), 500)
  expect((await state($)).rows.find(r => r.id === 'child')?.context.tokens).toBe(120000)
  expect((await state($)).rows.find(r => r.id === 'child')?.context.percent).toBe(60)
  expect((await main($)).context.window).toBe(500000)
  const output = (await command($)).text
  expect(output).toMatch('context registry v1')
  expect(output).toMatch('https://docs.example.com/models/verified-child')
  expect(output).toMatch('checked 2026-10-09')
  expect(reads).toBe(1)
})

test('bad packaged registry is observational and preserves confirmed CLI overrides', OPTIONS, async ($, on) => {
  const clock = setup(on, { registry: '{' })
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step({ ...request('codex/gpt-6.1-sol'), agentId: 'child' })), 500)
  expect((await state($)).rows.find(r => r.id === 'child')?.context.window).toBe(272000)
  expect((await command($)).text).toMatch('load failed: confirmed overrides only')
})

test('partial session readings keep the last known main measurement and a model switch never blanks it', OPTIONS, async ($, on) => {
  const usage: SessionUsage = { startedAt: 0, context: { tokens: 122400, window: 272000, percent: 45 }, rateLimits: [] }
  let model = 'codex/gpt-6.1-sol'
  const clock = setup(on, { usage })
  on('session.model', async () => ({ value: model }))
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request())), 500)
  await clock.advance(1000)
  const known = { tokens: 122400, window: 272000, percent: 45, source: 'session' }
  expect((await main($)).context).toEqual(known)
  // A reading that carries the window alone must not erase the known measurement.
  usage.context.tokens = undefined
  usage.context.percent = undefined
  await clock.advance(1000)
  expect((await main($)).context).toEqual(known)
  // A later complete reading still lands: the guard never freezes the meter.
  usage.context.tokens = 184960
  usage.context.percent = 68
  await clock.advance(1000)
  const updated = { tokens: 184960, window: 272000, percent: 68, source: 'session' }
  expect((await main($)).context).toEqual(updated)
  // A model switch lands with a partial reading in the same poll: still kept.
  usage.context.tokens = undefined
  usage.context.percent = undefined
  model = 'codex/gpt-6-astra'
  await clock.advance(1000)
  expect((await main($)).currentModel).toBe('codex/gpt-6-astra')
  expect((await main($)).context).toEqual(updated)
  // A main request under a new model keeps it past the request start.
  const pending = consume($.turn.step(request('glm-5.3')))
  await clock.settle()
  expect((await main($)).context).toEqual(updated)
  await clock.advance(500)
  await pending
})
