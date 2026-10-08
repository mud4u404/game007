/**
 * A 同屏战斗的真实浏览器验收：真实引擎、可控时钟、独立试招与正式存档。
 * node scripts/room-combat-smoke.mjs [http://127.0.0.1:5174/demo.html] [截图目录]
 * 未传 URL 时测试 dist；边界状态由真实创建并行动后的角色存档复制。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const SAVE = 'game007-sandbox-demo-v1';
const THEME = 'game007-sandbox-demo-theme';
const SENTINELS = { 'game007-save-v2': 'combat-original-progress-kept', 'jhyy-save-v2': 'combat-source-progress-kept' };
const VIEWPORTS = [
  { width: 320, height: 568 }, { width: 360, height: 560 },
  { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 720, height: 560 },
];
const shots = process.argv[3] && resolve(process.argv[3]);
if (shots) mkdirSync(shots, { recursive: true });
let url = process.argv[2], server, browser;
const errors = [];
const log = text => console.log(`· ${text}`);
try {
  if (!url) {
    const { preview } = await import('vite');
    server = await preview({ preview: { host: '127.0.0.1', port: 4189 }, logLevel: 'warn' });
    url = new URL('demo.html', server.resolvedUrls.local[0]).href;
  }
  const target = (trial = false) => {
    const link = new URL(url); link.searchParams.set('layout', 'room');
    if (trial) link.searchParams.set('trial', 'combat'); else link.searchParams.delete('trial');
    return link.href;
  };
  const executablePath = process.env.SMOKE_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const channel = process.env.SMOKE_CHANNEL;
  try { browser = await chromium.launch(channel ? { channel } : executablePath ? { executablePath } : {}); }
  catch (error) { if (!channel && !executablePath) throw error; browser = await chromium.launch(); }
  const makePage = async (viewport = VIEWPORTS[2]) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    await context.addInitScript(sentinels => {
      for (const [key, value] of Object.entries(sentinels)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      // A reproducible sequence still goes through the production hit/damage rules.
      let seed = 123456;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    }, SENTINELS);
    const p = await context.newPage();
    p.on('pageerror', error => errors.push(error.message));
    await p.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await p.clock.install({ time: new Date('2026-10-09T00:00:00Z') });
    await p.clock.pauseAt(new Date('2026-10-09T00:00:01Z'));
    return { p, context };
  };
  const raw = p => p.evaluate(key => localStorage.getItem(key), SAVE);
  const state = async p => JSON.parse(await raw(p));
  const ui = (p, value) => p.locator(`[data-ui="${value}"]:visible`).first();
  const tap = async (p, value) => { await ui(p, value).tap({ timeout: 8000 }); await p.clock.runFor(1); };
  const battle = p => p.locator('.battle.room-battle');
  const phase = p => battle(p).getAttribute('data-phase');
  const hp = async p => Number.parseInt(await p.locator('.room-battle-resource.hp > b').innerText(), 10);
  const snap = async (p, name) => { if (shots) await p.screenshot({ path: `${shots}/${name}.png` }); };
  const advanceTo = async (p, expected, limit = 12000) => {
    for (let elapsed = 0; elapsed <= limit; elapsed += 200) {
      if (await phase(p) === expected) return;
      if (await phase(p) === 'result') throw new Error(`交手提前结束，未到 ${expected}`);
      await p.clock.runFor(200);
    }
    assert.equal(await phase(p), expected, `真实计时应推进到 ${expected}`);
  };
  const reach = async (p, locator, label) => {
    assert.equal(await locator.count(), 1, `${label} 应存在`);
    const issue = await locator.evaluate(el => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      if (r.width < 43.9 || r.height < 43.9) return `${Math.round(r.width)}×${Math.round(r.height)}`;
      if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) return '按钮未完整露出';
      if (!top || (top !== el && !el.contains(top))) return `被 ${top?.tagName}.${top?.className} 遮住`;
      return null;
    });
    assert.equal(issue, null, `${label} 无需滚动即可点按`);
  };
  const controls = async (p, label) => {
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label} 横向溢出`);
    for (const button of await battle(p).locator('button:visible').all()) await reach(p, button, `${label} ${await button.getAttribute('data-ui')}`);
  };
  const responseBoxes = p => battle(p).locator('[data-ui^="respond:"]').evaluateAll(els => els.map(el => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { ui: el.dataset.ui, x, y, width, height };
  }));
  const sameBoxes = (actual, expected, label) => {
    assert.deepEqual(actual.map(row => row.ui), expected.map(row => row.ui), `${label} 应对顺序不变`);
    for (let i = 0; i < expected.length; i++) for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[i][key] - expected[i][key]) < 1.1, `${label} ${actual[i].ui} ${key} 漂移`);
  };
  const protectedTell = async p => {
    await advanceTo(p, 'tell');
    assert.equal(await p.locator('.room-countdown').count(), 0, '首次见招不能显示虚假倒计时');
    assert.match(await p.locator('.room-battle-reading').innerText(), /先看清|不计时|阅读/);
    assert.equal(await battle(p).getAttribute('data-urgency'), 'calm');
    const before = await battle(p).innerText();
    await p.clock.runFor(12000);
    assert.equal(await phase(p), 'tell');
    assert.equal(await battle(p).innerText(), before, '首次阅读保护不能悄悄推进战斗');
    assert.equal(await p.locator('[data-ui^="respond:"]').count(), 4);
  };
  const isolation = async p => {
    const saved = await p.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(SENTINELS));
    assert.deepEqual(saved, SENTINELS, '试玩不应污染原版存档');
  };

  // New visitors can try combat without creating or training their permanent character.
  for (const viewport of VIEWPORTS) {
    const { p, context } = await makePage(viewport);
    await p.goto(target(true)); await battle(p).waitFor();
    assert.equal(await raw(p), null, '直接试招不得创建正式存档');
    await controls(p, `${viewport.width} 平稳交锋`); await snap(p, `calm-${viewport.width}`);
    await protectedTell(p);
    const first = await responseBoxes(p);
    await controls(p, `${viewport.width} 初次读招`); await snap(p, `first-tell-${viewport.width}`);
    await tap(p, 'respond:dodge');
    await advanceTo(p, 'tell');
    assert.equal(await battle(p).getAttribute('data-urgency'), 'warning');
    assert.match(await p.locator('.room-countdown').innerText(), /[1-8]/);
    sameBoxes(await responseBoxes(p), first, '第二次读招');
    await snap(p, `warning-${viewport.width}`);
    for (let elapsed = 0; elapsed < 8000 && await battle(p).getAttribute('data-urgency') !== 'critical'; elapsed += 200) await p.clock.runFor(200);
    assert.equal(await battle(p).getAttribute('data-urgency'), 'critical', '临近时限应突出紧急状态');
    assert.equal(await phase(p), 'tell');
    sameBoxes(await responseBoxes(p), first, '倒计时转危急');
    await controls(p, `${viewport.width} 危急读招`); await snap(p, `urgent-${viewport.width}`);
    const countdown = await p.locator('.room-countdown').innerText();
    await tap(p, 'fight:pause');
    assert.equal(await battle(p).getAttribute('data-paused'), 'true');
    const paused = await battle(p).innerText(); await p.clock.runFor(12000);
    assert.equal(await battle(p).innerText(), paused, '暂停应冻结战斗与倒计时');
    assert.ok(await ui(p, 'respond:dodge').isDisabled());
    await controls(p, `${viewport.width} 暂停`);
    await tap(p, 'fight:pause');
    assert.equal(await battle(p).getAttribute('data-paused'), 'false');
    assert.equal(await p.locator('.room-countdown').innerText(), countdown, '恢复应沿用暂停前剩余时间');
    sameBoxes(await responseBoxes(p), first, '暂停恢复');
    if (await ui(p, 'fight:medicine').isEnabled()) {
      const beforeHeal = await hp(p);
      await tap(p, 'fight:medicine');
      assert.ok(await hp(p) > beforeHeal, '试招用药也必须真实恢复当前气血');
      assert.equal(await phase(p), 'tell', '用药不能跳过当前来招');
      sameBoxes(await responseBoxes(p), first, '读招中用药');
    }
    assert.equal(await raw(p), null, '试招的伤势、应对与用药不得写入正式存档');
    if (viewport.width === 390) {
      const box = await ui(p, 'respond:dodge').boundingBox();
      const cdp = await context.newCDPSession(p);
      const beforeHold = await p.locator('.room-countdown').innerText();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      await p.clock.runFor(2400);
      assert.equal(await p.locator('.room-countdown').innerText(), beforeHold, '手指按住动作时不能跨秒重绘换掉按钮');
      sameBoxes(await responseBoxes(p), first, '按住动作跨秒');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      assert.equal(await phase(p), 'exchange', '抬手后应执行原来按住的应对');
    } else if (viewport.width === 360) {
      await p.clock.runFor(4000);
      assert.equal(await phase(p), 'exchange', '读招时限耗尽应通过真实引擎自动应对');
    } else {
      await tap(p, 'respond:dodge');
      assert.equal(await phase(p), 'exchange', '第二次应对仍应立即执行');
    }
    if (viewport.width === 430) {
      await ui(p, 'fight:flee').focus();
      await p.keyboard.press('Enter'); await p.clock.runFor(1);
      assert.ok(await ui(p, 'fight:finish').evaluate(el => document.activeElement === el), '键盘脱身后焦点应落到结束入口');
    } else await tap(p, 'fight:flee');
    assert.equal(await phase(p), 'result'); await controls(p, `${viewport.width} 战斗结果`);
    if (viewport.width === 430) {
      await ui(p, 'fight:retry-practice').focus();
      await p.keyboard.press('Enter'); await p.clock.runFor(1);
      assert.equal(await phase(p), 'exchange');
      assert.ok(await ui(p, 'fight:pause').evaluate(el => document.activeElement === el), '键盘再试一场后焦点应落到暂停入口');
      await protectedTell(p);
      assert.equal(await raw(p), null, '再试一场也不能创建正式角色');
      await tap(p, 'fight:flee');
    }
    await tap(p, 'fight:finish');
    assert.equal(await battle(p).count(), 0);
    assert.equal(await raw(p), null, '试招结算也不能创建正式存档');
    assert.equal(await p.locator('.arrival-screen').count(), 1);
    await isolation(p); await context.close();
  }
  log('五种屏幕的战斗按钮完整44px可点，首次阅读保护、真实倒计时、固定应对位置、暂停/恢复与试招退出通过');

  const { p, context } = await makePage();
  await p.goto(target()); await tap(p, 'choose-origin:porter'); await tap(p, 'begin');
  await tap(p, 'room-select:docker'); await tap(p, 'action:work-cargo');
  const saved = await raw(p), progressed = await state(p);
  assert.ok(progressed.minute > 540 && progressed.silver > 28, '试招隔离样本需有真实游玩进度');
  await p.goto(target(true)); await protectedTell(p);
  assert.equal(await raw(p), saved);
  await p.reload(); await battle(p).waitFor(); await protectedTell(p);
  assert.equal(await raw(p), saved, '试招中刷新不得覆盖正式进度或写入临时交手');
  await tap(p, 'fight:exit-practice');
  assert.equal(await battle(p).count(), 0); assert.equal(await raw(p), saved);
  assert.equal(await p.locator('.room-world').count(), 1);
  assert.equal(await p.locator('.demo-layout[inert]').count(), 0);
  await reach(p, ui(p, 'travel:street'), '退出试招继续行路');
  // An explicit practice entry is also reachable through the normal world menu/page.
  if (!(await ui(p, 'practice').count())) await tap(p, 'menu');
  await tap(p, 'practice'); await battle(p).waitFor();
  await tap(p, 'fight:exit-practice'); assert.equal(await raw(p), saved);
  await p.evaluate(key => localStorage.setItem(key, 'dark'), THEME);
  await p.goto(target(true)); await protectedTell(p);
  assert.equal(await p.locator('html').getAttribute('data-theme'), 'dark');
  await controls(p, '深色战斗'); await snap(p, 'dark-first-tell');
  await tap(p, 'fight:exit-practice'); assert.equal(await raw(p), saved);
  log('真实进度中进入、退出、刷新试招均保留原存档，正常入口和深色战斗通过');

  // A genuine unfinished battle must take precedence over a trial link.
  const wounded = { ...structuredClone(progressed), place: 'yard', hp: 1, mp: 90, power: 1, sword: 1, footwork: 1,
    pendingBattle: { foe: 'swordsman', reason: 'spar', name: '顾行舟' } };
  await p.evaluate(({ SAVE, wounded }) => localStorage.setItem(SAVE, JSON.stringify(wounded)), { SAVE, wounded });
  await p.goto(target(true)); await battle(p).waitFor();
  assert.equal(await ui(p, 'fight:exit-practice').count(), 0, '已有正式交手不能被试招覆盖');
  assert.equal(await phase(p), 'exchange');
  assert.equal(await battle(p).getAttribute('data-urgency'), 'calm', '气血告急不能伪造敌招倒计时');
  assert.equal(await p.locator('.room-low-health').count(), 1, '低气血须在自身状态区独立提示');
  assert.equal(await p.locator('.room-countdown').count(), 0);
  await snap(p, 'low-health-independent');
  const beforeMedicine = await state(p);
  await tap(p, 'fight:medicine');
  assert.equal(await hp(p), 61, '正式战斗用药应即时恢复60气血');
  assert.equal((await state(p)).inventory.medicine, beforeMedicine.inventory.medicine - 1, '正式战斗用药需真实扣库存');
  assert.equal(await p.locator('.room-low-health').count(), 0, '疗伤后低气血警告应按实际血量解除');
  await tap(p, 'fight:flee'); await tap(p, 'fight:finish');
  assert.equal(await battle(p).count(), 0); assert.ok(!(await state(p)).pendingBattle);
  assert.equal((await state(p)).place, 'yard');
  assert.ok((await state(p)).hp > 1, '正式战斗疗伤结果需带回江湖');
  assert.equal(await p.locator('.demo-layout[inert]').count(), 0);
  await ui(p, 'travel:tea').scrollIntoViewIfNeeded();
  await reach(p, ui(p, 'travel:tea'), '正式战斗退出后行路');

  // A shared rescue action belongs to the person selected when it was taken,
  // even though the opponent is somebody else and remains in the same room.
  const learned = { ...structuredClone(progressed), hp: 170, sword: 1, footwork: 1, power: 1, mp: 90 };
  await p.evaluate(({ SAVE, learned }) => localStorage.setItem(SAVE, JSON.stringify(learned)), { SAVE, learned });
  await p.goto(target()); await tap(p, 'room-select:xu'); await tap(p, 'action:rescue-fight');
  await tap(p, 'fight:flee'); await tap(p, 'fight:finish');
  assert.equal(await ui(p, 'room-select:xu').getAttribute('aria-pressed'), 'true');
  assert.match(await p.locator('.room-actions .room-latest[data-room-feedback-target="xu"]').innerText(), /卫衡.*交手之后/);
  assert.equal((await state(p)).caseStatus, 'held', '败退不会凭空救出许青');

  const stopped = { ...structuredClone(learned), place: 'street', stopped: true, heat: 40 };
  await p.evaluate(({ SAVE, stopped }) => localStorage.setItem(SAVE, JSON.stringify(stopped)), { SAVE, stopped });
  await p.goto(target()); await tap(p, 'action:arrest-fight');
  await tap(p, 'fight:flee'); await tap(p, 'fight:finish');
  assert.match(await p.locator('.room-latest-label').innerText(), /秦捕头/);
  assert.doesNotMatch(await p.locator('.room-latest-label').innerText(), /卫衡/);
  await isolation(p); await context.close();
  assert.deepEqual(errors, [], '浏览器不应出现脚本错误');
  log('续战优先、低气血独立警告、正式用药/脱身/返回江湖与存档隔离通过');
} finally {
  await browser?.close();
  if (server) await new Promise(resolveClose => server.httpServer.close(resolveClose));
}
