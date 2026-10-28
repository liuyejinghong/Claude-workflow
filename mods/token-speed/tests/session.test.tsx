import { uniform, certifiedSample } from './magpie-fixture'
import { test, expect, mock } from 'claude-code/testing'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import type { AgentInfo, HookStream, On, RenderPropsOf, SessionRepo, SessionUsage, TurnStepChunk, TurnStepInput, TurnStepResult } from 'claude-code'
import type { TokenSpeedRow, TokenSpeedSnapshot } from '../types'

const START = { cwd: '/test', surface: 'terminal', isInteractive: true } as const
const BAND: RenderPropsOf['AbovePrompt'] = { hasSurvey: false, isWorking: true, maxRows: 4,
  bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const DAY = 24 * 60 * 60 * 1000
const REPO: SessionRepo = { root: '/repos/Claude-workflow', remote: null, internal: false, name: 'liuyejinghong/Claude-workflow' }

interface Setup { usage?: SessionUsage; repo?: SessionRepo | null; root?: string; git?: { exitCode: number; stdout: string }; model?: string; settings?: Record<string, unknown>; registry?: string; registryRead?: () => void; env?: Record<string, string> }
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
// Rejects the plugin's environment reads from its own hook registration, as FAULT does for the clock;
// the command reports how many reads were denied, proving the read really happened.
const ENV_REJECT: Plugin = { name: 'env-reject', register(on) {
  let denied = 0
  on('env.get', async (_$, e, next) =>
    e.name === 'CLAUDE_CODE_EFFORT_LEVEL' ? (denied++, { deny: 'environment unavailable' }) : next(e))
  on('command.run', { command: 'env-reject-count' }, async () => ({ text: String(denied) }))
} }
const OPTIONS = { plugins: [PROBE] }
const REJECTING = { plugins: [PROBE, ENV_REJECT] }
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
  on('session.id', async () => ({ value: 'session' }))
  // A fixed environment keeps effort readings independent of the host running the tests.
  mock.env(on, held.env ?? {})
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
  const lines = await ui.findAll({ type: 'Text', text: / · Last / })
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
  const compact = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 49 } })
  const compactLine = await compact.find({ type: 'Text', text: '⌂' })
  expect(compactLine?.text).toBe('⌂ feat/token-speed')
  await compact.unmount()
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
  const lines = await ui.findAll({ type: 'Text', text: / · Last / })
  expect(lines.length).toBe(2)
  expect(lines[0]?.text).toMatch(/⚡ main\s+· gpt-6\.1-sol\s+· high\s+· Ctx/)
  expect(lines[1]?.text).toMatch(/🌳 long-ide · glm-5\.3\s+· —\s+· Ctx/)
  const cells = (text: string): number => Array.from(text).reduce((sum, char) => sum + (char === '⚡' || char === '🌳' ? 2 : 1), 0)
  const prefix = (text: string, marker: string) => cells(text.slice(0, text.indexOf(marker)))
  expect(prefix(lines[0]?.text ?? '', '·')).toBe(prefix(lines[1]?.text ?? '', '·'))
  expect(prefix(lines[0]?.text ?? '', 'Last')).toBe(prefix(lines[1]?.text ?? '', 'Last'))
  await ui.unmount()
  await clock.advance(1750)
  await Promise.all(pending)
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
    expect((await ui.findAll({ type: 'Text', text: / · Last / })).length).toBe(1)
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
  expect((await ui.find({ type: 'Text', text: /Last/ }))?.text).toMatch('claude-opus-5-5 · max · Ctx')
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
  expect((await ui.find({ type: 'Text', text: /🌳 child/ }))?.text).toMatch('5.5k/?')
  expect((await ui.find({ type: 'Text', text: /🌳 child/ }))?.text).not.toMatch('67%')
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
  const cells = (text: string): number => Array.from(text).reduce((sum, char) => sum + (char === '⚡' || char === '🌳' || char === '🙂' || /[中⽂文]/u.test(char) ? 2 : 1), 0)
  let compact67 = ''
  let full67 = ''
  for (const columns of [80, 120, 240]) {
    const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: columns } })
    const lines = await ui.findAll({ type: 'Text', text: / · Last / })
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
    expect(prefix(mainLine, 'Last')).toBe(prefix(lines[1]?.text ?? '', 'Last'))
    expect((await ui.find({ type: 'Text', text: 'rest band' }))?.text).toBe('rest band')
    await ui.unmount()
  }
  usage.context.percent = 68
  await clock.advance(1000)
  for (const columns of [120, 240]) {
    const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: columns } })
    const line = (await ui.findAll({ type: 'Text', text: / · Last / }))[0]?.text ?? ''
    expect(line).toMatch('68%/272k')
    expect(line).not.toBe(columns === 120 ? compact67 : full67)
    if (columns === 240) expect(((await ui.findAll({ type: 'Text' })).find(node => node.props.backgroundColor === 'rate_limit_empty'))?.text).toBe('█'.repeat(6) + '▊' + ' '.repeat(3))
    await ui.unmount()
  }
})
function terminalCells(text: string): number {
  let cells = 0
  let joined = false
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code === 0x200d) { joined = true; continue }
    if (/\p{Mark}/u.test(char) || code === 0xfe0f || code < 32) continue
    if (joined) { joined = false; continue }
    cells += char === '⚡' || /[\p{Unified_Ideograph}\p{Extended_Pictographic}]/u.test(char) ? 2 : 1
  }
  return cells
}

