import { icon } from '../icons';
import { clockLabel, derived, placeDescription, PLACES, type DemoAction } from '../model';
import { smartSuggestions, travelMinutes } from '../suggestions';
import { escapeHTML as esc, type WorldDesignContext } from '../design-context';
import { chooseRoomTarget, roomTargets, type RoomTarget } from './room-model';

/** The caller remembers which interaction produced a response. */
export interface RoomFeedback {
  targetId?: string;
  label: string;
  html: string;
}

function actionButton(action: DemoAction): string {
  const glyph = action.id.startsWith('talk:') ? 'person'
    : action.id.includes('medicine') ? 'leaf'
      : action.id.includes('sword') || action.id.includes('fight') || action.id === 'spar' ? 'sword'
        : action.id.includes('money') || action.id.includes('purse') || action.id === 'settle-fine' ? 'coin'
          : action.id.includes('ledger') || action.id === 'work-copy' || action.id === 'rescue-evidence' ? 'book'
            : action.id === 'work-cargo' ? 'box'
              : action.id === 'eat' ? 'tea'
                : action.id === 'free-rest' || action.id === 'sleep' ? 'moon'
                  : action.id === 'wait' ? 'clock' : 'arrow';
  return `<button class="room-action ${action.tone ?? ''}" data-ui="action:${esc(action.id)}" ${action.disabled ? 'disabled' : ''}><span class="room-action-head"><span>${icon(glyph)}<b>${esc(action.label)}</b></span><span class="room-action-cost">${esc(action.cost)}</span></span><span class="room-action-description ${action.disabled ? 'unavailable' : ''}">${esc(action.disabled || action.description)}</span></button>`;
}

function response(feedback: RoomFeedback, world = false): string {
  return `<div class="room-latest ${world ? 'room-world-update' : ''}" ${feedback.targetId ? `data-room-feedback-target="${esc(feedback.targetId)}"` : ''}><div class="room-latest-label">${esc(feedback.label)}</div>${feedback.html}</div>`;
}

/** Recovery links select an object for inspection; they never execute its action. */
function recoveryLink(ctx: WorldDesignContext, targets: RoomTarget[], selectedId: string): string {
  const lowHealth = ctx.state.hp < derived(ctx.state).hpMax * .45;
  const lowStamina = ctx.state.stamina < 25;
  if (!lowHealth && !lowStamina) return '';
  const recoveryIds = new Set(['free-rest', 'eat', 'sleep', 'use-medicine']);
  const suggested = smartSuggestions(ctx.state).find(item => item.ui.startsWith('action:') && recoveryIds.has(item.ui.slice(7)));
  const suggestedId = suggested?.ui.slice(7);
  const owner = suggestedId ? targets.find(item => item.actions.some(action => action.id === suggestedId && !action.disabled)) : undefined;
  if (!owner || owner.id === selectedId) return '';
  const label = suggestedId === 'free-rest' ? '查看歇脚' : suggestedId === 'use-medicine' ? '查看用药' : '查看补给';
  return `<div class="room-recovery"><span>${lowHealth ? '伤势未愈' : '精力不足'}<small>${suggestedId === 'free-rest' ? '可在自身处免费歇脚' : suggestedId === 'use-medicine' ? '身上还有金疮药' : `${esc(owner.name)}这里可补充精力`}</small></span><button data-ui="room-select:${esc(owner.id)}">${label}${icon('arrow')}</button></div>`;
}

/** Show follow-up routes only while the player is attending to this case. */
function caseContext(ctx: WorldDesignContext, target: RoomTarget, targets: RoomTarget[]): { summary: string; continuation: string } {
  const { state } = ctx;
  const title = state.caseStatus === 'released' ? '许青已获释' : state.caseStatus === 'moved' ? '许青已被押往镇公所' : '许青仍在渡口 · 午时押送';
  const summary = `<button class="room-case" data-ui="journal"><span>${icon('book')}<b>${title}</b></span><span>记事${icon('arrow')}</span></button>`;
  const related = ['guard', 'xu', 'object-ledger', 'teaman'].includes(target.id)
    || (target.id === 'constable' && state.caseStatus === 'moved');
  if (!related || state.caseStatus === 'released') return { summary, continuation: '' };
  const progress = `<p class="room-case-progress"><span class="${state.flags.ledger ? 'known' : ''}">${state.flags.ledger ? icon('check') : icon('book')}货单${state.flags.ledger ? '已核对' : '待查'}</span><span class="${state.flags.witness ? 'known' : ''}">${state.flags.witness ? icon('check') : icon('person')}人证${state.flags.witness ? '已记下' : '待问'}</span></p>`;
  const actionId = !state.flags.ledger ? 'inspect-ledger' : !state.flags.witness ? 'ask-witness' : 'rescue-evidence';
  const owner = [...targets.filter(item => item.kind === 'object'), ...targets.filter(item => item.kind !== 'object')]
    .find(item => item.actions.some(action => action.id === actionId && !action.disabled));
  let next = '';
  if (owner && owner.id !== target.id) {
    const label = actionId === 'inspect-ledger' ? '查看运货账' : actionId === 'ask-witness' ? '找陆婆婆问问' : '查看交涉办法';
    next = `<button class="room-case-next" data-ui="room-select:${esc(owner.id)}">${label}${icon('arrow')}</button>`;
  } else if (!owner) {
    const destinations = actionId === 'inspect-ledger' ? ['travel:street'] : actionId === 'ask-witness' ? ['travel:tea'] : ['travel:dock', 'travel:yamen'];
    const nextTrip = smartSuggestions(state).find(item => destinations.includes(item.ui));
    if (nextTrip) next = `<button class="room-case-next" data-ui="${esc(nextTrip.ui)}"><span>${esc(nextTrip.title)}<small>${esc(nextTrip.cost)}</small></span>${icon('arrow')}</button>`;
  }
  return { summary, continuation: `<div class="room-case-followup">${progress}${next}</div>` };
}

