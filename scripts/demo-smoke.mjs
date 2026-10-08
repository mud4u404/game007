/**
 * 青溪试玩的真实浏览器验收。默认测试已构建的 dist；也可指定开发服务器。
 * node scripts/demo-smoke.mjs [http://127.0.0.1:5174/demo.html] [截图目录]
 * 优先使用 SMOKE_EXECUTABLE_PATH / SMOKE_CHANNEL，其次系统 Chromium，最后 Playwright。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const SAVE = 'game007-sandbox-demo-v1';
const LAYOUT = 'game007-sandbox-demo-layout';
const ORIGINS = ['porter', 'courier', 'scholar', 'apprentice'];
const LAYOUTS = ['cards', 'scroll', 'compact'];
const VIEWPORTS = [
  { width: 320, height: 568 }, { width: 360, height: 560 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 720, height: 560 },
];
const SENTINELS = { 'game007-save-v2': 'original-game007-save-kept', 'jhyy-save-v2': 'original-game006-save-kept' };
let url = process.argv[2];
const shots = process.argv[3] && resolve(process.argv[3]);
if (shots) mkdirSync(shots, { recursive: true });
let server, browser;
const errors = [];
const log = text => console.log(`· ${text}`);

try {
  if (!url) {
    const { preview } = await import('vite');
    server = await preview({ preview: { host: '127.0.0.1', port: 4184 }, logLevel: 'warn' });
    url = new URL('demo.html', server.resolvedUrls.local[0]).href;
  }
  const executablePath = process.env.SMOKE_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const channel = process.env.SMOKE_CHANNEL;
  try { browser = await chromium.launch(channel ? { channel } : executablePath ? { executablePath } : {}); }
  catch (error) {
    if (!channel && !executablePath) throw error;
    log('指定浏览器不可用，尝试 Playwright Chromium');
    browser = await chromium.launch();
  }
  const context = await browser.newContext({ viewport: { width: 360, height: 560 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await context.addInitScript(sentinels => {
    for (const [key, value] of Object.entries(sentinels)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, SENTINELS);
  const p = await context.newPage();
  p.on('pageerror', error => errors.push(error.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  await p.goto(url);
  const state = () => p.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE);
  const ui = value => p.locator(`[data-ui="${value}"]:visible`).first();
  const click = async value => {
    if (!(await ui(value).count())) {
      const nested = p.locator(`[data-ui="${value}"]`).first();
      const folds = nested.locator('xpath=ancestor::details[not(@open)]');
      for (const fold of await folds.all()) await fold.locator(':scope > summary').tap();
    }
    await ui(value).tap({ timeout: 8000 });
  };
  const snap = async name => { if (shots) await p.screenshot({ path: `${shots}/${name}.png` }); };
  const isolation = async () => {
    const values = await p.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(SENTINELS));
    assert.deepEqual(values, SENTINELS, '试玩修改了原版存档');
  };
  const layout = async label => {
    const bad = await p.evaluate(() => {
      const width = innerWidth;
      const rows = [];
      if (document.documentElement.scrollWidth > width + 1) rows.push(`页面宽 ${document.documentElement.scrollWidth} > ${width}`);
      for (const el of document.querySelectorAll('.arrival-screen button,.play-scroll button,.play-scroll summary,.bottom-nav button,.side-nav button,.topbar button,.modal button,.battle button,[data-ui^="quick:"]')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.width < 43.9 || r.height < 43.9) rows.push(`${el.dataset.ui}: 点击区 ${Math.round(r.width)}×${Math.round(r.height)}`);
        // 人物列表本身允许横向滚动；其他交互项不可被挤出屏幕。
        if (el.closest('.people-row')) continue;
        if (r.left < -1 || r.right > width + 1) rows.push(`${el.dataset.ui}: ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return rows;
    });
    assert.deepEqual(bad, [], `${label} 有横向溢出或点击区小于 44px`);
  };
  const responsesReachable = async () => {
    assert.equal(await p.locator('.response-button').count(), 4);
    assert.equal(await ui('fight:medicine').count(), 1, '见招拆招时也应能用药');
    assert.equal(await ui('fight:flee').count(), 1, '见招拆招时也应能脱身');
    const blocked = await p.locator('.response-button,[data-ui="fight:medicine"],[data-ui="fight:flee"]').evaluateAll(els => els.flatMap(el => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return x < 0 || x > innerWidth || y < 0 || y > innerHeight || !(top && (top === el || el.contains(top))) ? [el.dataset.ui] : [];
    }));
    assert.deepEqual(blocked, [], '见招拆招或战斗辅助按钮不能直接点到');
  };
  const restart = async origin => {
    await click('tab:person');
    await click('origins');
    await click(`origin:${origin}`);
    await click(`origin:${origin}`);
    assert.equal((await state()).origin, origin);
    assert.equal((await state()).caseStatus, 'held');
  };

  const untrained = (s, label) => {
    assert.deepEqual([s.power, s.sword, s.footwork, s.experience, s.mp], [0, 0, 0, 0, 0], `${label} 必须尚未习武`);
    assert.ok(!Object.entries(s.inventory).some(([id, n]) => id.includes('sword') && n > 0), `${label} 不应凭空携带剑`);
  };
  const setLayout = async variant => {
    const before = await state();
    await click('layouts');
    await click(`layout:${variant}`);
    if (await p.locator('.modal:visible').count()) await click('close');
    assert.equal(await p.evaluate(key => localStorage.getItem(key), LAYOUT), variant);
    assert.equal(await p.locator('html').getAttribute('data-layout'), variant);
    assert.deepEqual(await state(), before, '换界面不得改变游戏进度');
  };

  // 开局选择必须是实际的第一步；看出身和换选项不能提前创建进度。
  await p.locator('.arrival-screen').waitFor();
  assert.equal(await state(), null, '尚未进入江湖就写了存档');
  assert.equal(await p.locator('[data-ui^="choose-origin:"]').count(), 4);
  await layout('360×560 出身选择');
  await p.setViewportSize({ width: 390, height: 844 });
  await snap('01-arrival-origins');
  for (const origin of ORIGINS) {
    await click(`choose-origin:${origin}`);
    assert.equal(await state(), null, '切换出身预览不得写入试玩进度');
  }
  for (const origin of ORIGINS) {
    await click(`choose-origin:${origin}`);
    await click('begin');
    await p.locator('.scene-prose').waitFor({ state: 'attached' });
    assert.equal((await state()).origin, origin);
    untrained(await state(), origin);
    await p.evaluate(key => localStorage.removeItem(key), SAVE);
    await p.reload();
    await p.locator('.arrival-screen').waitFor();
  }
  await click('choose-origin:porter');
  await click('begin');
  const newPorter = await state();
  // 旧版本已经入门的本机角色必须原样续玩，而非被新的开局规则清零。
  const oldCharacter = structuredClone(newPorter);
  Object.assign(oldCharacter, { power: 1, sword: 1, footwork: 1, experience: 12, mp: 90 });
  oldCharacter.inventory.old_sword = 1;
  await p.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: SAVE, value: oldCharacter });
  await p.reload();
  assert.equal(await p.locator('.arrival-screen').count(), 0, '旧存档不能被欢迎页挡住');
  assert.deepEqual(await state(), oldCharacter, '已有的一级武学应原样保留');
  await p.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: SAVE, value: newPorter });
  await p.reload();
  log('首次选择四种出身、未确认不写档、全部零武学开局、旧版一级角色续玩');

  for (const variant of LAYOUTS) {
    await setLayout(variant);
    await p.reload();
    assert.equal(await p.locator('html').getAttribute('data-layout'), variant, '刷新应保持界面选择');
    assert.deepEqual(await state(), newPorter);
    for (const viewport of VIEWPORTS) {
      await p.setViewportSize(viewport);
      for (const tab of ['world', 'person', 'sword', 'bag', 'map']) {
        await click(`tab:${tab}`);
        await layout(`${variant} ${viewport.width}×${viewport.height} ${tab}`);
      }
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await click('tab:world');
    await snap(`02-${variant}-world`);
    if (variant === 'compact') {
      for (const zone of ['people', 'actions', 'roads']) {
        await click(`quick:${zone}`);
        await layout(`compact 快捷入口 ${zone}`);
      }
      await click('quick:actions');
    } else {
      await p.locator('[data-section="actions"]').first().scrollIntoViewIfNeeded();
    }
    await snap(`03-${variant}-actions`);
    assert.deepEqual(await state(), newPorter, '换页和浏览界面不得推进世界');
  }
  const queryUrl = new URL(url);
  queryUrl.searchParams.set('layout', 'scroll');
  await p.goto(queryUrl.href);
  assert.equal(await p.locator('html').getAttribute('data-layout'), 'scroll', 'URL 应能直接预览界面');
  assert.deepEqual(await state(), newPorter);
  await p.goto(url);
  await setLayout('cards');
  log('三套界面 × 五种屏幕 × 五页，44px 点击区、布局持久化、URL 预览和进度隔离');

  assert.equal((await state()).origin, 'porter');
  await p.setViewportSize({ width: 360, height: 560 });
  await layout('360×560 初入江湖');
  await snap('01-mobile-arrival');
  await click('action:work-cargo');
  assert.equal((await state()).silver, 70, '脚夫一次搬货应挣 42 文');
  await click('select:guard');
  await click('action:rescue-money');
  assert.equal((await state()).caseStatus, 'released');
  assert.equal((await state()).silver, 10);
  await click('travel:tea');
  await click('select:xu');
  await click('action:talk:xu');
  assert.match(await p.locator('.reply-card').innerText(), /许青|岸上/);
  await click('action:xu-gift');
  assert.equal((await state()).inventory.medicine, 2);
  await snap('02-released-friend');
  // 只为药品 UI 构造受伤边界，主流程仍由真实点击推进。
  await p.evaluate(key => { const s = JSON.parse(localStorage.getItem(key)); s.hp -= 65; localStorage.setItem(key, JSON.stringify(s)); }, SAVE);
  await p.reload();
  const beforeMedicine = await state();
  await click('tab:bag');
  await click('medicine');
  assert.equal((await state()).inventory.medicine, 1, '行囊服药应消耗物品');
  assert.equal((await state()).hp, beforeMedicine.hp + 60, '行囊服药应疗伤');
  await isolation();
  log('脚夫谋生 → 担保放人 → 茶棚人情 → 行囊疗伤');

  await restart('scholar');
  untrained(await state(), '重选书生');
  await click('tab:person');
  assert.match(await p.locator('.attribute-list').innerText(), /悟性\s*17/);
  await layout('360×560 人物属性');
  await snap('03-scholar-attributes');
  await click('tab:world');
  await click('travel:street');
  const ledgerStart = (await state()).minute;
  await click('action:inspect-ledger');
  assert.equal((await state()).minute - ledgerStart, 10, '书生查账应受悟性影响');
  await click('travel:tea');
  await click('action:ask-witness');
  await click('travel:dock');
  await click('select:guard');
  await click('action:rescue-evidence');
  assert.equal((await state()).caseStatus, 'released');
  assert.equal((await state()).caseMethod, 'evidence');
  assert.equal((await state()).heat, 0);
  await click('journal');
  assert.match(await p.locator('.case-record').innerText(), /已有下文/);
  assert.doesNotMatch(await p.locator('.case-record').innerText(), /\bevidence\b/, '玩家手记不能显示内部枚举');
  await snap('04-evidence-journal');
  await click('close');
  log('书生根基 → 长街查账 → 茶棚人证 → 据理放人');

  await click('travel:tea');
  await click('travel:yard');
  assert.ok(await ui('action:spar').isDisabled(), '未经学习不能凭空切磋剑法');
  await click('tab:sword');
  assert.ok(!(await ui('train:sword').count()) || await ui('train:sword').isDisabled(), '尚未入门不能直接静修升级');
  await snap('04-untrained-skills');
  await click('tab:world');
  await click('action:observe-sword');
  for (const kind of ['sword', 'inner', 'footwork']) {
    const before = await state();
    await click(`action:learn-${kind}`);
    const after = await state();
    assert.equal(after[kind === 'inner' ? 'power' : kind], 1, `学会第一门 ${kind}`);
    assert.equal(after.silver, before.silver, '第一招不能因没钱而卡住');
    assert.equal(after.minute - before.minute, 15, '初学一门应经过 15 分钟');
    assert.equal(before.stamina - after.stamina, 10, '初学一门应消耗 10 精力');
  }
  assert.equal((await state()).inventory.practice_sword, 1, '学剑后才获得练习木剑');
  assert.ok((await state()).mp > 0, '学会养息后才拥有可用内力');
  await snap('04-first-lessons');
  log('未习武也能谋生、查证、救人；去旧武场看剑，再亲自学会第一招');
  const xpBefore = (await state()).experience;
  await click('action:spar');
  await ui('respond:block').waitFor({ timeout: 10000 });
  await p.waitForTimeout(9000);
  assert.match(await p.locator('.tell-heading').innerText(), /先看清/);
  for (const viewport of VIEWPORTS) {
    await p.setViewportSize(viewport);
    await layout(`${viewport.width}×${viewport.height} 战斗`);
    await responsesReachable();
    await snap(`05-tell-${viewport.width}`);
  }
  await p.setViewportSize({ width: 390, height: 844 });
  if (await ui('fight:medicine').isEnabled()) {
    const medicinesBefore = (await state()).inventory.medicine;
    await click('fight:medicine');
    assert.equal((await state()).inventory.medicine, medicinesBefore - 1, '重招阶段服药应消耗物品');
    assert.equal(await p.locator('.response-button').count(), 4, '服药不能绕过重招应对');
  }
  let didPerform = false, didUltimate = false;
  const deadline = Date.now() + 100000;
  while (!(await ui('fight:finish').count()) && Date.now() < deadline) {
    if (await p.locator('.response-button:visible').count()) {
      const options = await p.locator('.response-button:not(:disabled)').evaluateAll(els => els.map(el => ({ key: el.dataset.ui, chance: Number.parseInt(el.querySelector('strong').textContent, 10) })));
      const best = options.sort((a, b) => b.chance - a.chance)[0];
      assert.ok(best, '重招必须至少有一种可用应对');
      await click(best.key);
    } else if (await ui('fight:ultimate').isEnabled().catch(() => false)) {
      await click('fight:ultimate'); didUltimate = true;
    } else if (await ui('fight:perform').isEnabled().catch(() => false)) {
      await click('fight:perform'); didPerform = true;
    } else if (await ui('fight:medicine').isEnabled().catch(() => false)) {
      await click('fight:medicine');
    }
    await p.waitForTimeout(150);
  }
  assert.ok(await ui('fight:finish').count(), '完整切磋未能结算');
  assert.ok(didPerform, '未实际使用绝招');
  await snap('06-battle-result');
  const result = await p.locator('.battle-result h2').innerText();
  await click('fight:finish');
  assert.equal((await state()).pendingBattle, undefined);
  assert.ok((await state()).experience > xpBefore, '输赢都应获得切磋历练');
  await click('tab:sword');
  const beforeTrain = await state();
  await click('train:sword');
  assert.equal((await state()).sword, beforeTrain.sword + 1);
  assert.ok((await state()).experience < beforeTrain.experience);
  await click('stance:flowing');
  assert.equal((await state()).stance, 'flowing');
  await snap('07-training');
  log(`完整切磋（${result}，绝招已用，杀招${didUltimate ? '已用' : '未蓄满'}）→ 消化历练 → 换路数`);

  await click('theme');
  assert.equal(await p.locator('html').getAttribute('data-theme'), 'dark');
  const saved = await state();
  await p.reload();
  assert.deepEqual(await state(), saved, '重载必须继续同一份试玩进度');
  assert.equal(await p.locator('html').getAttribute('data-theme'), 'dark');
  await snap('08-dark-mobile');
  for (const viewport of [{ width: 360, height: 560 }, { width: 390, height: 844 }, { width: 720, height: 560 }]) {
    await p.setViewportSize(viewport);
    for (const tab of ['world', 'person', 'sword', 'bag', 'map']) {
      await click(`tab:${tab}`);
      await layout(`${viewport.width}×${viewport.height} ${tab}`);
    }
    await click('tab:world');
    await snap(`09-world-dark-${viewport.width}`);
  }
  await click('theme');
  assert.equal(await p.locator('html').getAttribute('data-theme'), 'light');
  await snap('10-landscape-light');

  // 注入追缉条件，仅验收拦查 UI 和绝境出路；不声称覆盖由战斗累积追缉的流程。
  await p.evaluate(key => {
    const s = JSON.parse(localStorage.getItem(key));
    Object.assign(s, { place: 'dock', minute: 600, heat: 40, theftHeat: 30, silver: 0, hp: 1, stamina: 0, stopped: false });
    s.relations.merchant = -3;
    localStorage.setItem(key, JSON.stringify(s));
  }, SAVE);
  await p.setViewportSize({ width: 360, height: 560 });
  await p.reload();
  await click('travel:street');
  assert.equal((await state()).stopped, true, '通缉中进入长街应被拦下');
  const scenery = p.locator('.scene-prose');
  if (!(await scenery.isVisible())) {
    await scenery.locator('xpath=ancestor::details').locator(':scope > summary').tap();
  }
  assert.match(await p.locator('.scene-prose').innerText(), /秦捕头|拦住/);
  const stopped = await state();
  if (await ui('travel:inn').isEnabled()) await click('travel:inn');
  assert.equal((await state()).place, 'street', '道路不能绕过拦查');
  await click('tab:map');
  if (await ui('travel:yard').isEnabled()) await click('travel:yard');
  assert.equal((await state()).place, 'street', '地图不能绕过拦查');
  await click('tab:sword');
  assert.ok(await ui('train:sword').isDisabled(), '被拦查时修炼入口应禁用');
  assert.equal((await state()).sword, stopped.sword, '被拦查时不能修炼');
  assert.equal((await state()).experience, stopped.experience);
  assert.equal((await state()).minute, stopped.minute, '无效行动不应推进时间');
  await click('tab:world');
  await click('select:constable');
  assert.ok(await ui('action:settle-fine').isDisabled(), '无钱时不能交罚钱');
  assert.ok(await ui('action:arrest-fight').isDisabled(), '满伤零精力时不能强行开战');
  assert.ok(await ui('action:submit-check').isEnabled(), '无钱满伤零精力仍应有出路');
  await layout('360×560 追缉拦查');
  await snap('11-patrol-no-resources');
  await click('action:submit-check');
  const released = await state();
  assert.equal(released.stopped, false);
  assert.equal(released.place, 'yamen');
  assert.equal(released.heat, 0);
  assert.equal(released.theftHeat, 0);
  assert.equal(released.silver, 0);
  assert.equal(released.hp, 1);
  assert.equal(released.minute, stopped.minute + 120);
  assert.deepEqual(released.relations, stopped.relations, '官府释放不能抹掉人物恩怨');
  await click('travel:street');
  assert.equal((await state()).place, 'street');
  assert.equal((await state()).stopped, false, '释放后应能继续行动');
  await snap('12-patrol-release');
  log('注入追缉触发条件：街头拦查 → 道路/地图/练功均不可绕过 → 无钱重伤仍可获释，关系保留');
  await isolation();
  assert.deepEqual(errors, [], '浏览器出现脚本错误');
  log('完整战斗、学习修炼、明暗主题、刷新续玩、追缉兜底与原版存档隔离全部通过');
} finally {
  await browser?.close();
  if (server) await new Promise(resolveClose => server.httpServer.close(resolveClose));
}