function seededBand(on: On, live: number | null, mainContext: TokenSpeedRow['context'] =
  { tokens: 114240, window: 272000, percent: 42, source: 'session' },
  childIds = ['alpha-worker-one', 'beta-worker-two', 'gamma-worker-three']): string[] {
  const ids = ['main', ...childIds]
  const models = ['codex/gpt-6.1-sol', 'provider/very-long-model-name-for-a-small-terminal',
    'provider/中文👩‍💻模型-with-a-long-tail', 'provider/unknown-context-model']
  setup(on, { model: models[0], usage: { startedAt: 0,
    context: { window: mainContext.window, ...(mainContext.tokens === null ? {} : { tokens: mainContext.tokens }),
      ...(mainContext.percent === null ? {} : { percent: mainContext.percent }) }, rateLimits: [] },
    registry: JSON.stringify({ version: 1, models: [], overrides: [
      { id: 'gpt-6.1-sol', aliases: [], window: 272000, reason: 'Test override' },
      { id: 'very-long-model-name-for-a-small-terminal', aliases: [], window: 272000, reason: 'Test override' },
    ] }) }, async () => ids.slice(1).map(id => info(id)))
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    const rows: TokenSpeedRow[] = ids.map((id, index) => ({ id, description: '', running: true,
      currentModel: models[index]!, active: null, status: 'streaming', seen: true,
      turnId: null, revision: 0, effort: 'high', effortSource: 'request',
      context: index < 2 ? mainContext : { tokens: index === 2 ? 5500 : null, window: 0, percent: null, source: 'unknown' },
      models: [{ model: models[index]!, metric: 'magpie-measured-v1', log: [certifiedSample()], outputTokens: 286, durationMs: 10000, samples: 1, lastApi: 28.6 }],
    }))
    return next({ ...e, value: { version: 2, rows, session: { context: mainContext, workspace: null } } })
  })
  return ids
}

test('24/32/49/80/120 bands preserve both measured rates, context and distinct identities', OPTIONS, async ($, on) => {
  const ids = seededBand(on, null)
  await $.session.start(START)
  const before = await state($)
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  for (const columns of [24, 32, 40, 49, 54, 60, 80, 120, 240]) {
    await ui.redraw({ ...BAND, bodyColumns: columns })
    const rows = (await ui.findAll({ type: 'Text' })).filter(node => node.props.wrap === 'truncate-end' && /(?: C| · Ctx )/.test(node.text))
    expect(rows.length).toBe(ids.length)
    for (const line of rows) {
      expect(terminalCells(line.text)).toBeLessThanOrEqual(columns)
      expect(line.text).toMatch(/(?:Last\s+|L)28\.6/)
      expect(line.text).toMatch(/(?:Avg\s+|A)28\.6/)
      expect(line.text).not.toMatch(/Live|provider\/|~|[\r\n]/)
    }
    expect(rows[0]?.text).toMatch(columns < 32 ? /C42%/ : /42%\/272k/)
    expect(rows[2]?.text).not.toMatch(/C0|5\.5k\/0/)
    expect(rows[3]?.text).toMatch(/(?:C|Ctx ).*(?:—|\?)/)
    if (columns >= 32 && columns < 80) {
      expect(rows[1]?.text.startsWith('🌳 alpha-wo ')).toBe(true)
      expect(rows[2]?.text.startsWith('🌳 beta-wor ')).toBe(true)
    }
  }
  expect(await state($)).toEqual(before)
  await ui.unmount()
})

