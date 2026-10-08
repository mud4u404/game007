/**
 * 聚焦界面的触控验收：信息按需出现，选择才行动，困境仍有出路。
 * node scripts/focus-smoke.mjs [http://127.0.0.1:5174/demo.html] [截图目录]
 * 无 URL 时测试 dist。边界存档只用于检验界面出口，不代替规则测试。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const SAVE = 'game007-sandbox-demo-v1';
const LAYOUT = 'game007-sandbox-demo-layout';
const THEME = 'game007-sandbox-demo-theme';
const ORIGINS = ['porter', 'courier', 'scholar', 'apprentice'];
const VIEWPORTS = [
  { width: 320, height: 568 }, { width: 360, height: 560 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 720, height: 560 },
];
const SENTINELS = { 'game007-save-v2': 'focus-original-game007-kept', 'jhyy-save-v2': 'focus-original-game006-kept' };
const shots = process.argv[3] && resolve(process.argv[3]);
if (shots) mkdirSync(shots, { recursive: true });
let url = process.argv[2], server, browser;
const errors = [];
const log = text => console.log(`· ${text}`);

try {
  if (!url) {
    const { preview } = await import('vite');
    server = await preview({ preview: { host: '127.0.0.1', port: 4186 }, logLevel: 'warn' });
    url = new URL('demo.html', server.resolvedUrls.local[0]).href;
  }
  const executablePath = process.env.SMOKE_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const channel = process.env.SMOKE_CHANNEL;
  try { browser = await chromium.launch(channel ? { channel } : executablePath ? { executablePath } : {}); }
  catch (error) {
    if (!channel && !executablePath) throw error;
    browser = await chromium.launch();
  }
  const context = await browser.newContext({ viewport: VIEWPORTS[2], hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await context.addInitScript(sentinels => {
    for (const [key, value] of Object.entries(sentinels)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, SENTINELS);
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(error.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  await p.goto(url);

  const state = () => p.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE);
  const ui = value => p.locator(`[data-ui="${value}"]:visible`).first();
  const tap = value => ui(value).tap({ timeout: 8000 });
  const dialog = () => p.locator('.modal[role="dialog"]:visible');
  const snap = async name => { if (shots) await p.screenshot({ path: `${shots}/${name}.png` }); };
  const shape = async label => {
    const problems = await p.evaluate(() => {
      const bad = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(`页面宽 ${document.documentElement.scrollWidth} > ${innerWidth}`);
      for (const el of document.querySelectorAll('button,summary')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        if (r.width < 43.9 || r.height < 43.9) bad.push(`${el.dataset.ui ?? el.textContent.trim()}: 点击区 ${Math.round(r.width)}×${Math.round(r.height)}`);
        if (r.left < -1 || r.right > innerWidth + 1) bad.push(`${el.dataset.ui}: 横向 ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return bad;
    });
    assert.deepEqual(problems, [], label);
  };
  // 在 tap 之前检查，避免浏览器自动滚动掩盖首屏入口被遮住的问题。
  const reachable = async (locator, label) => {
    const issue = await locator.evaluate(el => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return x < 0 || x > innerWidth || y < 0 || y > innerHeight ? `中心 ${Math.round(x)},${Math.round(y)} 不在屏内`
        : !(top && (top === el || el.contains(top))) ? `被 ${top?.tagName}.${top?.className} 遮住` : null;
    });
    assert.equal(issue, null, `${label} 不能直接点到`);
  };
  // 场景图和肖像不能只在 DOM 里占位：检查屏内实际使用的资源能被浏览器解码。
  const artLoaded = async (label, portraits = true) => {
    const art = await p.evaluate(async () => {
      const urls = new Set();
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect(), style = getComputedStyle(el);
        if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth || style.visibility === 'hidden' || style.opacity === '0') continue;
        if (el instanceof HTMLImageElement && el.currentSrc) urls.add(el.currentSrc);
        for (const pseudo of [null, '::before', '::after']) {
          const background = getComputedStyle(el, pseudo).backgroundImage;
          for (const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(match[1]);
        }
      }
      return Promise.all([...urls].filter(src => /\/(scenes|portraits)\.webp(?:[?#]|$)/.test(src)).map(async src => {
        const image = new Image();
        image.src = src;
        try {
          await image.decode();
          return { src, decoded: image.naturalWidth > 0 && image.naturalHeight > 0 };
        } catch { return { src, decoded: false }; }
      }));
    });
    assert.ok(art.some(item => /\/scenes\.webp(?:[?#]|$)/.test(item.src)), `${label} 首屏没有场景美术`);
    if (portraits) assert.ok(art.some(item => /\/portraits\.webp(?:[?#]|$)/.test(item.src)), `${label} 人物肖像没有显示`);
    assert.deepEqual(art.filter(item => !item.decoded), [], `${label} 美术资源加载失败`);
  };
  // 中心可点还不够：关键操作应完整留在屏内，内侧四角也不能被画面或浮层覆盖。
  const unobstructed = async (locator, label) => {
    const issue = await locator.evaluate(el => {
      const r = el.getBoundingClientRect();
      if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) return '点击区未完整显示';
      const inset = 12;
      const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + inset, r.top + inset], [r.right - inset, r.top + inset], [r.left + inset, r.bottom - inset], [r.right - inset, r.bottom - inset]];
      for (const [x, y] of points) {
        const top = document.elementFromPoint(x, y);
        if (!top || (top !== el && !el.contains(top))) return `${Math.round(x)},${Math.round(y)} 被 ${top?.tagName}.${top?.className} 遮住`;
      }
      return null;
    });
    assert.equal(issue, null, `${label} 被遮挡或裁切`);
  };
  const focusInside = async () => assert.ok(await dialog().evaluate(el => el.contains(document.activeElement)), '键盘焦点离开了抽屉');
  const checkFocusTrap = async () => {
    await focusInside();
    const controls = dialog().locator('button:not(:disabled):visible,a[href]:visible,input:visible,summary:visible,[tabindex="0"]:visible');
    await controls.last().focus();
    await p.keyboard.press('Tab');
    await focusInside();
    assert.ok(await controls.first().evaluate(el => el === document.activeElement), 'Tab 应循环回抽屉首项');
    await p.keyboard.press('Shift+Tab');
    assert.ok(await controls.last().evaluate(el => el === document.activeElement), 'Shift+Tab 应循环回抽屉末项');
  };
  const close = async () => { if (await dialog().count()) await tap('close'); };
  const showUnavailable = async () => {
    for (const summary of await dialog().locator('details.focus-unavailable:not([open]) > summary').all()) await summary.tap();
  };
  const noWorldActionList = async () => {
    assert.equal(await p.locator('.focus-world').count(), 1, '默认世界页应采用聚焦场景');
    assert.equal(await p.locator('.action-card:visible').count(), 0, '未选择目标时，不应常驻展开行动列表');
    assert.equal(await dialog().count(), 0, '进入世界不应自动打开人物或行动');
    const keys = await p.locator('.bottom-nav [data-ui]').evaluateAll(els => els.map(el => el.dataset.ui));
    assert.deepEqual(keys, ['tab:world', 'tab:map', 'tab:person'], '底部主导航应保持三个入口');
  };
  const resultInSheet = async () => {
    const reply = dialog().locator('.reply-card');
    assert.equal(await reply.count(), 1, '行动后应在原抽屉内看到回应');
    await reachable(reply, '行动结果');
    assert.ok((await reply.innerText()).trim().length > 0, '回应不能是空白');
    await focusInside();
  };
  const untrained = (s, label) => {
    assert.deepEqual([s.power, s.sword, s.footwork, s.experience, s.mp], [0, 0, 0, 0, 0], `${label} 不应凭空会武功`);
    assert.ok(!Object.entries(s.inventory).some(([id, n]) => id.includes('sword') && n > 0), `${label} 不应凭空携带剑`);
  };

  assert.equal(await p.locator('html').getAttribute('data-layout'), 'focus', '新用户默认应进入聚焦界面');
  await p.locator('.arrival-screen').waitFor();
  assert.equal(await state(), null, '选择出身之前不应写存档');
  for (const viewport of VIEWPORTS) {
    await p.setViewportSize(viewport);
    await shape(`${viewport.width}×${viewport.height} 出身页`);
    await reachable(ui('begin'), '开始按钮');
    await snap(`focus-arrival-${viewport.width}x${viewport.height}`);
  }
  await p.setViewportSize(VIEWPORTS[2]);
  await snap('focus-arrival');
  for (const origin of ORIGINS) {
    await tap(`choose-origin:${origin}`);
    assert.equal(await state(), null, '浏览出身不得创建角色');
  }
  for (const origin of ORIGINS) {
    await tap(`choose-origin:${origin}`);
    await tap('begin');
    assert.equal((await state()).origin, origin);
    untrained(await state(), origin);
    await noWorldActionList();
    await p.evaluate(key => localStorage.removeItem(key), SAVE);
    await p.reload();
    await p.locator('.arrival-screen').waitFor();
  }
  await tap('choose-origin:porter');
  await tap('begin');
  const initial = await state();
  const seed = async (patch = {}, extra = {}) => {
    const value = { ...structuredClone(initial), ...patch };
    for (const key of ['inventory', 'flags', 'relations']) value[key] = { ...initial[key], ...extra[key] };
    await p.evaluate(({ value, SAVE, LAYOUT, THEME }) => {
      localStorage.setItem(SAVE, JSON.stringify(value));
      localStorage.setItem(LAYOUT, 'focus');
      localStorage.setItem(THEME, 'light');
    }, { value, SAVE, LAYOUT, THEME });
    await p.reload();
    await p.locator('.focus-world').waitFor();
    assert.deepEqual(await state(), value, '仅渲染界面不应改变世界');
    return value;
  };
  log('默认聚焦界面、四种出身均从零武学开始、确认前不写档');

  for (const viewport of VIEWPORTS) {
    await seed();
    await p.setViewportSize(viewport);
    const label = `${viewport.width}×${viewport.height}`;
    await noWorldActionList();
    await shape(`${label} 世界页`);
    await artLoaded(`${label} 世界页`);
    for (const key of ['menu', 'status', 'focus-actions', 'select:guard', 'tab:world', 'tab:map', 'tab:person']) {
      await reachable(ui(key), `${label} ${key}`);
      await unobstructed(ui(key), `${label} ${key}`);
    }
    await snap(`focus-world-${viewport.width}x${viewport.height}`);
    await tap('select:guard');
    assert.equal(await p.locator('.modal.focus-sheet[role="dialog"]').count(), 1, '选人物应打开行动抽屉');
    await shape(`${label} 人物行动`);
    await reachable(ui('action:talk:guard'), `${label} 交谈`);
    await unobstructed(ui('action:talk:guard'), `${label} 交谈`);
    if (viewport.width === 390) await snap('focus-person-sheet');
    const guardActions = ['talk:guard', 'rescue-evidence', 'rescue-money', 'rescue-sneak', 'rescue-fight'];
    for (const action of guardActions) assert.equal(await dialog().locator(`[data-ui="action:${action}"]`).count(), 1, `人物交互遗漏 ${action}`);
    await showUnavailable();
    assert.match(await ui('action:talk:guard').innerText(), /两分钟/);
    assert.match(await ui('action:rescue-money').innerText(), /60\s*文/);
    assert.match(await ui('action:rescue-evidence').innerText(), /需要.*货单|人证/);
    assert.match(await ui('action:rescue-sneak').innerText(), /尚未.*轻功/);
    assert.ok(await ui('action:rescue-money').isDisabled(), '28 文不能担保 60 文');
    await checkFocusTrap();
    await p.keyboard.press('Escape');
    assert.equal(await dialog().count(), 0);
    assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('data-ui')), 'select:guard', 'Escape 应把焦点还给刚点的人物');
    await noWorldActionList();

    await tap('focus-actions');
    await shape(`${label} 当地行动`);
    if (viewport.width === 390) await snap('focus-local-sheet');
    for (const action of ['work-cargo', 'free-rest', 'wait', 'use-medicine']) assert.equal(await dialog().locator(`[data-ui="action:${action}"]`).count(), 1, `当地行动遗漏 ${action}`);
    await close();
    await tap('status');
    await shape(`${label} 状态抽屉`);
    assert.match(await dialog().innerText(), /气血/);
    assert.match(await dialog().innerText(), /精力/);
    await close();
    await tap('menu');
    await shape(`${label} 菜单`);
    for (const key of ['layouts', 'theme', 'journal', 'origins']) assert.equal(await dialog().locator(`[data-ui="${key}"]`).count(), 1, `菜单遗漏 ${key}`);
    await close();

    await tap('tab:person');
    await shape(`${label} 人物页`);
    for (const key of ['tab:sword', 'tab:bag', 'journal', 'menu']) assert.equal(await p.locator(`.focus-person-links [data-ui="${key}"]`).count(), 1, `人物页遗漏 ${key}`);
    for (const tab of ['sword', 'bag']) {
      await tap(`tab:${tab}`);
      await shape(`${label} ${tab}`);
      await reachable(ui('tab:person'), `${label} 返回人物`);
      await tap('tab:person');
    }
    await tap('tab:map');
    await shape(`${label} 地图`);
    await tap('tab:world');
    assert.deepEqual(await state(), initial, '换页、查状态、开关抽屉不能消耗世界时间');
  }
  await p.setViewportSize(VIEWPORTS[2]);
  await seed();
  const worldText = await p.locator('body').innerText();
  assert.doesNotMatch(worldText, /一身本事，一段江湖|一蓑烟雨任平生|比较三种操作方式|从场景找人|概念试玩|进度保存在本机|原版存档独立保留|自由世界.*演示/, '首屏不应出现品牌标语、方案说明或常驻存档说明');
  log('五种屏幕：三主入口、44px 点击区、无横向溢出、抽屉焦点循环；场景和人物图已解码，关键操作无遮挡');
  await snap('focus-world');
  await tap('tab:person'); await snap('focus-person');
  await tap('tab:map'); await snap('focus-map');
  await tap('tab:world');

  // 不同地点、夜间无人和多人同屏都应保留场景与可点的行动出口。
  for (const place of ['dock', 'street', 'tea', 'yard', 'inn', 'yamen']) {
    await seed({ place });
    await artLoaded(`${place} 白日场景`);
    await shape(`${place} 白日场景`);
    await snap(`focus-scene-${place}`);
  }
  for (const viewport of VIEWPORTS) {
    await p.setViewportSize(viewport);
    await seed({ stopped: true, heat: 40 });
    await shape(`${viewport.width} 四人同屏`);
    await artLoaded(`${viewport.width} 四人同屏`);
    for (const key of ['select:docker', 'select:guard', 'select:xu', 'select:constable', 'focus-actions', 'status']) {
      await unobstructed(ui(key), `${viewport.width} 四人同屏 ${key}`);
    }
    if (viewport.width === 390) await snap('focus-four-people');
    await seed({ place: 'yard', minute: 1380 });
    await shape(`${viewport.width} 夜间无人`);
    await artLoaded(`${viewport.width} 夜间无人`, false);
    await unobstructed(ui('focus-actions'), `${viewport.width} 夜间行动`);
    await unobstructed(ui('tab:map'), `${viewport.width} 夜间离开`);
    if (viewport.width === 390) await snap('focus-night-empty');
  }
  await p.setViewportSize(VIEWPORTS[2]);
  await seed({ place: 'inn', minute: 1380, caseStatus: 'released' });
  await artLoaded('夜间客栈');
  for (const person of ['xu', 'innkeeper']) await unobstructed(ui(`select:${person}`), `夜间 ${person}`);
  await snap('focus-night-inn');
  await seed();
  log('六处场景、夜间无人、夜间客栈与四人同屏均可操作，美术资源正常显示');

  await tap('select:guard');
  const beforeTalk = await state();
  await tap('action:talk:guard');
  assert.equal((await state()).minute, beforeTalk.minute + 2);
  await resultInSheet();
  await close();
  await tap('focus-actions');
  await tap('action:work-cargo');
  assert.equal((await state()).silver, 70, '脚夫搬货应取得收入');
  await resultInSheet();
  await snap('focus-actions');
  await close();
  await tap('tab:map');
  const beforeTravel = await state();
  await tap('travel:street');
  const arrived = await state();
  assert.equal(arrived.place, 'street');
  assert.ok(arrived.minute > beforeTravel.minute, '赶路必须经过时间');
  assert.ok(!arrived.flags.ledger, '旅行不能替玩家自动查账');
  await noWorldActionList();
  assert.equal(await p.locator('.bottom-nav [aria-current="page"]').getAttribute('data-ui'), 'tab:world', '到达后应回到场景');
  await snap('focus-street');
  await tap('select:merchant');
  assert.match(await ui('action:take-purse').innerText(), /案底|认出|目击|人多眼杂/, '危险动作在执行前应交代风险');
  await close();
  await tap('focus-actions');
  await tap('action:inspect-ledger');
  assert.equal((await state()).flags.ledger, true, '当地行动应可直接执行调查');
  await resultInSheet();
  await close();
  log('点人交谈、当地搬货、地图赶路与另行查账；结果保留在操作抽屉内，危险动作有风险提示');

  // 这些状态来自真实新角色，仅注入边界，实际恢复/获释仍通过触控执行。
  const examples = [
    { id: 'low-hp', patch: { hp: 1 }, action: 'use-medicine', verify: (before, after) => { assert.equal(after.hp, 61); assert.equal(after.inventory.medicine, 0); } },
    { id: 'no-resources', patch: { hp: 1, stamina: 0, silver: 0 }, extra: { inventory: { medicine: 0 } }, action: 'free-rest', verify: (before, after) => { assert.equal(after.stamina, 40); assert.equal(after.hp, 36); assert.equal(after.minute, before.minute + 120); } },
    { id: 'stopped', patch: { place: 'street', stopped: true, heat: 40, theftHeat: 30, hp: 1, stamina: 0, silver: 0 }, extra: { inventory: { medicine: 0 }, relations: { merchant: -3 } }, action: 'submit-check', verify: (before, after) => { assert.equal(after.stopped, false); assert.equal(after.place, 'yamen'); assert.equal(after.heat, 0); assert.equal(after.silver, 0); assert.equal(after.minute, before.minute + 120); assert.deepEqual(after.relations, before.relations); } },
  ];
  for (const example of examples) {
    await p.setViewportSize(VIEWPORTS[0]);
    const before = await seed(example.patch, example.extra);
    await reachable(ui('focus-actions'), `${example.id} 行动入口`);
    if (example.id === 'stopped') {
      await tap('tab:map');
      const route = ui('travel:inn');
      if (await route.isEnabled()) await route.tap();
      assert.equal((await state()).place, 'street', '地图不能绕过盘查');
      assert.equal((await state()).minute, before.minute, '无效旅行不能耗时');
      await tap('tab:world');
    }
    await tap('focus-actions');
    await shape(`320×568 ${example.id} 当地行动`);
    if (example.id === 'stopped') {
      await showUnavailable();
      assert.ok(await ui('action:settle-fine').isDisabled(), '没钱不能直接交罚钱');
      assert.ok(await ui('action:arrest-fight').isDisabled(), '重伤零精力不能开战');
    }
    const exit = ui(`action:${example.action}`);
    assert.ok(await exit.isEnabled(), `${example.id} 没有可用的出路`);
    await exit.scrollIntoViewIfNeeded();
    await reachable(exit, `${example.id} 出路`);
    assert.deepEqual(await state(), before, '展示出路不能替玩家作决定');
    await exit.tap();
    example.verify(before, await state());
    await resultInSheet();
    await snap(`focus-${example.id}`);
    await close();
  }
  log('重伤敷药、零钱零药零精力歇脚、盘查获释：极端处境仍有可执行出路');

  await p.setViewportSize(VIEWPORTS[2]);
  await seed({ place: 'yard' });
  await tap('select:swordsman');
  await tap('action:observe-sword');
  assert.equal((await state()).flags.observedSword, true);
  await resultInSheet();
  await tap('action:learn-sword');
  assert.equal((await state()).sword, 1, '观摩后应能在同一人物抽屉请教入门');
  await resultInSheet();
  await tap('action:spar');
  await p.locator('.battle[role="dialog"]').waitFor();
  assert.equal(await dialog().count(), 0, '开始交手后，行动抽屉应收起');
  await reachable(ui('fight:flee'), '切磋认输');
  await tap('fight:flee');
  await tap('fight:finish');
  assert.equal(await p.locator('.battle').count(), 0, '切磋结束应收起战斗');
  assert.equal((await state()).pendingBattle, undefined);
  await noWorldActionList();
  await reachable(ui('tab:person'), '切磋结束后的导航');
  await tap('tab:person');
  assert.equal(await p.locator('.focus-person-links').count(), 1, '结束交手后页面应恢复可操作');
  await tap('tab:world');
  log('观摩 → 请教第一招 → 切磋认输 → 返回场景；抽屉与战斗不叠加，背景操作恢复');

  await seed();
  for (const variant of ['cards', 'scroll', 'compact', 'focus']) {
    const before = await state();
    if (await ui('menu').count()) await tap('menu');
    await tap('layouts');
    await tap(`layout:${variant}`);
    await close();
    assert.equal(await p.locator('html').getAttribute('data-layout'), variant);
    assert.deepEqual(await state(), before, '更换布局不能影响进度');
  }
  await tap('menu');
  await tap('theme');
  await close();
  assert.equal(await p.locator('html').getAttribute('data-theme'), 'dark');
  await shape('深色世界页');
  await snap('focus-dark');
  const saved = await state();
  await p.reload();
  assert.deepEqual(await state(), saved, '刷新应继续同一份试玩进度');
  assert.equal(await p.locator('html').getAttribute('data-layout'), 'focus');
  assert.equal(await p.locator('html').getAttribute('data-theme'), 'dark');
  await tap('menu');
  await tap('journal');
  assert.match(await dialog().innerText(), /许青|船工/);
  await p.keyboard.press('Escape');
  await tap('menu');
  await tap('origins');
  assert.equal(await dialog().locator('[data-ui^="origin:"]').count(), 4);
  await close();
  assert.deepEqual(await state(), saved, '阅读手记和出身不能改变进度');
  const sentinels = await p.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(SENTINELS));
  assert.deepEqual(sentinels, SENTINELS, '聚焦演示不可修改原版存档');
  assert.deepEqual(errors, [], '浏览器出现脚本错误');
  log('菜单中的布局/主题/手记/出身可达，旧三套界面可切换，刷新续玩与存档隔离通过');
} finally {
  await browser?.close();
  if (server) await new Promise(resolveClose => server.httpServer.close(resolveClose));
}
