/**
 * 房间式 MUD 浏览器验收：选对象、做动作、看变化和离开均在同一屏。
 * node scripts/room-smoke.mjs [http://127.0.0.1:5174/demo.html] [截图目录]
 * 未给 URL 时测试 dist；只为边界检查注入由真实新角色复制的存档。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const SAVE = 'game007-sandbox-demo-v1', THEME = 'game007-sandbox-demo-theme';
const VIEWPORTS = [
  { width: 320, height: 568 }, { width: 360, height: 560 },
  { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 720, height: 560 },
];
const ORIGINS = ['porter', 'courier', 'scholar', 'apprentice'];
const SENTINELS = { 'game007-save-v2': 'room-original-save-kept', 'jhyy-save-v2': 'room-source-save-kept' };
const shots = process.argv[3] && resolve(process.argv[3]);
if (shots) mkdirSync(shots, { recursive: true });
let url = process.argv[2], server, browser;
const errors = [];
const log = text => console.log(`· ${text}`);
try {
  if (!url) {
    const { preview } = await import('vite');
    server = await preview({ preview: { host: '127.0.0.1', port: 4188 }, logLevel: 'warn' });
    url = new URL('demo.html', server.resolvedUrls.local[0]).href;
  }
  const target = variant => { const out = new URL(url); out.searchParams.set('layout', variant); return out.href; };
  const executablePath = process.env.SMOKE_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const channel = process.env.SMOKE_CHANNEL;
  try { browser = await chromium.launch(channel ? { channel } : executablePath ? { executablePath } : {}); }
  catch (error) { if (!channel && !executablePath) throw error; browser = await chromium.launch(); }
  const context = await browser.newContext({ viewport: VIEWPORTS[2], hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await context.addInitScript(sentinels => {
    for (const [key, value] of Object.entries(sentinels)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, SENTINELS);
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(error.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  const state = () => p.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE);
  const ui = value => p.locator(`[data-ui="${value}"]:visible`).first();
  const tap = async value => ui(value).tap({ timeout: 8000 });
  const snap = async name => { if (shots) await p.screenshot({ path: `${shots}/${name}.png` }); };
  const reachable = async (locator, label) => {
    assert.equal(await locator.count(), 1, `${label} 应有入口`);
    const problem = await locator.evaluate(el => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      if (r.width < 43.9 || r.height < 43.9) return `点击区 ${Math.round(r.width)}×${Math.round(r.height)}`;
      if (r.left < -1 || r.right > innerWidth + 1) return '横向溢出';
      if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) return '首屏不可见';
      if (!top || (top !== el && !el.contains(top))) return `被 ${top?.tagName}.${top?.className} 遮挡`;
      return null;
    });
    assert.equal(problem, null, `${label} 应无需页面滚动直接点按`);
  };
  const shape = async label => {
    const bad = await p.evaluate(() => {
      const rows = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) rows.push('页面横向溢出');
      for (const el of document.querySelectorAll('.arrival-screen button,.play-scroll button,.play-scroll summary,.bottom-nav button,.topbar button,.modal button,.battle button')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.width < 43.9 || r.height < 43.9) rows.push(`${el.dataset.ui || el.tagName}: ${Math.round(r.width)}×${Math.round(r.height)}`);
        if (r.left < -1 || r.right > innerWidth + 1) rows.push(`${el.dataset.ui || el.tagName}: 横向 ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return rows;
    });
    assert.deepEqual(bad, [], `${label} 应无横向溢出，所有触控不小于 44px`);
  };
  const frame = () => p.evaluate(() => {
    const area = document.querySelector('.room-actions').getBoundingClientRect();
    return { y: area.y, height: area.height, window: window.scrollY, page: document.querySelector('.play-scroll').scrollTop };
  });
  const stable = async (before, label) => {
    const after = await frame();
    for (const key of Object.keys(before)) assert.ok(Math.abs(after[key] - before[key]) < 1.1, `${label}: ${key} 从 ${before[key]} 漂移到 ${after[key]}`);
  };
  const select = async id => {
    const before = await state();
    await tap(`room-select:${id}`);
    assert.equal(await p.locator('.modal:visible').count(), 0, '选对象不能打开对白页');
    assert.deepEqual(await state(), before, '选对象和读说明不能花费时间或改变状态');
  };
  const act = async id => {
    const action = ui(`action:${id}`);
    await action.scrollIntoViewIfNeeded();
    await reachable(action, id);
    await action.tap();
  };
  await p.goto(target('room'));
  await p.locator('.arrival-screen').waitFor();
  assert.equal(await p.locator('.modal:visible').count(), 0, 'room 直接链接应可直接创建角色');
  assert.equal(await p.locator('[data-ui^="choose-origin:"]').count(), 4);
  for (const viewport of VIEWPORTS) {
    await p.setViewportSize(viewport);
    await shape(`出身 ${viewport.width}×${viewport.height}`);
    await reachable(ui('begin'), '开始按钮');
    for (const origin of ORIGINS) {
      await tap(`choose-origin:${origin}`);
      assert.equal(await state(), null, '选出身预览不得提前建档');
    }
    await snap(`arrival-${viewport.width}`);
  }
  for (const origin of ORIGINS) {
    await tap(`choose-origin:${origin}`);
    await tap('begin');
    await p.locator('.room-world').waitFor();
    const s = await state();
    assert.equal(s.origin, origin);
    assert.deepEqual([s.sword, s.power, s.footwork, s.mp, s.experience], [0, 0, 0, 0, 0], '四种出身均从未入门起步');
    await p.evaluate(key => localStorage.removeItem(key), SAVE);
    await p.reload();
  }
  await tap('choose-origin:porter'); await tap('begin');
  const initial = await state();
  const seed = async (patch = {}, extra = {}) => {
    const value = { ...structuredClone(initial), ...patch };
    for (const field of ['inventory', 'flags', 'relations']) value[field] = { ...initial[field], ...extra[field] };
    await p.evaluate(({ SAVE, THEME, value }) => { localStorage.setItem(SAVE, JSON.stringify(value)); localStorage.setItem(THEME, 'light'); }, { SAVE, THEME, value });
    await p.goto(target('room'));
    await p.locator('.room-world').waitFor();
    assert.deepEqual(await state(), value, '显示房间不能自动推进世界');
    return value;
  };
  log('四种零武学出身，选择和查看不提前建档，五种屏幕开始按钮可用');

  for (const viewport of VIEWPORTS) {
    await p.setViewportSize(viewport); await seed();
    await shape(`room ${viewport.width}×${viewport.height}`);
    const navKeys = await p.locator('.bottom-nav [data-ui]').evaluateAll(els => els.map(el => el.dataset.ui));
    assert.deepEqual(navKeys, ['tab:world', 'tab:person', 'tab:sword', 'tab:bag', 'tab:map']);
    for (const value of ['room-select:docker', 'room-select:guard', 'room-select:xu', 'travel:street', 'travel:tea', ...navKeys]) await reachable(ui(value), `${viewport.width} ${value}`);
    const position = await frame();
    await select('guard');
    await reachable(ui('action:talk:guard'), '人物动作');
    const beforeDetails = await state();
    const actionHelp = p.locator('.room-action-help > summary');
    await actionHelp.scrollIntoViewIfNeeded();
    await actionHelp.tap();
    assert.deepEqual(await state(), beforeDetails, '展开行动详情与禁用原因不能花时间');
    assert.match(await p.locator('.room-action-help').innerText(), /货单|线索|证据/, '未满足条件的行动应能查到原因');
    await actionHelp.tap();
    await p.locator('[data-room-scroll=actions]').evaluate(el => { el.scrollTop = 0; });
    await stable(position, '从房间选人物');
    await snap(`world-guard-${viewport.width}`);
    await select('object-cargo');
    await reachable(ui('action:work-cargo'), '货物的搬货动作');
    const workPosition = await frame(), workBox = await ui('action:work-cargo').boundingBox();
    for (let i = 0; i < 2; i++) {
      const before = await state(); await tap('action:work-cargo'); const after = await state();
      assert.equal(after.minute - before.minute, 45); assert.equal(after.silver - before.silver, 42);
      assert.equal(before.stamina - after.stamina, 22);
      await stable(workPosition, '连续搬货后');
      assert.deepEqual(await ui('action:work-cargo').boundingBox(), workBox, '连续操作的按钮不能换位置');
      await reachable(ui('action:work-cargo'), '连续搬货无需重新寻找入口');
    }
    assert.ok(await p.locator('.room-feedback').innerText().then(text => text.includes('42')));
    await snap(`world-work-${viewport.width}`);
    const progress = await state();
    for (const tab of ['person', 'sword', 'bag', 'map', 'world']) { await tap(`tab:${tab}`); await shape(`${viewport.width} ${tab}`); }
    assert.deepEqual(await state(), progress, '浏览五个页面不能推进时间');
    await seed();
    await tap('travel:street');
    assert.equal((await state()).place, 'street', '没有读剧情也应能直接离开渡口');
    assert.equal((await state()).caseStatus, 'held');
  }
  log('五种屏幕：人物、出口和五页入口直接可点；同页动作、连续搬货固定位置、无需阅读即可离开');

  await p.setViewportSize(VIEWPORTS[2]); await seed();
  await select('docker'); await act('talk:docker');
  assert.equal((await state()).minute, initial.minute + 2, '交谈仍遵循原有时间成本');
  await tap('travel:street'); await select('object-ledger');
  const ledgerBefore = await state(); await act('inspect-ledger');
  assert.equal((await state()).minute - ledgerBefore.minute, 35); assert.equal((await state()).flags.ledger, true);
  assert.ok(await ui('action:inspect-ledger').isDisabled(), '查过的账应显式不可重复领取');
  await snap('ledger-found');
  await tap('travel:tea'); await select('teaman'); await act('ask-witness');
  assert.equal((await state()).flags.witness, true);
  await tap('travel:dock'); await select('guard'); await act('rescue-evidence');
  assert.equal((await state()).caseMethod, 'evidence'); assert.equal((await state()).caseStatus, 'released');
  assert.equal(await ui('room-select:guard').count(), 0, '人已离开不能留下过期对象入口');
  assert.equal(await ui('action:rescue-evidence').count(), 0, '目标离开后动作要失效');
  await snap('case-settled');
  log('货物/货单对象绑定真实行动；两份线索据理放人，离开的人与动作及时更新');

  await seed(); await tap('travel:tea'); await tap('travel:yard'); await select('swordsman');
  assert.ok(await ui('action:spar').isDisabled(), '未学剑不能凭空切磋');
  await act('observe-sword'); assert.equal((await state()).flags.observedSword, true);
  await act('learn-sword'); assert.equal((await state()).sword, 1); assert.equal((await state()).inventory.practice_sword, 1);
  await snap('first-sword');
  await act('spar'); await ui('fight:flee').waitFor();
  for (const viewport of VIEWPORTS) {
    await p.setViewportSize(viewport); await shape(`${viewport.width} 战斗`);
    await reachable(ui('fight:flee'), '战斗中可退出');
  }
  await p.setViewportSize(VIEWPORTS[2]); await tap('fight:flee'); await tap('fight:finish');
  assert.equal(await p.locator('.battle-scrim:visible,.modal:visible').count(), 0);
  assert.ok(!(await state()).pendingBattle);
  await reachable(ui('travel:tea'), '结束战斗回到可用房间');
  assert.equal(await p.locator('.demo-layout[inert]').count(), 0);
  await snap('after-spar');
  log('观摩、初学、切磋与退出保留原玩法，战斗结束可继续走动');

  await seed({ hp: 12 }); await select('self'); const injured = await state(); await act('use-medicine');
  assert.equal((await state()).hp, injured.hp + 60); assert.equal((await state()).inventory.medicine, 0);
  await seed({ stamina: 0, silver: 0 }); await select('self'); await act('free-rest');
  assert.equal((await state()).stamina, 40, '无钱无精力仍有免费恢复路径');
  await seed({ place: 'street', stopped: true, heat: 40, hp: 1, stamina: 0, silver: 0 }, { inventory: { medicine: 0 } });
  assert.ok(await ui('travel:tea').isDisabled(), '拦查时去路不可绕过');
  await reachable(ui('action:submit-check'), '身无分文的拦查出路'); await act('submit-check');
  assert.equal((await state()).stopped, false); assert.equal((await state()).place, 'yamen');
  await snap('after-patrol');
  await seed({ minute: 18 * 60 + 50, caseStatus: 'moved' }); await select('docker'); await act('work-cargo');
  assert.equal(await ui('room-select:docker').count(), 0);
  assert.equal(await ui('room-select:object-cargo').count(), 0, '领班下工后货物不能成为绕过作息的入口');
  assert.equal(await ui('action:work-cargo').count(), 0);
  await reachable(ui('travel:tea'), '天黑后仍能离开'); await snap('night-dock');
  await seed({ place: 'street', minute: 21 * 60, caseStatus: 'moved' });
  for (const id of ['merchant', 'object-ledger', 'object-medicine', 'object-purse', 'object-work']) assert.equal(await ui(`room-select:${id}`).count(), 0, `闭店后的 ${id} 不能误导玩家`);
  await seed({ place: 'yard', minute: 21 * 60, caseStatus: 'moved' });
  assert.equal(await ui('room-select:swordsman').count(), 0); await select('self'); await reachable(ui('action:wait'), '无人房间可等待');
  log('受伤、精力耗尽、没钱、巡街拦查和夜间目标消失均有可用出路');

  await seed(); await select('object-cargo'); await act('work-cargo'); const saved = await state();
  for (const variant of ['cards', 'scroll', 'compact', 'room']) {
    await tap('layouts'); await tap(`layout:${variant}`);
    assert.equal(await p.locator('html').getAttribute('data-layout'), variant); assert.deepEqual(await state(), saved);
  }
  await tap('theme'); assert.equal(await p.locator('html').getAttribute('data-theme'), 'dark'); await shape('深色主题'); await snap('room-dark');
  await p.reload(); assert.equal(await p.locator('html').getAttribute('data-layout'), 'room');
  assert.equal(await p.locator('html').getAttribute('data-theme'), 'dark'); assert.deepEqual(await state(), saved);
  const sentinels = await p.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(SENTINELS));
  assert.deepEqual(sentinels, SENTINELS); assert.deepEqual(errors, [], '浏览器不得有脚本错误');
  log('新旧四方案共用原进度、主题与刷新续玩正常，两个原版存档隔离，无脚本错误');
} finally {
  await browser?.close();
  if (server) await new Promise(resolveClose => server.httpServer.close(resolveClose));
}
