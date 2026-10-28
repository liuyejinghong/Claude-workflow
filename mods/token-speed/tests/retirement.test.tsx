import { test, expect } from 'claude-code/testing'
import type { On, TurnStepChunk } from 'claude-code'
import { AVG_WINDOW_MS } from '../hooks/magpie'
import { START, PROBE, req, result, gateway, setup, state, consume, certifiedSample, json } from './magpie-fixture'

const OPTIONS = { plugins: [PROBE] }
const oldLast = certifiedSample(149, 1294, -AVG_WINDOW_MS + 10000)
function seedLast(on: On): void {
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    return next({ ...e, value: { ...e.value, rows: [{ ...e.value.rows[0]!, models: [{ model: 'old/model',
      metric: 'magpie-measured-v1', log: [], last: oldLast, outputTokens: 0, durationMs: 0, samples: 0,
      lastApi: 149000 / 1294 }] }] } })
  })
}

for (const fault of ['deny', 'discard'] as const) test(`retirement ${fault} consumes five attempts with backoff, stops, and only a new request recovers`, OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  seedLast(on)
  let refuse = true, requests = 0
  const retirements: number[] = [], network: number[] = []
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (refuse && e.value.session.evidenceRetiredThrough !== e.previous?.session.evidenceRetiredThrough) {
      retirements.push(clock.now())
      if (fault === 'deny') return { deny: 'retirement persistence unavailable' }
      // An apparently successful write still needs a read-back watermark proof.
      return next({ ...e, value: e.previous! })
    }
    return next(e)
  })
  data.response = async () => { network.push(clock.now()); return json({}, 503) }
  const chunks: TurnStepChunk[] = [{ kind: 'text', index: 0, text: 'original', ref: 17 }]
  on('turn.step', async function* (_$, e) { requests++; yield* chunks; await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const old = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(2294)
  expect(await old).toEqual({ chunks, result: result(req()) })
  await clock.advance(180000 - clock.now())
  expect(network).toEqual([4000, 6000])
  expect(retirements).toEqual([10000, 18000, 34000])
  const exhausted = await state($)
  expect(exhausted.rows[0]?.models.find(b => b.model === 'channel/model')).toMatchObject({ samples: 0, lastApi: null, latestStatus: 'unavailable' })
  expect(exhausted.rows[0]?.models.find(b => b.model === 'old/model')?.last).toEqual(oldLast)
  expect(exhausted.session.evidenceRetiredThrough).toBeUndefined()
  await clock.advance(60000)
  expect(retirements.length).toBe(3); expect(data.calls.length).toBe(2)
  refuse = false; data.response = null; data.rows = [gateway()]
  await clock.advance(10000)
  expect(data.calls.length).toBe(2) // The exhausted pending must never be revived.
  const start = clock.now()
  data.rows.push(gateway(start, { route_id: 2 }))
  const fresh = consume($.turn.step(req(1)))
  await clock.settle(); await clock.advance(4000)
  expect(await fresh).toEqual({ chunks, result: result(req(1)) })
  const recovered = await state($)
  expect(recovered.rows[0]?.models.find(b => b.model === 'channel/model')).toMatchObject({ samples: 1, latestStatus: 'measured' })
  expect(recovered.rows[0]?.models.find(b => b.model === 'channel/model')?.log?.[0]?.startedAt).toBe(start)
  expect(recovered.rows[0]?.models.find(b => b.model === 'old/model')?.last).toEqual(oldLast)
  expect(requests).toBe(2); expect(data.calls.length).toBe(4); expect(data.maximum).toBe(1)
})

test('separate due groups each own five attempts, including retirement failures, and both stop', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  seedLast(on)
  const retired: number[] = []
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (e.value.session.evidenceRetiredThrough !== e.previous?.session.evidenceRetiredThrough) {
      retired.push(clock.now()); return { deny: 'retirement persistence unavailable' }
    }
    return next(e)
  })
  data.response = async () => json({}, 503)
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const a = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(6000); await a
  const b = consume($.turn.step(req(1, 'channel/model', 'b')))
  await clock.settle(); await clock.advance(180000); await b
  // Main spent two attempts on HTTP; b's start is outside the 5-second group.
  expect(data.calls.length).toBe(2)
  expect(retired).toEqual([10000, 11000, 12000, 16000, 19000, 24000, 35000, 40000])
  const held = await state($)
  expect(held.rows.map(r => r.models.find(b => b.model === 'channel/model')?.latestStatus)).toEqual(['unavailable', 'unavailable'])
  expect(held.rows.every(r => r.models.every(b => b.samples === 0))).toBe(true)
  expect(held.rows[0]?.models.find(b => b.model === 'old/model')?.last).toEqual(oldLast)
  await clock.advance(60000)
  expect(retired.length).toBe(8); expect(data.calls.length).toBe(2)
})