test('one mount restores full layout after 49 → 24 → 120 and preserves unknown percentages', OPTIONS, async ($, on) => {
  seededBand(on, 42.1, { tokens: null, window: 272000, percent: null, source: 'session' })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 49 } })
  await ui.redraw({ ...BAND, bodyColumns: 120 })
  const wide = (await ui.findAll({ type: 'Text' })).find(node => node.props.wrap === 'truncate-end' && /^⚡ main /.test(node.text))?.text
  await ui.redraw({ ...BAND, bodyColumns: 49 })
  expect((await ui.findAll({ type: 'Text' })).find(node => node.props.wrap === 'truncate-end' && /^(main|m|⚡ main) /.test(node.text))?.text).toMatch('C—%/272k')
  await ui.redraw({ ...BAND, bodyColumns: 24 })
  expect((await ui.findAll({ type: 'Text' })).find(node => node.props.wrap === 'truncate-end' && /^(main|m|⚡ main) /.test(node.text))?.text).toMatch(/C—%.*L28\.6 A28\.6/)
  expect((await ui.findAll({ type: 'Text' })).find(node => node.props.wrap === 'truncate-end' && /^(main|m|⚡ main) /.test(node.text))?.text).not.toMatch('C0%')
  await ui.redraw({ ...BAND, bodyColumns: 120 })
  const restored = (await ui.findAll({ type: 'Text' })).find(node => node.props.wrap === 'truncate-end' && /^(main|m|⚡ main) /.test(node.text))?.text ?? ''
  expect(restored).toMatch(/⚡ main\s+· gpt-6\.1-sol/)
  expect(restored).toMatch('· Ctx')
  expect(restored).toMatch('—%/272k')
  expect(restored).toBe(wide)
  expect(restored).toMatch(/· Avg\s+28\.6 tok\/s/)
  expect((await ui.findAll({ type: 'Text' })).some(node => node.props.backgroundColor === 'rate_limit_empty')).toBe(true)
  await ui.unmount()
})

