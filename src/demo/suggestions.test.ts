import { describe, expect, it } from 'vitest';
import { act, actionsFor, createDemo, derived, npcsAt, ORIGINS, PLACES, travel, type DemoState, type PlaceId } from './model';
import { availableActions, smartSuggestions, travelMinutes } from './suggestions';

const choices = (s: DemoState) => smartSuggestions(s).map(a => a.ui);

describe('随境提示：只整理当前选择，不替人过江湖', () => {
  it.each(ORIGINS.map(o => o.id))('%s 的无武功开局仍有谋生、查事与习武的自由选择', origin => {
    const s = createDemo(origin);
    const recommendations = smartSuggestions(s);
    expect(recommendations).toHaveLength(3);
    expect(choices(s)).toContain('travel:yard');
    expect(choices(s)).toContain('travel:street');
    expect(choices(s)).not.toContain('action:spar');
    expect(recommendations.some(a => /谋生|气力|体魄|抄写|送信|活计/.test(a.reason + a.title))).toBe(true);
    expect(recommendations.find(a => a.ui === 'travel:street')?.reason).toContain('先找线索');
  });

  it('在武场只提示下一门未学的功夫，观摩与每次入门都有事前代价', () => {
    const s = createDemo('apprentice'); travel(s, 'yard');
    for (const id of ['observe-sword', 'learn-sword', 'learn-inner', 'learn-footwork']) {
      const lesson = smartSuggestions(s).find(a => a.ui === `action:${id}`);
      expect(lesson).toBeDefined();
      expect(lesson!.cost).toBe(availableActions(s).find(a => a.id === id)!.cost);
      expect(smartSuggestions(s).filter(a => /action:(observe|learn)-/.test(a.ui))).toHaveLength(1);
      act(s, id);
      expect(choices(s)).not.toContain(`action:${id}`);
    }
    expect(choices(s)).toContain('action:spar');
  });

  it('身无分文、气血精力为零又被拦查，仍给出不会卡死的离开办法', () => {
    const s = createDemo('porter'); s.place = 'street'; s.stopped = true;
    s.silver = 0; s.hp = 0; s.stamina = 0; s.heat = 80;
    const offered = smartSuggestions(s);
    expect(offered[0].ui).toBe('action:submit-check');
    expect(offered[0].cost).toContain('两小时');
    expect(offered[0].cost).toContain('0 文');
    expect(offered.map(a => a.ui)).not.toContain('action:free-rest');
    expect(offered.some(a => a.ui.startsWith('travel:'))).toBe(false);
    const before = s.minute; act(s, offered[0].ui.slice(7));
    expect(s.minute - before).toBe(120);
    expect(s.stopped).toBe(false);
    expect(s.heat).toBe(0);
    expect(choices(s)[0]).toBe('action:use-medicine');
  });

  it('有足够罚钱时先显示确切数额，也保留耗时查问的选择', () => {
    const s = createDemo('porter'); s.place = 'street'; s.stopped = true; s.heat = 35; s.silver = 55;
    const offered = smartSuggestions(s);
    expect(offered[0].ui).toBe('action:settle-fine');
    expect(offered[0].cost).toBe('半小时 · 55 文');
    expect(offered.map(a => a.ui)).toContain('action:submit-check');
    expect(offered.some(a => /fight|purse|sneak/.test(a.ui))).toBe(false);
    act(s, 'settle-fine'); expect(s.silver).toBe(0); expect(s.stopped).toBe(false);
  });

  it('先照顾重伤，有药敷药，无药无钱也能休息', () => {
    const s = createDemo('scholar'); s.hp = Math.floor(derived(s).hpMax * .44);
    expect(choices(s)[0]).toBe('action:use-medicine');
    s.inventory.medicine = 0; s.silver = 0;
    expect(choices(s)[0]).toBe('action:free-rest');
    expect(smartSuggestions(s)[0].cost).toBe('两小时 · 免费');
  });

  it('精力不足时按当地财力提供吃面或免费休息，不推荐做不了的活', () => {
    const s = createDemo('porter'); s.stamina = 21;
    expect(choices(s)[0]).toBe('action:free-rest');
    expect(choices(s)).not.toContain('action:work-cargo');
    s.place = 'tea'; s.stamina = 0;
    expect(choices(s)[0]).toBe('action:eat');
    expect(smartSuggestions(s)[0].cost).toBe('二十分钟 · 10 文');
    s.silver = 0;
    expect(choices(s)[0]).toBe('action:free-rest');
  });

  it('两份证据齐全时就地提出，不把已经查过的线索再推给玩家', () => {
    const s = createDemo('scholar'); s.flags.ledger = true; s.flags.witness = true;
    expect(choices(s)[0]).toBe('action:rescue-evidence');
    expect(smartSuggestions(s)[0].cost).toBe('一刻钟 · 两份线索');
    s.place = 'tea';
    expect(choices(s)[0]).toBe('travel:dock');
    s.caseStatus = 'moved';
    expect(choices(s)[0]).toBe('travel:yamen');
    s.place = 'yamen';
    expect(choices(s)[0]).toBe('action:rescue-evidence');
  });

  it('赶路会跨过午时便提示去公所，不会把人领到已经空了的渡口', () => {
    const s = createDemo('porter'); s.place = 'yard'; s.minute = 719;
    s.flags.ledger = true; s.flags.witness = true;
    const offered = smartSuggestions(s)[0];
    expect(offered.ui).toBe('travel:yamen');
    const before = s.minute; travel(s, 'yamen');
    expect(s.caseStatus).toBe('moved');
    expect(offered.cost).toBe(`${s.minute - before} 分钟 · 仅赶路`);
    expect(choices(s)[0]).toBe('action:rescue-evidence');
  });

  it('钱足了才给现场担保，事先写清六十文，不伪装成免费对话', () => {
    const s = createDemo('courier'); s.silver = 59;
    expect(choices(s)).not.toContain('action:rescue-money');
    s.silver = 60;
    const offered = smartSuggestions(s).find(a => a.ui === 'action:rescue-money');
    expect(offered?.cost).toBe('十分钟 · 60 文');
    expect(offered?.reason).toContain('欠薪的事仍待查清');
    act(s, 'rescue-money');
    expect(s.silver).toBe(0);
    expect(choices(s).some(ui => ui.includes('rescue'))).toBe(false);
  });

  it('事情了结后保留生活与人情，不重复催玩家救人或查账', () => {
    const s = createDemo('scholar'); s.caseStatus = 'released'; s.place = 'tea';
    expect(choices(s)[0]).toBe('action:xu-gift');
    expect(smartSuggestions(s)[0].cost).toContain('两分钟');
    act(s, 'xu-gift');
    expect(choices(s)).not.toContain('action:xu-gift');
    expect(choices(s).some(ui => /rescue|inspect-ledger|ask-witness/.test(ui))).toBe(false);
    s.place = 'street';
    expect(choices(s)[0]).toBe('action:work-copy');
    const offered = smartSuggestions(s)[0]; const minute = s.minute; const stamina = s.stamina;
    act(s, 'work-copy');
    expect(offered.cost).toBe('四十分钟 · 12 精力');
    expect(s.minute - minute).toBe(40); expect(stamina - s.stamina).toBe(12);
  });

  it('顾行舟与商人离开后不推荐当面动作，也不推荐赶到时已关门的目的地', () => {
    const s = createDemo('porter'); s.place = 'yard'; s.minute = 20 * 60;
    expect(choices(s).some(ui => /observe|learn|spar/.test(ui))).toBe(false);
    s.place = 'street';
    expect(choices(s).some(ui => /inspect-ledger|work-copy|work-courier/.test(ui))).toBe(false);
    s.place = 'dock'; s.minute = 19 * 60 + 55;
    expect(choices(s)).not.toContain('travel:street');
    expect(choices(s)).not.toContain('travel:yard');
    expect(choices(s)).toContain('travel:inn');
  });

  it('正交手时没有世界行动建议，被拦查时也不给赶路捷径', () => {
    const s = createDemo('porter');
    s.pendingBattle = { foe: 'swordsman', reason: 'spar', name: '顾行舟' };
    expect(smartSuggestions(s)).toEqual([]);
    expect(availableActions(s)).toEqual([]);
    expect(travelMinutes(s, 'yard')).toBeNull();
    delete s.pendingBattle; s.stopped = true;
    expect(travelMinutes(s, 'yard')).toBeNull();
    expect(choices(s).some(ui => ui.startsWith('travel:'))).toBe(false);
  });

  it('汇总 NPC 专属动作并去重，只有眼下可以执行的动作才进入候选', () => {
    const s = createDemo('porter'); s.silver = 60;
    const ids = availableActions(s).map(a => a.id);
    expect(ids).toContain('rescue-money');
    expect(ids).toContain('talk:guard');
    expect(ids).not.toContain('rescue-fight');
    expect(ids).not.toContain('rescue-evidence');
    expect(ids).not.toContain('use-medicine');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('查看建议、合法行动和预估时间不会推进时间、改日志或改人物', () => {
    const s = createDemo('courier'); s.minute = 719; s.heat = 35;
    s.flags.ledger = true; s.flags.witness = true;
    const before = structuredClone(s);
    for (let i = 0; i < 3; i++) {
      smartSuggestions(s); availableActions(s);
      for (const p of PLACES) travelMinutes(s, p.id);
    }
    expect(s).toEqual(before);
  });

  it('各地点、出身、昼夜与案情下最多三个不同建议，且每一个都真能做', () => {
    for (const origin of ORIGINS) for (const place of PLACES) for (const minute of [300, 540, 1199, 1380]) {
      for (const caseStatus of ['held', 'moved', 'released'] as const) {
        const s = createDemo(origin.id); Object.assign(s, { place: place.id, minute, caseStatus });
        const offered = smartSuggestions(s);
        expect(offered.length).toBeLessThanOrEqual(3);
        expect(new Set(offered.map(a => a.ui)).size).toBe(offered.length);
        const legal = [...actionsFor(s), ...npcsAt(s).flatMap(n => actionsFor(s, n.id))].filter(a => !a.disabled);
        for (const a of offered) {
          expect(a.cost).not.toBe(''); expect(a.reason).not.toBe('');
          expect(a.ui).not.toMatch(/action:(arrest-fight|rescue-fight|rescue-sneak|take-purse)/);
          if (a.ui.startsWith('action:')) expect(legal.some(item => item.id === a.ui.slice(7))).toBe(true);
          else {
            const moved = structuredClone(s); travel(moved, a.ui.slice(7) as PlaceId);
            expect(moved.place).toBe(a.ui.slice(7)); expect(moved.stopped).not.toBe(true);
            expect(moved.minute).toBeGreaterThan(s.minute);
            expect(a.cost).toBe(`${moved.minute - s.minute} 分钟 · 仅赶路`);
          }
        }
      }
    }
  });
});

describe('出发前的路程', () => {
  it('身法与武学影响耗时，当前位置零分钟，非法目的地没有路线', () => {
    const porter = createDemo('porter'); const courier = createDemo('courier');
    expect(travelMinutes(porter, 'yard')).toBe(20);
    expect(travelMinutes(courier, 'yard')).toBe(16);
    courier.footwork = 6;
    expect(travelMinutes(courier, 'yard')).toBe(13);
    expect(travelMinutes(porter, 'dock')).toBe(0);
    expect(travelMinutes(porter, 'nowhere' as PlaceId)).toBeNull();
  });

  it('途中会被捕头拦下时，预估停在实际拦查地点，也不推荐穿过去办别的事', () => {
    const s = createDemo('porter'); s.heat = 35; s.minute = 1199;
    expect(travelMinutes(s, 'inn')).toBe(10);
    expect(choices(s)).not.toContain('travel:inn');
    const before = s.minute; travel(s, 'inn');
    expect(s.place).toBe('street'); expect(s.stopped).toBe(true);
    expect(s.minute - before).toBe(10);
  });

  it('全部起止点的显示耗时与实际移动一致，包括长途、轻功和追缉中断', () => {
    for (const origin of ORIGINS) for (const from of PLACES) for (const to of PLACES) {
      for (const heat of [0, 35]) for (const footwork of [0, 6]) {
        const s = createDemo(origin.id); Object.assign(s, { place: from.id, heat, footwork });
        const minutes = travelMinutes(s, to.id);
        const before = s.minute; travel(s, to.id);
        expect(minutes).toBe(s.minute - before);
      }
    }
  });
});
