import { actionsFor, npcsAt, type DemoAction, type DemoState } from '../model';

/** Clickable things in the current room; choosing one never advances the world. */
export interface RoomTarget {
  id: string;
  name: string;
  role: string;
  kind: 'person' | 'object' | 'self';
  glyph: string;
  detail: string;
  actions: DemoAction[];
}

export function roomTargets(state: DemoState): RoomTarget[] {
  const objectActionIds = new Set(['inspect-ledger', 'take-purse', 'return-purse']);
  const originalPeople = npcsAt(state).map(person => ({ person, actions: actionsFor(state, person.id) }));
  const personActionIds = new Set(originalPeople.flatMap(entry => entry.actions.map(action => action.id)));
  const people: RoomTarget[] = originalPeople.map(({ person, actions }) => ({
    id: person.id,
    name: person.name,
    role: person.role,
    kind: 'person',
    glyph: person.id === 'swordsman' ? 'sword' : ['guard', 'constable'].includes(person.id) ? 'shield' : 'person',
    detail: person.description,
    actions: actions.filter(action => !objectActionIds.has(action.id)),
  }));
  const localActions = actionsFor(state);
  const objects: RoomTarget[] = [];
  const object = (id: string, name: string, role: string, glyph: string, detail: string, actionIds: string[]) => {
    const actions = localActions.filter(action => actionIds.includes(action.id));
    // Owner schedules, patrols and costs all come from the existing world rules.
    if (actions.length) objects.push({ id, name, role, kind: 'object', glyph, detail, actions });
  };

  if (state.place === 'street') {
    object('object-ledger', '运货账', state.flags.ledger ? '已经核过' : '账房货单', 'book', state.flags.ledger ? '核过的货单：船钱缴清，工钱仍欠着。' : '几张运货账压在镇纸下，记着船钱和工钱。', ['inspect-ledger']);
    if (state.flags.purseTaken) {
      object('object-purse', '掌柜的钱袋', '在你身上', 'coin', '钱袋已在你身上，方掌柜正在找它。', ['return-purse']);
    } else if (!state.flags.purseReturned) {
      object('object-purse', '柜边钱袋', '掌柜的财物', 'coin', '钱袋搁在柜台一角，内有三十五文。', ['take-purse']);
    }
  }

  const self: RoomTarget = {
    id: 'self', name: '自己', role: state.stopped ? '随身伤药' : '歇脚与随身', kind: 'self', glyph: 'person',
    detail: state.stopped ? '去路被拦住了，身上的伤仍可敷药。' : '歇脚、候时，料理身上的伤。',
    // Use the original ownership, including actions moved to objects. A purse
    // that has gone must not leave a disabled theft action in the self panel.
    actions: localActions.filter(action => !personActionIds.has(action.id)),
  };
  return [...people, ...objects, ...(self.actions.length ? [self] : [])];
}

/** Keep the selected thing while it exists so repeated actions stay in place.
 * When it leaves, return to self instead of silently choosing another person.
 * The caller selects constable on a new patrol interruption; a player who is
 * already stopped may still deliberately select self to use medicine.
 */
export function chooseRoomTarget(state: DemoState, targetId?: string): RoomTarget {
  const targets = roomTargets(state);
  return targets.find(target => target.id === targetId)
    ?? (state.stopped ? targets.find(target => target.id === 'constable') : undefined)
    ?? (targetId ? targets.find(target => target.id === 'self') : undefined)
    ?? targets.find(target => target.kind === 'person')
    ?? targets.find(target => target.id === 'self')!;
}
