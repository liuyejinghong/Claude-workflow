import { test, expect } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'
import { AVG_WINDOW_MS, MAX_EVIDENCE, pruneEvidence, rememberEvidence, queryRows } from '../hooks/magpie'
import type { Evidence } from '../hooks/magpie'
import { START, PROBE, req, result, gateway, setup, state, command, consume, json, certifiedSample, curlResponse } from './magpie-fixture'

const OPTIONS = { plugins: [PROBE] }
// Separate plugin ownership lets wall time diverge from mock.clock's scheduler.
const WALL_CLOCK: Plugin = { name: 'evidence-wall-clock', register(on) {
  let wall = 0
  on('clock.now', async () => ({ value: wall }))
  on('command.run', { command: 'evidence-wall-clock' }, async (_$, e) => {
    wall = Number(e.args)
    return { text: String(wall) }
  })
} }
const WALL_OPTIONS = { plugins: [PROBE, WALL_CLOCK] }
const counts = { input: 100, write: 20, output: 149, read: 30 }

test('old completion arriving during a recent query never certifies the shared row, even after the old group exceeds budget', OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  on('turn.step', async function* (_$, e) { await clock.sleep(e.index === 0 ? 124100 : 2294); return result(e) })
  await $.session.start(START)
  const old = consume($.turn.step(req(0)))
  await clock.settle(); await clock.advance(120000)
  data.rows = [gateway(120000), ...Array.from({ length: 4500 }, (_, i) => gateway(70000,
    { route_id: i + 200000, req: 'noise/model' }))]
  const recent = consume($.turn.step(req(1)))
  await clock.settle(); await clock.advance(2294); await recent
  let release: (() => void) | undefined, blocked = false
  data.response = async url => {
    if (!blocked) { blocked = true; await new Promise<void>(resolve => { release = resolve }) }
    const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
    return json({ offset, total: data.rows.length, rows: data.rows.slice(offset, offset + 500) })
  }
  await clock.advance(1706)
  expect(release).not.toBeUndefined()
  await clock.advance(100); await old
  release?.(); await clock.settle()
  expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 0, lastApi: null })
  data.response = null
  await clock.advance(60000)
  expect((await state($)).rows[0]?.models[0]).toMatchObject({ samples: 0, lastApi: null })
  const calls = data.calls.length
  await clock.advance(60000)
  expect(data.calls.length).toBe(calls)
  expect(data.maximum).toBe(1)
})

for (const mode of ['callback-delayed', 'set-delayed', 'set-conflict'] as const) {
  test(`evidence revision invalidates ${mode} and preserves a later request status`, OPTIONS, async ($, on) => {
    const { clock, data } = setup(on)
    let arm = false, release: (() => void) | undefined
    if (mode === 'callback-delayed') on('state.get', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
      const held = await next(e)
      if (arm && data.calls.length === 2) { arm = false; await new Promise<void>(resolve => { release = resolve }) }
      return held
    })
    else on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
      if (arm && e.value.rows.some(r => r.models.some(bucket => bucket.log?.length === 2))) {
        arm = false; await new Promise<void>(resolve => { release = resolve })
      }
      return next(e)
    })
    on('turn.step', async function* (_$, e) {
      await clock.sleep(e.index === 0 ? 124100 : e.index === 3 ? 10000 : 2294)
      return result(e, e.index === 2 ? 298 : 149)
    })
    await $.session.start(START)
    // A prior unrelated Last must survive abort/rollback of the shared-row batch.
    data.rows = [gateway(0, { out: 298 })]
    const first = consume($.turn.step(req(2)))
    await clock.settle(); await clock.advance(4000); await first
    data.calls.length = 0
    const old = consume($.turn.step(req(0)))
    await clock.settle(); await clock.advance(120000)
    data.rows.push(gateway(124000, { route_id: 2 }))
    const recent = consume($.turn.step(req(1)))
    await clock.settle(); await clock.advance(2294); await recent
    arm = true
    await clock.advance(1706)
    expect(release).not.toBeUndefined()
    await clock.advance(100); await old
    const third = mode === 'set-conflict' ? consume($.turn.step(req(3))) : null
    await clock.settle()
    release?.(); await clock.settle()
    const bucket = (await state($)).rows[0]?.models[0]
    expect(bucket).toMatchObject({ samples: 1, lastApi: 298000 / 1294 })
    expect(bucket?.last?.at).toBe(2294)
    if (third) {
      expect(bucket?.latestStatus).toBe('waiting')
      await clock.advance(10000); await third
    }
    await clock.advance(60000)
    expect((await state($)).rows[0]?.models[0]?.samples).toBe(1)
  })
}

