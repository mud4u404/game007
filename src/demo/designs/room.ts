import { icon } from '../icons';
import { clockLabel, derived, placeDescription, PLACES, type DemoAction } from '../model';
import { travelMinutes } from '../suggestions';
import { escapeHTML as esc, type WorldDesignContext } from '../design-context';
import { chooseRoomTarget, roomTargets } from './room-model';

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
  return `<button class="room-action ${action.tone ?? ''}" data-ui="action:${esc(action.id)}" ${action.disabled ? `disabled aria-describedby="room-action-info-${esc(action.id)}"` : ''}>${icon(glyph)}<span class="room-action-copy"><b>${esc(action.label)}</b><span>${esc(action.cost)}</span></span>${action.disabled ? '<i>条件未足</i>' : ''}</button>`;
}

/** A room is a set of objects and exits. Selecting an object never acts on it. */
export function renderRoom(ctx: WorldDesignContext, targetId: string): string {
  const { state, place } = ctx;
  const stats = derived(state);
  const targets = roomTargets(state);
  const target = chooseRoomTarget(state, targetId);
  const actions = target.actions;
  const roads = place.links.map(id => PLACES.find(candidate => candidate.id === id)!);
  const recent = state.log.slice(ctx.result ? -5 : -4, ctx.result ? -1 : undefined).reverse();
  const hasInner = stats.mpMax > 0;
  const available = actions.filter(action => !action.disabled).length;

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
    <nav class="room-exits" aria-label="当地去路" style="--room-exits:${roads.length}">${roads.map(road => {
      const minutes = travelMinutes(state, road.id);
      return `<button data-ui="travel:${road.id}" ${minutes === null ? 'disabled' : ''}><b>${esc(road.name)}${icon('arrow')}</b><small>${state.stopped ? '去路被拦' : minutes === null ? '暂不能动身' : `${minutes} 分钟`}</small></button>`;
    }).join('')}</nav>
    <section class="room-objects" aria-labelledby="room-objects-title">
      <div class="room-section-label"><h2 id="room-objects-title">眼前的人与物</h2><span>${targets.filter(item => item.kind === 'person').length} 人在场</span></div>
      <div class="room-target-list" data-room-scroll="objects">${targets.map(item => `<button class="room-target ${target.id === item.id ? 'selected' : ''} kind-${item.kind}" data-ui="room-select:${esc(item.id)}" aria-pressed="${target.id === item.id}" aria-controls="room-actions" aria-label="${esc(item.name)}，${item.kind === 'person' ? '人物' : item.kind === 'object' ? '物件' : '自身'}，${item.actions.length} 项行动"><span class="room-target-icon">${icon(item.glyph)}</span><span><b>${esc(item.name)}</b></span></button>`).join('')}</div>
    </section>
    <section class="room-feedback" aria-label="眼前动静与行动反馈">
      <div class="room-feed-scroll" data-room-scroll="feedback" tabindex="0">
        ${state.stopped ? '<p class="room-stop-note">秦捕头拦住了去路，先处理眼前的盘查。</p>' : ''}
        ${ctx.result ? `<div class="room-latest"><div class="room-latest-label">行动结果</div>${ctx.result}</div>` : `<p class="room-look">${esc(placeDescription(state))}</p>`}
        <ol class="room-log">${recent.map(entry => `<li class="${entry.tone}"><time>${String(Math.floor(entry.at % 1440 / 60)).padStart(2, '0')}:${String(entry.at % 60).padStart(2, '0')}</time><p>${esc(entry.text)}</p></li>`).join('')}</ol>
      </div>
    </section>
    <section class="room-actions" id="room-actions" aria-labelledby="room-actions-title">
      <header><h2 id="room-actions-title">${esc(target.name)}<span>${target.kind === 'person' ? esc(ctx.relation(state.relations[target.id] ?? 0)) : target.kind === 'object' ? '物件' : '随时可做'}</span></h2><span>可做 ${available} / ${actions.length}</span></header>
      <div class="room-action-scroll" data-room-scroll="actions"><div class="room-action-grid">${actions.map(actionButton).join('')}</div>
        <details class="room-action-help" data-section="room-help-${esc(target.id)}"><summary>查看行动说明与条件${icon('arrow')}</summary><p class="room-target-detail">${esc(target.detail)}</p><dl>${actions.map(action => `<div id="room-action-info-${esc(action.id)}"><dt>${esc(action.label)}<small>${esc(action.cost)}</small></dt><dd>${esc(action.description)}${action.disabled ? `<strong>${esc(action.disabled)}</strong>` : ''}</dd></div>`).join('')}</dl></details>
      </div>
    </section>
  </div>`;
}
