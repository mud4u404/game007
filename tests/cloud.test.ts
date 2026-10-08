import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 云存档的配置在测试里填上假的地址
vi.mock('../src/net/config', () => ({ SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_KEY: 'sb_publishable_demo', EMAIL_DOMAIN: 'players.example.net' }));

const { CloudError, explain, pull, push, session, signIn, signOut, signUp, useFetch, usernameEmail } = await import('../src/net/cloud');
const { decide, fingerprint, lastSyncedFp, markSynced, stableJson } = await import('../src/net/sync');

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let replies: { status: number; body: unknown }[] = [];
let mem: Mem;
beforeEach(() => {
  mem = new Mem();
  (globalThis as { localStorage?: unknown }).localStorage = mem;
  calls = []; replies = [];
  useFetch((async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = replies.shift() ?? { status: 200, body: null };
    return { ok: r.status < 300, status: r.status, text: async () => (r.body === null ? '' : JSON.stringify(r.body)) } as Response;
  }) as typeof fetch);
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

const auth = { access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'uid-1', user_metadata: { username: '孤舟' } } };

describe('账号', () => {
  it('同源的 game006 登录状态、同步指纹和历史日期不会被读取或改写', async () => {
    const oldData = { v: 2, name: '旧项目' };
    const legacy = new Map([
      ['jhyy-cloud-session', JSON.stringify({ access: 'old-tok', refresh: 'old-ref', expires: Date.now() + 3_600_000, uid: 'uid-1', username: '旧项目' })],
      ['jhyy-cloud-synced', JSON.stringify({ uid: 'uid-1', fp: fingerprint(oldData) })],
      ['jhyy-cloud-history-day', new Date().toISOString().slice(0, 10)]
    ]);
    for (const [key, value] of legacy) mem.setItem(key, value);
    const reads = vi.spyOn(mem, 'getItem');
    const writes = vi.spyOn(mem, 'setItem');
    const deletes = vi.spyOn(mem, 'removeItem');

    expect(session()).toBeNull();
    expect(lastSyncedFp()).toBeNull();
    await expect(pull()).rejects.toThrow('还没登录');
    expect(calls).toEqual([]);
    signOut();

    replies.push({ status: 200, body: auth });
    await signIn('孤舟', 'secret1');
    expect(lastSyncedFp()).toBeNull();
    const newData = { v: 2, name: '孤舟' };
    markSynced('uid-1', newData);
    expect(lastSyncedFp()).toBe(fingerprint(newData));
    await push(newData, 2, '新项目');
    expect(calls.filter(c => c.url.endsWith('/rest/v1/save_history'))).toHaveLength(1);
    signOut();
    expect(session()).toBeNull();

    expect(new Map([...mem.m].filter(([key]) => legacy.has(key)))).toEqual(legacy);
    for (const accesses of [reads.mock.calls, writes.mock.calls, deletes.mock.calls]) {
      expect(accesses.length).toBeGreaterThan(0);
      expect(accesses.every(([key]) => key.startsWith('game007-'))).toBe(true);
    }
  });

  it('用户名换算成合法的内部邮箱，大小写不分，汉字也行', () => {
    expect(usernameEmail('孤舟')).toMatch(/^u[0-9a-f]+@players\.example\.net$/);
    expect(usernameEmail('LiuHan')).toBe(usernameEmail('liuhan'));
    expect(usernameEmail(' 孤舟 ')).toBe(usernameEmail('孤舟'));
  });

  it('体检脚本换算邮箱的办法和游戏一致', async () => {
    const probe = await import('../scripts/cloud-email.mjs');
    for (const n of ['孤舟', 'LiuHan', ' 体检员 ']) expect(probe.usernameEmail(n, 'players.example.net')).toBe(usernameEmail(n));
  });

  it('注册：带上公开密钥和换算后的邮箱，登录状态记在本机', async () => {
    replies.push({ status: 200, body: auth });
    const s = await signUp('孤舟', 'secret1');
    expect(calls[0].url).toBe('https://demo.supabase.co/auth/v1/signup');
    expect((calls[0].init.headers as Record<string, string>).apikey).toBe('sb_publishable_demo');
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ email: usernameEmail('孤舟'), password: 'secret1', data: { username: '孤舟' } });
    expect(s.uid).toBe('uid-1');
    expect(session()?.username).toBe('孤舟');
  });

  it('错误换成玩家看得懂的话', async () => {
    replies.push({ status: 422, body: { msg: 'User already registered' } });
    await expect(signUp('孤舟', 'secret1')).rejects.toThrow('已经有人用了');
    replies.push({ status: 400, body: { error_description: 'Invalid login credentials' } });
    await expect(signIn('孤舟', 'wrong12')).rejects.toThrow('用户名或密码不对');
    await expect(signIn('a', 'secret1')).rejects.toBeInstanceOf(CloudError);
    await expect(signIn('孤舟', '123')).rejects.toThrow('至少六位');
    expect(calls.length).toBe(2);
    expect(explain(429, '')).toContain('频繁');
  });

  it('推送：按账号覆盖当前存档，当天第一次还记一份历史', async () => {
    replies.push({ status: 200, body: auth });
    await signIn('孤舟', 'secret1');
    await push({ v: 2, name: '孤舟' }, 2, '第一回');
    await push({ v: 2, name: '孤舟', silver: 1 }, 2, '第一回');
    const writes = calls.slice(1);
    expect(writes.map(c => c.url.replace('https://demo.supabase.co', ''))).toEqual(['/rest/v1/saves?on_conflict=user_id', '/rest/v1/save_history', '/rest/v1/saves?on_conflict=user_id']);
    expect((writes[0].init.headers as Record<string, string>).prefer).toContain('merge-duplicates');
    expect((writes[0].init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(writes[0].init.body as string)).toMatchObject({ user_id: 'uid-1', username: '孤舟', version: 2, summary: '第一回' });
  });

  it('拉取：只取自己的那一行', async () => {
    replies.push({ status: 200, body: auth });
    await signIn('孤舟', 'secret1');
    replies.push({ status: 200, body: [{ data: { v: 2 }, version: 2, summary: 's', updated_at: '2026-10-07T12:00:00Z' }] });
    const c = await pull();
    expect(calls[1].url).toContain('user_id=eq.uid-1');
    expect(c?.updated).toBe(Date.parse('2026-10-07T12:00:00Z'));
  });
});

describe('同步规则', () => {
  const a = { v: 2, name: '孤舟', day: 7, flags: { boss: true } };
  const b = { v: 2, name: '孤舟', day: 9, flags: { boss: true } };
  const cloud = (data: unknown) => ({ data, version: 2, summary: '', updated: 0 });

  it('云端打乱键的顺序，也认得出是同一份', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(stableJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(fingerprint({ b: 1, a: 2 })).toBe(fingerprint({ a: 2, b: 1 }));
  });

  it('哪边自上次同步以来变了，就以哪边为准；两边都变了才问玩家', () => {
    expect(decide(null, null, null)).toBe('none');
    expect(decide(a, null, null)).toBe('push');
    expect(decide(null, cloud(a), null)).toBe('pull');
    expect(decide(a, cloud({ ...a }), null)).toBe('none');
    expect(decide(b, cloud(a), fingerprint(a))).toBe('push');
    expect(decide(a, cloud(b), fingerprint(a))).toBe('pull');
    expect(decide(a, cloud(b), null)).toBe('ask');
    expect(decide(a, cloud(b), fingerprint({ v: 2, day: 1 }))).toBe('ask');
  });
});
