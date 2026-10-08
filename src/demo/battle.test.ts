import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { createBattle, flee, perform, respond, responses, takeMedicine, tickBattle, ultimate } from './battle';
import type { BattleRequest, DemoBattle, PlayerInput, ResponseKey } from './battle';

const player = (): PlayerInput => ({
  name: '沈行舟', hp: 195, mp: 95, hpMax: 195, mpMax: 95,
  attrs: { body: 12, root: 12, agility: 12, insight: 12, courage: 12 },
  power: 1, sword: 1, footwork: 1, stance: 'steady',
});
const request: BattleRequest = { foe: 'guard', reason: 'rescue', name: '渡口护卫' };
const enterTell = (b: DemoBattle): void => {
  for (let i = 0; i < 3; i++) tickBattle(b);
  expect(b.phase).toBe('tell');
};
const chance = (b: DemoBattle, key: ResponseKey): number => responses(b).find(r => r.key === key)!.chance;

describe('自由江湖 demo：与原战斗内核共用结算', () => {
  it('体魄提高真实伤害，气血上限仍使用世界模型给出的唯一数值', () => {
    const base = createBattle(player(), request, () => 0.5);
    const p = player(); p.attrs.body += 10;
    const strong = createBattle(p, request, () => 0.5);
    tickBattle(base); tickBattle(strong);
    expect(strong.foeHp).toBeLessThan(base.foeHp);
    expect(strong.playerMaxHp).toBe(p.hpMax);
    expect(strong.playerMaxHp).toBe(base.playerMaxHp);
  });

  it('根骨提高每合回内，使用已传入的内力上限，不再重复计算', () => {
    const p = { ...player(), mp: 10 };
    const base = createBattle(p, request, () => 0.99);
    const rooted = createBattle({ ...p, attrs: { ...p.attrs, root: p.attrs.root + 8 } }, request, () => 0.99);
    tickBattle(base); tickBattle(rooted);
    expect(rooted.playerMp).toBeGreaterThan(base.playerMp);
    expect(rooted.playerMaxMp).toBe(p.mpMax);
    expect(rooted.foeHp).toBe(base.foeHp);
  });

  it('身法能在普通对拆中避开原本命中的一击', () => {
    const p = player();
    const base = createBattle(p, request, () => 0.81);
    const agile = createBattle({ ...p, attrs: { ...p.attrs, agility: p.attrs.agility + 10 } }, request, () => 0.81);
    tickBattle(base); tickBattle(agile);
    expect(base.playerHp).toBeLessThan(base.playerMaxHp);
    expect(agile.playerHp).toBe(agile.playerMaxHp);
    expect(agile.foeHp).toBe(base.foeHp);
  });

  it('悟性提高普通招式命中，胆魄提高没有命中时的蓄怒', () => {
    const p = player();
    const base = createBattle(p, request, () => 0.88);
    const insightful = createBattle({ ...p, attrs: { ...p.attrs, insight: p.attrs.insight + 10 } }, request, () => 0.88);
    tickBattle(base); tickBattle(insightful);
    expect(base.foeHp).toBe(base.foeMaxHp);
    expect(insightful.foeHp).toBeLessThan(insightful.foeMaxHp);
    const ordinary = createBattle(p, request, () => 0.99);
    const courageous = createBattle({ ...p, attrs: { ...p.attrs, courage: p.attrs.courage + 10 } }, request, () => 0.99);
    tickBattle(ordinary); tickBattle(courageous);
    expect(courageous.rage).toBeGreaterThan(ordinary.rage);
    expect(courageous.foeHp).toBe(ordinary.foeHp);
  });

  it('剑术与内功提升出手能力，轻功提升闪避，均不额外累加资源上限', () => {
    const p = player();
    const base = createBattle(p, request, () => 0.5);
    const sword = createBattle({ ...p, sword: p.sword + 1 }, request, () => 0.5);
    const inner = createBattle({ ...p, power: p.power + 2 }, request, () => 0.5);
    for (const b of [base, sword, inner]) tickBattle(b);
    expect(sword.foeHp).toBeLessThan(base.foeHp);
    expect(inner.foeHp).toBeLessThan(base.foeHp);
    expect(chance(sword, 'parry')).toBeGreaterThan(chance(base, 'parry'));
    expect(chance(inner, 'block')).toBeGreaterThan(chance(base, 'block'));
    const untrained = createBattle(p, request, () => 0.81);
    const footwork = createBattle({ ...p, footwork: p.footwork + 2 }, request, () => 0.81);
    tickBattle(untrained); tickBattle(footwork);
    expect(footwork.playerHp).toBeGreaterThan(untrained.playerHp);
    expect(chance(footwork, 'dodge')).toBeGreaterThan(chance(untrained, 'dodge'));
    for (const b of [sword, inner, footwork]) {
      expect(b.playerMaxHp).toBe(p.hpMax);
      expect(b.playerMaxMp).toBe(p.mpMax);
    }
  });

  it('应对来自根骨、身法、悟性、胆魄，不由重招名字指定答案', () => {
    const base = createBattle(player(), request);
    const pairs = [['root', 'block'], ['agility', 'dodge'], ['insight', 'parry'], ['courage', 'rush']] as const;
    for (const [attr, response] of pairs) {
      const p = player(); p.attrs[attr] += 5;
      const improved = createBattle(p, request);
      expect(chance(improved, response)).toBeGreaterThan(chance(base, response));
      for (const [, other] of pairs.filter(([, r]) => r !== response)) {
        expect(chance(improved, other)).toBe(chance(base, other));
      }
    }
    base.tell = { name: '任意招名', text: '' };
    expect(chance(base, 'parry')).toBe(chance(createBattle(player(), request), 'parry'));
  });

  it('守势增加硬接、拆招成算，流势增加闪避、抢攻成算', () => {
    const a = createBattle(player(), request);
    const b = createBattle({ ...player(), stance: 'flowing' }, request);
    expect(chance(a, 'block')).toBeGreaterThan(chance(b, 'block'));
    expect(chance(a, 'parry')).toBeGreaterThan(chance(b, 'parry'));
    expect(chance(b, 'dodge')).toBeGreaterThan(chance(a, 'dodge'));
    expect(chance(b, 'rush')).toBeGreaterThan(chance(a, 'rush'));
  });

  it('每三合出现重招，等待期间停止自动对拆，回应之后恢复', () => {
    const b = createBattle(player(), request, () => 0.5);
    enterTell(b);
    const before = [b.round, b.playerHp, b.foeHp, b.playerMp];
    tickBattle(b); perform(b); ultimate(b);
    expect([b.round, b.playerHp, b.foeHp, b.playerMp]).toEqual(before);
    respond(b, 'dodge');
    expect(b.phase).toBe('exchange');
    expect(b.tell).toBeUndefined();
    tickBattle(b);
    expect(b.round).toBe(4);
  });

  it('绝招耗内力且必须调息，不能连续点击绕过冷却', () => {
    const b = createBattle(player(), request, () => 0.5);
    perform(b);
    expect(b.playerMp).toBe(75);
    expect(b.cooldown).toBe(4);
    const hp = b.foeHp;
    perform(b);
    expect(b.foeHp).toBe(hp);
    expect(b.playerMp).toBe(75);
    tickBattle(b);
    expect(b.cooldown).toBe(3);
  });

  it('内力不足时不能硬接、抢攻或出绝招，免费应对仍可使用', () => {
    const b = createBattle({ ...player(), mp: 0 }, request, () => 0.5);
    perform(b);
    expect(b.cooldown).toBe(0);
    enterTell(b);
    const options = responses(b);
    expect(options.find(r => r.key === 'block')!.disabled).toBe(true);
    expect(options.find(r => r.key === 'rush')!.disabled).toBe(true);
    expect(options.find(r => r.key === 'dodge')!.disabled).toBe(false);
    const mp = b.playerMp;
    respond(b, 'block');
    expect(b.playerMp).toBe(mp);
    expect(b.phase).toBe('tell');
    respond(b, 'parry');
    expect(b.playerMp).toBeGreaterThanOrEqual(0);
  });

  it('刚学剑而未习内功、轻功时，可用本能闪避与基础拆招打完切磋', () => {
    const novice = { ...player(), power: 0, footwork: 0, mp: 0, mpMax: 0 };
    const b = createBattle(novice, { foe: 'swordsman', reason: 'spar', name: '顾行舟' }, mulberry32(707));
    expect(b.combat.f[0].kit.mpRegen).toBe(0);
    expect(b.combat.f[0].kit.passive.guard).toBe(0);
    expect(b.ultName).toBe('连环进剑');
    const initialFoeHp = b.foeHp;
    perform(b);
    expect(b.foeHp).toBe(initialFoeHp);
    expect(b.cooldown).toBe(0);
    enterTell(b);
    const options = responses(b);
    expect(options.find(r => r.key === 'block')).toMatchObject({ disabled: true, skill: '养息功 · 未入门' });
    expect(options.find(r => r.key === 'rush')!.disabled).toBe(true);
    expect(options.find(r => r.key === 'dodge')).toMatchObject({ disabled: false, cost: 0, skill: '本能避让 · 身法' });
    expect(options.find(r => r.key === 'parry')).toMatchObject({ disabled: false, cost: 0 });
    for (let i = 0; i < 80 && b.phase !== 'result'; i++) {
      if (b.phase === 'tell') respond(b, 'parry');
      else { ultimate(b); tickBattle(b); }
      expect(b.playerMp).toBe(0);
      for (const n of [b.playerHp, b.foeHp, b.rage, b.momentum, b.cooldown]) expect(Number.isFinite(n)).toBe(true);
    }
    expect(b.phase).toBe('result');
    expect(b.round).toBeLessThanOrEqual(24);
    expect(b.foeHp).toBeLessThan(b.foeMaxHp);
    expect(b.logs.some(line => line.text.includes('一剑横江'))).toBe(false);
  });

  it('入门连招只靠积蓄剑势；学到内功后保留原来的绝招、回内与应对节奏', () => {
    const b = createBattle({ ...player(), power: 0, footwork: 0, mp: 0, mpMax: 0 }, request, () => 0.5);
    const foeHp = b.foeHp;
    b.combat.f[0].rage = 100;
    ultimate(b);
    expect(b.foeHp).toBeLessThan(foeHp);
    expect(b.rage).toBe(0);
    expect(b.playerMp).toBe(0);
    expect(b.combat.f[1].shi).toBe(50);
    expect(b.logs.at(-1)!.text).toContain('初学的两剑');
    const learned = createBattle(player(), request, () => 0.5);
    expect(learned.ultName).toBe('一剑横江');
    expect(learned.combat.f[0].kit.mpRegen).toBe(2);
    perform(learned);
    expect(learned.playerMp).toBe(75);
    expect(learned.cooldown).toBe(4);
    enterTell(learned);
    expect(responses(learned).every(r => !r.disabled)).toBe(true);
    expect(responses(learned).find(r => r.key === 'dodge')!.skill).toBe('穿巷步 · 身法');
  });

  it('结局锁定后，全部操作无效，也不能消耗药物', () => {
    const b = createBattle(player(), request, () => 0.5);
    enterTell(b);
    flee(b);
    const snapshot = JSON.stringify(b);
    tickBattle(b); respond(b, 'rush'); perform(b); ultimate(b); flee(b);
    expect(takeMedicine(b)).toBe(false);
    expect(JSON.stringify(b)).toBe(snapshot);
    expect(b.result).toBe('flee');
    expect(b.playerHp).toBeGreaterThan(0);
  });

  it('满血不耗药，治疗不超过上限', () => {
    const b = createBattle(player(), request, () => 0.5);
    expect(takeMedicine(b)).toBe(false);
    tickBattle(b);
    expect(b.playerHp).toBeLessThan(b.playerMaxHp);
    expect(takeMedicine(b)).toBe(true);
    expect(b.playerHp).toBe(b.playerMaxHp);
    const wounded = createBattle({ ...player(), hp: 70 }, request);
    expect(takeMedicine(wounded)).toBe(true);
    expect(wounded.playerHp).toBe(130);
  });

  it('正气血不足一点时仍显示一点，真正归零才判败', () => {
    const b = createBattle({ ...player(), hp: 0.2 }, request, () => 0.5);
    expect(b.playerHp).toBe(1);
    expect(b.phase).toBe('exchange');
    tickBattle(b);
    expect(b.playerHp).toBe(0);
    expect(b.result).toBe('lose');
  });

  it('相同种子与操作产生相同结果，整场战斗可复现', () => {
    const play = (): DemoBattle => {
      const b = createBattle(player(), request, mulberry32(701));
      for (let i = 0; i < 80 && b.phase !== 'result'; i++) {
        if (b.phase === 'tell') respond(b, 'parry');
        else { perform(b); ultimate(b); tickBattle(b); }
      }
      return b;
    };
    const a = play(), b = play();
    expect(a.phase).toBe('result');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.round).toBeLessThanOrEqual(24);
  });

  it('怒气不足不触发杀招，满怒只能使用一次', () => {
    const b = createBattle(player(), request, () => 0.5);
    const hp = b.foeHp;
    ultimate(b);
    expect(b.foeHp).toBe(hp);
    b.combat.f[0].rage = 100;
    ultimate(b);
    expect(b.foeHp).toBeLessThan(hp);
    expect(b.rage).toBe(0);
    const remaining = b.foeHp;
    ultimate(b);
    expect(b.foeHp).toBe(remaining);
  });

  it('应对几率有上下限，输入角色不会被战斗修改', () => {
    const p = player(), snapshot = JSON.stringify(p);
    const b = createBattle(p, request, () => 0.5);
    perform(b); tickBattle(b);
    expect(JSON.stringify(p)).toBe(snapshot);
    const strong = player();
    strong.attrs = { body: 1000, root: 1000, agility: 1000, insight: 1000, courage: 1000 };
    for (const r of responses(createBattle(strong, request))) expect(r.chance).toBe(0.9);
  });
});
