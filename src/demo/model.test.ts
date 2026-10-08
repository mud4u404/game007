import { describe, expect, it } from 'vitest';
import {
  act, actionsFor, createDemo, derived, MAX_SKILL_LEVEL, npcsAt, settleBattle, train, trainingOffer, travel,
  ORIGINS, type DemoState, type OriginId,
} from './model';

const clone = (s: DemoState) => JSON.parse(JSON.stringify(s)) as DemoState;
// Existing level-one saves and learned characters still use the same world rules.
function trained(origin: OriginId = 'porter') {
  const s = createDemo(origin);
  s.power = 1; s.sword = 1; s.footwork = 1; s.experience = 12;
  s.inventory.old_sword = 1; s.hp = derived(s).hpMax; s.mp = derived(s).mpMax;
  return s;
}
function uncover(s: DemoState) {
  travel(s, 'street'); act(s, 'inspect-ledger');
  travel(s, 'tea'); act(s, 'ask-witness');
}

describe('自由江湖：从未入门的普通人开始', () => {
  it.each(ORIGINS.map(o => o.id))('%s 只有生活根基，不凭出身获得武功或内力', (origin) => {
    const s = createDemo(origin);
    expect(Object.values(s.attrs).reduce((a, b) => a + b, 0)).toBe(64);
    expect([s.power, s.sword, s.footwork, s.experience, s.mp, derived(s).mpMax]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(s.inventory).toEqual({ medicine: 1, cloth_bundle: 1 });
    expect(s.hp).toBe(derived(s).hpMax);
    expect(act(s, 'rescue-fight').text).toContain('尚未学过剑术');
    expect(act(s, 'rescue-sneak').text).toContain('尚未学过轻功');
    expect(s.pendingBattle).toBeUndefined();
  });

  it('观摩和请教均须当面，历练再多也不能由静修学出不存在的功夫', () => {
    const s = createDemo('apprentice'); s.experience = 1000;
    const outside = clone(s); act(s, 'learn-sword'); expect(s).toEqual(outside);
    travel(s, 'yard');
    expect(act(s, 'spar').text).toContain('还没学过');
    for (const kind of ['sword', 'inner', 'footwork'] as const) {
      const before = clone(s);
      expect(train(s, kind).text).toContain('入门练法');
      expect(act(s, `learn-${kind}`).text).toContain('先看一遍');
      expect(s).toEqual(before);
    }
    s.minute = 20 * 60; const night = clone(s);
    act(s, 'observe-sword'); act(s, 'learn-sword'); expect(s).toEqual(night);
  });

  it('亲眼观摩后逐门请教，第一招给木剑，内功只在学会时生出内力', () => {
    const s = createDemo('scholar'); travel(s, 'yard');
    const seenAt = s.minute; act(s, 'observe-sword');
    expect(s.minute).toBe(seenAt + 20); expect(s.flags.observedSword).toBe(true);
    expect([s.sword, s.power, s.footwork]).toEqual([0, 0, 0]);
    const before = clone(s);
    act(s, 'learn-sword');
    expect(s.sword).toBe(1); expect(s.inventory.practice_sword).toBe(1);
    expect(s.inventory.old_sword).toBeUndefined();
    expect(s.mp).toBe(0); expect(derived(s).mpMax).toBe(0);
    const learned = clone(s); act(s, 'learn-sword'); expect(s).toEqual(learned);
    act(s, 'learn-inner');
    expect(s.power).toBe(1); expect(s.mp).toBe(30); expect(derived(s).mpMax).toBeGreaterThan(30);
    expect(s.hp).toBe(before.hp);
    act(s, 'learn-footwork');
    expect(s.footwork).toBe(1); expect(derived(s).travelFactor).toBeLessThan(derived(before).travelFactor);
    expect(s.minute).toBe(before.minute + 45); expect(s.stamina).toBe(before.stamina - 30);
    expect(s.silver).toBe(before.silver); expect(s.experience).toBe(before.experience);
    expect(actionsFor(s).find(a => a.id === 'spar')?.disabled).toBeUndefined();
  });

  it('缺钱缺历练仍能从休息、观摩走到入门，不把习武变成强制营生门槛', () => {
    const s = createDemo('porter'); s.silver = 0; s.experience = 0; s.hp = 1; s.stamina = 0;
    travel(s, 'yard'); act(s, 'observe-sword');
    const exhausted = clone(s); act(s, 'learn-sword'); expect(s).toEqual(exhausted);
    act(s, 'free-rest'); expect(s.mp).toBe(0);
    s.experience = 0;
    for (const id of ['learn-sword', 'learn-inner', 'learn-footwork']) act(s, id);
    expect([s.sword, s.power, s.footwork]).toEqual([1, 1, 1]);
    expect(s.silver).toBe(0); expect(s.experience).toBe(0); expect(s.stamina).toBe(10);
    expect(s.hp).toBeGreaterThan(1);
  });

  it('只学剑术也能试招，但尚无内功时休息不会虚增内力', () => {
    const s = createDemo('courier'); travel(s, 'yard'); act(s, 'observe-sword'); act(s, 'learn-sword');
    act(s, 'free-rest'); expect(s.mp).toBe(0);
    const request = act(s, 'spar').battle!; expect(request).toBeDefined();
    settleBattle(s, request, 'lose', 0, 50);
    expect(s.hp).toBeGreaterThan(0); expect(s.mp).toBe(0); expect(s.power).toBe(0);
  });

  it('没有武功被拦查也能离开，不能凭空拔剑', () => {
    const s = createDemo('porter'); s.heat = 35; s.silver = 0;
    travel(s, 'street');
    expect(act(s, 'arrest-fight').text).toContain('还不会剑术');
    expect(s.pendingBattle).toBeUndefined();
    act(s, 'submit-check'); expect(s.stopped).toBe(false); expect(s.heat).toBe(0);
    expect(s.sword).toBe(0);
  });
});

describe('自由江湖：同一风波可以用不同本领和资源处理', () => {
  it('悟性改变查账时间，证据线能在不花钱、不战斗的情况下放人', () => {
    const scholar = createDemo('scholar'); const porter = createDemo('porter');
    for (const s of [scholar, porter]) travel(s, 'street');
    const scholarBefore = scholar.minute; const porterBefore = porter.minute;
    act(scholar, 'inspect-ledger'); act(porter, 'inspect-ledger');
    expect(scholar.minute - scholarBefore).toBe(10);
    expect(porter.minute - porterBefore).toBe(35);
    travel(scholar, 'tea'); act(scholar, 'ask-witness'); travel(scholar, 'dock');
    act(scholar, 'rescue-evidence');
    expect(scholar.caseStatus).toBe('released');
    expect(scholar.caseMethod).toBe('evidence');
    expect(scholar.silver).toBe(28);
    expect(scholar.heat).toBe(0);
    expect(scholar.relations.constable).toBeGreaterThan(0);
  });

  it('无证据不能直接说服，调用底层接口也不能越过条件或扣错资源', () => {
    const s = createDemo('porter'); const before = clone(s);
    expect(act(s, 'rescue-evidence').text).toContain('需要');
    expect(s).toEqual(before);
    expect(act(s, 'rescue-money').text).toContain('还缺');
    expect(s).toEqual(before);
  });

  it('可以靠本事谋生再花钱担保，奖励只结算一次', () => {
    const s = createDemo('porter');
    act(s, 'work-cargo');
    expect(s.silver).toBe(70);
    act(s, 'rescue-money');
    expect(s.silver).toBe(10);
    expect(s.caseStatus).toBe('released');
    const before = clone(s);
    act(s, 'rescue-money');
    expect(s).toEqual(before);
    travel(s, 'tea'); act(s, 'xu-gift');
    const medicines = s.inventory.medicine;
    act(s, 'xu-gift');
    expect(s.inventory.medicine).toBe(medicines);
  });

  it('轻功脱身有成功且无人认出、被认出、失手三种可继续的结果', () => {
    const unseen = trained('courier');
    act(unseen, 'rescue-sneak', () => 0);
    expect(unseen.caseStatus).toBe('released');
    expect(unseen.heat).toBe(0);
    expect(unseen.renown).toBe(1);
    const seen = trained('courier'); let rolls = 0;
    act(seen, 'rescue-sneak', () => rolls++ === 0 ? 0 : .99);
    expect(seen.caseStatus).toBe('released');
    expect(seen.flags.rescueWitnessed).toBe(true);
    expect(seen.heat).toBe(24);
    const failed = trained('porter');
    act(failed, 'rescue-sneak', () => .99);
    expect(failed.caseStatus).toBe('held');
    expect(failed.heat).toBe(16);
    uncover(failed); travel(failed, failed.caseStatus === 'moved' ? 'yamen' : 'dock');
    act(failed, 'rescue-evidence');
    expect(failed.caseStatus).toBe('released');
  });

  it('到了午时人被移交，但线索与解法仍有效', () => {
    const s = createDemo('scholar'); uncover(s);
    while (s.minute < 720) act(s, 'wait');
    expect(s.caseStatus).toBe('moved');
    expect(s.log.some(e => e.text.includes('午时一到'))).toBe(true);
    expect(s.log.some(e => e.text.includes('押往镇公所'))).toBe(true);
    travel(s, 'dock'); expect(npcsAt(s).some(n => n.id === 'xu')).toBe(false);
    const before = clone(s); act(s, 'rescue-evidence'); expect(s).toEqual(before);
    travel(s, 'yamen'); expect(npcsAt(s).some(n => n.id === 'xu')).toBe(true);
    act(s, 'rescue-evidence'); expect(s.caseStatus).toBe('released');
    expect(s.log.filter(e => e.text.includes('押往镇公所'))).toHaveLength(1);
  });
});

describe('自由江湖：钱、时间、体力和物品守恒', () => {
  it('出生根基改变生计收入、内力与赶路，而不是只有面板不同', () => {
    const porter = createDemo('porter'); const courier = createDemo('courier'); const scholar = createDemo('scholar');
    for (const s of [porter, courier, scholar]) act(s, 'work-cargo');
    expect(porter.silver).toBeGreaterThan(courier.silver);
    expect(derived(scholar).mpMax).toBe(0); expect(derived(porter).mpMax).toBe(0);
    scholar.power = 1; porter.power = 1;
    expect(derived(scholar).mpMax).toBeGreaterThan(derived(porter).mpMax);
    const pStart = porter.minute; const cStart = courier.minute;
    travel(porter, 'yamen'); travel(courier, 'yamen');
    expect(courier.minute - cStart).toBeLessThan(porter.minute - pStart);
  });

  it('没钱、没精力、身受重伤仍可免费恢复并重新谋生', () => {
    const s = createDemo('porter'); s.silver = 0; s.stamina = 0; s.hp = 1; s.mp = 0;
    const before = clone(s); act(s, 'work-cargo'); expect(s).toEqual(before);
    act(s, 'free-rest');
    expect(s.stamina).toBe(40); expect(s.hp).toBe(36); expect(s.mp).toBe(0);
    expect(s.silver).toBe(0); expect(s.minute).toBe(660);
    act(s, 'work-cargo'); expect(s.silver).toBeGreaterThan(0);
    expect(s.stamina).toBeGreaterThanOrEqual(0);
  });

  it('关门后不能隔空买药或接活；越地点动作也不能执行', () => {
    const s = createDemo('porter');
    const before = clone(s); act(s, 'buy-medicine'); expect(s).toEqual(before);
    travel(s, 'street'); s.minute = 21 * 60;
    expect(npcsAt(s).some(n => n.id === 'merchant')).toBe(false);
    const closed = clone(s); act(s, 'buy-medicine'); expect(s).toEqual(closed);
    act(s, 'work-copy'); expect(s).toEqual(closed);
  });

  it('药不能负库存，恢复不能超过上限，等待不凭空给收益', () => {
    const s = createDemo('porter');
    expect(s.inventory.cloth_bundle).toBe(1);
    expect(s.inventory.old_sword).toBeUndefined();
    const full = clone(s); act(s, 'use-medicine'); expect(s).toEqual(full);
    expect(s.inventory.medicine).toBe(1);
    s.hp -= 10;
    act(s, 'use-medicine'); expect(s.hp).toBe(derived(s).hpMax);
    const before = clone(s); act(s, 'use-medicine'); expect(s).toEqual(before);
    expect(s.inventory.medicine).toBe(0);
    act(s, 'wait'); expect(s.experience).toBe(before.experience); expect(s.silver).toBe(before.silver);
  });

  it('拿走财物造成见证与追缉，归还后不能重新刷同一个钱袋', () => {
    const s = createDemo('porter'); travel(s, 'street');
    act(s, 'take-purse', () => .99);
    expect(s.silver).toBe(63); expect(s.heat).toBe(30);
    expect(s.relations.merchant).toBe(-3);
    const stolen = clone(s); act(s, 'take-purse'); expect(s).toEqual(stolen);
    act(s, 'work-copy'); expect(s).toEqual(stolen);
    act(s, 'return-purse'); expect(s.silver).toBe(28); expect(s.heat).toBe(0);
    const returned = clone(s); act(s, 'take-purse'); expect(s).toEqual(returned);
    act(s, 'work-copy'); expect(s.silver).toBeGreaterThan(28);
  });

  it('已经交罚金后再还钱，不能抵消后来另一件事的追缉', () => {
    const s = createDemo('porter'); s.silver = 200; travel(s, 'street');
    act(s, 'take-purse', () => .99); travel(s, 'yamen'); act(s, 'settle-fine');
    expect(s.heat).toBe(0); expect(s.theftHeat).toBe(0);
    travel(s, 'street'); s.heat = 35; act(s, 'return-purse');
    expect(s.heat).toBe(35);
  });
});

describe('自由江湖：巡街拦查有后果也有出路', () => {
  it('经过长街也会被拦，不能用地图、练功或营生跳过查问', () => {
    const s = createDemo('porter'); s.heat = 40; s.hp = 30;
    travel(s, 'inn');
    expect(s.place).toBe('street'); expect(s.stopped).toBe(true);
    expect(npcsAt(s).some(n => n.id === 'constable')).toBe(true);
    expect(actionsFor(s).map(a => a.id)).toEqual(expect.arrayContaining(['settle-fine', 'submit-check', 'arrest-fight', 'use-medicine']));
    const before = clone(s);
    travel(s, 'tea'); act(s, 'work-copy'); act(s, 'free-rest'); act(s, 'wait'); train(s, 'inner');
    expect(s).toEqual(before);
    act(s, 'use-medicine'); expect(s.hp).toBe(90); expect(s.stopped).toBe(true);
    act(s, 'talk:constable'); expect(s.minute).toBeGreaterThan(before.minute); expect(s.stopped).toBe(true);
  });

  it('没钱、没精力且重伤仍能接受查问获释，人情与旧账不会被抹掉', () => {
    const s = trained('porter'); act(s, 'wait'); travel(s, 'street'); act(s, 'take-purse', () => .99);
    travel(s, 'dock'); act(s, 'rescue-sneak', () => .99);
    expect(s.heat).toBe(46);
    travel(s, 'street'); expect(s.stopped).toBe(true);
    s.silver = 0; s.stamina = 0; s.hp = 1; s.inventory.medicine = 0;
    expect(actionsFor(s).find(a => a.id === 'settle-fine')!.disabled).toBeTruthy();
    expect(actionsFor(s).find(a => a.id === 'arrest-fight')!.disabled).toBeTruthy();
    expect(actionsFor(s).find(a => a.id === 'submit-check')!.disabled).toBeUndefined();
    const beforeMinute = s.minute; act(s, 'submit-check');
    expect(s.minute).toBe(beforeMinute + 120); expect(s.place).toBe('yamen');
    expect(s.stopped).toBe(false); expect(s.heat).toBe(0); expect(s.theftHeat).toBe(0);
    expect(s.silver).toBe(0); expect(s.hp).toBe(1); expect(s.relations.merchant).toBe(-3);
    expect(s.flags.purseTaken).toBe(true); expect(s.caseStatus).toBe('moved');
    act(s, 'free-rest'); expect(s.hp).toBeGreaterThan(1); expect(s.stamina).toBeGreaterThan(0);
    travel(s, 'street'); expect(s.stopped).toBe(false);
  });

  it('交罚金可以马上继续赶路，但再犯仍会重新被拦', () => {
    const s = trained('porter'); s.silver = 200; s.heat = 35;
    travel(s, 'street'); expect(s.stopped).toBe(true);
    act(s, 'settle-fine'); expect(s.silver).toBe(145); expect(s.stopped).toBe(false); expect(s.heat).toBe(0);
    travel(s, 'dock'); const request = act(s, 'rescue-fight').battle!;
    settleBattle(s, request, 'win', 100, 50);
    travel(s, 'street'); expect(s.stopped).toBe(true);
  });

  it.each(['win', 'lose', 'flee'] as const)('闯关%s都结束当前拦查，并保留更重的后果', (result) => {
    const s = trained('porter'); s.heat = 35;
    travel(s, 'street'); const request = act(s, 'arrest-fight').battle!;
    expect(request.reason).toBe('arrest');
    settleBattle(s, request, result, result === 'lose' ? 0 : 100, 20);
    expect(s.stopped).toBe(false); expect(s.heat).toBeGreaterThan(35);
    expect(s.hp).toBeGreaterThan(0); expect(s.silver).toBeGreaterThanOrEqual(0);
    travel(s, 'tea'); expect(s.place).toBe('tea');
    travel(s, 'street'); expect(s.stopped).toBe(true);
  });
});

describe('自由江湖：个人功力与战斗结算', () => {
  it('剑术与轻功不会叠加永久气血，内功成长只归一份个人根基', () => {
    const s = trained('scholar'); travel(s, 'yard'); s.experience = 100;
    const start = derived(s);
    train(s, 'sword'); expect(derived(s).hpMax).toBe(start.hpMax); expect(s.sword).toBe(2);
    train(s, 'footwork'); expect(derived(s).hpMax).toBe(start.hpMax); expect(s.footwork).toBe(2); expect(derived(s).travelFactor).toBeLessThan(start.travelFactor);
    train(s, 'inner'); expect(derived(s).hpMax).toBe(start.hpMax + 12); expect(s.power).toBe(2);
    expect(s.hp).toBe(start.hpMax);
  });

  it('修炼须消耗历练，地点不对、历练不足或练到当前尽头不会扣资源', () => {
    const s = trained('porter'); const street = clone(s);
    train(s, 'sword'); expect(s).toEqual(street);
    travel(s, 'yard'); s.experience = 0; const noXp = clone(s);
    train(s, 'inner'); expect(s).toEqual(noXp);
    s.experience = 1000; s.power = MAX_SKILL_LEVEL; const capped = clone(s);
    train(s, 'inner'); expect(s).toEqual(capped);
  });

  it('训练报价与实际消耗一致，禁用理由直接由执行方使用', () => {
    for (const origin of ['porter', 'courier', 'scholar'] as const) {
      for (const kind of ['sword', 'inner', 'footwork'] as const) {
        const s = trained(origin);
        const blocked = trainingOffer(s, kind);
        expect(blocked.disabled).toBeTruthy(); expect(train(s, kind).text).toBe(blocked.disabled);
        travel(s, 'yard');
        const offer = trainingOffer(s, kind); const before = clone(s);
        expect(offer.disabled).toBeUndefined(); expect(offer.cost).toBe(12);
        train(s, kind);
        expect(s.experience).toBe(before.experience - offer.cost);
        expect(s.stamina).toBe(before.stamina - 15);
        expect(s.minute).toBe(before.minute + offer.minutes);
        const noExperience = trainingOffer(s, kind);
        expect(noExperience.disabled).toContain('历练');
        expect(train(s, kind).text).toBe(noExperience.disabled);
      }
    }
  });

  it('战斗必须从世界内发起，战中不能在别处挣钱或移动', () => {
    const s = trained('porter');
    const fabricated = { foe: 'guard' as const, reason: 'rescue' as const, name: '卫衡' };
    settleBattle(s, fabricated, 'win', 100, 50); expect(s.caseStatus).toBe('held');
    const request = act(s, 'rescue-fight').battle!; expect(request).toBeDefined();
    const pending = clone(s);
    act(s, 'work-cargo'); travel(s, 'tea'); train(s, 'sword'); expect(s).toEqual(pending);
    settleBattle(s, request, 'win', 100, 50);
    expect(s.caseStatus).toBe('released'); expect(s.heat).toBe(35); expect(s.pendingBattle).toBeUndefined();
    const completed = clone(s); settleBattle(s, request, 'win', 100, 50); expect(s).toEqual(completed);
  });

  it('战败可以继续尝试其他解法，切磋每日只有有限历练', () => {
    const s = trained('porter');
    const rescue = act(s, 'rescue-fight').battle!; settleBattle(s, rescue, 'lose', 0, 0);
    expect(s.caseStatus).toBe('held'); expect(s.hp).toBeGreaterThan(0); expect(s.silver).toBeGreaterThanOrEqual(0);
    travel(s, 'yard');
    const before = s.experience;
    for (let i = 0; i < 3; i++) {
      const request = act(s, 'spar').battle!; expect(request).toBeDefined();
      settleBattle(s, request, 'win', 100, 50);
    }
    expect(s.experience - before).toBe(20);
  });

  it('所有公开的 disabled 都由模型执行相同校验', () => {
    const s = createDemo('courier'); s.silver = 0; s.stamina = 0;
    for (const to of ['dock', 'street', 'tea', 'yard', 'inn', 'yamen'] as const) {
      travel(s, to);
      const choices = [...actionsFor(s), ...npcsAt(s).flatMap(n => actionsFor(s, n.id))];
      for (const choice of choices.filter(a => a.disabled)) {
        const before = clone(s); expect(act(s, choice.id).text).toBe(choice.disabled); expect(s).toEqual(before);
      }
    }
  });
});
