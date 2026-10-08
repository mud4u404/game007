/**
 * The sandbox keeps the existing exchange / response rhythm. Its damage, hit,
 * guard and temporary effects use the production combat kernel; it never reads
 * or writes the main game's singleton or save slot.
 */
import { act, createCombat, endOfRound, strike } from '../engine/combat';
import type { Combat, Kit, Move } from '../engine/combat';

export type ResponseKey = 'block' | 'dodge' | 'parry' | 'rush';
export interface PlayerInput {
  name: string;
  hp: number; mp: number; hpMax: number; mpMax: number;
  attrs: Record<'body' | 'root' | 'agility' | 'insight' | 'courage', number>;
  power: number; sword: number; footwork: number;
  stance: 'steady' | 'flowing';
}
export interface BattleRequest {
  foe: 'guard' | 'swordsman'; reason: 'rescue' | 'spar' | 'arrest'; name: string;
}
export interface BattleResponse {
  key: ResponseKey; label: string; skill: string;
  chance: number; cost: number; disabled: boolean;
}
export interface DemoBattle {
  round: number;
  playerHp: number; playerMp: number; playerMaxHp: number; playerMaxMp: number;
  foeHp: number; foeMaxHp: number; foeName: string;
  rage: number; momentum: number;
  phase: 'exchange' | 'tell' | 'result';
  result?: 'win' | 'lose' | 'flee';
  logs: Array<{ text: string; tone: 'normal' | 'player' | 'foe' | 'good' }>;
  tell?: { name: string; text: string };
  cooldown: number;
  performName: string; performCost: number; ultName: string;
  stance: PlayerInput['stance'];
  /** Internal battle state; all mutations go through the exported actions. */
  combat: Combat;
  player: PlayerInput;
  request: BattleRequest;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const basic = (name: string, lo: number, hi: number, acc = 0.88): Move =>
  ({ name, mp: 0, cd: 0, hits: 1, dmg: [lo, hi], acc, fx: [] });
const passive = (guard = 0): Kit['passive'] => ({ guard, haste: 0, heal: 0, rage: 0 });
const weaponOf = (request: BattleRequest): { edge: string; force: string; posture: string } =>
  request.reason === 'arrest' ? { edge: '铁尺', force: '尺劲', posture: '尺势' }
    : request.foe === 'swordsman' ? { edge: '剑锋', force: '剑劲', posture: '剑势' }
      : { edge: '刀锋', force: '刀劲', posture: '刀势' };

/**
 * Single source for battle stats. World-derived hpMax/mpMax are inputs: learning
 * another skill must not award those resources a second time during battle.
 * Response probabilities have their one source in responses(), shown by the UI.
 */
function playerKit(p: PlayerInput): Kit {
  const steady = p.stance === 'steady';
  const inner = p.power > 0;
  const strength = 9 + p.sword * 1.8 + p.power * 0.8 + p.attrs.body * 0.28;
  const attack = strength * (steady ? 0.94 : 1.1);
  const move: Move = steady
    ? { ...basic('拦江 · 留三分', attack * 1.25, attack * 1.65), mp: 20, cd: 4,
      fx: [{ kind: 'guard', value: 25, rounds: 2 }] }
    : { ...basic('回澜 · 逐浪', attack * 0.86, attack * 1.12), mp: 26, cd: 3, hits: 2,
      fx: [{ kind: 'break', value: 8, rounds: 2 }] };
  return {
    name: p.name, hpMax: p.hpMax, mpMax: p.mpMax,
    mpRegen: inner ? 1 + Math.floor(p.attrs.root / 8) : 0,
    dodge: clamp(p.attrs.agility * 0.003 + p.footwork * 0.012 + (steady ? 0 : 0.025), 0, 0.3),
    hit: clamp((p.attrs.insight - 10) * 0.004, -0.04, 0.08),
    passive: { ...passive(steady && inner ? 12 : 0), rage: 2 + p.attrs.courage * 0.12 }, openers: [],
    moves: [move], basic: basic(steady ? '横剑守中' : '踏步进剑', attack - 3, attack + 3),
    ult: inner
      ? { ...basic('一剑横江', attack * 2.8, attack * 3.5), sure: true,
        fx: [{ kind: 'fear', value: 15 }] }
      : { ...basic('连环进剑', attack * 1.4, attack * 1.75), hits: 2, sure: true },
  };
}

function foeKit(request: BattleRequest): Kit {
  const swordsman = request.foe === 'swordsman';
  return {
    name: request.name, hpMax: swordsman ? 280 : 230, mpMax: 100, mpRegen: 2,
    dodge: swordsman ? 0.06 : 0.02, hit: 0, passive: passive(), openers: [], moves: [],
    basic: basic(request.reason === 'arrest' ? '铁尺锁腕' : swordsman ? '白鹭掠水' : '分水刀', swordsman ? 20 : 16, swordsman ? 27 : 22, 0.87),
  };
}

function log(b: DemoBattle, text: string, tone: DemoBattle['logs'][number]['tone'] = 'normal'): void {
  b.logs.push({ text, tone });
  if (b.logs.length > 40) b.logs.splice(0, b.logs.length - 40);
}

function sync(b: DemoBattle): void {
  const [me, foe] = b.combat.f;
  me.hp = clamp(me.hp, 0, me.kit.hpMax);
  me.mp = clamp(me.mp, 0, me.kit.mpMax);
  foe.hp = clamp(foe.hp, 0, foe.kit.hpMax);
  b.playerHp = Math.ceil(me.hp); b.playerMp = Math.round(me.mp);
  b.foeHp = Math.ceil(foe.hp); b.rage = Math.round(me.rage);
  b.momentum = Math.round(me.shi); b.cooldown = me.cd[0];
}

function finish(b: DemoBattle, result: NonNullable<DemoBattle['result']>): void {
  if (b.phase === 'result') return;
  b.phase = 'result'; b.result = result; b.tell = undefined;
  const weapon = weaponOf(b.request);
  const text = result === 'win'
    ? b.request.reason === 'spar'
      ? `${b.foeName}收剑退开，抱拳道：「这一阵，是你赢了。」`
      : `${b.foeName}手中${weapon.edge}垂落，踉跄退开。眼前的路让了出来。`
    : result === 'lose'
      ? b.request.reason === 'spar'
        ? '剑锋停在肩前三寸。你退开半步，认了这一阵。'
        : '你脚下一软，再也架不住来势。此时先保住性命要紧。'
    : `你拨开${weapon.edge}，借人群退走。肩头仍挨了一记，所幸脱了身。`;
  log(b, text, result === 'win' ? 'good' : 'normal');
  sync(b);
}

function checkEnd(b: DemoBattle, limit = false): boolean {
  const [me, foe] = b.combat.f;
  if (me.hp <= 0) finish(b, 'lose');
  else if (foe.hp <= 0) finish(b, 'win');
  else if (limit && b.round >= 24) {
    finish(b, me.hp / me.kit.hpMax >= foe.hp / foe.kit.hpMax ? 'win' : 'lose');
  }
  return b.phase === 'result';
}

export function createBattle(player: PlayerInput, request: BattleRequest, rng: () => number = Math.random): DemoBattle {
  const p = { ...player, attrs: { ...player.attrs } };
  const combat = createCombat(playerKit(p), foeKit(request), rng);
  combat.f[0].hp = clamp(p.hp, 0, p.hpMax);
  combat.f[0].mp = clamp(p.mp, 0, p.mpMax);
  const b: DemoBattle = {
    round: 0, playerHp: 0, playerMp: 0, playerMaxHp: p.hpMax, playerMaxMp: p.mpMax,
    foeHp: 0, foeMaxHp: combat.f[1].kit.hpMax, foeName: request.name,
    rage: 0, momentum: 50, phase: 'exchange', logs: [], cooldown: 0,
    performName: combat.f[0].kit.moves[0].name, performCost: combat.f[0].kit.moves[0].mp,
    ultName: combat.f[0].kit.ult!.name, stance: p.stance, combat, player: p, request: { ...request },
  };
  log(b, request.reason === 'spar' ? '双方抱拳，各退半步。此番切磋，点到即止。'
    : request.reason === 'arrest' ? `${request.name}横过铁尺，拦住去路。你拔剑在手，退了半步。`
      : `你横剑拦在路中。对方举起${weaponOf(request).edge}，缓缓站定。`);
  sync(b);
  checkEnd(b);
  return b;
}

/** A UI timer advances one exchange. Reading a telegraphed move pauses time. */
export function tickBattle(b: DemoBattle): void {
  if (b.phase !== 'exchange') return;
  const c = b.combat, [me, foe] = c.f;
  b.round++; c.round = b.round;
  me.mp = Math.min(me.kit.mpMax, me.mp + me.kit.mpRegen);
  me.cd = me.cd.map(cd => Math.max(0, cd - 1));
  me.rage = Math.min(100, me.rage + me.kit.passive.rage);
  const dealt = strike(c, me, foe, me.kit.basic);
  log(b, dealt ? `你使出「${me.kit.basic.name}」，剑锋逼进，伤敌 ${dealt}。` : '你递出一剑，对方侧身让过。', 'player');
  if (checkEnd(b)) return;
  if (b.round % 3 === 0) {
    b.phase = 'tell';
    b.tell = b.request.reason === 'arrest'
      ? { name: '横尺拿云', text: `${b.foeName}踏近半步，铁尺翻转，直扣你握剑的手腕。这一手拿的是关节，须以自己的长处化解。` }
      : b.request.foe === 'swordsman'
      ? { name: '雁回横江', text: `${b.foeName}剑尖微垂，忽而旋身，剑光贴着水势横卷而来。` }
      : { name: '劈浪断舟', text: `${b.foeName}沉腰踏步，双手握刀压下。这一刀来得沉，须以自己的长处化解。` };
    log(b, `${b.foeName}变招——「${b.tell.name}」！`, 'foe');
  } else {
    const taken = strike(c, foe, me, foe.kit.basic);
    log(b, taken ? `${b.foeName}还以「${foe.kit.basic.name}」，你受伤 ${taken}。` : `你移步避开，衣角掠过${weaponOf(b.request).edge}。`, 'foe');
  }
  endOfRound(me); endOfRound(foe);
  if (!checkEnd(b, b.phase === 'exchange')) sync(b);
}

/** Chances are fractions, not percentages, and are independent of tell names. */
export function responses(b: DemoBattle): BattleResponse[] {
  const p = b.player, a = p.attrs, steady = p.stance === 'steady';
  const strength = b.request.foe === 'swordsman' ? 0.045 : 0;
  const options: Array<Omit<BattleResponse, 'disabled'>> = [
    { key: 'block', label: '硬接', skill: p.power > 0 ? '养息功 · 根骨' : '养息功 · 未入门', cost: 16,
      chance: 0.4 + a.root * 0.014 + p.power * 0.025 + (steady ? 0.08 : 0) },
    { key: 'dodge', label: '闪避', skill: p.footwork > 0 ? '穿巷步 · 身法' : '本能避让 · 身法', cost: 0,
      chance: 0.3 + a.agility * 0.016 + p.footwork * 0.025 + (steady ? 0 : 0.07) },
    { key: 'parry', label: '拆招', skill: p.sword > 0 ? '渡水剑 · 悟性' : '渡水剑 · 未入门', cost: 0,
      chance: 0.3 + a.insight * 0.014 + p.sword * 0.035 + (steady ? 0.06 : 0) },
    { key: 'rush', label: '抢攻', skill: p.sword > 0 ? '渡水剑 · 胆魄' : '渡水剑 · 未入门', cost: 10,
      chance: 0.16 + a.courage * 0.016 + p.sword * 0.03 + (steady ? 0 : 0.07) },
  ];
  return options.map(o => ({ ...o, chance: clamp(o.chance - strength, 0.15, 0.9),
    disabled: b.phase !== 'tell' || b.combat.f[0].mp < o.cost
      || (o.key === 'block' && p.power <= 0)
      || ((o.key === 'parry' || o.key === 'rush') && p.sword <= 0) }));
}

export function respond(b: DemoBattle, key: ResponseKey): void {
  const option = responses(b).find(r => r.key === key);
  if (!option || option.disabled) return;
  const c = b.combat, [me, foe] = c.f;
  me.mp -= option.cost;
  const success = c.rng() < option.chance;
  const weapon = weaponOf(b.request);
  const heavy = { ...basic(b.tell?.name ?? '重招', 28, 36), sure: true };
  if (success) {
    me.shi = clamp(me.shi + 12, 5, 85);
    me.rage = Math.min(100, me.rage + 14);
    if (key === 'block') {
      const hurt = strike(c, foe, me, heavy, 0.18);
      log(b, `你沉气守住中门，${weapon.force}尽卸，只受了 ${hurt} 点擦伤。`, 'good');
      if (b.stance === 'steady') {
        const damage = strike(c, me, foe, { ...basic('留三分', 9, 13), sure: true });
        log(b, `你留着的三分剑势顺手递出，反击 ${damage}。`, 'player');
      }
    } else if (key === 'dodge') {
      log(b, `你踏出半步，让${weapon.edge}从身侧落空，毫发无伤。`, 'good');
    } else {
      const move = key === 'parry' ? basic('借势回剑', 12, 18) : basic('抢步封喉', 30, 40);
      const damage = strike(c, me, foe, { ...move, sure: true });
      log(b, key === 'parry' ? `你认准来路，拨开${weapon.edge}，借势反击 ${damage}。` : `你不退反进，在重招落下前抢中一剑，伤敌 ${damage}！`, 'good');
    }
  } else {
    me.shi = clamp(me.shi - 10, 5, 85);
    const hurt = strike(c, foe, me, heavy, key === 'rush' ? 1.25 : key === 'block' ? 0.7 : 1);
    log(b, key === 'rush'
      ? `你抢步稍迟，撞进${weapon.posture}，多受了几分力，受伤 ${hurt}。`
      : `你使出「${option.label}」，火候终究差了一分，受伤 ${hurt}。`, 'foe');
  }
  b.phase = 'exchange'; b.tell = undefined;
  if (!checkEnd(b, true)) sync(b);
}

export function perform(b: DemoBattle): void {
  if (b.phase !== 'exchange' || b.player.power <= 0 || b.player.sword <= 0) return;
  const c = b.combat, [me, foe] = c.f, move = me.kit.moves[0];
  if (me.cd[0] > 0 || me.mp < move.mp) return;
  const hp = foe.hp;
  act(c, me, foe, { kind: 'move', i: 0 });
  log(b, b.stance === 'steady'
    ? `你使「${move.name}」，伤敌 ${hp - foe.hp}，回剑护住周身。`
    : `你使「${move.name}」，两剑接连递出，伤敌 ${hp - foe.hp}。`, 'player');
  if (!checkEnd(b)) sync(b);
}

export function ultimate(b: DemoBattle): void {
  if (b.phase !== 'exchange' || b.player.sword <= 0 || b.combat.f[0].rage < 100) return;
  const c = b.combat, [me, foe] = c.f, hp = foe.hp;
  act(c, me, foe, { kind: 'ult' });
  log(b, b.player.power > 0
    ? `你吐气开声，积蓄的剑势一并送出——「${b.ultName}」！伤敌 ${hp - foe.hp}。`
    : `你咬紧牙关，将初学的两剑接连递出——「${b.ultName}」！伤敌 ${hp - foe.hp}。`, 'good');
  if (!checkEnd(b)) sync(b);
}

export function flee(b: DemoBattle): void {
  if (b.phase === 'result') return;
  const me = b.combat.f[0];
  me.hp = Math.max(1, me.hp - Math.ceil(me.kit.hpMax * 0.08));
  finish(b, 'flee');
}

/** The caller owns inventory and consumes a dose only when this returns true. */
export function takeMedicine(b: DemoBattle): boolean {
  const me = b.combat.f[0];
  if (b.phase === 'result' || me.hp >= me.kit.hpMax) return false;
  const healed = Math.min(60, me.kit.hpMax - me.hp);
  me.hp += healed;
  log(b, `你退开半步，敷上金疮药，气血恢复 ${healed}。`, 'good');
  sync(b);
  return true;
}
