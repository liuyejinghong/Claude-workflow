export type TokenSpeedStatus = 'idle' | 'waiting' | 'streaming' | 'aborted' | 'error' | 'usage unavailable'

export type TokenSpeedModelStats = {
  model: string
  outputTokens: number
  durationMs: number
  samples: number
  lastApi: number | null
  /** v0.1 used response models, so its averages remain separately identified. */
  legacy?: true
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
}

export type TokenSpeedSnapshot = {
  version: 2
  rows: TokenSpeedRow[]
}

/** Read only compatibility shape; all writes use version 2. */
export type TokenSpeedLegacySnapshot = Pick<TokenSpeedRow, 'models' | 'currentModel' | 'active' | 'live' | 'status' | 'seen'>

declare module 'claude-code' {
  interface PluginState {
    'token-speed': { snapshot: TokenSpeedSnapshot }
  }
}
