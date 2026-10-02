import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { Lifetime, Play, Sys } from '../types'

// Joy-Con neon blue (left) and neon red (right)
const BLUE = '#00C3E3'
const RED = '#FF4554'
const YELLOW = '#FFC83D'

const HOME = 'switch2-home'
const TROPHIES = 'switch2-trophies'
const play = atom({ plugin: 'switch2', key: 'play' } as const, { turns: 0, tools: {} })
const pulse = atom({ plugin: 'switch2', key: 'pulse' } as const, 0)
const sys = atom({ plugin: 'switch2', key: 'sys' } as const, { model: '', startedAt: 0, now: 0 } as Sys)
const muted = atom({ plugin: 'switch2', key: 'muted' } as const, false)
const selected = atom({ plugin: 'switch2', key: 'selected' } as const, '')
const NEW_LIFE: Lifetime = {
  tools: {},
  turns: 0,
  playMs: 0,
  longestSessionMs: 0,
  compacts: 0,
  nightOwl: false,
  lowBattery: false,
  unlocked: {},
}
const life = atom({ plugin: 'switch2', key: 'life' } as const, NEW_LIFE)
const sessionPlay = atom({ plugin: 'switch2', key: 'sessionPlayMs' } as const, 0)

// Game covers for the HOME tiles; any other MCP tool is a plug-in cartridge
const COVERS: Record<string, string> = {
  Bash: '💻',
  Read: '📖',
  Edit: '✏️',
  Write: '📝',
  Grep: '🔍',
  Glob: '🗂️',
  WebFetch: '🌐',
  WebSearch: '🔎',
  Agent: '🤖',
  Skill: '🧩',
  AskUserQuestion: '💬',
  TodoWrite: '✅',
  ToolSearch: '🧰',
  SearchPlugins: '🧭',
  Artifact: '🖼️',
}
const cover = (tool: string) => COVERS[tool] ?? (tool.startsWith('mcp__') ? '🔌' : '🎮')
const title = (tool: string) => tool.replace(/^mcp__[^_]+__/, '')

const clockTime = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Trophies ────────────────────────────────────────────────────────────────

type Medal = 'bronze' | 'silver' | 'gold'
type Trophy = {
  id: string
  name: string
  medal: Medal
  group: string
  goal: number
  // Hidden trophies show as ??? until unlocked
  isSecret?: boolean
  progress: (l: Lifetime) => number
}

const MEDALS: Record<Medal, string> = { bronze: '🥉', silver: '🥈', gold: '🥇' }
const HOUR = 3_600_000
const TIERS: readonly [Medal, number, string][] = [
  ['bronze', 10, '新手'],
  ['silver', 100, '达人'],
  ['gold', 1000, '大师'],
]
const kinds = (l: Lifetime) => Object.keys(l.tools).length

const TROPHY_LIST: readonly Trophy[] = [
  ...['Bash', 'Read', 'Edit'].flatMap(tool =>
    TIERS.map(([medal, goal, rank]) => ({
      id: `tool:${tool}:${goal}`,
      name: `${cover(tool)} ${tool} ${rank}`,
      medal,
      group: '工具大师',
      goal,
      progress: (l: Lifetime) => l.tools[tool] ?? 0,
    })),
  ),
  { id: 'turns:1', name: '初次开机', medal: 'bronze', group: '游玩', goal: 1, progress: l => l.turns },
  { id: 'turns:10', name: '十局玩家', medal: 'bronze', group: '游玩', goal: 10, progress: l => l.turns },
  { id: 'turns:100', name: '百局老玩家', medal: 'silver', group: '游玩', goal: 100, progress: l => l.turns },
  { id: 'turns:1000', name: '千局传说', medal: 'gold', group: '游玩', goal: 1000, progress: l => l.turns },
  { id: 'play:1h', name: '游玩 1 小时', medal: 'bronze', group: '游玩', goal: 1, progress: l => l.playMs / HOUR },
  { id: 'play:10h', name: '游玩 10 小时', medal: 'silver', group: '游玩', goal: 10, progress: l => l.playMs / HOUR },
  { id: 'play:100h', name: '游玩 100 小时', medal: 'gold', group: '游玩', goal: 100, progress: l => l.playMs / HOUR },
  { id: 'marathon', name: '马拉松', medal: 'silver', group: '游玩', goal: 1, progress: l => l.longestSessionMs / HOUR },
  { id: 'kinds:5', name: '收集 5 张游戏卡', medal: 'bronze', group: '探索收集', goal: 5, progress: kinds },
  { id: 'kinds:10', name: '收集 10 张游戏卡', medal: 'silver', group: '探索收集', goal: 10, progress: kinds },
  { id: 'kinds:20', name: '集齐 20 张游戏卡', medal: 'gold', group: '探索收集', goal: 20, progress: kinds },
  {
    id: 'mcp',
    name: '🔌 插上扩展卡带',
    medal: 'bronze',
    group: '探索收集',
    goal: 1,
    progress: l => (Object.keys(l.tools).some(t => t.startsWith('mcp__')) ? 1 : 0),
  },
  { id: 'night-owl', name: '🦉 夜猫子', medal: 'silver', group: '彩蛋', goal: 1, isSecret: true, progress: l => (l.nightOwl ? 1 : 0) },
  { id: 'low-battery', name: '🪫 电量告急', medal: 'silver', group: '彩蛋', goal: 1, isSecret: true, progress: l => (l.lowBattery ? 1 : 0) },
  { id: 'tidy', name: '🗜 整理大师', medal: 'bronze', group: '彩蛋', goal: 1, isSecret: true, progress: l => l.compacts },
]

