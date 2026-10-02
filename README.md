# switch2 · Claude Code 的 Switch 2 主题插件

> A Nintendo Switch 2 flavoured mod for Claude Code: a Joy-Con status bar, a HOME screen, trophies and console-style wording.

把 Claude Code 变成一台小主机：提示框上方有 Joy-Con 顶栏，`/home` 打开 HOME 菜单，用得越多解锁的奖杯越多。

## 安装

```bash
claude plugin marketplace add SimuraEpona/claude-plugin-switch2
claude plugin install switch2@simuraepona
```

也可以在 Claude Code 里输入 `/plugin marketplace add SimuraEpona/claude-plugin-switch2`，再 `/plugin install switch2@simuraepona`。

更新：

```bash
claude plugin update switch2@simuraepona
```

> 需要较新版本的 Claude Code（支持函数钩子插件）。加载不了时先升级到最新版。

## 功能

### Joy-Con 顶栏

```
[L] 🎮 Opus 5.5  ⏸ 待机 · 第 4 局 · 操作 20 次     ⏱ 25m  💰 $1.23  [████████░░]▪ 86% [R]
```

- **🎮 游戏卡**：当前模型，点击打开 HOME
- **局数 / 操作次数**：本次会话的回合数和工具调用数
- **⏱ 游玩时长**、**💰 余额**（本次会话花费）
- **电池**：剩余上下文，40% 以下变黄，20% 以下变红
- **呼吸灯**：Claude 工作时 L / R 会缓慢明暗呼吸

### HOME 菜单（`/home` 或点击游戏卡）

- 顶部系统栏：Joy-Con 图标、时间、电池
- 游戏卡墙：每个用过的工具一张卡，带封面图标和使用次数，方向键 / Tab 移动光标
- 快捷键：`C` 压缩上下文 · `T` 奖杯室 · `S` 声音开关（跨会话记住） · `B` 返回

### 奖杯室（`/trophies` 或 HOME 里按 `T`）

24 个成就，分 🥉 铜 / 🥈 银 / 🥇 金，跨会话累计：

| 类别 | 内容 |
| --- | --- |
| 工具大师 | Bash / Read / Edit 各 10、100、1000 次 |
| 游玩 | 局数 1 / 10 / 100 / 1000；累计 1 / 10 / 100 小时；单次会话 1 小时 |
| 探索收集 | 用过 5 / 10 / 20 种工具；首次使用 MCP 工具 |
| 彩蛋 | 三个隐藏成就，自己去发现 🤫 |

解锁时会弹出提示并播放音效。

### 其他小改动

- 思考动画文案：「读取游戏卡」「匹配对手」「渲染画面」……
- 回合结束：`◖ 本局游玩 12s ◗`
- 提示栏：`Ⓐ 确定  Ⓧ /home`

## 设置

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `sounds` | `true` | 播放点击 / 选择 / 完成音效（仅 macOS） |

在插件设置菜单中修改，或在 HOME 里按 `S` 临时静音。

## 开发

```bash
git clone git@github.com:SimuraEpona/claude-plugin-switch2.git
claude --plugin-dir ./claude-plugin-switch2   # 加载本地版本，保存即热重载
claude plugin validate ./claude-plugin-switch2
claude plugin test ./claude-plugin-switch2
```

在 Claude Code 里运行 `/plugin-types` 可以生成编辑器用的类型声明（写入 `.claude-plugin/types/`，已被 git 忽略）。

## 声明

非官方粉丝作品，与任天堂无关。Nintendo Switch 是任天堂的商标。

## 许可

MIT