test('narrow child prefixes remain distinct and exceptionally small bands fit without adding rows', OPTIONS, async ($, on) => {
  seededBand(on, 42.1, undefined, ['agent-one-long-id', 'agent-two-long-id', 'm'])
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => next({ ...e,
    value: { ...e.value, rows: e.value.rows.map((r, index) => index === 2 ? { ...r, currentModel: 'codex/gpt-6.1-sol',
      context: { tokens: 114240, window: 272000, percent: 42, source: 'cli-input-window-config' },
      models: [{ model: 'codex/gpt-6.1-sol', metric: 'magpie-measured-v1', log: [certifiedSample()], outputTokens: 286, durationMs: 10000, samples: 1, lastApi: 28.6 }] } : r) } }))
  await $.session.start(START)
  expect((await state($)).rows.map(r => r.id)).toEqual(['main', 'agent-one-long-id', 'agent-two-long-id', 'm'])
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  for (const columns of [24, 31, 32]) {
    await ui.redraw({ ...BAND, bodyColumns: columns })
    const rows = (await ui.findAll({ type: 'Text' })).filter(node => node.props.wrap === 'truncate-end' && /(?: C| · Ctx )/.test(node.text))
    const first = rows[1]?.text ?? ''
    const second = rows[2]?.text ?? ''
    expect(first.match(/^(?:🌳 )?(\S+)/)?.[1]).not.toBe(second.match(/^(?:🌳 )?(\S+)/)?.[1])
    expect(first).toMatch(columns < 32 ? /^(?:🌳 )?agent-on? / : /^🌳 agent-on /)
    expect(second).toMatch(columns < 32 ? /^(?:🌳 )?agent-tw? / : /^🌳 agent-tw /)
    expect(rows[0]?.text.split(' ')[0]).not.toBe(rows[3]?.text.split(' ')[0])
    expect(terminalCells(first)).toBeLessThanOrEqual(columns)
    expect(terminalCells(second)).toBeLessThanOrEqual(columns)
    expect(first).toMatch('A28.6')
    expect(second).toMatch('A28.6')
  }
  for (const columns of [1, 8, 16, 23]) {
    await ui.redraw({ ...BAND, bodyColumns: columns })
    const rows = (await ui.findAll({ type: 'Text' })).filter(node => node.props.wrap === 'truncate-end' && node.text !== 'rest band')
    expect(rows.length).toBe(4)
    for (const line of rows) {
      expect(terminalCells(line.text)).toBeLessThanOrEqual(columns)
      expect(line.text).not.toMatch(/[\r\n]/)
    }
  }
  await ui.unmount()
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
    expect((await ui.find({ type: 'Text', text: / · Last / }))?.text).toMatch(`${percent}%/272k`)
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
  expect((await ui.find({ type: 'Text', text: /🌳 child/ }))?.text).toMatch('14%/1.0M')
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
  expect((await state($)).rows.find(r => r.id === 'child')?.context.window).toBe(500000)
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

test('unchanged configuration preserves the actual bare request bucket and an explicit switch still applies', OPTIONS, async ($, on) => {
  const clock = setup(on, { usage: { startedAt: 0, context: { tokens: 122400, window: 272000, percent: 45 }, rateLimits: [] },
    settings: { modelSettings: { 'new/model': { effortLevel: 'medium' } } } })
  let configured = 'old/model'
  on('session.model', async () => ({ value: configured }))
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    return next({ ...e, value: { ...e.value, rows: e.value.rows.map(r => ({ ...r, currentModel: 'old/model',
      models: [{ model: 'old/model', metric: 'magpie-measured-v1', log: [certifiedSample()],
        outputTokens: 286, durationMs: 10000, samples: 1, lastApi: 28.6 }] })) } })
  })
  on('turn.step', async function* (_$, e) { await clock.sleep(500); return result(e) })
  await $.session.start(START)
  await finishAt(clock, consume($.turn.step(request('model'))), 500)
  await clock.advance(1000)
  expect((await main($)).currentModel).toBe('model')
  expect((await main($)).models.find(bucket => bucket.model === 'model')?.lastApi).toBeNull()
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect((await ui.find({ type: 'Text', text: /Last/ }))?.text).toMatch(/Last\s+—/)
  await ui.unmount()
  await $.session.start(START) // Repeated initialization must keep observed request identity.
  expect((await main($)).currentModel).toBe('model')
  configured = 'new/model'
  await clock.advance(1000)
  expect((await main($)).currentModel).toBe('new/model')
  expect((await main($)).effort).toBe('medium')
  expect((await main($)).context.percent).toBe(45)
})

const EFFORT_SETTINGS = { effortLevel: 'high', modelSettings: { 'codex/gpt-6.1-sol': { effortLevel: 'high' } } }

