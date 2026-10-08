import { describe, expect, it } from 'vitest';
import { act, actionsFor, createDemo, npcsAt, PLACES, type DemoState } from '../src/demo/model';
import { chooseRoomTarget, roomTargets } from '../src/demo/designs/room-model';

const target = (state: DemoState, id: string) => roomTargets(state).find(item => item.id === id);

describe('同屏场所：选对象不改变世界，动作仍由原规则决定', () => {
  it('查看和切换目标不耗时，连续搬货仍保留同一目标', () => {
    const state = createDemo('porter');
    const before = structuredClone(state);
    expect(chooseRoomTarget(state).id).toBe('docker');
    expect(chooseRoomTarget(state, '').id).toBe('docker');
    for (const item of roomTargets(state)) expect(chooseRoomTarget(state, item.id).id).toBe(item.id);
    expect(state).toEqual(before);

    act(state, 'work-cargo');
    expect(chooseRoomTarget(state, 'docker').id).toBe('docker');
    expect(target(state, 'docker')!.actions.find(action => action.id === 'work-cargo')!.disabled).toBeUndefined();
    expect(state.minute - before.minute).toBe(45);
  });

  it('生计与买卖归人物，账与钱袋归物件，自己只料理随身事务', () => {
    const state = createDemo('porter');
    const owners = (id: string) => roomTargets(state).filter(item => item.actions.some(action => action.id === id)).map(item => item.id);
    expect(owners('work-cargo')).toEqual(['docker']);
    expect(target(state, 'docker')!.role).toBe('船行领班');
    expect(target(state, 'xu')!.role).toBe('被扣的船工');
    expect(target(state, 'self')!.actions.map(action => action.id)).toEqual(['free-rest', 'wait', 'use-medicine']);

    state.place = 'street';
    for (const id of ['work-courier', 'work-copy', 'buy-medicine']) expect(owners(id)).toEqual(['merchant']);
    expect(owners('inspect-ledger')).toEqual(['object-ledger']);
    expect(owners('take-purse')).toEqual(['object-purse']);
    expect(target(state, 'self')!.actions.map(action => action.id)).toEqual(['free-rest', 'wait', 'use-medicine']);

    state.place = 'tea';
    expect(owners('eat')).toEqual(['teaman']);
    state.caseStatus = 'released';
    expect(target(state, 'xu')!.role).toBe('记着你恩情的船工');
    state.place = 'inn';
    expect(owners('eat')).toEqual(['innkeeper']);
    expect(owners('sleep')).toEqual(['innkeeper']);
    expect(roomTargets(state).some(item => item.kind === 'object')).toBe(false);
  });

  it('钱袋被拿走后只提供归还，归还后不再显示一个能拿的钱袋', () => {
    const state = createDemo('courier'); state.place = 'street';
    expect(target(state, 'object-purse')!.actions.map(action => action.id)).toEqual(['take-purse']);
    act(state, 'take-purse', () => .99);
    expect(target(state, 'object-purse')!.actions.map(action => action.id)).toEqual(['return-purse']);
    expect(target(state, 'object-purse')!.detail).toContain('你身上');
    expect(chooseRoomTarget(state, 'object-purse').id).toBe('object-purse');
    expect(roomTargets(state).flatMap(item => item.actions).filter(action => action.id === 'return-purse')).toHaveLength(1);
    expect(roomTargets(state).flatMap(item => item.actions).some(action => action.id === 'take-purse')).toBe(false);
    act(state, 'return-purse');
    expect(target(state, 'object-purse')).toBeUndefined();
    expect(chooseRoomTarget(state, 'object-purse').id).toBe('self');
    expect(roomTargets(state).flatMap(item => item.actions).some(action => ['take-purse', 'return-purse'].includes(action.id))).toBe(false);
  });

  it('关门后撤下需要店主的入口，空场仍可等待和免费休息', () => {
    const state = createDemo('scholar'); state.place = 'street'; state.minute = 20 * 60;
    expect(roomTargets(state).map(item => item.id)).toEqual(['self']);
    expect(chooseRoomTarget(state, 'object-ledger').id).toBe('self');
    expect(target(state, 'self')!.actions.map(action => action.id)).toContain('free-rest');
    state.place = 'dock'; state.caseStatus = 'moved'; state.minute = 19 * 60;
    expect(target(state, 'docker')).toBeUndefined();
    expect(roomTargets(state).flatMap(item => item.actions).some(action => action.id === 'work-cargo')).toBe(false);
    state.place = 'tea'; state.minute = 22 * 60;
    expect(roomTargets(state).flatMap(item => item.actions).some(action => action.id === 'eat')).toBe(false);
    state.place = 'inn';
    expect(target(state, 'innkeeper')!.actions.map(action => action.id)).toContain('eat');
    expect(target(state, 'innkeeper')!.actions.map(action => action.id)).toContain('sleep');
  });

  it('人被押走后不会留下失效对象，公所可继续处理原案', () => {
    const state = createDemo('porter'); state.minute = 715;
    expect(chooseRoomTarget(state, 'xu').id).toBe('xu');
    act(state, 'wait');
    expect(state.caseStatus).toBe('moved');
    expect(target(state, 'xu')).toBeUndefined();
    expect(target(state, 'guard')).toBeUndefined();
    expect(chooseRoomTarget(state, 'xu').id).toBe('self');
    state.place = 'yamen';
    expect(target(state, 'xu')!.actions.map(action => action.id)).toContain('rescue-evidence');
    expect(target(state, 'guard')!.actions.map(action => action.id)).toContain('rescue-money');
  });

  it('重伤、没钱没精力且被拦查仍能用药或随行，不被残留物件卡住', () => {
    const state = createDemo('porter'); state.place = 'street'; state.stopped = true;
    state.silver = 0; state.hp = 1; state.stamina = 0; state.heat = 80;
    const patrol = chooseRoomTarget(state, 'object-ledger');
    expect(patrol.id).toBe('constable');
    expect(patrol.actions.find(action => action.id === 'submit-check')!.disabled).toBeUndefined();
    expect(patrol.actions.find(action => action.id === 'settle-fine')!.disabled).toBeTruthy();
    const self = chooseRoomTarget(state, 'self');
    expect(self.id).toBe('self');
    expect(self.actions.find(action => action.id === 'use-medicine')!.disabled).toBeUndefined();
    expect(self.actions.map(action => action.id)).toEqual(['use-medicine']);
    expect(roomTargets(state).flatMap(item => item.actions).some(action => ['free-rest', 'wait', 'eat', 'sleep'].includes(action.id))).toBe(false);
    expect(roomTargets(state).some(item => item.kind === 'object')).toBe(false);

    act(state, 'use-medicine');
    expect(state.hp).toBe(61);
    expect(target(state, 'self')).toBeUndefined();
    expect(chooseRoomTarget(state, 'self').id).toBe('constable');
    act(state, 'submit-check');
    expect(state.stopped).toBe(false);
    const rest = chooseRoomTarget(state, 'self').actions.find(action => action.id === 'free-rest');
    expect(rest?.disabled).toBeUndefined();
    expect(rest).toBeDefined();
    act(state, 'free-rest');
    expect(state.stamina).toBe(40);
    expect(state.silver).toBe(0);
  });

  it('不同地点、时辰、案件与钱袋状态的有效动作均有入口，价格与禁用原因不被改写', () => {
    for (const place of PLACES) {
      for (const hour of [5, 9, 19, 20, 22]) {
        for (const status of ['held', 'moved', 'released'] as const) {
          for (const stopped of [false, true]) {
            for (const purse of ['present', 'taken', 'returned']) {
              const state = createDemo('porter');
              Object.assign(state, { place: place.id, minute: hour * 60, caseStatus: status, stopped, silver: 0, stamina: 0, hp: 1, heat: 40 });
              state.flags.purseTaken = purse === 'taken';
              state.flags.purseReturned = purse === 'returned';
              const native = [...actionsFor(state), ...npcsAt(state).flatMap(person => actionsFor(state, person.id))];
              // A purse no longer on the counter has no theft target. The model's
              // historical, disabled take-purse option need not remain as clutter.
              const relevant = native.filter(action => action.id !== 'take-purse' || purse === 'present');
              const targets = roomTargets(state);
              const offered = targets.flatMap(item => item.actions);
              expect(new Set(offered.map(action => action.id))).toEqual(new Set(relevant.map(action => action.id)));
              for (const action of native.filter(item => !item.disabled)) expect(offered).toContainEqual(action);
              for (const action of offered) expect(native).toContainEqual(action);
              expect(targets.every(item => item.actions.length > 0 && item.role && !item.id.includes(':'))).toBe(true);
            }
          }
        }
      }
    }
  });
});
