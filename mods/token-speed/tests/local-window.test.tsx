import { test, expect, mock } from 'claude-code/testing'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, HookStream, On, TurnStepChunk, TurnStepInput, TurnStepResult } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import { agentDefinitionWindow, composeWindow, modelSettingsWindow, normalizeModelName, parseWindowValue,
  readAgentWindow, readWindowConfig, topLevelWindow, windowFromConfig } from '../hooks/local-window'
import type { TokenSpeedSnapshot } from '../types'

const START = { cwd: '/test', surface: 'terminal', isInteractive: true } as const
const EMPTY_REGISTRY = JSON.stringify({ version: 1, models: [], overrides: [] })
const SPAWN = (description: string, type = 'worker'): AgentSpawnInput => ({ description, tool_use_id: description,
  prompt: 'task', subagentType: type, provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'codex/gpt-6.1-sol', background: true, fork: false })
const info = (id: string, type = 'worker', status: AgentInfo['status'] = 'running'): AgentInfo =>
  ({ id, status, description: id, type })
const request = (id: string, model: string): TurnStepInput =>
  ({ agentId: id, model, index: 0, turnId: 'turn', messageCount: 1 })
const result = (e: TurnStepInput, input = 100000): TurnStepResult => ({ turnId: e.turnId, index: e.index,
  answer: 'answer', stopReason: 'end_turn', toolUses: [],
  usage: { model: 'model', output_tokens: 100, input_tokens: input,
    cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
const PROBE: Plugin = { name: 'local-window-probe', register(on) {
  on('command.run', { command: 'local-window-probe' }, async $ =>
    ({ text: JSON.stringify((await $.state.get({ plugin: 'token-speed', key: 'snapshot' })).value) }))
} }
const OPTIONS = { plugins: [PROBE] }
const OVERRIDE_OPTIONS = { ...OPTIONS, options: { contextOverrides: 'capped-model=350000' } }
interface Held {
  settings?: Record<string, unknown>
  env?: Record<string, string>
  files?: Record<string, string>
  registry?: string
}
interface World { roster: AgentInfo[]; models: Record<string, string> }
function setup(on: On, held: Held = {}, world: World = { roster: [], models: {} }): MockClock {
  const clock = mock.clock(on)
  mock.env(on, held.env ?? {})
  on('session.cwd', async () => ({ value: '/test' }))
  on('session.id', async () => ({ value: 'session' }))
  on('fs.read', async (_$, e) => {
    const file = held.files?.[e.path]
    if (file !== undefined) return { value: file }
    if (e.path.endsWith('/data/model-contexts.json') || held.files === undefined) {
      return { value: held.registry ?? EMPTY_REGISTRY }
    }
    throw new Error(`missing ${e.path}`)
  })
  on('settings.read', async () => ({ value: held.settings ?? {} }))
  on('agent.list', async () => ({ value: world.roster.map(agent => ({ ...agent })) }))
  on('agent.spawn', async (_$, e) => ({ agentId: e.description, model: world.models[e.description] ?? 'provider/model' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('turn.complete', async (_$, e) => ({ text: e.answer, usage: e.usage }))
  return clock
}
async function command($: Engine, args = '') {
  return $.command.run({ command: 'tok-speed', args, origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 } })
}
async function state($: Engine): Promise<TokenSpeedSnapshot> {
  const held = await $.command.run({ command: 'local-window-probe', args: '', origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 } })
  return JSON.parse(held.text ?? '{}') as TokenSpeedSnapshot
}
async function loop($: Engine, id: string) {
  const row = (await state($)).rows.find(item => item.id === id)
  if (!row) throw new Error(`Missing ${id}`)
  return row
}
async function spawn($: Engine, clock: MockClock, world: World, id: string, model: string, type = 'worker') {
  world.roster.push(info(id, type))
  world.models[id] = model
  await $.agent.spawn(SPAWN(id, type))
  await clock.settle()
}
async function step($: Engine, clock: MockClock, id: string, model: string, input: number) {
  const stream: HookStream<TurnStepChunk, TurnStepResult> = $.turn.step(request(id, model))
  for (;;) { if ((await stream.next()).done) break }
  await clock.settle()
  return input
}

test('top-level settings supply a child window with its own source and recompute the percentage', OPTIONS, async ($, on) => {
  const world: World = { roster: [], models: {} }
  const clock = setup(on, { settings: { autoCompactWindow: 300000 } }, world)
  on('turn.step', async function* (_$, e) { return result(e, 150000) })
  await $.session.start(START)
  await spawn($, clock, world, 'child-a', 'provider/worker-a')
  expect((await loop($, 'child-a')).context).toEqual({ tokens: null, window: 300000, percent: null,
    source: 'cli-input-auto-compact-window' })
  await step($, clock, 'child-a', 'provider/worker-a', 150000)
  expect((await loop($, 'child-a')).context).toEqual({ tokens: 150000, window: 300000, percent: 50,
    source: 'cli-input-auto-compact-window' })
  expect((await command($)).text).toMatch('cli-input-auto-compact-window')
  expect((await command($)).text).toMatch('token-speed 0.8.3')
})

test('a child window matches a bare modelSettings key for a provider-prefixed model', OPTIONS, async ($, on) => {
  const world: World = { roster: [], models: {} }
  const clock = setup(on, { settings: { modelSettings: {
    'claude-fable-5-2': { autoCompactWindow: 400000 } } } }, world)
  await $.session.start(START)
  await spawn($, clock, world, 'bare-key', 'factory/claude-fable-5-2:medium')
  expect((await loop($, 'bare-key')).context).toEqual({ tokens: null, window: 400000, percent: null,
    source: 'cli-input-auto-compact-window' })
})

test('exact modelSettings keys outrank suffix-normalized keys and agent definitions only lower the result', OPTIONS, async ($, on) => {
  const world: World = { roster: [], models: {} }
  const clock = setup(on, {
    settings: { autoCompactWindow: 300000, modelSettings: {
      'aipai/gpt-6.1-terra[1m]': { autoCompactWindow: 272000 },
      'aipai/gpt-6.1-terra:max[1m]': { autoCompactWindow: 300000 },
    } },
    env: { HOME: '/home/user' },
    files: {
      '/test/.claude/agents/worker.md': '---\nname: worker\nautoCompactWindow: 200000\n---\nbody',
      '/home/user/.claude/agents/strong.md': '---\nname: strong\nautoCompactWindow: 900000\n---\nbody',
    },
  }, world)
  await $.session.start(START)
  await spawn($, clock, world, 'exact', 'aipai/gpt-6.1-terra:max[1m]', 'worker')
  expect((await loop($, 'exact')).context.window).toBe(200000)
  await spawn($, clock, world, 'normalized', 'aipai/gpt-6.1-terra:low[1m]', 'Explore')
  expect((await loop($, 'normalized')).context.window).toBe(272000)
  await spawn($, clock, world, 'strong', 'provider/model-b', 'strong')
  expect((await loop($, 'strong')).context.window).toBe(300000)
  expect((await loop($, 'exact')).context.source).toBe('cli-input-auto-compact-window')
})

test('official capacity caps the local window and a later spawn sees changed settings', OPTIONS, async ($, on) => {
  const world: World = { roster: [], models: {} }
  const held: Held = {
    settings: { autoCompactWindow: 2000000 },
    registry: JSON.stringify({ version: 1, models: [{ id: 'capped-model', aliases: [], defaultWindow: 200000,
      maxWindow: 900000, sourceURL: 'https://docs.example.com/models/capped-model', date: '2026-10-09' }], overrides: [] }),
  }
  const clock = setup(on, held, world)
  on('turn.step', async function* (_$, e) { return result(e, 100000) })
  await $.session.start(START)
  await spawn($, clock, world, 'cap-one', 'provider/capped-model')
  expect((await loop($, 'cap-one')).context).toEqual({ tokens: null, window: 900000, percent: null,
    source: 'cli-input-auto-compact-window' })
  await step($, clock, 'cap-one', 'provider/capped-model', 100000)
  expect((await loop($, 'cap-one')).context).toEqual({ tokens: 100000, window: 900000, percent: 11,
    source: 'cli-input-auto-compact-window' })
  held.settings!.autoCompactWindow = 500000
  await spawn($, clock, world, 'cap-two', 'provider/capped-model')
  expect((await loop($, 'cap-two')).context.window).toBe(500000)
  // The first row keeps its inputs and recomputes its percentage under the new window.
  expect((await loop($, 'cap-one')).context).toEqual({ tokens: 100000, window: 500000, percent: 20,
    source: 'cli-input-auto-compact-window' })
  // A later settings change is picked up by the periodic reconcile, without a spawn.
  held.settings!.autoCompactWindow = 400000
  await clock.advance(5000)
  expect((await loop($, 'cap-one')).context).toEqual({ tokens: 100000, window: 400000, percent: 25,
    source: 'cli-input-auto-compact-window' })
})

test('a local contextOverride still outranks Claude Code configuration', OVERRIDE_OPTIONS, async ($, on) => {
  const world: World = { roster: [], models: {} }
  const clock = setup(on, {
    settings: { autoCompactWindow: 300000 },
    registry: JSON.stringify({ version: 1, models: [{ id: 'capped-model', aliases: [], defaultWindow: 200000,
      maxWindow: 900000, sourceURL: 'https://docs.example.com/models/capped-model', date: '2026-10-09' }], overrides: [] }),
  }, world)
  await $.session.start(START)
  await spawn($, clock, world, 'override', 'provider/capped-model')
  expect((await loop($, 'override')).context).toEqual({ tokens: null, window: 350000, percent: null,
    source: 'cli-input-window-config' })
})

test('auto and illegal windows degrade to the official default instead of guessing', OPTIONS, async ($, on) => {
  const world: World = { roster: [], models: {} }
  const clock = setup(on, {
    settings: { autoCompactWindow: 'auto', modelSettings: { 'provider/invalid-model': { autoCompactWindow: 'auto' } } },
    env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: 'auto', HOME: '/home/user' },
    registry: JSON.stringify({ version: 1, models: [{ id: 'invalid-model', aliases: [], defaultWindow: 200000,
      sourceURL: 'https://docs.example.com/models/invalid-model', date: '2026-10-09' }], overrides: [] }),
  }, world)
  await $.session.start(START)
  await spawn($, clock, world, 'invalid', 'provider/invalid-model')
  expect((await loop($, 'invalid')).context).toEqual({ tokens: null, window: 200000, percent: null,
    source: 'cli-input-official-default' })
})


interface Fake {
  env?: Record<string, string | undefined>
  envReject?: boolean
  settings?: unknown
  settingsReject?: boolean
  files?: Record<string, string>
  cwd?: string
  cwdReject?: boolean
}
const engine = (fake: Fake): EngineInterface => ({
  env: { get: async (name: string) => {
    if (fake.envReject) throw new Error('environment unavailable')
    return fake.env?.[name]
  } },
  settings: { read: async () => {
    if (fake.settingsReject) throw new Error('settings unavailable')
    return fake.settings ?? {}
  } },
  fs: { read: async (path: string) => {
    const value = fake.files?.[path]
    if (value === undefined) throw new Error(`missing ${path}`)
    return value
  } },
  session: { cwd: async () => {
    if (fake.cwdReject) throw new Error('cwd unavailable')
    return fake.cwd ?? '/test'
  } },
}) as unknown as EngineInterface

test('window values accept positive integers and treat "auto" or invalid content as unconfigured', () => {
  expect(parseWindowValue(272000)).toBe(272000)
  expect(parseWindowValue(' 300000 ')).toBe(300000)
  for (const invalid of ['auto', '', '0', '-1', '1.5', 0, -1, 1.5, Number.NaN, Infinity, null, undefined, {}, []]) {
    expect(parseWindowValue(invalid)).toBeNull()
  }
})

test('model names normalize [1m] and effort suffixes while an exact settings key still wins', () => {
  expect(normalizeModelName(' aipai/gpt-6.1-terra:max[1m] ')).toBe('aipai/gpt-6.1-terra')
  expect(normalizeModelName('codex/gpt-6.1-sol(high)[1m]')).toBe('codex/gpt-6.1-sol')
  expect(normalizeModelName('glm-5.3-flash[1m]:max')).toBe('glm-5.3-flash')
  const settings = { modelSettings: {
    'aipai/gpt-6.1-terra[1m]': { autoCompactWindow: 272000 },
    'aipai/gpt-6.1-terra:max[1m]': { autoCompactWindow: 300000, effortLevel: 'max' },
    'invalid-model': { autoCompactWindow: 'auto' },
    'zero-model': { autoCompactWindow: 0 },
  } }
  expect(modelSettingsWindow(settings, 'aipai/gpt-6.1-terra:max[1m]')).toBe(300000)
  expect(modelSettingsWindow(settings, 'aipai/gpt-6.1-terra:low[1m]')).toBe(272000)
  expect(modelSettingsWindow(settings, 'invalid-model')).toBeNull()
  expect(modelSettingsWindow(settings, 'zero-model')).toBeNull()
  expect(modelSettingsWindow({ modelSettings: 'nope' }, 'aipai/gpt-6.1-terra')).toBeNull()
})

test('bare modelSettings keys match a provider-prefixed model without crossing channels', () => {
  const settings = { modelSettings: {
    'claude-fable-5-2': { autoCompactWindow: 400000 },
    'codex/gpt-6.1-terra': { autoCompactWindow: 300000 },
    'claude-opus-5-5': { autoCompactWindow: 500000 },
  } }
  expect(modelSettingsWindow(settings, 'factory/claude-fable-5-2:medium')).toBe(400000)
  expect(modelSettingsWindow(settings, 'factory/claude-fable-5-2')).toBe(400000)
  expect(modelSettingsWindow(settings, 'codex/gpt-6.1-terra:high')).toBe(300000)
  // A slash-bearing key stays on its own channel, and a bare key needs the same final segment.
  expect(modelSettingsWindow(settings, 'aipai/gpt-6.1-terra')).toBeNull()
  expect(modelSettingsWindow(settings, 'aipai/gpt-6.1-terra[1m]')).toBeNull()
  expect(modelSettingsWindow(settings, 'group/auto-claude-opus-5-5')).toBeNull()
})

test('exact modelSettings keys outrank suffix-normalized keys, which outrank bare keys', () => {
  const settings = { modelSettings: {
    'claude-fable-5-2': { autoCompactWindow: 111000 },
    'factory/claude-fable-5-2:low': { autoCompactWindow: 222000 },
    'factory/claude-fable-5-2:medium': { autoCompactWindow: 333000 },
  } }
  expect(modelSettingsWindow(settings, 'factory/claude-fable-5-2:medium')).toBe(333000)
  expect(modelSettingsWindow(settings, 'factory/claude-fable-5-2:high')).toBe(222000)
})

test('a higher-priority key without a valid field falls through to the next tier and then the top level', () => {
  const settings = { autoCompactWindow: 500000, modelSettings: {
    'factory/claude-fable-5-2:medium': { effortLevel: 'max' },
    'factory/claude-fable-5-2:high': { autoCompactWindow: 'auto' },
    'claude-fable-5-2': { autoCompactWindow: 400000 },
  } }
  expect(modelSettingsWindow(settings, 'factory/claude-fable-5-2:medium')).toBe(400000)
  expect(windowFromConfig({ env: null, settings }, 'factory/claude-fable-5-2:medium')).toBe(400000)
  const noWindow = { autoCompactWindow: 500000, modelSettings: {
    'factory/claude-fable-5-2:medium': { effortLevel: 'max' },
    'claude-fable-5-2': { effortLevel: 'low' },
  } }
  expect(modelSettingsWindow(noWindow, 'factory/claude-fable-5-2:medium')).toBeNull()
  expect(windowFromConfig({ env: null, settings: noWindow }, 'factory/claude-fable-5-2:medium')).toBe(500000)
})

test('environment outranks model and top-level settings; invalid values fall through', () => {
  const settings = { modelSettings: { 'provider/model': { autoCompactWindow: 250000 } }, autoCompactWindow: 300000 }
  expect(windowFromConfig({ env: 400000, settings }, 'provider/model')).toBe(400000)
  expect(windowFromConfig({ env: null, settings }, 'provider/model')).toBe(250000)
  expect(windowFromConfig({ env: null, settings }, 'provider/other')).toBe(300000)
  expect(windowFromConfig({ env: null, settings: { autoCompactWindow: 'auto' } }, 'provider/model')).toBeNull()
  expect(topLevelWindow({ autoCompactWindow: 'auto' })).toBeNull()
  expect(topLevelWindow({ autoCompactWindow: 300000 })).toBe(300000)
})

test('agent frontmatter reads only a top-level autoCompactWindow within its legal range', () => {
  expect(agentDefinitionWindow('---\nname: worker\nautoCompactWindow: 272000\n---\nbody')).toBe(272000)
  expect(agentDefinitionWindow('---\nautoCompactWindow: 272000 # cap\n---\n')).toBe(272000)
  expect(agentDefinitionWindow('---\nautoCompactWindow: "300000"\n---\n')).toBe(300000)
  expect(agentDefinitionWindow('---\nautoCompactWindow: 99999\n---\n')).toBeNull()
  expect(agentDefinitionWindow('---\nautoCompactWindow: 1000001\n---\n')).toBeNull()
  expect(agentDefinitionWindow('---\nautoCompactWindow: auto\n---\n')).toBeNull()
  expect(agentDefinitionWindow('---\nnested:\n  autoCompactWindow: 300000\n---\n')).toBeNull()
  expect(agentDefinitionWindow('name: worker\nautoCompactWindow: 300000')).toBeNull()
  expect(agentDefinitionWindow('---\nname: worker\n---\n')).toBeNull()
})

test('an agent window only lowers the configured window and never raises it', () => {
  expect(composeWindow(300000, 200000)).toBe(200000)
  expect(composeWindow(300000, 900000)).toBe(300000)
  expect(composeWindow(null, 200000)).toBe(200000)
  expect(composeWindow(300000, null)).toBe(300000)
  expect(composeWindow(null, null)).toBeNull()
})

test('each configuration read rejects independently and degrades to the next layer', async () => {
  expect(await readWindowConfig(engine({ envReject: true, settingsReject: true })))
    .toEqual({ env: null, settings: null })
  expect(await readWindowConfig(engine({ env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: 'auto' }, settings: { autoCompactWindow: 300000 } })))
    .toEqual({ env: null, settings: { autoCompactWindow: 300000 } })
  expect(await readWindowConfig(engine({ env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '400000' }, settings: { autoCompactWindow: 300000 } })))
    .toEqual({ env: 400000, settings: null })
  expect(await readWindowConfig(engine({ settingsReject: true })))
    .toEqual({ env: null, settings: null })
})

test('agent definitions are read from the project first, then the user directory, with failures skipped', async () => {
  const project = '---\nautoCompactWindow: 200000\n---\n'
  const user = '---\nautoCompactWindow: 300000\n---\n'
  expect(await readAgentWindow(engine({ files: {
    '/test/.claude/agents/worker.md': project,
    '/home/u/.claude/agents/worker.md': user,
  }, env: { HOME: '/home/u' } }), 'worker')).toBe(200000)
  expect(await readAgentWindow(engine({ files: { '/home/u/.claude/agents/worker.md': user },
    env: { HOME: '/home/u' } }), 'worker')).toBe(300000)
  expect(await readAgentWindow(engine({ files: { '/cfg/agents/worker.md': '---\nautoCompactWindow: 400000\n---\n' },
    env: { CLAUDE_CONFIG_DIR: '/cfg', HOME: '/home/u' } }), 'worker')).toBe(400000)
  expect(await readAgentWindow(engine({ files: { '/home/u/.claude/agents/worker.md': user },
    env: { HOME: '/home/u' }, cwdReject: true }), 'worker')).toBe(300000)
  expect(await readAgentWindow(engine({ files: {
    '/test/.claude/agents/worker.md': 'no frontmatter',
    '/home/u/.claude/agents/worker.md': user,
  }, env: { HOME: '/home/u' } }), 'worker')).toBeNull()
  expect(await readAgentWindow(engine({ envReject: true, cwdReject: true }), 'worker')).toBeNull()
  expect(await readAgentWindow(engine({ files: {} }), 'general-purpose')).toBeNull()
  expect(await readAgentWindow(engine({ files: {} }), '../worker')).toBeNull()
  expect(await readAgentWindow(engine({ files: {} }), null)).toBeNull()
})
