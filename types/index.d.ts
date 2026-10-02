export type Play = { turns: number; tools: Record<string, number> }

// The console's system bar: what the band shows on the right
export type Sys = {
  model: string
  startedAt: number
  now: number
  contextPercent?: number
  usd?: number
}

// Totals across every session, kept in $.store and mirrored into state for drawing
export type Lifetime = {
  tools: Record<string, number>
  turns: number
  playMs: number
  longestSessionMs: number
  compacts: number
  nightOwl: boolean
  lowBattery: boolean
  // trophy id → when it was unlocked
  unlocked: Record<string, number>
}

declare module 'claude-code' {
  interface PluginState {
    switch2: { play: Play; sys: Sys; pulse: number; muted: boolean; selected: string; life: Lifetime; sessionPlayMs: number }
  }
}
