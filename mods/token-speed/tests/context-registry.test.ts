import { test, expect } from 'claude-code/testing'
import { fallbackRegistry, lookupWindow, officialCapacity, parseLocalOverrides, parseRegistry, registryLoader, withLocalOverrides } from '../hooks/context-registry'

const official = { id: 'verified-model', aliases: ['verified-alias'], defaultWindow: 200000,
  maxWindow: 1000000, sourceURL: 'https://docs.example.com/models/verified-model', date: '2026-10-09' }
const registryJSON = (models: unknown[] = [official], overrides: unknown[] = []) => JSON.stringify({ version: 1, models, overrides })

test('registry exact aliases choose defaults, never maximum or neighboring model names', async () => {
  const registry = parseRegistry(registryJSON())
  expect(lookupWindow(registry, 'provider/VERIFIED-ALIAS')).toEqual({ window: 200000, source: 'official-default',
    sourceURL: official.sourceURL, date: official.date })
  expect(lookupWindow(registry, 'provider/verified-model-neighbor')).toEqual({ window: 0, source: 'unknown' })
  expect(lookupWindow(registry, 'provider/verified-model[1m]')).toEqual({ window: 0, source: 'unknown' })
  const overrides = parseRegistry(registryJSON([official], [{ id: 'verified-model', aliases: ['verified-alias'], window: 272000, reason: 'Explicit CLI cap' }]))
  expect(lookupWindow(overrides, 'verified-alias')).toEqual({ window: 272000, source: 'configured' })
  expect(lookupWindow(fallbackRegistry(), 'provider/glm-5.3-flash')).toEqual({ window: 0, source: 'unknown' })
})

test('registry refuses malformed JSON, aliases, windows, source URLs and dates', async () => {
  for (const invalid of ['{', registryJSON([{ ...official, defaultWindow: -1 }]),
    registryJSON([{ ...official, maxWindow: 100 }]), registryJSON([{ ...official, sourceURL: 'http://docs.example.com' }]),
    registryJSON([{ ...official, date: '2026-02-30' }]), registryJSON([{ ...official, aliases: ['verified-model'] }]),
    registryJSON([official, { ...official, id: 'other', aliases: ['VERIFIED-ALIAS'] }]),
    registryJSON([], [{ id: 'a', aliases: ['a'], window: 1, reason: 'cap' }]),
    JSON.stringify({ version: 2, models: [], overrides: [] }), registryJSON([{ ...official, typo: true }])]) {
    expect(() => parseRegistry(invalid)).toThrow()
  }
})

test('registry loader reads plugin data once concurrently; a fresh module loader reloads and failure leaves an empty registry', async () => {
  let calls = 0
  const read = async () => { calls++; return registryJSON() }
  const load = registryLoader()
  const [a, b] = await Promise.all([load(read), load(read)])
  expect(calls).toBe(1)
  expect(a).toEqual(b)
  await load(read)
  expect(calls).toBe(1)
  await registryLoader()(read)
  expect(calls).toBe(2)
  const fallback = await registryLoader()(async () => '{')
  expect(fallback.fallback).toBe(true)
  expect(fallback.models).toEqual([])
  expect(fallback.overrides).toEqual([])
  expect(lookupWindow(fallback, 'codex/gpt-6.1-sol')).toEqual({ window: 0, source: 'unknown' })
})

test('a local override wins while official metadata stays intact', async () => {
  const terra = { ...official, id: 'gpt-6.1-terra', aliases: [], defaultWindow: 500000 }
  const packaged = parseRegistry(registryJSON([official, terra]))
  expect(packaged.overrides).toEqual([])
  const local = parseLocalOverrides(' gpt-6.1-terra = 272000 ')
  expect(local).toEqual({ overrides: [{ id: 'gpt-6.1-terra', aliases: [], window: 272000,
    reason: 'User-configured window (local setting)' }], ignored: 0 })
  expect(lookupWindow(packaged, 'codex/gpt-6.1-terra')).toEqual({ window: 500000, source: 'official-default',
    sourceURL: official.sourceURL, date: official.date })
  const merged = withLocalOverrides(packaged, local.overrides)
  expect(lookupWindow(merged, 'codex/gpt-6.1-terra')).toEqual({ window: 272000, source: 'configured' })
  expect(merged.models.find(model => model.id === 'gpt-6.1-terra')?.defaultWindow).toBe(500000)
})

test('local overrides accept comma, semicolon and newline separators, blank space, and the last duplicate wins', async () => {
  const parsed = parseLocalOverrides('gpt-6.1-terra=272000, glm-5.3 = 1000000;deepseek-v4.1-flash-free=1000000\ngpt-6-astra=500000\nGLM-5.3=900000')
  expect(parsed.ignored).toBe(0)
  expect(parsed.overrides.map(entry => [entry.id, entry.window])).toEqual([
    ['gpt-6.1-terra', 272000],
    ['glm-5.3', 900000],
    ['deepseek-v4.1-flash-free', 1000000],
    ['gpt-6-astra', 500000],
  ])
})

test('local overrides ignore invalid items without dropping valid ones', async () => {
  const parsed = parseLocalOverrides('missing-equals;gpt-6.1-terra=0;glm-5.3=-1;deepseek=1.5;!bad=100;=100;gpt-6.1-terra=272000')
  expect(parsed.ignored).toBe(6)
  expect(parsed.overrides).toEqual([{ id: 'gpt-6.1-terra', aliases: [], window: 272000,
    reason: 'User-configured window (local setting)' }])
})

test('an empty local option produces no overrides', async () => {
  expect(parseLocalOverrides('')).toEqual({ overrides: [], ignored: 0 })
  expect(parseLocalOverrides('  \n , ; \t')).toEqual({ overrides: [], ignored: 0 })
})

test('capacity-only official metadata is distinguished from defaults', async () => {
  const registry = parseRegistry(registryJSON([{ ...official, defaultWindow: null, contextWindow: 1000000 }]))
  expect(lookupWindow(registry, 'verified-model')).toEqual({ window: 1000000, source: 'official-capacity',
    sourceURL: official.sourceURL, date: official.date })
})

test('official capacity prefers maxWindow, then contextWindow, then defaultWindow, and is absent for unknown models', async () => {
  const registry = parseRegistry(registryJSON([official]))
  expect(officialCapacity(registry, 'provider/verified-alias')).toBe(1000000)
  const capacityOnly = parseRegistry(registryJSON([{ ...official, defaultWindow: null, maxWindow: undefined, contextWindow: 800000 }]))
  expect(officialCapacity(capacityOnly, 'verified-model')).toBe(800000)
  const defaultOnly = parseRegistry(registryJSON([{ ...official, maxWindow: undefined }]))
  expect(officialCapacity(defaultOnly, 'verified-model')).toBe(200000)
  expect(officialCapacity(registry, 'provider/verified-model-neighbor')).toBeNull()
  expect(officialCapacity(fallbackRegistry(), 'provider/verified-model')).toBeNull()
})
