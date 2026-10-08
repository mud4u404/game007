import { describe, expect, it } from 'vitest';
import { act, actionsFor, createDemo, npcsAt, PLACES, type DemoState } from '../src/demo/model';
import { chooseRoomTarget, roomTargets } from '../src/demo/designs/room-model';

const target = (state: DemoState, id: string) => roomTargets(state).find(item => item.id === id);

describe('同屏场所：选对象不改变世界，动作仍由原规则决定', () => {
  it('查看和切换目标不耗时，连续搬货仍保留同一目标', () => {
    const state = createDemo('porter');
    const before = structuredClone(state);
    expect(chooseRoomTarget(state).id).toBe('docker');
    for (const item of roomTargets(state)) expect(chooseRoomTarget(state, item.id).id).toBe(item.id);
    expect(state).toEqual(before);

    act(state, 'work-cargo');
    expect(chooseRoomTarget(state, 'object-cargo').id).toBe('object-cargo');
    expect(target(state, 'object-cargo')!.actions[0].disabled).toBeUndefined();
    expect(state.minute - before.minute).toBe(45);
  });

  it('钱袋被拿走后只提供归还，归还后不再显示一个能拿的钱袋', () => {
    const state = createDemo('courier'); state.place = 'street';
    expect(target(state, 'object-purse')!.actions.map(action => action.id)).toEqual(['take-purse']);
    act(state, 'take-purse', () => .99);
    expect(target(state, 'object-purse')!.actions.map(action => action.id)).toEqual(['return-purse']);
    expect(target(state, 'object-purse')!.detail).toContain('你身上');
    expect(chooseRoomTarget(state, 'object-purse').id).toBe('object-purse');
    act(state, 'return-purse');
    expect(target(state, 'object-purse')).toBeUndefined();
    expect(chooseRoomTarget(state, 'object-purse').id).toBe('merchant');
  });

  it('关门后撤下需要店主的入口，空场仍可等待和免费休息', () => {
    const state = createDemo('scholar'); state.place = 'street'; state.minute = 20 * 60;
    expect(roomTargets(state).map(item => item.id)).toEqual(['self']);
    expect(chooseRoomTarget(state, 'object-ledger').id).toBe('self');
    expect(target(state, 'self')!.actions.map(action => action.id)).toContain('free-rest');
    state.place = 'dock'; state.caseStatus = 'moved'; state.minute = 19 * 60;
    expect(target(state, 'docker')).toBeUndefined();
    expect(target(state, 'object-cargo')).toBeUndefined();
    state.place = 'tea'; state.minute = 22 * 60;
    expect(target(state, 'object-meal')).toBeUndefined();
    state.place = 'inn';
    expect(target(state, 'object-meal')!.actions[0].id).toBe('eat');
    expect(target(state, 'object-room')!.actions[0].id).toBe('sleep');
  });

  it('人被押走后不会留下失效对象，公所可继续处理原案', () => {
    const state = createDemo('porter'); state.minute = 715;
    expect(chooseRoomTarget(state, 'xu').id).toBe('xu');
    act(state, 'wait');
    expect(state.caseStatus).toBe('moved');
    expect(target(state, 'xu')).toBeUndefined();
    expect(target(state, 'guard')).toBeUndefined();
    expect(chooseRoomTarget(state, 'xu').id).toBe('docker');
    state.place = 'yamen';
    expect(target(state, 'xu')!.actions.map(action => action.id)).toContain('rescue-evidence');
    expect(target(state, 'guard')!.actions.map(action => action.id)).toContain('rescue-money');
  });

  it('重伤、没钱没精力且被拦查仍能用药或随行，不被残留物件卡住', () => {
    const state = createDemo('porter'); state.place = 'street'; state.stopped = true;
    state.silver = 0; state.hp = 1; state.stamina = 0; state.heat = 80;
    const patrol = chooseRoomTarget(state, 'object-medicine');
    expect(patrol.id).toBe('constable');
    expect(patrol.actions.find(action => action.id === 'submit-check')!.disabled).toBeUndefined();
    expect(patrol.actions.find(action => action.id === 'settle-fine')!.disabled).toBeTruthy();
    const self = chooseRoomTarget(state, 'self');
    expect(self.id).toBe('self');
    expect(self.actions.find(action => action.id === 'use-medicine')!.disabled).toBeUndefined();
    expect(roomTargets(state).some(item => item.kind === 'object')).toBe(false);

    act(state, 'use-medicine');
    expect(state.hp).toBe(61);
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

  it('不同地点、时辰与案件状态的全部原动作均有入口，价格与禁用原因不被改写', () => {
    for (const place of PLACES) {
      for (const hour of [5, 9, 19, 20, 22]) {
        for (const status of ['held', 'moved', 'released'] as const) {
          for (const stopped of [false, true]) {
            const state = createDemo('porter');
            Object.assign(state, { place: place.id, minute: hour * 60, caseStatus: status, stopped, silver: 0, stamina: 0, hp: 1, heat: 40 });
            state.flags.purseTaken = true;
            const native = [...actionsFor(state), ...npcsAt(state).flatMap(person => actionsFor(state, person.id))];
            const targets = roomTargets(state);
            const offered = targets.flatMap(item => item.actions);
            expect(new Set(offered.map(action => action.id))).toEqual(new Set(native.map(action => action.id)));
            for (const action of offered) expect(native).toContainEqual(action);
            expect(targets.every(item => item.actions.length > 0 && !item.id.includes(':'))).toBe(true);
          }
        }
      }
    }
  });
});
