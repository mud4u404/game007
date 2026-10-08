/**
 * 三种手机操作方案的浏览器验收：阅读不耗时，建议有依据/成本，捷径真的能点。
 * node scripts/ux-smoke.mjs [http://127.0.0.1:5174/demo.html] [截图目录]
 * 无 URL 时测试 dist。边界状态从真实新角色复制，仅验证界面与行动的衔接。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const SAVE = 'game007-sandbox-demo-v1';
const LAYOUT = 'game007-sandbox-demo-layout';
const THEME = 'game007-sandbox-demo-theme';
const LAYOUTS = ['cards', 'scroll', 'compact'];
const VIEWPORTS = [
  { width: 320, height: 568 }, { width: 360, height: 560 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 720, height: 560 },
];
const SENTINELS = { 'game007-save-v2': 'ux-original-game007-kept', 'jhyy-save-v2': 'ux-original-game006-kept' };
const shots = process.argv[3] && resolve(process.argv[3]);
if (shots) mkdirSync(shots, { recursive: true });
let url = process.argv[2], server, browser;
const errors = [];
const log = text => console.log(`· ${text}`);

try {
  if (!url) {
    const { preview } = await import('vite');
    server = await preview({ preview: { host: '127.0.0.1', port: 4185 }, logLevel: 'warn' });
    url = new URL('demo.html', server.resolvedUrls.local[0]).href;
  }
  const executablePath = process.env.SMOKE_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const channel = process.env.SMOKE_CHANNEL;
  try { browser = await chromium.launch(channel ? { channel } : executablePath ? { executablePath } : {}); }
  catch (error) {
    if (!channel && !executablePath) throw error;
    browser = await chromium.launch();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await context.addInitScript(sentinels => {
    for (const [key, value] of Object.entries(sentinels)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, SENTINELS);
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(error.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  const firstLayout = new URL(url);
  firstLayout.searchParams.set('layout', 'cards');
  await p.goto(firstLayout.href);
  const state = () => p.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE);
  const ui = value => p.locator(`[data-ui="${value}"]:visible`).first();
  const click = async value => ui(value).tap({ timeout: 8000 });
  const snap = async name => { if (shots) await p.screenshot({ path: `${shots}/${name}.png` }); };
  const reachable = async (locator, label) => {
    const issue = await locator.evaluate(el => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return r.width < 43.9 || r.height < 43.9 ? `点击区 ${r.width}×${r.height}`
        : x < 0 || x > innerWidth || y < 0 || y > innerHeight ? `中心 ${Math.round(x)},${Math.round(y)} 不在屏内`
          : !(top && (top === el || el.contains(top))) ? `被 ${top?.tagName}.${top?.className} 遮住` : null;
    });
    assert.equal(issue, null, `${label} 不能立即点击`);
  };
  const reveal = async locator => {
    await locator.scrollIntoViewIfNeeded();
    await p.waitForTimeout(80);
  };
  const shape = async label => {
    const problems = await p.evaluate(() => {
      const bad = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(`页面宽 ${document.documentElement.scrollWidth}`);
      for (const el of document.querySelectorAll('.play-scroll button,.play-scroll summary,.bottom-nav button,.quick-dock button,.modal button')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.width < 43.9 || r.height < 43.9) bad.push(`${el.dataset.ui} 点击区 ${Math.round(r.width)}×${Math.round(r.height)}`);
        if (!el.closest('.people-row') && (r.left < -1 || r.right > innerWidth + 1)) bad.push(`${el.dataset.ui} 横向 ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return bad;
    });
    assert.deepEqual(problems, [], label);
  };
  const chooseLayout = async variant => {
    const before = await state();
    await click('layouts');
    await click(`layout:${variant}`);
    assert.equal(await p.locator('html').getAttribute('data-layout'), variant);
    assert.deepEqual(await state(), before, '切换方案不能推进世界');
  };
  await click('choose-origin:porter');
  await click('begin');
  const initial = await state();
  const seed = async (variant, patch = {}, extra = {}) => {
    const value = { ...structuredClone(initial), ...patch };
    Object.assign(value, {
      inventory: { ...initial.inventory, ...extra.inventory },
      flags: { ...initial.flags, ...extra.flags },
      relations: { ...initial.relations, ...extra.relations },
    });
    await p.evaluate(({ value, variant, SAVE, LAYOUT, THEME }) => {
      localStorage.setItem(SAVE, JSON.stringify(value));
      localStorage.setItem(LAYOUT, variant);
      localStorage.setItem(THEME, 'light');
    }, { value, variant, SAVE, LAYOUT, THEME });
    const target = new URL(url); target.searchParams.set('layout', variant);
    await p.goto(target.href);
    await p.locator('.scene-prose').waitFor({ state: 'attached' });
    assert.deepEqual(await state(), value, '渲染推荐不能自动行动');
    return value;
  };

  // 同一份存档切换方案；每个页面均用真实触控访问。
  const structures = [];
  for (const variant of LAYOUTS) {
    await seed(variant);
    for (const viewport of VIEWPORTS) {
      await p.setViewportSize(viewport);
      for (const tab of ['world', 'person', 'sword', 'bag', 'map']) {
        await click(`tab:${tab}`);
        await shape(`${variant} ${viewport.width}×${viewport.height} ${tab} 溢出或小于 44px`);
      }
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await click('tab:world');
    structures.push(await p.locator('.play-scroll').evaluate(el => [...el.children].map(child => `${child.tagName}.${child.className}`).join('|')));
    await snap(`${variant}-world`);
    const before = await state();
    const person = ui('select:guard');
    await reveal(person);
    await person.tap();
    await p.waitForTimeout(450);
    const firstAction = p.locator('[data-section="actions"] button:not(:disabled)').first();
    await reachable(firstAction, `${variant} 选中人物后的第一项交互`);
    await snap(`${variant}-actions`);
    assert.deepEqual(await state(), before, '点人物、看操作不能推进世界');
    await firstAction.tap();
    assert.ok(await p.locator('.reply-card').count(), '人物第一项操作应产生回应');
    await seed(variant);
    await chooseLayout(LAYOUTS[(LAYOUTS.indexOf(variant) + 1) % LAYOUTS.length]);
    await chooseLayout(variant);
    assert.deepEqual(await state(), initial);
  }
  assert.equal(new Set(structures).size, 3, '三种方案必须采用不同内容结构');
  log('三方案 × 五种手机/横屏尺寸 × 五页；44px 点击区、无横向溢出、选择人物后可直接操作');

  // 底部捷径要把可执行内容带进可点击区域，不借助 Playwright 的自动滚动。
  for (const viewport of VIEWPORTS) {
    await seed('compact');
    await p.setViewportSize(viewport);
    for (const [zone, selector] of [
      ['people', '[data-section="people"] .person-chip'],
      ['actions', '[data-section="actions"] button:not(:disabled)'],
      ['roads', '[data-section="roads"] button[data-ui^="travel:"]:not(:disabled)'],
    ]) {
      await click(`quick:${zone}`);
      await p.waitForTimeout(450);
      await reachable(p.locator(selector).first(), `compact ${viewport.width}×${viewport.height} 快捷 ${zone}`);
    }
    assert.deepEqual(await state(), initial, '快捷定位不能消耗时间');
  }
  log('行旅方案的找人／做事／动身三个捷径：点一下即可触达可操作项');

  // 规则的单元测试另行覆盖；这里检查规则输出与真实可点击按钮的连接。
  const examples = [
    { id: 'low-hp', patch: { hp: 12 }, expected: 'use-medicine', verify: (before, after) => assert.equal(after.hp, before.hp + 60) },
    { id: 'exhausted', patch: { stamina: 0, silver: 0 }, expected: 'free-rest', verify: (before, after) => assert.equal(after.stamina, 40) },
    { id: 'stopped', patch: { place: 'street', stopped: true, heat: 40, hp: 1, stamina: 0, silver: 0 }, extra: { inventory: { medicine: 0 } }, expected: 'submit-check', verify: (before, after) => { assert.equal(after.stopped, false); assert.equal(after.minute, before.minute + 120); } },
    { id: 'untrained', patch: { place: 'yard' }, expected: 'observe-sword', verify: (before, after) => { assert.equal(after.flags.observedSword, true); assert.equal(after.sword, 0); } },
    { id: 'evidence', extra: { flags: { ledger: true, witness: true } }, expected: 'rescue-evidence', verify: (before, after) => { assert.equal(after.caseStatus, 'released'); assert.equal(after.caseMethod, 'evidence'); } },
    { id: 'released', patch: { place: 'tea', caseStatus: 'released', caseMethod: 'evidence' }, expected: 'xu-gift', verify: (before, after) => { assert.equal(after.inventory.medicine, before.inventory.medicine + 1); assert.equal(after.flags.xuGift, true); } },
  ];
  await p.setViewportSize({ width: 390, height: 844 });
  for (const example of examples.filter(item => ['low-hp', 'stopped'].includes(item.id))) {
    await seed('cards', example.patch, example.extra);
    await snap(`cards-${example.id}-world`);
  }
  for (const variant of ['scroll', 'compact']) {
    for (const example of examples) {
      const before = await seed(variant, example.patch, example.extra);
      const suggestions = p.locator('button[data-suggestion]');
      assert.ok(await suggestions.count(), `${variant} ${example.id} 没有处境建议`);
      const rows = await suggestions.evaluateAll(els => els.map(el => ({ ui: el.dataset.ui, disabled: el.disabled, reason: el.querySelector('.suggestion-reason')?.textContent.trim(), cost: el.querySelector('.suggestion-cost')?.textContent.trim() })));
      assert.ok(rows.every(row => !row.disabled && row.reason && row.cost), `${variant} ${example.id} 推荐缺原因/成本或不可执行`);
      const offered = p.locator(`button[data-suggestion][data-ui="action:${example.expected}"]`).first();
      assert.equal(await offered.count(), 1, `${variant} ${example.id} 没有合理出路 ${example.expected}`);
      await reveal(offered);
      await reachable(offered, `${variant} ${example.id} 建议按钮`);
      const cost = offered.locator('.suggestion-cost');
      assert.ok(await cost.isVisible(), '行动成本必须在点击前可见');
      if (['low-hp', 'stopped'].includes(example.id)) await snap(`${variant}-${example.id}-suggestion`);
      assert.deepEqual(await state(), before, '阅读建议不得执行行动');
      await offered.tap();
      example.verify(before, await state());
      assert.ok(await p.locator('.reply-card').count(), `${variant} ${example.id} 建议行动没有结果反馈`);
    }
  }
  log('六种处境 × 两种推荐方案：理由、真实成本、可执行性；从建议到结果均为一次点按');

  // 事务界面的线索可直接动身；到场后另点核查，不能偷偷包办两个动作。
  await seed('scroll');
  const clue = p.locator('.board-evidence [data-ui="travel:street"]');
  await reveal(clue);
  assert.match(await clue.innerText(), /分钟/);
  await clue.tap();
  const arrived = await state();
  assert.equal(arrived.place, 'street');
  assert.ok(!arrived.flags.ledger, '点去路只应赶路，不能自动查账');
  const ledger = p.locator('[data-suggestion][data-ui="action:inspect-ledger"]');
  await reveal(ledger);
  await reachable(ledger, '到长街后的查账建议');
  await ledger.tap();
  assert.equal((await state()).flags.ledger, true);
  log('事务线索：一次点按到长街，再一次点按查账；赶路与调查的时间分别结算');

  for (const variant of LAYOUTS) {
    await seed(variant);
    await click('theme');
    assert.equal(await p.locator('html').getAttribute('data-theme'), 'dark');
    await shape(`${variant} 深色模式`);
    await snap(`${variant}-dark`);
    const before = await state();
    await p.reload();
    assert.deepEqual(await state(), before);
    assert.equal(await p.locator('html').getAttribute('data-layout'), variant);
    assert.equal(await p.locator('html').getAttribute('data-theme'), 'dark');
  }
  const sentinels = await p.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(SENTINELS));
  assert.deepEqual(sentinels, SENTINELS, '独立演示必须保留原版存档');
  assert.deepEqual(errors, [], '浏览器出现脚本错误');
  log('明暗主题、刷新续玩、原版存档隔离通过，无浏览器脚本错误');
} finally {
  await browser?.close();
  if (server) await new Promise(resolveClose => server.httpServer.close(resolveClose));
}
