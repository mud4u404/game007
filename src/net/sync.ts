/**
 * 本机存档和云存档怎么对齐。规则：
 * - 记下上次同步时那份存档的指纹。哪一边自那以后变了，就以哪一边为准；
 * - 两边都变了（比如两台设备各玩了一阵），让玩家自己选，另一份留作备份；
 * - 存档写完后十五秒推一次云，切到后台时立刻推。
 */
import { SAVE_VERSION, onReplacing, onSaved, summary } from '../core/save';
import type { GameState } from '../core/state';
import { archive, cloudEnabled, push, session, type CloudSave } from './cloud';

/** 键按字母排好再序列化：云端的 jsonb 不保留键的顺序 */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => (v as Record<string, unknown>)[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableJson((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v);
}
/** 存档指纹（FNV-1a） */
export function fingerprint(v: unknown): string {
  let h = 0x811c9dc5;
  for (const c of stableJson(v)) { h ^= c.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

const SYNCED = 'game007-cloud-synced';
interface Synced { uid: string; fp: string }
const ls = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
function synced(uid: string): string | null {
  try { const s = JSON.parse(ls()?.getItem(SYNCED) ?? 'null') as Synced | null; return s?.uid === uid ? s.fp : null; } catch { return null; }
}
export function markSynced(uid: string, data: unknown): void {
  try { ls()?.setItem(SYNCED, JSON.stringify({ uid, fp: fingerprint(data) })); } catch { /* 无妨 */ }
}

export type Decision = 'none' | 'push' | 'pull' | 'ask';

/** 纯函数：给出本机存档、云存档、上次同步的指纹，决定怎么办 */
export function decide(local: unknown | null, cloud: CloudSave | null, lastFp: string | null): Decision {
  if (!cloud) return local ? 'push' : 'none';
  if (!local) return 'pull';
  const lf = fingerprint(local), cf = fingerprint(cloud.data);
  if (lf === cf) return 'none';
  if (lastFp === cf) return 'push';   // 云上自上次同步没变，本机新
  if (lastFp === lf) return 'pull';   // 本机自上次同步没变，云上新
  return 'ask';
}
export const lastSyncedFp = (): string | null => { const s = session(); return s ? synced(s.uid) : null; };

/* ---------- 自动推送 ---------- */

let timer: ReturnType<typeof setTimeout> | undefined;
let latest: GameState | null = null;
let status = '';
export const syncStatus = (): string => status;

export const setLatest = (state: GameState): void => { latest = state; };

export async function pushNow(keepalive = false): Promise<void> {
  clearTimeout(timer);
  const s = session();
  if (!latest || !s || !cloudEnabled()) return;
  const data = latest;
  if (synced(s.uid) === fingerprint(data)) return;
  try {
    await push(data, SAVE_VERSION, summary(data), keepalive);
    markSynced(s.uid, data);
    status = '已同步';
  } catch (e) { status = (e as Error).message; }
}

/** 由 main.ts 调用一次：挂上存档钩子和切后台的推送 */
export function startAutoSync(): void {
  if (!cloudEnabled()) return;
  onSaved(state => {
    latest = state;
    if (!session()) return;
    clearTimeout(timer);
    timer = setTimeout(() => void pushNow(), 15_000);
  });
  // 重新开始、导入、换回备份之前，把原来的进度收进云上的历史，云上不会因此丢进度
  onReplacing(old => { if (session()) void archive(old, SAVE_VERSION, summary(old)).catch(() => undefined); });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) void pushNow(true); });
}