// Applies a change to the lifetime totals, stamps any trophy it completes,
// saves the totals across sessions, and announces each new trophy
async function record($: EngineInterface, isSoundOn: boolean, change: (l: Lifetime) => Lifetime) {
  const now = await $.clock.now()
  let fresh: Trophy[] = []
  const saved = await update($, life, l => {
    const next = change(l)
    fresh = TROPHY_LIST.filter(t => !next.unlocked[t.id] && t.progress(next) >= t.goal)
    if (fresh.length === 0) return next
    return { ...next, unlocked: { ...next.unlocked, ...Object.fromEntries(fresh.map(t => [t.id, now])) } }
  })
  await $.store.set('lifetime', saved)
  for (const t of fresh) $.ui.toast(`🏆 解锁成就：${MEDALS[t.medal]} ${t.name}`)
  if (fresh.length > 0) sound($, isSoundOn, 'done')
}


const WORDS: Record<string, readonly string[]> = {
  thinking: ['读取游戏卡', '加载关卡', '思考下一步'],
  requesting: ['连接服务器', '匹配对手', '同步存档'],
  responding: ['渲染画面', '播放过场', '输出字幕'],
  'tool-input': ['Joy-Con 振动', '按下 Ⓐ', '输入指令'],
  'tool-use': ['Joy-Con 振动', '保存进度', '下载更新'],
}

// The spinner redraws many times a turn; pick by the engine's own word so the
// replacement stays put instead of flickering.
const pick = (list: readonly string[], seed: string) => {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return list[Math.abs(hash) % list.length] ?? list[0] ?? seed
}

const seconds = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

