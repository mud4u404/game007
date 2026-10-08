/**
 * 原三方案与新 room 入口、旧 focus 链接迁移验收；玩法路线由 demo/ux-smoke 覆盖。
 * node scripts/entry-smoke.mjs [http://127.0.0.1:5174/demo.html] [截图目录]
 * 无 URL 时测试 dist。迁移存档来自真实选出身、搬货后的浏览器进度。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const SAVE = 'game007-sandbox-demo-v1';
const LAYOUT = 'game007-sandbox-demo-layout';
const VARIANTS = ['cards', 'scroll', 'compact', 'room'];
const VIEWPORTS = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
const SENTINELS = { 'game007-save-v2': 'entry-original-game007-kept', 'jhyy-save-v2': 'entry-original-game006-kept' };
const shots = process.argv[3] && resolve(process.argv[3]);
if (shots) mkdirSync(shots, { recursive: true });
let url = process.argv[2], server, browser;
const errors = [];
const log = text => console.log(`· ${text}`);

try {
  if (!url) {
    const { preview } = await import('vite');
    server = await preview({ preview: { host: '127.0.0.1', port: 4187 }, logLevel: 'warn' });
    url = new URL('demo.html', server.resolvedUrls.local[0]).href;
  }
  const executablePath = process.env.SMOKE_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const channel = process.env.SMOKE_CHANNEL;
  try { browser = await chromium.launch(channel ? { channel } : executablePath ? { executablePath } : {}); }
  catch (error) {
    if (!channel && !executablePath) throw error;
    browser = await chromium.launch();
  }
  const target = variant => {
    const value = new URL(url);
    if (variant) value.searchParams.set('layout', variant);
    else value.searchParams.delete('layout');
    return value.href;
  };
  const makePage = async ({ query, stored, save, viewport = VIEWPORTS[1], blockedStorage = false } = {}) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    await context.addInitScript(({ SAVE, LAYOUT, SENTINELS, stored, save, blockedStorage }) => {
      if (blockedStorage) {
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked for entry smoke', 'SecurityError'); } });
        return;
      }
      // Seed once per tab, so reload checks observe the app's persisted preference.
      if (sessionStorage.getItem('entry-smoke-seeded')) return;
      sessionStorage.setItem('entry-smoke-seeded', 'yes');
      for (const [key, value] of Object.entries(SENTINELS)) localStorage.setItem(key, value);
      if (stored !== undefined) localStorage.setItem(LAYOUT, stored);
      if (save !== undefined) localStorage.setItem(SAVE, JSON.stringify(save));
    }, { SAVE, LAYOUT, SENTINELS, stored, save, blockedStorage });
    const p = await context.newPage();
    p.on('pageerror', error => errors.push(error.message));
    await p.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    await p.goto(target(query));
    await p.locator('.arrival-screen,.demo-layout').first().waitFor();
    return { p, context };
  };
  const state = p => p.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE);
  const ui = (p, value) => p.locator(`[data-ui="${value}"]:visible`).first();
  const tap = (p, value) => ui(p, value).tap({ timeout: 8000 });
  const dialog = p => p.locator('.modal[role="dialog"]:visible');
  const currentLayout = p => p.locator('html').getAttribute('data-layout');
  const snap = async (p, name) => { if (shots) await p.screenshot({ path: `${shots}/${name}.png` }); };
  const isolation = async p => {
    const values = await p.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(SENTINELS));
    assert.deepEqual(values, SENTINELS, '恢复入口不得修改原版存档');
  };
  const chooser = async p => {
    await dialog(p).waitFor();
    const keys = await dialog(p).locator('[data-ui^="layout:"]').evaluateAll(els => els.map(el => el.dataset.ui));
    assert.deepEqual(keys, VARIANTS.map(id => `layout:${id}`), '入口应同时提供 room 与原有三种布局');
    assert.equal(await p.locator('[data-ui="layout:focus"]').count(), 0, '电影界面不再是可选方案');
    assert.equal(await p.locator('.focus-world,.focus-arrival').count(), 0, '底层不应继续显示电影界面');
    assert.ok(await dialog(p).evaluate(el => el.contains(document.activeElement)), '选择器应接收键盘焦点');
  };
  const reachable = async (locator, label) => {
    await locator.scrollIntoViewIfNeeded();
    const issue = await locator.evaluate(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 43.9 || r.height < 43.9) return `点击区 ${Math.round(r.width)}×${Math.round(r.height)}`;
      if (r.left < -1 || r.right > innerWidth + 1) return '点击区横向溢出';
      const x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
      if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) return '滚动后仍不在屏内';
      if (!top || (top !== el && !el.contains(top))) return `被 ${top?.tagName}.${top?.className} 遮挡`;
      return null;
    });
    assert.equal(issue, null, `${label} 无法真实点按`);
  };
  const choose = async (p, variant) => {
    await reachable(ui(p, `layout:${variant}`), variant);
    await tap(p, `layout:${variant}`);
    assert.equal(await currentLayout(p), variant);
    assert.equal(await dialog(p).count(), 0, '选择后应关闭选择器');
    assert.equal(new URL(p.url()).searchParams.get('layout'), variant, '选择应替换旧 URL 参数');
  };

  // 每个尺寸实际点一次每个方案，允许选择器正常纵向滚动。
  for (const viewport of VIEWPORTS) for (const variant of VARIANTS) {
    const { p, context } = await makePage({ viewport });
    await chooser(p);
    assert.equal(await state(p), null, '选择界面之前不得创建存档');
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, '入口不应横向溢出');
    if (variant === 'cards') await snap(p, `entry-${viewport.width}`);
    for (const id of VARIANTS) await reachable(ui(p, `layout:${id}`), `${viewport.width} ${id}`);
    await choose(p, variant);
    assert.equal(await state(p), null, '只选择界面不能创建角色');
    assert.equal(await p.evaluate(key => localStorage.getItem(key), LAYOUT), variant);
    await p.goto(target());
    assert.equal(await currentLayout(p), variant, '无参数链接应沿用选择');
    assert.equal(await dialog(p).count(), 0, '已有有效方案偏好时不应反复提示选择');
    await isolation(p);
    await context.close();
  }
  log('三个手机尺寸可真实选择四方案，新访客选界面不建档，偏好可续用');

  const bootstrap = await makePage({ query: 'cards' });
  assert.equal(await dialog(bootstrap.p).count(), 0, '明确可玩方案链接不需再次选择');
  await tap(bootstrap.p, 'choose-origin:porter');
  await tap(bootstrap.p, 'begin');
  const beforeWork = await state(bootstrap.p);
  await tap(bootstrap.p, 'select:docker');
  const work = ui(bootstrap.p, 'action:work-cargo');
  await work.scrollIntoViewIfNeeded();
  await work.tap();
  const saved = await state(bootstrap.p);
  assert.ok(saved.minute > beforeWork.minute && saved.silver > beforeWork.silver, '迁移样本应包含真实行动进度');
  await bootstrap.context.close();

  for (const variant of VARIANTS) {
    const stored = VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length];
    const { p, context } = await makePage({ query: variant, stored, save: saved });
    assert.equal(await currentLayout(p), variant, '明确可玩方案链接应优先其他有效偏好');
    assert.equal(await dialog(p).count(), 0);
    assert.deepEqual(await state(p), saved, '直接选方案不应损失进度');
    await p.reload();
    assert.equal(await currentLayout(p), variant);
    assert.deepEqual(await state(p), saved);
    await context.close();
  }
  for (const query of [undefined, 'focus']) {
    const { p, context } = await makePage({ query, stored: 'focus', save: saved });
    await chooser(p);
    assert.deepEqual(await state(p), saved, '迁移入口不能重置已有角色');
    await choose(p, 'compact');
    assert.deepEqual(await state(p), saved, '迁移只换布局，不能推进时间或修改状态');
    assert.equal(await p.evaluate(key => localStorage.getItem(key), LAYOUT), 'compact');
    await p.reload();
    assert.equal(await currentLayout(p), 'compact');
    assert.equal(await dialog(p).count(), 0);
    assert.deepEqual(await state(p), saved);
    await isolation(p);
    await context.close();
  }
  for (const variant of VARIANTS) {
    const { p, context } = await makePage({ query: 'focus', stored: variant, save: saved });
    assert.equal(await currentLayout(p), variant, '旧 focus 分享地址应尊重已选可玩方案偏好');
    assert.equal(await dialog(p).count(), 0, '旧链接不得反复迫使已有玩家选界面');
    assert.deepEqual(await state(p), saved);
    await context.close();
  }
  log('真实行动存档、旧 focus 链接与偏好迁移、四种直接链接和刷新全部保留进度');

  for (const save of [undefined, saved]) {
    const { p, context } = await makePage({ query: 'choose', stored: 'scroll', save });
    await chooser(p);
    assert.equal(await currentLayout(p), 'scroll', '显式选择入口仍应保留已有布局作为底层');
    await tap(p, 'close');
    assert.equal(await dialog(p).count(), 0);
    assert.ok(await ui(p, 'layouts').evaluate(el => el === document.activeElement), '关闭后应回到界面选择入口');
    assert.deepEqual(await state(p), save ?? null);
    await context.close();
  }
  const pending = { ...structuredClone(saved), pendingBattle: { foe: 'guard', reason: 'rescue', name: '卫衡' } };
  const battle = await makePage({ query: 'choose', stored: 'focus', save: pending });
  await battle.p.locator('.battle-scrim').waitFor();
  assert.equal(await dialog(battle.p).count(), 0, '续战优先，不能另罩界面选择器');
  assert.deepEqual(await state(battle.p), pending, '恢复交手前状态不应改写存档');
  await battle.context.close();
  log('强制选择入口、关闭后的焦点返回与战斗恢复优先级通过');

  const blocked = await makePage({ query: 'focus', blockedStorage: true });
  await chooser(blocked.p);
  await choose(blocked.p, 'compact');
  await tap(blocked.p, 'choose-origin:porter');
  await tap(blocked.p, 'begin');
  assert.equal(await blocked.p.locator('.demo-layout').count(), 1, '无法储存时仍应能够开始试玩');
  assert.ok(await blocked.p.locator('.save-note').innerText().then(text => text.includes('未能保存')), '保存不可用应有明确反馈');
  await blocked.context.close();
  const directBlocked = await makePage({ query: 'scroll', blockedStorage: true });
  assert.equal(await currentLayout(directBlocked.p), 'scroll', '存储不可用不应吞掉明确的布局参数');
  assert.equal(await dialog(directBlocked.p).count(), 0);
  await directBlocked.context.close();
  assert.deepEqual(errors, [], '浏览器出现脚本错误');
  log('储存不可用时入口、URL 选择和试玩正常，浏览器无脚本错误');
} finally {
  await browser?.close();
  if (server) await new Promise(resolveClose => server.httpServer.close(resolveClose));
}
