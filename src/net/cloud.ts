/**
 * 账号与云存档：直接用 fetch 调 Supabase 的接口，不引入依赖。
 * - 用户名 + 密码：用户名在本地换算成一个内部邮箱地址交给 Supabase（邮箱验证已关，不发信）。
 * - 每个账号一份当前存档（saves 表），外加每天一份历史（save_history 表，云上保留三十份）。
 * 存档始终先存本机；这里出任何错，都不影响游戏。
 */
import { EMAIL_DOMAIN, SUPABASE_KEY, SUPABASE_URL } from './config';

export const cloudEnabled = (): boolean => !!(SUPABASE_URL && SUPABASE_KEY);

export interface Session { access: string; refresh: string; expires: number; uid: string; username: string }
export interface CloudSave { data: unknown; version: number; summary: string; updated: number }

const SESSION_KEY = 'game007-cloud-session';
type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
/** 测试用：换掉 fetch */
export const useFetch = (f: Fetch): void => { fetcher = f; };

/** 用户名：两到十二个字，汉字、字母、数字、下划线 */
export const USERNAME_RE = /^[\p{Script=Han}A-Za-z0-9_]{2,12}$/u;

/** 用户名换算成内部邮箱：大小写不分，汉字转成十六进制，保证是合法的邮箱地址 */
export function usernameEmail(username: string): string {
  const hex = Array.from(new TextEncoder().encode(username.trim().toLowerCase()), b => b.toString(16).padStart(2, '0')).join('');
  return `u${hex}@${EMAIL_DOMAIN}`;
}

export class CloudError extends Error {}

/** 把 Supabase 的英文错误换成玩家看得懂的话 */
export function explain(status: number, body: string): string {
  const t = body.toLowerCase();
  if (t.includes('already registered') || t.includes('already exists')) return '这个名字已经有人用了，换一个吧';
  if (t.includes('invalid login credentials')) return '用户名或密码不对';
  if (t.includes('password') && (t.includes('at least') || t.includes('weak') || t.includes('short'))) return '密码太短，至少六位';
  if (t.includes('signups not allowed') || t.includes('signup is disabled')) return '暂时不开放注册，请找负责人';
  if (status === 429) return '试得太频繁了，过一会儿再来';
  if (status === 401 || status === 403) return '登录已过期，请重新登录';
  return `云端出错了（${status}），进度先存在本机`;
}

async function call(path: string, init: RequestInit & { token?: string } = {}): Promise<unknown> {
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, 'content-type': 'application/json', ...(init.headers as Record<string, string>) };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let r: Response;
  try { r = await fetcher(SUPABASE_URL + path, { ...init, headers }); }
  catch { throw new CloudError('连不上云端，进度先存在本机'); }
  const text = await r.text();
  if (!r.ok) throw new CloudError(explain(r.status, text));
  return text ? JSON.parse(text) : null;
}

/* ---------- 会话 ---------- */

const store = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function session(): Session | null {
  try { return JSON.parse(store()?.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
}
function keep(s: Session | null): void {
  try { if (s) store()?.setItem(SESSION_KEY, JSON.stringify(s)); else store()?.removeItem(SESSION_KEY); } catch { /* 存不了就每次重新登录 */ }
}

interface AuthReply { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id: string; user_metadata?: { username?: string } } }
function fromAuth(a: AuthReply, username: string): Session {
  if (!a.access_token || !a.refresh_token || !a.user) throw new CloudError('注册成功了，但还没开通免验证登录，请找负责人');
  return { access: a.access_token, refresh: a.refresh_token, expires: Date.now() + (a.expires_in ?? 3600) * 1000, uid: a.user.id, username: a.user.user_metadata?.username ?? username };
}

function checkInput(username: string, password: string): void {
  if (!USERNAME_RE.test(username.trim())) throw new CloudError('用户名两到十二个字，只能用汉字、字母、数字和下划线');
  if (password.length < 6) throw new CloudError('密码太短，至少六位');
}

export async function signUp(username: string, password: string): Promise<Session> {
  checkInput(username, password);
  const a = await call('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: usernameEmail(username), password, data: { username: username.trim() } }) }) as AuthReply;
  const s = fromAuth(a, username.trim());
  keep(s);
  return s;
}

export async function signIn(username: string, password: string): Promise<Session> {
  checkInput(username, password);
  const a = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: usernameEmail(username), password }) }) as AuthReply;
  const s = fromAuth(a, username.trim());
  keep(s);
  return s;
}

export function signOut(): void { keep(null); }

/** 拿到一个还有效的会话；快过期就续上，续不上就退出登录 */
async function live(): Promise<Session> {
  const s = session();
  if (!s) throw new CloudError('还没登录');
  if (s.expires - Date.now() > 60_000) return s;
  try {
    const a = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.refresh }) }) as AuthReply;
    const n = fromAuth(a, s.username);
    keep(n);
    return n;
  } catch (e) {
    if (e instanceof CloudError && e.message.includes('过期')) keep(null);
    throw e;
  }
}

/* ---------- 存档 ---------- */

interface Row { data: unknown; version: number; summary: string; updated_at: string }

export async function pull(): Promise<CloudSave | null> {
  const s = await live();
  const rows = await call(`/rest/v1/saves?select=data,version,summary,updated_at&user_id=eq.${s.uid}`, { token: s.access }) as Row[];
  const r = rows?.[0];
  return r ? { data: r.data, version: r.version, summary: r.summary, updated: Date.parse(r.updated_at) } : null;
}

const HIST_DAY = 'game007-cloud-history-day';

/** 推一份到云上；当天第一次推送时，顺手记一份历史 */
export async function push(data: unknown, version: number, summary: string, keepalive = false): Promise<number> {
  const s = await live();
  const now = new Date();
  await call('/rest/v1/saves?on_conflict=user_id', {
    method: 'POST', token: s.access, keepalive,
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: s.uid, username: s.username, version, summary, data, updated_at: now.toISOString() })
  });
  const day = now.toISOString().slice(0, 10);
  if (store()?.getItem(HIST_DAY) !== day) {
    await call('/rest/v1/save_history', { method: 'POST', token: s.access, keepalive, headers: { prefer: 'return=minimal' }, body: JSON.stringify({ user_id: s.uid, version, summary, data }) });
    try { store()?.setItem(HIST_DAY, day); } catch { /* 无妨 */ }
  }
  return now.getTime();
}

/** 把一份存档记进云上的历史（玩家选了本机进度时，先把云上那份收好） */
export async function archive(data: unknown, version: number, summary: string): Promise<void> {
  const s = await live();
  await call('/rest/v1/save_history', { method: 'POST', token: s.access, headers: { prefer: 'return=minimal' }, body: JSON.stringify({ user_id: s.uid, version, summary, data }) });
}

/** 云上的历史备份，新的在前 */
export async function history(): Promise<CloudSave[]> {
  const s = await live();
  const rows = await call(`/rest/v1/save_history?select=data,version,summary,created_at&user_id=eq.${s.uid}&order=created_at.desc&limit=30`, { token: s.access }) as (Omit<Row, 'updated_at'> & { created_at: string })[];
  return (rows ?? []).map(r => ({ data: r.data, version: r.version, summary: r.summary, updated: Date.parse(r.created_at) }));
}