for (const days of [2, 365]) test(`4096 completed model Last proofs aged ${days} days leave capacity for a real new request`, OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    const models = Array.from({ length: MAX_EVIDENCE }, (_, i) => {
      const sample = { ...certifiedSample(149, 1294, -days * AVG_WINDOW_MS), step: `ended-${i}`, key: `key-${i}` }
      return { model: `old/model-${i}`, metric: 'magpie-measured-v1' as const, log: [], last: sample,
        outputTokens: 0, durationMs: 0, samples: 0, lastApi: 149000 / 1294, latestStep: sample.step, latestStatus: 'measured' as const }
    })
    return next({ ...e, value: { ...e.value, rows: [{ ...e.value.rows[0]!, models }] } })
  })
  data.rows = [gateway()]
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  const fresh = consume($.turn.step(req()))
  await clock.settle(); await clock.advance(4000); await fresh
  const models = (await state($)).rows[0]!.models
  expect(models.filter(bucket => bucket.model.startsWith('old/') && bucket.last?.key?.startsWith('key-')).length).toBe(MAX_EVIDENCE)
  expect(models.find(bucket => bucket.model === 'channel/model')).toMatchObject({ samples: 1, lastApi: 149000 / 1294 })
  expect(data.calls.length).toBe(2)
})

test('working capacity frees expired Last and retains old non-Last competitors near a pending finish', async () => {
  const evidence = new Map<string, Evidence>(), pending = new Map<string, { attempts: number; due: number }>()
  const retained = new Set<string>()
  const step: Evidence = { id: 'fresh', loopId: 'main', model: 'm', startedAt: 0, finishedAt: 2294, counts }
  for (let i = 0; i < MAX_EVIDENCE; i++) {
    const id = `last-${i}`; retained.add(id); evidence.set(id, { ...step, id, key: id })
  }
  expect(rememberEvidence(evidence, pending, step, 0)).toBe(false)
  expect(pruneEvidence(evidence, pending, 2 * AVG_WINDOW_MS, retained)).toBe(2294)
  expect(rememberEvidence(evidence, pending, { ...step, startedAt: 2 * AVG_WINDOW_MS,
    finishedAt: 2 * AVG_WINDOW_MS + 2294 }, 2 * AVG_WINDOW_MS + 2294)).toBe(true)
  expect(evidence.size).toBe(1)
  evidence.set('competitor', { ...step, id: 'competitor', finishedAt: 2 * AVG_WINDOW_MS })
  expect(pruneEvidence(evidence, pending, 4 * AVG_WINDOW_MS)).toBe(-Infinity)
  expect(evidence.has('competitor')).toBe(true)
})

for (const mode of ['retirement-write-refused', 'restored-watermark'] as const) test(`clock rollback stays conservative after ${mode}`, WALL_OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  let seeded = false, refused = 0
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (!seeded) {
      seeded = true
      const last = { ...certifiedSample(149, 1294, -2 * AVG_WINDOW_MS), counts }
      return next({ ...e, value: { ...e.value,
        session: { ...e.value.session, ...(mode === 'restored-watermark' ? { evidenceRetiredThrough: 10000 } : {}) },
        rows: [{ ...e.value.rows[0]!, models: [{ model: 'old/model', metric: 'magpie-measured-v1', log: [], last,
          outputTokens: 0, durationMs: 0, samples: 0, lastApi: 149000 / 1294 }] }] } })
    }
    if (mode === 'retirement-write-refused' && e.value.session.evidenceRetiredThrough !== e.previous?.session.evidenceRetiredThrough) {
      refused++; return { deny: 'retirement persistence unavailable' }
    }
    return next(e)
  })
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START)
  if (mode === 'retirement-write-refused') expect(refused).toBe(1)
  const step = consume($.turn.step(req()))
  await clock.settle()
  await command($, '2294', 'evidence-wall-clock')
  await clock.advance(4000)
  expect((await step).result).toEqual(result(req()))
  if (mode === 'retirement-write-refused') {
    expect(refused).toBeGreaterThan(1) // Repeated retirement still has evidence to retire.
    expect((await state($)).session.evidenceRetiredThrough).toBeUndefined()
    expect(data.calls.length).toBe(0)
  } else {
    data.rows = [gateway()]
    await command($, '4000', 'evidence-wall-clock')
    await clock.advance(4000)
    expect(data.calls.length).toBeGreaterThan(0)
    expect((await state($)).rows[0]?.models.find(bucket => bucket.model === 'channel/model')?.lastApi).toBeNull()
  }
  expect((await command($, 'reset')).text).toMatch('已重置')
})

