export type TokenSpeedStatus = 'idle' | 'waiting' | 'streaming' | 'aborted' | 'error' | 'usage unavailable'

export type TokenSpeedEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number

export type TokenSpeedSample = {
  /** $.clock.now() epoch ms when the request finished. */
  at: number
  tokens: number
  ms: number
}

export type TokenSpeedModelStats = {
  model: string
  outputTokens: number
  durationMs: number
  samples: number
  lastApi: number | null
  /** v0.1 used response models, so its averages remain separately identified. */
  legacy?: true
  /**
   * v0.3+ per-request log backing the rolling 24h Avg. Absent on v0.1 legacy
   * buckets and on v0.2 state migrated before its first new request.
   */
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
  live: number | null
  status: TokenSpeedStatus
  seen: boolean
  turnId: string | null
  /** Lifecycle guard for asynchronously returned roster snapshots. */
  revision: number
  /** The request's effort as turn.step reported it, absent or invalid parsed to null. */
  effort: TokenSpeedEffort | null
}

export type TokenSpeedContextInfo = {
  /** Last response's input tokens (status line total_input_tokens); null before one. */
  tokens: number | null
  window: number
  percent: number | null
}

export type TokenSpeedWorkspace = { name: string; branch: string | null }

export type TokenSpeedSessionInfo = {
  context: TokenSpeedContextInfo
  workspace: TokenSpeedWorkspace | null
}

export type TokenSpeedSnapshot = {
  version: 2
  rows: TokenSpeedRow[]
  session: TokenSpeedSessionInfo
}

/** Read only compatibility shape; all writes use version 2. */
export type TokenSpeedLegacySnapshot = Pick<TokenSpeedRow, 'models' | 'currentModel' | 'active' | 'live' | 'status' | 'seen'>

declare module 'claude-code' {
  interface PluginState {
    'token-speed': { snapshot: TokenSpeedSnapshot }
  }
}