const minutes = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// "claude-opus-5-5[1m]" → "Opus 5.5"; a name /model already prettified passes through
const cartridge = (model: string) => {
  const id = model.replace(/\[.*\]$/, '')
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  if (!m) return id
  const [, family = '', major, minor] = m
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`
}

// Ten cells of charge for the context left; amber at 40%, red at 20%
const battery = (usedPercent: number | undefined) => {
  const left = Math.max(0, Math.min(100, 100 - (usedPercent ?? 0)))
  const fill = Math.round(left / 10)
  const color = left <= 20 ? RED : left <= 40 ? YELLOW : '#C8C8C8'
  return { left, fill, color }
}

// The battery as both the band and HOME draw it: a framed cell bar with a
// terminal nub on the desktop, one row of ▰▱ on the terminal where a border
// would cost three rows
function Battery(ui: Pick<Elements['terminal'], 'Box' | 'Text'>, isTerminal: boolean, usedPercent: number | undefined) {
  const { Box, Text } = ui
  const charge = battery(usedPercent)
  const label = usedPercent === undefined ? '--' : `${charge.left}%`

  if (isTerminal) {
    const cells = Math.round(charge.fill / 2)
    return (
      <Text color={charge.color}>
        {'▰'.repeat(cells)}
        {'▱'.repeat(5 - cells)} {label}
      </Text>
    )
  }

  return (
    <Box alignItems="center" marginLeft={1}>
      <Box borderStyle="single" borderColor="#8A8A8A" padding={0}>
        {charge.fill > 0 && <Box width={charge.fill} height={1} backgroundColor={charge.color} />}
        {charge.fill < 10 && <Box width={10 - charge.fill} height={1} />}
      </Box>
      <Text color="#8A8A8A">▪</Text>
      <Text color={charge.color}> {label}</Text>
    </Box>
  )
}

// A progress bar of `cells` cells, as the battery draws its charge
function Meter(ui: Pick<Elements['terminal'], 'Box' | 'Text'>, isTerminal: boolean, ratio: number, color: string) {
  const { Box, Text } = ui
  const cells = 10
  const fill = Math.max(0, Math.min(cells, Math.floor(ratio * cells)))
  if (isTerminal) return <Text color={color}>{'▰'.repeat(fill) + '▱'.repeat(cells - fill)}</Text>

  return (
    <Box borderStyle="single" borderColor="#5A5A5A" padding={0}>
      {fill > 0 && <Box width={fill} height={1} backgroundColor={color} />}
      {fill < cells && <Box width={cells - fill} height={1} />}
    </Box>
  )
}

// Breathing Joy-Con: one cosine cycle every PULSE_FRAMES ticks, dipping to
// DIM of the colour's brightness at the bottom of the breath
const PULSE_MS = 200
const PULSE_FRAMES = 8
const DIM = 0.35

const breathe = (hex: string, frame: number) => {
  const level = DIM + (1 - DIM) * (0.5 + 0.5 * Math.cos((2 * Math.PI * frame) / PULSE_FRAMES))
  const rgb = [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * level))
  return `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`
}

async function refresh($: EngineInterface, isSoundOn: boolean) {
  const [model, usage, now] = await Promise.all([$.session.model(), $.session.usage(), $.clock.now()])
  await update($, sys, () => ({
    model,
    startedAt: usage.startedAt,
    now,
    contextPercent: usage.context.percent,
    usd: usage.cost?.usd,
  }))
  // 🪫 under 10% of the context left
  if ((usage.context.percent ?? 0) >= 90 && !(await read($, life)).lowBattery) {
    await record($, isSoundOn, l => ({ ...l, lowBattery: true }))
  }
}

// Fire and forget, so a clip never holds up the hook; a Linux or Windows
// terminal has no player and plays nothing.
function sound($: EngineInterface, isOn: boolean, asset: string) {
  if (isOn) void $.audio.play({ asset: `sounds/${asset}.wav` }).catch(() => {})
}

export const register: Register = (on, options) => {
  const hasSound = options.sounds !== false
  let isWorking = false
  let isMuted = false
  let turnStartedAt = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'home', description: 'Switch 2 HOME 菜单：本次会话玩过的工具' })
    await $.command.register({ name: 'trophies', description: 'Switch 2 奖杯室：跨会话累计的成就' })
    const stored = (await $.store.get('lifetime')) as Partial<Lifetime> | undefined
    await update($, life, () => ({ ...NEW_LIFE, ...stored }))
    // The mute switch on HOME outlives the session
    isMuted = (await $.store.get('muted')) === true
    await update($, muted, () => isMuted)
    sound($, hasSound && !isMuted, 'click')
    $.ui.toast('咔嚓！Joy-Con 已连接')
    await refresh($, hasSound && !isMuted)
    // Keeps the play time ticking while the session sits idle
    $.clock.every(30_000, () => void refresh($, hasSound && !isMuted).catch(() => {}))
    $.clock.every(PULSE_MS, () => {
      if (isWorking) void update($, pulse, f => (f + 1) % PULSE_FRAMES).catch(() => {})
    })

    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    sound($, hasSound && !isMuted, 'select')

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await update($, play, p => ({ ...p, tools: { ...p.tools, [e.tool]: (p.tools[e.tool] ?? 0) + 1 } }))
    await record($, hasSound && !isMuted, l => ({ ...l, tools: { ...l.tools, [e.tool]: (l.tools[e.tool] ?? 0) + 1 } }))
    const result = await next(e)
    void refresh($, hasSound && !isMuted).catch(() => {})

    return result
  })

  on('turn.start', async ($, e, next) => {
    isWorking = true
    turnStartedAt = await $.clock.now()

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    isWorking = false
    await update($, pulse, () => 0)
    await update($, play, p => ({ ...p, turns: p.turns + 1 }))
    // A turn begun before a reload has no start time and adds no play time
    const now = await $.clock.now()
    const playedMs = turnStartedAt ? now - turnStartedAt : 0
    turnStartedAt = 0
    const sessionMs = await update($, sessionPlay, ms => ms + playedMs)
    const hour = new Date(now).getHours()
    await record($, hasSound && !isMuted, l => ({
      ...l,
      turns: l.turns + 1,
      playMs: l.playMs + playedMs,
      longestSessionMs: Math.max(l.longestSessionMs, sessionMs),
      nightOwl: l.nightOwl || (hour >= 2 && hour < 5),
    })).catch(() => {})
    void refresh($, hasSound && !isMuted).catch(() => {})
    sound($, hasSound && !isMuted, 'done')

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.trigger !== 'precompute' && !('skip' in result && result.skip)) {
      await record($, hasSound && !isMuted, l => ({ ...l, compacts: l.compacts + 1 })).catch(() => {})
    }

    return result
  })

  on('command.run', { command: 'trophies' }, async $ => {
    await $.ui.open({ id: TROPHIES, title: '奖杯室', focus: true })

    return { text: '奖杯室已打开。' }
  })

  on('command.run', { command: 'home' }, async $ => {
    await $.ui.open({ id: HOME, title: 'HOME', focus: true })

    return { text: 'HOME 菜单已打开。' }
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    const words = WORDS[e.props.mode]
    if (e.props.message !== null || !words) return next(e)

    return next({ ...e, props: { ...e.props, word: pick(words, e.props.word) } })
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={BLUE}>◖</Text>
        <Text dimColor> 本局游玩 {seconds(e.props.durationMs)} </Text>
        <Text color={RED}>◗</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, tail: e.props.isWorking ? ' Ⓑ 中断' : ' Ⓐ 确定  Ⓧ /home' } }),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, play)
    const s = await read($, sys)
    const frame = e.props.isWorking ? await read($, pulse) : 0
    const calls = Object.values(p.tools).reduce((sum, n) => sum + n, 0)

    return (
      <Box width={e.props.bodyColumns}>
        <Text backgroundColor={breathe(BLUE, frame)} color="#000000" bold> L </Text>
        <Box flexGrow={1} justifyContent="space-between" paddingX={1}>
          <Box alignItems="center" flexShrink={1}>
            {/* The cartridge is the HOME button: a click opens the HOME pane */}
            <Button
              key="cartridge"
              plain
              label={`🎮 ${s.model ? cartridge(s.model) : 'SWITCH 2'}`}
              onPress={() => $.ui.open({ id: HOME, title: 'HOME', focus: true })}
            />
            <Text dimColor wrap="truncate-end">
              {'  '}
              {e.props.isWorking ? '▶ 游戏中' : '⏸ 待机'} · 第 {p.turns + (e.props.isWorking ? 1 : 0)} 局 · 操作 {calls} 次
            </Text>
          </Box>
          <Box alignItems="center" gap={2}>
            <Text dimColor>
              ⏱ {minutes(s.now - s.startedAt)}
              {s.usd !== undefined && `  💰 $${s.usd.toFixed(2)}`}
            </Text>
            {Battery({ Box, Text }, e.surface === 'terminal', s.contextPercent)}
          </Box>
        </Box>
        <Text backgroundColor={breathe(RED, frame)} color="#000000" bold> R </Text>
      </Box>
    )
  })

  // The selection cursor follows the focus ring across the game cards
  on('ui.focus', async ($, e, next) => {
    if (e.requestId === HOME && e.element?.startsWith('card:')) {
      const tool = e.element.slice('card:'.length)
      await update($, selected, () => tool)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: HOME }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, play)
    const s = await read($, sys)
    const isMute = await read($, muted)
    const games = Object.entries(p.tools).sort((a, b) => b[1] - a[1]).slice(0, 12)
    const total = games.reduce((sum, [, n]) => sum + n, 0)
    const pick = await read($, selected)
    const current = games.find(([tool]) => tool === pick) ?? games[0]
    const unlockedCount = Object.keys((await read($, life)).unlocked).length

    const toggleSound = async () => {
      isMuted = !isMuted
      await $.store.set('muted', isMuted)
      await update($, muted, () => isMuted)
      if (!isMuted) sound($, hasSound && !isMuted, 'click')
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box justifyContent="space-between" alignItems="center">
          <Text>
            <Text bold>HOME</Text>
            <Text dimColor>  已玩 {p.turns} 局</Text>
          </Text>
          <Box alignItems="center" gap={2}>
            <Text>
              <Text color={BLUE}>●</Text>
              <Text color={RED}>●</Text>
            </Text>
            <Text>{s.now ? clockTime(s.now) : '--:--'}</Text>
            {Battery({ Box, Text }, e.surface === 'terminal', s.contextPercent)}
          </Box>
        </Box>

        {games.length === 0 && <Text dimColor>还没有玩过任何游戏。让 Claude 用一次工具试试。</Text>}
        <Box flexWrap="wrap" gap={1}>
          {games.map(([tool, count], i) => {
            const isCurrent = tool === current?.[0]
            return (
              <Box
                key={`tile:${tool}`}
                borderStyle="round"
                borderColor={isCurrent ? '#FFFFFF' : i % 2 === 0 ? BLUE : RED}
                width={18}
                flexDirection="column"
                alignItems="center"
                paddingX={1}
                paddingY={1}
                hover={{ borderColor: '#FFFFFF' }}
              >
                <Text>{cover(tool)}</Text>
                <Button
                  key={`card:${tool}`}
                  plain
                  label={title(tool)}
                  onPress={() => update($, selected, () => tool)}
                  {...(i === 0 ? { autoFocus: true as const } : {})}
                />
                <Text dimColor>{count} 次</Text>
              </Box>
            )
          })}
        </Box>
        {current && (
          <Text>
            <Text color={BLUE}>▶ </Text>
            <Text bold>{title(current[0])}</Text>
            <Text dimColor>
              {'  '}
              {current[1]} 次 · 占全部 {Math.round((current[1] / total) * 100)}%
            </Text>
          </Text>
        )}

        <Box flexWrap="wrap" gap={1}>
          <Button
            key="compact"
            hotkey="c"
            label="🗜 压缩"
            onPress={async () => {
              $.ui.toast('正在整理存档…')
              await $.session.compact()
            }}
          />
          <Button
            key="trophies"
            hotkey="t"
            label={`🏆 成就 ${unlockedCount}/${TROPHY_LIST.length}`}
            onPress={() => $.ui.open({ id: TROPHIES, title: '奖杯室', focus: true })}
          />
          <Button key="sound" hotkey="s" label={isMute ? '🔇 声音关' : '🔊 声音开'} onPress={toggleSound} />
          <Button key="close" role="dismiss" hotkey="b" label="Ⓑ 返回" onPress={() => $.ui.close({ id: HOME })} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: TROPHIES }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const l = await read($, life)
    const isTerminal = e.surface === 'terminal'
    const groups = [...new Set(TROPHY_LIST.map(t => t.group))]
    const done = TROPHY_LIST.filter(t => l.unlocked[t.id]).length

    return (
      <Box flexDirection="column" gap={1}>
        <Box justifyContent="space-between">
          <Text bold>🏆 奖杯室</Text>
          <Text dimColor>
            已解锁 {done} / {TROPHY_LIST.length}
          </Text>
        </Box>
        {groups.map(group => (
          <Box key={`group:${group}`} flexDirection="column">
            <Text color={BLUE} bold>
              {group}
            </Text>
            {TROPHY_LIST.filter(t => t.group === group).map(t => {
              const isDone = Boolean(l.unlocked[t.id])
              const value = t.progress(l)
              const shown = t.goal >= 10 ? Math.floor(value) : Number(value.toFixed(1))
              return (
                <Box key={t.id} alignItems="center" gap={1}>
                  <Text>{isDone ? MEDALS[t.medal] : '🔒'}</Text>
                  <Box width={18}>
                    <Text bold={isDone} dimColor={!isDone} wrap="truncate-end">
                      {t.isSecret && !isDone ? '???' : t.name}
                    </Text>
                  </Box>
                  {isDone ? (
                    <Text color="#8FD694">✔ 已解锁</Text>
                  ) : t.isSecret ? (
                    <Text dimColor>隐藏成就</Text>
                  ) : (
                    <Box alignItems="center" gap={1}>
                      {Meter({ Box, Text }, isTerminal, value / t.goal, t.medal === 'gold' ? YELLOW : BLUE)}
                      <Text dimColor>
                        {shown}/{t.goal}
                      </Text>
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        ))}
        <Box>
          <Button key="close" role="dismiss" hotkey="b" label="Ⓑ 返回" onPress={() => $.ui.close({ id: TROPHIES })} />
        </Box>
      </Box>
    )
  })
}
