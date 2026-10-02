import { expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const scroll = { offset: 0, bodyRows: 10 }

test('the Joy-Con band counts turns and tool calls', { options: { sounds: false } }, async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'pwd' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'switch2',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll, view: {} },
    })
    expect((await ui.find({ text: /操作 2 次/ }))?.text).toContain('第 0 局')
    await ui.unmount()
  }
})

test('the spinner speaks console', { options: { sounds: false } }, async ($, on) => {
  const words: string[] = []
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    words.push(e.props.word)
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.word}</Text>
  })

  const ui = await $.ui.mount({
    plugin: 'switch2',
    surface: 'terminal',
    component: 'Spinner',
    props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
  })
  expect(['读取游戏卡', '加载关卡', '思考下一步']).toContain(words[0])
  await ui.unmount()
})

test('the HOME pane shows a tile per tool and closes on Ⓑ', { options: { sounds: false } }, async ($, on) => {
  const closed: string[] = []
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.close', ($, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  await $.tool.call({ tool: 'Read', file_path: '/x' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'switch2',
      surface,
      component: 'Pane',
      requestId: 'switch2-home',
      props: { title: 'HOME', isFocused: true, bodyColumns: 80, placement: 'dock', scroll, view: {} },
    })
    expect(await ui.find({ key: 'card:Read' })).toBeDefined()
    await ui.press({ key: 'close' })
    await ui.unmount()
  }
  expect(closed).toEqual(['switch2-home', 'switch2-home'])
})

test('the band shows the cartridge, play time and battery', { options: { sounds: false } }, async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'switch2',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll, view: {} },
    })
    expect(await ui.find({ text: /🎮/ })).toBeDefined()
    expect(await ui.find({ text: /⏱ \d+m/ })).toBeDefined()
    expect(await ui.find({ text: /\d+%|--/ })).toBeDefined()
    await ui.unmount()
  }
})

test('HOME shows a cover per card, follows the cursor and toggles sound', { options: { sounds: false } }, async ($, on) => {
  const saved: unknown[] = []
  on('tool.call', () => ({ result: 'ok' }))
  on('store.set', ($, e) => {
    saved.push(e.value)
    return { value: undefined }
  })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'pwd' })
  await $.tool.call({ tool: 'Read', file_path: '/x' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'switch2',
      surface,
      component: 'Pane',
      requestId: 'switch2-home',
      props: { title: 'HOME', isFocused: true, bodyColumns: 80, placement: 'dock', scroll, view: {} },
    })
    expect(await ui.find({ text: /💻/ })).toBeDefined()
    expect(await ui.find({ text: /📖/ })).toBeDefined()
    expect((await ui.find({ text: /▶/ }))?.text).toContain('Bash')

    await ui.press({ key: 'card:Read' })
    expect((await ui.find({ text: /占全部/ }))?.text).toContain('33%')

    await ui.press({ key: 'sound' })
    expect(await ui.find({ text: /声音关/ })).toBeDefined()
    await ui.press({ key: 'sound' })
    expect(await ui.find({ text: /声音开/ })).toBeDefined()
    await ui.unmount()
  }
  expect(saved).toEqual([true, false, true, false])
})

test('ten Bash calls unlock Bash 新手 and the trophy room shows it', { options: { sounds: false } }, async ($, on) => {
  const store: Record<string, unknown> = {}
  on('tool.call', () => ({ result: 'ok' }))
  on('clock.now', () => ({ value: 1_000 }))
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  for (let i = 0; i < 10; i++) await $.tool.call({ tool: 'Bash', command: 'true' })

  const saved = store.lifetime as { tools: Record<string, number>; unlocked: Record<string, number> }
  expect(saved.tools.Bash).toBe(10)
  expect(Object.keys(saved.unlocked)).toEqual(['tool:Bash:10'])
  expect(toasts).toEqual(['🏆 解锁成就：🥉 💻 Bash 新手'])

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'switch2',
      surface,
      component: 'Pane',
      requestId: 'switch2-trophies',
      props: { title: '奖杯室', isFocused: true, bodyColumns: 80, placement: 'dock', scroll, view: {} },
    })
    expect((await ui.find({ text: /已解锁 \d+ \// }))?.text).toContain('已解锁 1 / 24')
    expect(await ui.find({ text: /Bash 新手/ })).toBeDefined()
    expect(await ui.find({ text: /\?\?\?/ })).toBeDefined()
    await ui.unmount()
  }
})

test('pressing the cartridge in the band opens HOME', { options: { sounds: false } }, async ($, on) => {
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isOpen: true } }
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'switch2',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll, view: {} },
    })
    await ui.press({ key: 'cartridge' })
    await ui.unmount()
  }
  expect(opened).toEqual(['switch2-home', 'switch2-home'])
})