/** HUD and navigation stay put; the room itself has one natural reading order. */
export function renderRoom(ctx: WorldDesignContext, targetId: string, feedback?: RoomFeedback): string {
  const { state, place } = ctx;
  const stats = derived(state);
  const targets = roomTargets(state);
  const target = chooseRoomTarget(state, targetId);
  const roads = place.links.map(id => PLACES.find(candidate => candidate.id === id)!);
  const hasInner = stats.mpMax > 0;
  const currentFeedback = feedback?.targetId === target.id ? feedback : undefined;
  const worldFeedback = feedback && (!feedback.targetId || !targets.some(item => item.id === feedback.targetId)) ? feedback : undefined;
  const caseInfo = caseContext(ctx, target, targets);

  return `<div class="room-world">
    <header class="room-header">
      <div class="room-location"><h1>${icon('pin')}${esc(place.name)}</h1><time>${esc(clockLabel(state))}</time></div>
      <div class="room-tools"><button data-ui="layouts" aria-label="切换界面">${icon('map')}<span>界面</span></button><button data-ui="menu" aria-label="更多">${icon('more')}<span>更多</span></button><button data-ui="theme" aria-label="切换明暗主题">${icon(ctx.theme === 'dark' ? 'sun' : 'moon')}<span>${ctx.theme === 'dark' ? '日间' : '夜间'}</span></button></div>
    </header>
    <button class="room-resources ${hasInner ? 'has-inner' : ''}" data-ui="status" aria-label="查看气血、精力、盘缠与详细状态">
      <span class="${state.hp < stats.hpMax * .3 ? 'low' : ''}"><small>气血</small><b>${Math.ceil(state.hp)}<em>/${stats.hpMax}</em></b><i class="room-meter"><i style="width:${Math.max(0, Math.min(100, state.hp / stats.hpMax * 100))}%"></i></i></span>
      ${hasInner ? `<span><small>内力</small><b>${Math.floor(state.mp)}<em>/${stats.mpMax}</em></b><i class="room-meter"><i style="width:${Math.max(0, Math.min(100, state.mp / stats.mpMax * 100))}%"></i></i></span>` : ''}
      <span class="${state.stamina < 25 ? 'low' : ''}"><small>精力</small><b>${Math.floor(state.stamina)}<em>/100</em></b><i class="room-meter"><i style="width:${Math.max(0, Math.min(100, state.stamina))}%"></i></i></span>
      <span><small>盘缠</small><b>${state.silver}<em>文</em></b>${state.heat > 0 ? `<i class="room-heat">追缉 ${state.heat}</i>` : '<i class="room-money-rule"></i>'}</span>
    </button>
    <div class="room-world-scroll" data-room-scroll="world">
      <section class="room-place-context" aria-label="此处景况"><p class="room-look">${esc(placeDescription(state))}</p></section>
      <nav class="room-exits" aria-label="当地去路" style="--room-exits:${roads.length}">${roads.map(road => {
        const minutes = travelMinutes(state, road.id);
        return `<button data-ui="travel:${road.id}" ${minutes === null ? 'disabled' : ''}><b>${esc(road.name)}${icon('arrow')}</b><small>${state.stopped ? '去路被拦' : minutes === null ? '暂不能动身' : `${minutes} 分钟`}</small></button>`;
      }).join('')}</nav>
      ${caseInfo.summary}
      ${worldFeedback ? response(worldFeedback, true) : ''}
      <section class="room-objects" aria-labelledby="room-objects-title">
        <div class="room-section-label"><h2 id="room-objects-title">眼前的人与物</h2><span>${targets.filter(item => item.kind === 'person').length} 人在场</span></div>
        <div class="room-target-list" style="--room-target-columns:${targets.length === 4 ? 2 : Math.min(3, targets.length)}">${targets.map(item => `<button class="room-target ${target.id === item.id ? 'selected' : ''} kind-${item.kind}" data-ui="room-select:${esc(item.id)}" aria-pressed="${target.id === item.id}" aria-controls="room-actions"><span class="room-target-name">${icon(item.glyph)}<b>${esc(item.name)}</b></span><small>${esc(item.role)}</small></button>`).join('')}</div>
      </section>
      <section class="room-actions" id="room-actions" aria-labelledby="room-actions-title">
        <header><div><h2 id="room-actions-title">${esc(target.name)}<span>${esc(target.role)}</span></h2>${target.kind === 'person' ? `<small>${esc(ctx.relation(state.relations[target.id] ?? 0))}</small>` : ''}</div><span>${target.actions.length} 项行动</span></header>
        <p class="room-target-detail">${esc(target.detail)}</p>
        ${currentFeedback ? response(currentFeedback) : ''}
        ${caseInfo.continuation}
        ${recoveryLink(ctx, targets, target.id)}
        <div class="room-action-grid">${target.actions.map(actionButton).join('')}</div>
      </section>
    </div>
  </div>`;
}