test('effort environment outranks the saved model configuration at session start without a request', OPTIONS, async ($, on) => {
  setup(on, { model: 'codex/gpt-6.1-sol:high', settings: EFFORT_SETTINGS, env: { CLAUDE_CODE_EFFORT_LEVEL: 'max' } })
  await $.session.start(START)
  expect((await main($)).effort).toBe('max')
  expect((await main($)).effortSource).toBe('configured')
  const ui = await $.ui.mount({ plugin: 'token-speed', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect((await ui.find({ type: 'Text', text: / · Last / }))?.text).toMatch(/⚡ main\s+· gpt-6\.1-sol\s+· max\s+· Ctx/)
  await ui.unmount()
})

interface EffortFallback { label: string; held: Setup; expected: 'high' | 'medium'; reject?: boolean }
// No model suffix here: a fall-through that skipped the settings, or an unguarded
// rejection, loses the model-specific high and fails these cases.
const SPECIFIC_OVER_GLOBAL = { effortLevel: 'low', modelSettings: { 'codex/gpt-6.1-sol': { effortLevel: 'high' } } }
for (const { label, held, expected, reject } of [
  { label: 'unset', held: { model: 'codex/gpt-6.1-sol', settings: SPECIFIC_OVER_GLOBAL }, expected: 'high' },
  { label: 'invalid', held: { model: 'codex/gpt-6.1-sol', settings: SPECIFIC_OVER_GLOBAL,
    env: { CLAUDE_CODE_EFFORT_LEVEL: 'ultra' } }, expected: 'high' },
  // Rejection is behavioural: an unrejected max would show, so the saved high proves the deny.
  { label: 'rejected', held: { model: 'codex/gpt-6.1-sol', settings: SPECIFIC_OVER_GLOBAL,
    env: { CLAUDE_CODE_EFFORT_LEVEL: 'max' } }, expected: 'high', reject: true },
  { label: 'absent while a global default stays', held: { model: 'provider/worker:low', settings: { effortLevel: 'medium' } }, expected: 'medium' },
  { label: 'absent while an explicit suffix stays', held: { model: 'provider/worker:high' }, expected: 'high' },
] satisfies EffortFallback[]) {
  test(`saved configuration answers an effort environment that is ${label}`, reject ? REJECTING : OPTIONS, async ($, on) => {
    setup(on, held)
    await $.session.start(START)
    if (reject) {
      const count = await $.command.run({ command: 'env-reject-count', args: '', origin: { kind: 'composer' },
        presentation: { isFullscreen: true, columns: 120 } })
      expect(Number(count.text)).toBeGreaterThan(0)
    }
    expect((await main($)).effort).toBe(expected)
    expect((await main($)).effortSource).toBe('configured')
  })
}

test('request and applied effort outrank the environment across refreshes and leave the real request untouched', OPTIONS, async ($, on) => {
  const clock = setup(on, { model: 'codex/gpt-6.1-sol:high', settings: EFFORT_SETTINGS,
    env: { CLAUDE_CODE_EFFORT_LEVEL: 'max' }, usage: { startedAt: 0, context: { window: 272000 }, rateLimits: [] } })
  let calls = 0
  let received: TurnStepInput | undefined
  on('turn.step', async function* (_$, e) { calls++; received = e; await clock.sleep(500); return result(e) })
  on('classic.PostToolUse', async () => ({}))
  let stops = 0
  on('classic.Stop', async () => { stops++; return {} })
  await $.session.start(START)
  expect((await main($)).effort).toBe('max')
  expect((await main($)).effortSource).toBe('configured')
  const e = request(undefined, 'high')
  const pending = consume($.turn.step(e))
  await clock.settle()
  expect((await main($)).effort).toBe('high')
  expect((await main($)).effortSource).toBe('request')
  // A second of ticks runs the ordinary refreshMain: the environment must not roll it back.
  await clock.advance(1000)
  expect((await main($)).effort).toBe('high')
  expect((await main($)).effortSource).toBe('request')
  const observed = await pending
  expect(calls).toBe(1)
  expect(received).toEqual(e)
  expect(observed.result).toEqual(result(e))
  await $.classic.PostToolUse({ tool_name: 'Read', tool_input: {}, tool_response: {}, tool_use_id: 'r', effort: { level: 'medium' } })
  expect((await main($)).effort).toBe('medium')
  expect((await main($)).effortSource).toBe('applied')
  await clock.advance(1000)
  expect((await main($)).effort).toBe('medium')
  expect((await main($)).effortSource).toBe('applied')
  await $.classic.Stop({ stop_hook_active: true, effort: { level: 'medium' } })
  expect(stops).toBe(1)
  expect((await main($)).effort).toBe('medium')
  expect((await main($)).effortSource).toBe('applied')
  await clock.advance(1000)
  expect((await main($)).effort).toBe('medium')
  expect((await main($)).effortSource).toBe('applied')
})
