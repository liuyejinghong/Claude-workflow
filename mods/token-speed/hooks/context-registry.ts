export type OfficialContext = {
  id: string
  aliases: string[]
  defaultWindow: number | null
  maxWindow?: number
  contextWindow?: number
  sourceScope?: string
  additionalSources?: string[]
  apiContextWindow?: number
  maxInputTokens?: number
  sourceValue?: string
  sourceURL: string
  date: string
}
export type ContextOverride = { id: string; aliases: string[]; window: number; reason: string }
export type ContextRegistry = { version: 1; models: OfficialContext[]; overrides: ContextOverride[]; fallback?: true }
export type WindowReading = { window: number; source: 'configured' | 'official-default' | 'official-capacity' | 'unknown'; sourceURL?: string; date?: string }

// Keep the already-confirmed user windows if the packaged registry cannot load.
const FALLBACK_OVERRIDES: ContextOverride[] = [
  { id: 'gpt-6.1-sol', aliases: [], window: 272000, reason: 'User-confirmed CLI window' },
  { id: 'glm-5.3', aliases: [], window: 1000000, reason: 'User-confirmed CLI window' },
  { id: 'glm-5.3-flash', aliases: [], window: 1000000, reason: 'User-confirmed CLI window' },
]
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const name = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9._:-]*$/i.test(v)
const sourceURL = (v: unknown): v is string => typeof v === 'string' && /^https:\/\/[a-z0-9][a-z0-9.-]*(?:\/[\x21-\x7e]*)?$/i.test(v)
const fail = (): never => { throw new Error('Invalid model context registry') }
function aliases(v: unknown): string[] {
  if (!Array.isArray(v) || !v.every(name)) return fail()
  return v.map(s => s.toLowerCase())
}
function fields(v: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(v).some(k => !keys.includes(k))) fail()
}
function date(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const parsed = new Date(v + 'T00:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v
}
function unique(entries: { id: string; aliases: string[] }[]): void {
  const seen = new Set<string>()
  for (const entry of entries) for (const alias of [entry.id, ...entry.aliases]) {
    if (seen.has(alias)) fail()
    seen.add(alias)
  }
}
export function parseRegistry(text: string): ContextRegistry {
  const value: unknown = JSON.parse(text)
  if (!object(value) || value.version !== 1 || !Array.isArray(value.models) || !Array.isArray(value.overrides)) return fail()
  fields(value, ['version', 'models', 'overrides'])
  const models: OfficialContext[] = value.models.map(v => {
    if (!object(v) || !name(v.id) || (v.defaultWindow !== null && !integer(v.defaultWindow)) || !date(v.date)
      || !sourceURL(v.sourceURL) || (v.defaultWindow === null && !integer(v.contextWindow))) return fail()
    for (const key of ['maxWindow', 'contextWindow', 'apiContextWindow', 'maxInputTokens']) {
      if (v[key] !== undefined && !integer(v[key])) fail()
    }
    if (v.maxWindow !== undefined && v.defaultWindow !== null && (v.maxWindow as number) < (v.defaultWindow as number)) fail()
    if (v.additionalSources !== undefined && (!Array.isArray(v.additionalSources) || !v.additionalSources.every(sourceURL))) fail()
    if ((v.sourceScope !== undefined && (typeof v.sourceScope !== 'string' || !v.sourceScope.trim()))
      || (v.sourceValue !== undefined && (typeof v.sourceValue !== 'string' || !v.sourceValue.trim()))) fail()
    fields(v, ['id', 'aliases', 'defaultWindow', 'maxWindow', 'contextWindow', 'sourceScope', 'additionalSources',
      'apiContextWindow', 'maxInputTokens', 'sourceValue', 'sourceURL', 'date'])
    return { id: v.id.toLowerCase(), aliases: aliases(v.aliases), defaultWindow: v.defaultWindow as number | null,
      ...(v.maxWindow === undefined ? {} : { maxWindow: v.maxWindow as number }),
      ...(v.contextWindow === undefined ? {} : { contextWindow: v.contextWindow as number }),
      ...(v.apiContextWindow === undefined ? {} : { apiContextWindow: v.apiContextWindow as number }),
      ...(v.maxInputTokens === undefined ? {} : { maxInputTokens: v.maxInputTokens as number }),
      ...(v.sourceScope === undefined ? {} : { sourceScope: v.sourceScope as string }),
      ...(v.sourceValue === undefined ? {} : { sourceValue: v.sourceValue as string }),
      ...(v.additionalSources === undefined ? {} : { additionalSources: v.additionalSources as string[] }),
      sourceURL: v.sourceURL, date: v.date }
  })
  const overrides: ContextOverride[] = value.overrides.map(v => {
    if (!object(v) || !name(v.id) || !integer(v.window) || typeof v.reason !== 'string' || !v.reason.trim()) return fail()
    fields(v, ['id', 'aliases', 'window', 'reason'])
    return { id: v.id.toLowerCase(), aliases: aliases(v.aliases), window: v.window, reason: v.reason }
  })
  // A deliberate override may share an official id; ambiguity within either tier is refused.
  unique(models)
  unique(overrides)
  return { version: 1, models, overrides }
}
export function fallbackRegistry(): ContextRegistry {
  return { version: 1, models: [], overrides: FALLBACK_OVERRIDES.map(v => ({ ...v, aliases: [...v.aliases] })), fallback: true }
}
export function lookupWindow(registry: ContextRegistry, canonicalModel: string | null): WindowReading {
  const tail = canonicalModel?.slice(canonicalModel.lastIndexOf('/') + 1).toLowerCase() ?? ''
  const matches = (entry: { id: string; aliases: string[] }) => entry.id === tail || entry.aliases.includes(tail)
  const override = registry.overrides.find(matches)
  if (override) return { window: override.window, source: 'configured' }
  const official = registry.models.find(matches)
  return official ? { window: official.defaultWindow ?? official.contextWindow ?? 0,
    source: official.defaultWindow === null ? 'official-capacity' : 'official-default', sourceURL: official.sourceURL, date: official.date }
    : { window: 0, source: 'unknown' }
}
export function registryLoader(): (read: () => Promise<string>) => Promise<ContextRegistry> {
  let pending: Promise<ContextRegistry> | null = null
  return read => pending ??= (async () => {
    try { return parseRegistry(await read()) }
    catch { return fallbackRegistry() }
  })()
}
