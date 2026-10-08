// 等到有活可做才退出：每两分钟看一次 GitHub 上开着的 Issue 和 PR，等待期间不花模型的 token。
// 挑任务的规则见 scripts/relay.mjs，与 AGENTS.md 第五节一致。自动模式的用法见 AGENTS.md 第十节。
// 用法：node scripts/wait-for-work.mjs [--once] [--max-minutes N]
//   --once           只看一次
//   --max-minutes N  最多等 N 分钟。工具限制单条命令运行时长时用，到时打印「暂时没有可做的任务」后退出
import { execSync } from 'node:child_process';
import { describe, pickWork } from './relay.mjs';

const args = process.argv.slice(2);
const once = args.includes('--once');
const mi = args.indexOf('--max-minutes');
const maxMin = mi >= 0 ? Number(args[mi + 1]) || 0 : 0;

const sh = cmd => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const repo = 'mud4u404/game007';
const origin = sh('git remote get-url origin');
if (!/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)mud4u404\/game007(?:\.git)?\/?$/.test(origin)) {
  console.error('当前 origin 不是 mud4u404/game007，停止自动接任务。请先核对仓库，避免操作其他项目。');
  process.exit(1);
}
let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || sh('gh auth token');
// 不登录时 GitHub 每小时只让查六十次，所以两分钟一次；登录了一分钟一次
const interval = () => (token ? 60 : 120) * 1000;

async function get(url) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'jianghu-wait-for-work' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const r = await fetch(url, { headers });
    if (r.status === 401 && token) {
      token = '';
      return get(url);
    }
    if (!r.ok) throw new Error(`GitHub 返回 ${r.status}`);
    return await r.json();
  } catch (e) {
    // Node 自带的 fetch 不走代理；本机要靠代理才能上 GitHub 时，curl 会读 HTTPS_PROXY
    const out = sh(`curl -fsSL -H "accept: application/vnd.github+json" ${token ? `-H "authorization: Bearer ${token}" ` : ''}"${url}"`);
    if (!out) throw e;
    return JSON.parse(out);
  }
}

// 已推送的任务分支：CI 建好 PR 之前，也不能再接这个任务。
// 读不到就抛错，交给下面的重试；不能当成「没有分支」，否则会把别人正在做的任务再领一次。
const remoteBranches = () =>
  execSync('git ls-remote --heads origin', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map(l => l.split('refs/heads/')[1])
    .filter(Boolean);

async function openItems() {
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await get(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

const start = Date.now();
let fails = 0;
for (;;) {
  try {
    const w = pickWork(await openItems(), remoteBranches());
    fails = 0;
    if (w) {
      console.log(describe(w));
      console.log(w.html_url);
      process.exit(0);
    }
  } catch (e) {
    fails++;
    if (once || fails === 3) console.error(`查不到 GitHub（${e.message}）。${once ? '' : '会继续重试。'}`);
    if (once) process.exit(1);
  }
  if (once || (maxMin && Date.now() - start >= maxMin * 60000)) {
    console.log('暂时没有可做的任务');
    process.exit(0);
  }
  await new Promise(r => setTimeout(r, interval()));
}
