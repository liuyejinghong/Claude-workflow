import type { EngineInterface } from 'claude-code'

// Claude Code settles a model's auto-compact window from the environment, the
// merged settings, and an agent definition's frontmatter. This module reads
// those sources without trusting any of them: each failure falls through.
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const AGENT_WINDOW_MIN = 100000
const AGENT_WINDOW_MAX = 1000000
const AGENT_TYPE = /^[A-Za-z0-9_.:-]+$/

export type WindowConfig = { env: number | null; settings: unknown | null }

export function parseWindowValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!/^\d+$/.test(text)) return null
  const window = Number(text)
  return Number.isSafeInteger(window) && window > 0 ? window : null
}

// [1m] and explicit effort suffixes are configuration, not model identity.
export function normalizeModelName(model: string): string {
  let value = model.trim()
  for (;;) {
    const next = value.replace(/(?:\[1m\]|\((?:low|medium|high|xhigh|max)\)|:(?:low|medium|high|xhigh|max))$/i, '').trim()
    if (next === value) return value
    value = next
  }
}

// Claude Code stores per-model settings under canonical names without a
// channel prefix, while hooks see provider-prefixed names. Prefer an exact
// key, then an equal name after suffix stripping, then a bare key equal to the
// model's final segment. A slash-bearing key never matches another channel.
export function modelSettingsValue<T>(settings: unknown, model: string,
  read: (entry: Record<string, unknown>) => T | null): T | null {
  if (!object(settings) || !object(settings.modelSettings)) return null
  const models = settings.modelSettings
  const tiers: ((key: string) => boolean)[] = [key => key === model]
  const normalized = normalizeModelName(model)
  if (normalized) {
    const segment = normalized.slice(normalized.lastIndexOf('/') + 1)
    tiers.push(key => normalizeModelName(key) === normalized,
      key => !key.includes('/') && normalizeModelName(key) === segment)
  }
  // A key without the wanted field falls through to the next tier.
  for (const matches of tiers) {
    for (const key of Object.keys(models)) {
      if (!matches(key)) continue
      const entry = models[key]
      const found = object(entry) ? read(entry) : null
      if (found !== null) return found
    }
  }
  return null
}

export function modelSettingsWindow(settings: unknown, model: string): number | null {
  return modelSettingsValue(settings, model, entry => parseWindowValue(entry.autoCompactWindow))
}

export function topLevelWindow(settings: unknown): number | null {
  return object(settings) ? parseWindowValue(settings.autoCompactWindow) : null
}

export function windowFromConfig(config: WindowConfig, model: string): number | null {
  return config.env ?? modelSettingsWindow(config.settings, model) ?? topLevelWindow(config.settings)
}

export async function readWindowConfig($: EngineInterface): Promise<WindowConfig> {
  let env: number | null = null
  try { env = parseWindowValue(await $.env.get('CLAUDE_CODE_AUTO_COMPACT_WINDOW')) } catch { /* Read as unset. */ }
  let settings: unknown | null = null
  if (env === null) {
    try { settings = await $.settings.read() } catch { /* Read as unset. */ }
  }
  return { env, settings }
}

// Frontmatter only: the first top-level autoCompactWindow inside the leading
// block. No YAML dependency and no nested keys.
export function agentDefinitionWindow(text: string): number | null {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return null
  let end = -1
  for (let index = 1; index < lines.length; index++) {
    if (lines[index]?.trim() === '---') { end = index; break }
  }
  if (end < 0) return null
  for (let index = 1; index < end; index++) {
    const match = /^autoCompactWindow\s*:\s*(.*)$/.exec(lines[index] ?? '')
    if (!match) continue
    const raw = (match[1] ?? '').trim()
    const quoted = /^(['"])(\d+)\1$/.exec(raw)
    const digits = quoted?.[2] ?? /^\d+/.exec(raw)?.[0] ?? ''
    const trailing = quoted ? '' : raw.slice(digits.length).trim()
    if (!digits || (trailing && !trailing.startsWith('#'))) return null
    const window = Number(digits)
    return Number.isSafeInteger(window) && window >= AGENT_WINDOW_MIN && window <= AGENT_WINDOW_MAX ? window : null
  }
  return null
}

export function composeWindow(config: number | null, agent: number | null): number | null {
  if (config === null) return agent
  if (agent === null) return config
  return Math.min(config, agent)
}

function joinPath(base: string, ...parts: string[]): string {
  const prefix = base.replace(/\/+$/, '')
  return `${prefix}/${parts.join('/')}`
}

function agentTypeName(type: string | null): string | null {
  const value = type?.trim() ?? ''
  if (!value || value === '.' || value === '..' || !AGENT_TYPE.test(value)) return null
  return value
}

export async function readAgentWindow($: EngineInterface, agentType: string | null): Promise<number | null> {
  const type = agentTypeName(agentType)
  if (type === null) return null
  const paths: string[] = []
  try {
    const cwd = await $.session.cwd()
    if (cwd) paths.push(joinPath(cwd, '.claude', 'agents', `${type}.md`))
  } catch { /* No project-level definition is readable. */ }
  let configDir: string | null = null
  try { configDir = (await $.env.get('CLAUDE_CONFIG_DIR'))?.trim() || null } catch { /* Try HOME. */ }
  if (configDir === null) {
    try {
      const home = (await $.env.get('HOME'))?.trim()
      if (home) configDir = joinPath(home, '.claude')
    } catch { /* No user-level directory is readable. */ }
  }
  if (configDir !== null) paths.push(joinPath(configDir, 'agents', `${type}.md`))
  for (const path of paths) {
    let text: string
    try { text = await $.fs.read(path) } catch { continue }
    if (typeof text !== 'string') return null
    // A readable definition owns the answer, even when it sets no window.
    return agentDefinitionWindow(text)
  }
  return null
}