for (const covered of [false, true]) test(`expired host Last competes with a very long step; covered=${covered} controls revocation`, WALL_OPTIONS, async ($, on) => {
  const { clock, data } = setup(on)
  const oldStart = -3 * AVG_WINDOW_MS, finish = -2 * AVG_WINDOW_MS
  const raw = gateway(oldStart + 100, { route_id: 1, ms: finish + 1500 - oldStart - 100 })
  const fake = { process: { run: async (argv: readonly string[]) => curlResponse(argv,
    json({ offset: 0, total: 1, rows: [raw] })) } } as unknown as EngineInterface
  const key = (await queryRows(fake, 'http://localhost', 'session', oldStart, 0)).rows[0]!.key
  let seeded = false
  on('state.set', { plugin: 'token-speed', key: 'snapshot' }, async (_$, e, next) => {
    if (seeded) return next(e)
    seeded = true
    const sample = { at: finish, tokens: 149, ms: finish - oldStart - 1000, key, step: 'restored',
      startedAt: oldStart, finishedAt: finish, counts }
    return next({ ...e, value: { ...e.value, rows: [{ ...e.value.rows[0]!, models: [{ model: 'channel/model',
      metric: 'magpie-measured-v1', log: [], last: sample, outputTokens: 0, durationMs: 0, samples: 0,
      lastApi: sample.tokens * 1000 / sample.ms, latestStep: 'restored', latestStatus: 'measured' }] }] } })
  })
  on('turn.step', async function* (_$, e) { await clock.sleep(2294); return result(e) })
  await $.session.start(START) // Expired Last stays only in host.
  await command($, String(covered ? oldStart : oldStart + 1), 'evidence-wall-clock')
  const step = consume($.turn.step(req()))
  await clock.settle()
  await command($, String(finish), 'evidence-wall-clock')
  await clock.advance(2294); await step
  await command($, '0', 'evidence-wall-clock')
  const earliest = covered ? oldStart : oldStart + 1
  const boundary = earliest - 1
  const serviceRows = [raw, ...Array.from({ length: 498 }, (_, i) =>
    gateway(oldStart + 2 + i, { route_id: i + 10, req: 'noise/model' })),
    gateway(boundary, { route_id: 1000, req: 'noise/model' }),
    gateway(boundary - 1, { route_id: 1001, req: 'noise/model' })]
    .sort((a, b) => Date.parse(String(b.t)) - Date.parse(String(a.t)))
  data.response = async url => {
    const seconds = Number(decodeURIComponent(url).match(/period=last:(\d+)s/)?.[1])
    const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
    const rows = serviceRows.filter(row => Date.parse(String(row.t)) >= -seconds * 1000)
    const page = rows.slice(offset, offset + 500)
    expect(rows.length).toBe(501)
    expect(page.length).toBe(500)
    expect(Date.parse(String(page[499]?.t))).toBe(boundary)
    return json({ offset, total: rows.length, rows: page })
  }
  await clock.advance(1706)
  expect(data.calls.length).toBe(2)
  const bucket = (await state($)).rows[0]?.models[0]
  expect(bucket?.samples).toBe(0)
  expect(bucket?.latestStatus).toBe('ambiguous')
  expect(bucket?.last?.step).toBe(covered ? undefined : 'restored')
})