for (const mode of ['deadline', 'CAS-conflict', 'clear', 'lease'] as const) test(`retirement in flight respects ${mode} before retrying CAS or querying`, OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  seedLast(on)
  let release: (() => void) | undefined, blocked = false, replace = false, model = 'channel/model'
  let retirementWrites = 0
  on('session.model', async () => ({ value: model }))
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (e.value.session.evidenceRetiredThrough !== e.previous?.session.evidenceRetiredThrough) {
      retirementWrites++
      if (!blocked) { blocked = true; await new Promise<void>(resolve => { release = resolve }) }
    }
    return next(replace ? { ...e, value: { ...e.value, session: { ...e.value.session, observationGeneration: 'replacement-module' } } } : e)
  })
  data.response = async () => json({}, 503)
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const old = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(10000); await old
  expect(release).not.toBeUndefined(); expect(retirementWrites).toBe(1); expect(data.calls.length).toBe(2)
  let fresh: ReturnType<typeof consume> | undefined, freshStart = 0
  if (mode === 'deadline') await clock.advance(5000)
  if (mode === 'CAS-conflict') {
    freshStart = clock.now()
    fresh = consume($.turn.step(req(1, 'new/model', 'b')))
    await clock.settle()
  }
  if (mode === 'clear') {
    await $.session.end({ reason: 'clear', sessionId: 'session', resume: { id: 'fresh' } })
    data.session = async () => 'fresh'
    await $.session.start(START)
    freshStart = clock.now()
    fresh = consume($.turn.step(req(1)))
    await clock.settle(); await clock.advance(4000); await fresh
    expect(data.calls.length).toBe(2) // Physical retirement write still owns the flight.
  }
  if (mode === 'lease') {
    replace = true; model = 'different/model'
    await clock.advance(500)
    expect((await state($)).session.observationGeneration).toBe('replacement-module')
  }
  release?.(); await clock.settle()
  expect(retirementWrites).toBe(1) // A CAS miss after invalidation must not submit a no-op retry.
  expect(data.calls.length).toBe(2)
  const after = await state($)
  expect(after.rows.every(r => r.models.every(b => b.samples === 0))).toBe(true)
  if (mode !== 'clear') expect(after.rows[0]?.models.find(b => b.model === 'old/model')?.last).toEqual(oldLast)
  if (mode === 'lease') {
    await clock.advance(180000)
    expect(data.calls.length).toBe(2)
    expect((await state($)).session.observationGeneration).toBe('replacement-module')
    return
  }
  data.response = null
  data.rows = mode === 'clear' ? [gateway(freshStart, { session: 'fresh', native_session: 'fresh' })]
    : mode === 'CAS-conflict' ? [gateway(freshStart, { subagent: 'b', req: 'new/model' })] : [gateway()]
  await clock.advance(10000)
  if (fresh) await fresh
  const recovered = await state($)
  const owner = recovered.rows.find(r => r.id === (mode === 'CAS-conflict' ? 'b' : 'main'))
  expect(owner?.models.find(b => b.model === (mode === 'CAS-conflict' ? 'new/model' : 'channel/model'))?.samples).toBe(1)
  expect(data.maximum).toBe(1)
})

test('CAS collision during retirement recomputes once and queries in the same valid attempt', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  seedLast(on)
  let release: (() => void) | undefined, blocked = false, model = 'channel/model', retirementWrites = 0
  on('session.model', async () => ({ value: model }))
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (e.value.session.evidenceRetiredThrough !== e.previous?.session.evidenceRetiredThrough) {
      retirementWrites++
      if (!blocked) { blocked = true; await new Promise<void>(resolve => { release = resolve }) }
    }
    return next(e)
  })
  data.response = async () => json({}, 503)
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const old = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(10000); await old
  expect(release).not.toBeUndefined()
  model = 'metadata/model'
  await clock.advance(500) // Unrelated host metadata write forces CAS retry, no evidence change.
  data.response = null; data.rows = [gateway()]
  release?.(); await clock.settle()
  expect(retirementWrites).toBe(2)
  expect(data.calls.length).toBe(4)
  const held = await state($)
  expect(held.rows[0]?.models.find(b => b.model === 'channel/model')).toMatchObject({ samples: 1, latestStatus: 'measured' })
  expect(held.rows[0]?.models.find(b => b.model === 'old/model')?.last).toEqual(oldLast)
  expect(held.session.evidenceRetiredThrough).toBe(oldLast.finishedAt)
})
