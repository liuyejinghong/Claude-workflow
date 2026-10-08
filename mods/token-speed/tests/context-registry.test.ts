import { test, expect } from 'claude-code/testing'
import { fallbackRegistry, lookupWindow, parseRegistry, registryLoader } from '../hooks/context-registry'

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
  expect(lookupWindow(fallbackRegistry(), 'provider/glm-5.3-flash')).toEqual({ window: 1000000, source: 'configured' })
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

test('registry loader reads plugin data once concurrently; a fresh module loader reloads and failure preserves overrides', async () => {
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
  expect(lookupWindow(fallback, 'codex/gpt-6.1-sol').window).toBe(272000)
})


test('capacity-only official metadata is distinguished from defaults', async () => {
  const registry = parseRegistry(registryJSON([{ ...official, defaultWindow: null, contextWindow: 1000000 }]))
  expect(lookupWindow(registry, 'verified-model')).toEqual({ window: 1000000, source: 'official-capacity',
    sourceURL: official.sourceURL, date: official.date })
})
