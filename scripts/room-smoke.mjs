/**
 * 房间式 MUD 浏览器验收：对象、行动、结果及后续去处在同一连续交互里。
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
    await locator.scrollIntoViewIfNeeded();
    const problem = await locator.evaluate(el => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      if (r.width < 43.9 || r.height < 43.9) return `点击区 ${Math.round(r.width)}×${Math.round(r.height)}`;
      if (r.left < -1 || r.right > innerWidth + 1) return '横向溢出';
      if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) return '滚动后仍不可见';
      if (!top || (top !== el && !el.contains(top))) return `被 ${top?.tagName}.${top?.className} 遮挡`;
      return null;
    });
    assert.equal(problem, null, `${label} 应能自然滚动到并直接点按`);
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
  const continuousWorld = async label => {
    assert.equal(await p.locator('[data-room-scroll]').count(), 1, `${label} 世界只需一个滚动区域`);
    assert.equal(await p.locator('[data-room-scroll="world"]').count(), 1, `${label} 世界内容用自然滚动浏览`);
    const nested = await p.locator('.room-world').evaluate(root => [...root.querySelectorAll('*')].filter(el =>
      /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1
      && el.dataset.roomScroll !== 'world').map(el => el.className));
    assert.deepEqual(nested, [], `${label} 对象、动作和反馈不能各自出现内部滚动`);
    const anchored = await p.evaluate(() => {
      const world = document.querySelector('[data-room-scroll="world"]');
      const fixed = ['.room-header', '.room-resources', '.bottom-nav'].map(sel => document.querySelector(sel));
      const before = fixed.map(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
      const savedTop = world.scrollTop;
      world.scrollTo({ top: world.scrollHeight, behavior: 'instant' });
      const stayed = fixed.every((el, i) => Math.abs(el.getBoundingClientRect().top - before[i].top) < 1
        && Math.abs(el.getBoundingClientRect().bottom - before[i].bottom) < 1);
      world.scrollTo({ top: savedTop, behavior: 'instant' });
      return stayed;
    });
    assert.equal(anchored, true, `${label} 自然浏览世界时状态和底部导航保持可用`);
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
    await continuousWorld(`${viewport.width}×${viewport.height}`);
    const navKeys = await p.locator('.bottom-nav [data-ui]').evaluateAll(els => els.map(el => el.dataset.ui));
    assert.deepEqual(navKeys, ['tab:world', 'tab:person', 'tab:sword', 'tab:bag', 'tab:map']);
    for (const value of ['room-select:docker', 'room-select:guard', 'room-select:xu', 'travel:street', 'travel:tea', ...navKeys]) await reachable(ui(value), `${viewport.width} ${value}`);
    await select('guard');
    await reachable(ui('action:talk:guard'), '人物动作');
    assert.match(await p.locator('.room-actions').innerText(), /漕帮护卫|护卫/, '所选人物的身份处境应直接可读');
    assert.match(await ui('action:rescue-evidence').innerText(), /货单|线索|人证/, '禁用动作应直接说明缺少哪些条件');
    assert.doesNotMatch(await ui('action:rescue-evidence').innerText(), /条件未足/, '不能用统一的条件未足替代真正原因');
    await snap(`world-guard-${viewport.width}`);
    await select('docker');
    assert.match(await ui('action:work-cargo').innerText(), /42\s*文/, '做工前即可知道收益');
    assert.equal(await ui('room-select:object-cargo').count(), 0, '搬货由船行领班提供，不再重复为另一个物件入口');
    for (let i = 0; i < 2; i++) {
      const before = await state(); await act('work-cargo'); const after = await state();
      assert.equal(after.minute - before.minute, 45); assert.equal(after.silver - before.silver, 42);
      assert.equal(before.stamina - after.stamina, 22);
      assert.equal(await ui('room-select:docker').getAttribute('aria-pressed'), 'true', '连续做工保持当前对象');
      assert.match(await p.locator('.room-latest').innerText(), /陶三/, '结果应标明来源');
      assert.match(await p.locator('.room-latest').innerText(), /42/, '做工收益应在当前对象结果中出现');
      assert.ok(await p.locator('.room-actions .room-latest').count(), '结果与对象及动作在同一块');
      assert.equal(await p.locator('.room-latest').getAttribute('data-room-feedback-target'), 'docker', '做工反馈归属于陶三');
      assert.match(await p.locator('.room-look').innerText(), /缆绳|渡口|船工|木板卸货/, '动作之后地点描述仍然存在');
      await continuousWorld('连续搬货后');
      await reachable(ui('action:work-cargo'), '连续搬货可继续操作');
    }
    await snap(`world-work-${viewport.width}`);
    await select('guard');
    assert.doesNotMatch(await p.locator('.room-actions').innerText(), /陶三数出铜钱|最后一包货|挣得 42/, '换成卫衡时不保留陶三的当前结果');
    assert.equal(await p.locator('.room-latest[data-room-feedback-target="docker"]').count(), 0, '历史行动不能冒充新选中对象的即时回应');
    await reachable(ui('action:talk:guard'), '切换对象后可直接交涉');
    const progress = await state();
    for (const tab of ['person', 'sword', 'bag', 'map', 'world']) { await tap(`tab:${tab}`); await shape(`${viewport.width} ${tab}`); }
    assert.deepEqual(await state(), progress, '浏览五个页面不能推进时间');
    await seed();
    await tap('travel:street');
    assert.equal((await state()).place, 'street', '没有读剧情也应能直接离开渡口');
    assert.equal((await state()).caseStatus, 'held');
  }
  log('五种屏幕：单一自然滚动，人物身份、动作成本收益及条件可读，结果归属当前对象，五页和道路可用');

  await p.setViewportSize(VIEWPORTS[2]); await seed();
  await select('docker'); await act('talk:docker');
  assert.equal((await state()).minute, initial.minute + 2, '交谈仍遵循原有时间成本');
  await tap('travel:street'); await select('object-ledger');
  const ledgerBefore = await state(); await act('inspect-ledger');
  assert.equal((await state()).minute - ledgerBefore.minute, 35); assert.equal((await state()).flags.ledger, true);
  assert.ok(await ui('action:inspect-ledger').isDisabled(), '查过的账应显式不可重复领取');
  assert.match(await ui('action:inspect-ledger').innerText(), /已.*核|已.*查|已完成/, '查账完成应说明已核实，不应显示模糊的条件不足');
  assert.match(await p.locator('.room-case-progress').innerText(), /货单已核对/, '查证状态应持续可见');
  assert.match(await p.locator('.room-case-progress').innerText(), /人证待问/, '查账后仍能理解还缺的人证');
  assert.equal(await p.locator('.room-case-next').getAttribute('data-ui'), 'travel:tea', '查账后明确给出找人证的去处');
  await snap('ledger-found');
  await p.locator('.room-case-next').tap(); await select('teaman'); await act('ask-witness');
  assert.equal((await state()).flags.witness, true);
  assert.match(await p.locator('.room-case-progress').innerText(), /货单已核对[\s\S]*人证已记下/, '人证取得后两份线索的进度应明确');
  assert.equal(await p.locator('.room-case-next').getAttribute('data-ui'), 'travel:dock', '线索齐备后明确给出递交证据的去处');
  await p.locator('.room-case-next').tap(); await select('guard'); await act('rescue-evidence');
  assert.equal((await state()).caseMethod, 'evidence'); assert.equal((await state()).caseStatus, 'released');
  assert.equal(await ui('room-select:guard').count(), 0, '人已离开不能留下过期对象入口');
  assert.equal(await ui('action:rescue-evidence').count(), 0, '目标离开后动作要失效');
  await snap('case-settled');
  log('货单对象绑定查账，已完成与缺条件可区分；两份线索的状态和后续去处可见，离开的人与动作及时更新');

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
  await seed({ stamina: 0, silver: 0 });
  assert.ok(await ui('action:work-cargo').isDisabled(), '没有精力就不能搬货');
  assert.match(await ui('action:work-cargo').innerText(), /精力/, '做工受阻应说明精力不足');
  const recovery = p.locator('.room-recovery [data-ui="room-select:self"]');
  await reachable(recovery, '精力不足时可查看歇脚');
  const exhausted = await state(); await recovery.tap();
  assert.deepEqual(await state(), exhausted, '查看恢复方法本身不能消耗时间或自动休息');
  assert.match(await ui('action:free-rest').innerText(), /四十|40/, '确认休息前能看见恢复的精力');
  await act('free-rest');
  assert.equal((await state()).stamina, 40, '无钱无精力仍有免费恢复路径');
  assert.match(await p.locator('.room-latest').innerText(), /精力\s*\+40/, '休息的收益可追溯到当前动作');
  await p.setViewportSize(VIEWPORTS[0]); await continuousWorld('小屏休息结果');
  const lastEffect = p.locator('.room-latest .change-tags .pill').last();
  assert.ok(await lastEffect.count(), '休息结果必须显示实际数值变化');
  await lastEffect.scrollIntoViewIfNeeded();
  assert.equal(await lastEffect.evaluate(el => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.top >= 0 && r.bottom <= innerHeight && (at === el || el.contains(at));
  }), true, '320px 小屏通过世界自然滚动可读完结果，不被底栏截断');
  await snap('small-rest-result');
  await p.setViewportSize(VIEWPORTS[2]);
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
  for (const id of ['merchant', 'object-ledger', 'object-purse']) assert.equal(await ui(`room-select:${id}`).count(), 0, `闭店后的 ${id} 不能误导玩家`);
  await seed({ place: 'yard', minute: 21 * 60, caseStatus: 'moved' });
  assert.equal(await ui('room-select:swordsman').count(), 0); await select('self'); await reachable(ui('action:wait'), '无人房间可等待');
  log('受伤、精力耗尽、没钱、巡街拦查和夜间目标消失均有可用出路');

  await seed();
  await tap('layouts'); await tap('layout:cards');
  await tap('select:guard'); await act('talk:guard');
  const conversation = await state();
  await tap('layouts'); await tap('layout:room');
  assert.deepEqual(await state(), conversation, '换布局本身不改变刚才的交谈和时间');
  assert.equal(await ui('room-select:guard').getAttribute('aria-pressed'), 'true', '旧布局正在交涉的人在同屏布局继续选中');
  assert.equal(await p.locator('.room-actions .room-latest').getAttribute('data-room-feedback-target'), 'guard');
  assert.match(await p.locator('.room-actions .room-latest').innerText(), /卫衡[\s\S]*拿出凭据/, '换布局后仍可读到卫衡的实际回应');
  await select('docker');
  assert.equal(await p.locator('.room-latest[data-room-feedback-target="guard"]').count(), 0, '再选陶三不能残留卫衡的当前回应');
  assert.doesNotMatch(await p.locator('.room-actions').innerText(), /拿出凭据/, '陶三交互区不得混入卫衡交谈');
  log('旧布局交涉后切换保留所选人物和有归属的回应，再换人物清除不相关的当前结果');

  await seed(); await select('docker'); await act('work-cargo'); const saved = await state();
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
