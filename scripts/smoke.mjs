/**
 * 端到端冒烟测试：用无头 Chromium 从标题画面一路玩到第一回首领战。
 * 用法：npm run smoke（先打包，再自动起一个本地预览服务来测）。
 * 也可以测指定网址：node scripts/smoke.mjs <网址> [截图目录]
 * 页面报错或流程走不通时，以非零状态退出，CI 会因此变红。
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }

let url = process.argv[2];
let server;
if (!url) {
  const { preview } = await import('vite');
  server = await preview({ preview: { port: 4173 }, logLevel: 'warn' });
  url = server.resolvedUrls.local[0];
}
const shots = process.argv[3];
// CI 里用机器上装好的 Chrome（SMOKE_CHANNEL=chrome），省掉每次下载浏览器；找不到就退回 Playwright 自带的
const channel = process.env.SMOKE_CHANNEL;
let b;
try { b = await pw.chromium.launch(channel ? { channel } : {}); }
catch (e) {
  if (!channel) throw e;
  console.log(`· 找不到 ${channel}，改用 Playwright 自带的浏览器`);
  b = await pw.chromium.launch();
}
// 用矮屏手机的尺寸跑：手机浏览器的工具栏、微信的标题栏会吃掉一截高度，按钮跑到屏幕外，玩家就会以为卡死了
const p = await b.newPage({ viewport: { width: 360, height: 560 }, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await p.goto(url);
await p.evaluate(() => localStorage.clear());
await p.reload();
const click = async sel => { await p.waitForSelector(sel, { timeout: 8000 }); await p.click(sel); };
const snap = async name => { if (shots) await p.screenshot({ path: `${shots}/${name}.png` }); };
const log = (...a) => console.log('·', ...a);

await snap('01-title');
// game007 为本地存档版本：标题不应出现云存档登录入口。
await p.waitForSelector('[data-act="tGo:new"]');
if (await p.locator('[data-act="acctOpen"]').count()) {
  throw new Error('独立开发版本不应出现云存档登录入口');
}
log('本地存档模式：无云存档登录入口');
await click('[data-act="tGo:new"]');
await click('[data-act="stPick:0"]');                 // 回想
for (let i = 0; i < 3; i++) { await click(`[data-act="stPick:${i}"]`); await click('[data-act="stNext"]'); }
await snap('02-name');
await p.fill('#nameIn', '听雨');
await click('[data-act="stPick:0"]');
await click('[data-act="stPick:0"]');                 // 回到小屋
log('序章开场完成', await p.textContent('.who b'));
await snap('03-guazhou');
await click('[data-act="do:交谈"]');                  // 江伯
await click('[data-act="quest"]');                    // 去瓜洲镇
await p.waitForTimeout(1200);
await click('[data-act="sel:huichun"]');
await click('[data-act="do:抓药"]');
await click('[data-act="quest"]');                    // 回小屋，触发夜袭
await p.waitForTimeout(1200);
await click('[data-act="stPick:0"]');                 // 拔剑迎敌

async function fight(tag, pickBest = true) {
  for (let i = 0; i < 500; i++) {
    await p.waitForTimeout(200);
    if (!(await p.$('#fightLayer:not([hidden])'))) return 'closed';
    if (await p.$('#sheetLayer:not([hidden]) [data-act="fResult"]')) return 'result';
    if (await p.$('#fsheet.alert')) {
      await p.waitForTimeout(150);
      // 每个应对按钮都要露在屏幕里、点得到（不能靠自动滚动去找）
      const hidden = await p.$$eval('.ropt', els => els.filter(e => {
        const r = e.getBoundingClientRect(), cy = r.top + r.height / 2;
        const top = cy > 0 && cy < innerHeight ? document.elementFromPoint(r.left + r.width / 2, cy) : null;
        return !(top && (top === e || e.contains(top)));
      }).map(e => e.textContent.trim().slice(0, 8)));
      if (hidden.length) throw new Error('见招拆招的应对按钮在屏幕外或被挡住：' + hidden.join('、'));
      const opts = await p.$$eval('.ropt', els => els.map(e => ({ act: e.dataset.act, dis: e.disabled, o: e.querySelector('.ro').textContent })));
      const live = opts.filter(o => !o.dis);
      const order = '一两三四五六七八九';
      const choice = pickBest ? live.sort((a, c) => order.indexOf(c.o[2]) - order.indexOf(a.o[2]))[0] : live[0];
      if (tag && !(await p.$('#rTip[hidden]'))) await snap(`${tag}-tutorial`);
      await p.click(`[data-act="${choice.act}"]`).catch(() => {});
      continue;
    }
    if (await p.$('#opening:not([hidden])')) { await p.click('#opening').catch(() => {}); continue; }
    // 杀招、绝招：按钮由搭配生成（engine/zhaoshi.ts）
    for (const s of ['#skUlt', '#skP0', '#skP1', '#skP2']) { const el = await p.$(s + ':not([disabled])'); if (el) { await el.click().catch(() => {}); break; } }
  }
  return 'timeout';
}

// 赶路途中可能遇到路遇（随机）：弹出剧情就点第一个选项，开打就打完，直到路走完
async function settle() {
  for (let i = 0; i < 80; i++) {
    await p.waitForTimeout(250);
    if (await p.$('#storyLayer:not([hidden]) .choice')) {
      log('路遇', (await p.textContent('#storyLayer h2')).trim());
      await p.click('#storyLayer .choice').catch(() => {});
      continue;
    }
    // 先看结算页：打完以后结算页盖在战斗层上面，战斗层这时还没收起
    if (await p.$('#sheetLayer:not([hidden]) [data-act="fResult"]')) { await p.click('[data-act="fResult"]').catch(() => {}); continue; }
    if (await p.$('#fightLayer:not([hidden])')) { log('路遇开打', await fight(null)); continue; }
    if (await p.$('#travel:not([hidden])')) continue;
    return;
  }
}
// 按任务横幅赶路；路上开了打、停在半路的，再点一次接着走
async function goQuest(dest) {
  for (let k = 0; k < 5; k++) {
    await click('[data-act="quest"]');
    await settle();
    if ((await p.textContent('#appbar h1')).includes(dest)) return;
  }
  throw new Error('走不到' + dest);
}

log('黑衣人', await fight('04-fight1'));
await click('[data-act="stPick:0"]');                 // 握紧长剑
log('黑衣首领', await fight('05-fight2'));
await p.waitForSelector('#storyLayer:not([hidden])');
await snap('06-death');
await click('[data-act="stPick:0"]');                 // 江伯——
await click('[data-act="stPick:0"]');                 // 掩埋江伯
await click('[data-act="stPick:0"]');                 // 登船
await p.waitForTimeout(500);
await snap('07-chapter');
await click('[data-act="chapDone"]');
log('到达', await p.textContent('#appbar h1'), '| 主线：', await p.textContent('.quest .qt'));
await snap('08-yangzhou');
await goQuest('大明寺');
await click('[data-act="sel:liaochen"]');
await click('[data-act="do:交谈"]');
log('了尘：', (await p.textContent('.reply')).slice(0, 24));
await goQuest('运河渡口');
await click('[data-act="sel:tu"]');
await click('[data-act="do:动手"]');
log('屠千山', await fight(null));
log('结算：', (await p.textContent('#sheetLayer .r-h')).trim());
await snap('09-result');
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
await b.close();
await server?.close();
process.exit(errs.length ? 1 : 0);
