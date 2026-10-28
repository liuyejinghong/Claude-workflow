export type TokenSpeedStatus = 'idle' | 'waiting' | 'streaming' | 'aborted' | 'error' | 'usage unavailable'

export type TokenSpeedEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number

export type TokenSpeedSample = {
  /** Magpie request completion epoch ms. */
  at: number
  tokens: number
  ms: number
  /** Minimal local association proof, retained across plugin reload only. */
  key?: string
  step?: string
  startedAt?: number
  finishedAt?: number
  counts?: { input: number; write: number; output: number; read: number }
}

export type TokenSpeedModelStats = {
  model: string
  outputTokens: number
  durationMs: number
  samples: number
  lastApi: number | null
  /** Only this tagged metric may feed current Last/Avg. Untagged history is legacy. */
  metric?: 'magpie-measured-v1'
  latestStep?: string
  /** Last validation transaction, used only to roll back a late host commit. */
  validationBatch?: string
  legacy?: true
  legacyKind?: 'response-model' | 'full-request'
  /** Per-request completion log backing the rolling 24h Avg; required for the new metric. */
  log?: TokenSpeedSample[]
}

export type TokenSpeedActive = {
  id: string
  turnId: string
  model: string
  startedAt: number
}

export type TokenSpeedRow = {
  /** main, or the session-local agentId. Array order is first observation order. */
  id: string
  description: string
  running: boolean
  currentModel: string | null
  models: TokenSpeedModelStats[]
  active: TokenSpeedActive | null
  status: TokenSpeedStatus
  seen: boolean
  turnId: string | null
  /** Lifecycle guard for asynchronously returned roster snapshots. */
  revision: number
  /** Observed request/applied effort, or an explicit configuration fallback. */
  effort: TokenSpeedEffort | null
  effortSource: 'configured' | 'request' | 'applied' | 'unknown'
  /** Each loop owns its latest reading; child windows are explicit configuration. */
  context: TokenSpeedContextInfo
}

export type TokenSpeedContextInfo = {
  /** Last response's uncached + cache-read + cache-written inputs, never a turn sum. */
  tokens: number | null
  /** Zero means unknown, never a guessed model/context cap. */
  window: number
  percent: number | null
  source: 'session' | 'cli-input' | 'cli-input-window-config' | 'cli-input-official-default' | 'cli-input-official-capacity' | 'unknown'
}

export type TokenSpeedWorkspace = { name: string; branch: string | null }

export type TokenSpeedSessionInfo = {
  /** Session-state lease rejects asynchronous writes from a replaced module. */
  observationGeneration?: string
  /** Last observed host configuration; distinct from the latest actual request. */
  configuredModel?: string
  context: TokenSpeedContextInfo
  workspace: TokenSpeedWorkspace | null
}

export type TokenSpeedSnapshot = {
  version: 2
  rows: TokenSpeedRow[]
  session: TokenSpeedSessionInfo
}

/** Read only compatibility shape; all writes use version 2. */
export type TokenSpeedLegacySnapshot = Pick<TokenSpeedRow, 'models' | 'currentModel' | 'active' | 'status' | 'seen'>

declare module 'claude-code' {
  interface PluginState {
    'token-speed': { snapshot: TokenSpeedSnapshot }
  }
}
