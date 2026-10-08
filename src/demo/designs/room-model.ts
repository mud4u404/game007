import { actionsFor, npcsAt, type DemoAction, type DemoState } from '../model';

/** Clickable things in the current room; choosing one never advances the world. */
export interface RoomTarget {
  id: string;
  name: string;
  kind: 'person' | 'object' | 'self';
  glyph: string;
  detail: string;
  actions: DemoAction[];
}

export function roomTargets(state: DemoState): RoomTarget[] {
  const people: RoomTarget[] = npcsAt(state).map(person => ({
    id: person.id,
    name: person.name,
    kind: 'person',
    glyph: person.id === 'swordsman' ? 'sword' : ['guard', 'constable'].includes(person.id) ? 'shield' : 'person',
    detail: person.description,
    actions: actionsFor(state, person.id),
  }));
  const localActions = actionsFor(state);
  const objects: RoomTarget[] = [];
  const object = (id: string, name: string, glyph: string, detail: string, actionIds: string[]) => {
    const actions = localActions.filter(action => actionIds.includes(action.id));
    // Owner schedules, patrols and costs all come from the existing world rules.
    if (actions.length) objects.push({ id, name, kind: 'object', glyph, detail, actions });
  };

  if (state.place === 'dock') {
    object('object-cargo', '船货', 'box', '一包包船货堆在岸边，等着脚夫搬运。', ['work-cargo']);
  }
  if (state.place === 'street') {
    object('object-ledger', '运货账', 'book', state.flags.ledger ? '核过的货单：船钱缴清，工钱仍欠着。' : '几张运货账压在镇纸下，记着船钱和工钱。', ['inspect-ledger']);
    object('object-medicine', '药摊', 'leaf', '柜上摆着包好的金疮药。', ['buy-medicine']);
    if (state.flags.purseTaken) {
      object('object-purse', '掌柜的钱袋', 'coin', '钱袋已在你身上，方掌柜正在找它。', ['return-purse']);
    } else if (!state.flags.purseReturned) {
      object('object-purse', '柜边钱袋', 'coin', '钱袋搁在柜台一角，内有三十五文。', ['take-purse']);
    }
    object('object-work', '招工纸', 'book', '账房招人送信、誊抄，办妥便结工钱。', ['work-courier', 'work-copy']);
  }
  if (state.place === 'tea' || state.place === 'inn') {
    object('object-meal', '热面', 'tea', '一碗热面，能填肚子，也能缓缓乏。', ['eat']);
  }
  if (state.place === 'inn') {
    object('object-room', '客房', 'moon', '楼上有干净被褥，可以睡个整觉。', ['sleep']);
  }

  const personActions = new Set(people.flatMap(person => person.actions.map(action => action.id)));
  const self: RoomTarget = {
    id: 'self', name: '自身', kind: 'self', glyph: 'person',
    detail: state.stopped ? '去路被拦住了，身上的伤仍可敷药。' : '歇脚、候时，料理身上的伤。',
    actions: localActions.filter(action => !personActions.has(action.id)),
  };
  return [...people, ...objects, ...(self.actions.length ? [self] : [])];
}

/** Keep the selected thing while it exists so repeated actions stay in place.
 * The caller selects constable on a new patrol interruption; a player who is
 * already stopped may still deliberately select self to use medicine.
 */
export function chooseRoomTarget(state: DemoState, targetId?: string): RoomTarget {
  const targets = roomTargets(state);
  return targets.find(target => target.id === targetId)
    ?? (state.stopped ? targets.find(target => target.id === 'constable') : undefined)
    ?? targets.find(target => target.kind === 'person')
    ?? targets.find(target => target.id === 'self')!;
}
