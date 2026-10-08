import { actionsFor, clockLabel, derived, PLACES, placeDescription } from '../model';
import { icon } from '../icons';
import { smartSuggestions, travelMinutes } from '../suggestions';
import { escapeHTML as esc, type WorldDesignContext } from '../design-context';

/** A context-first handset: choose a person, see every available response, then act. */
export function renderRanger(ctx: WorldDesignContext): string {
  const { state, place, people, selected } = ctx;
  const who = people.find(person => person.id === selected);
  const personActions = who ? actionsFor(state, who.id) : [];
  const shown = new Set(personActions.map(action => action.id));
  const publicActions = actionsFor(state).filter(action => !shown.has(action.id));
  const suggestions = smartSuggestions(state).slice(0, 1);
  const hour = String(Math.floor(state.minute % 1440 / 60)).padStart(2, '0');
  const minute = String(Math.floor(state.minute % 60)).padStart(2, '0');
  const hpMax = derived(state).hpMax;
  const lowHealth = state.hp < hpMax * .4;
  const status = state.stopped ? '去路被拦 · 先应对查问' : state.caseStatus === 'held'
    ? `许青仍被扣 · 距午时 ${Math.max(0, 720 - state.minute)} 分钟`
    : state.caseStatus === 'moved' ? '许青已押往镇公所 · 仍可介入' : '船工已获自由 · 江湖记着此事';

  return `<div class="ranger-view">
    <header class="ranger-top"><div class="ranger-brand"><span class="ranger-brand-mark">游</span><div><b>掌上游侠</b><span>青溪镇 · ${esc(ctx.originName)}</span></div></div><div class="ranger-tools"><button data-ui="layouts" aria-label="切换界面">${icon('map')}<small>界面</small></button><button data-ui="journal" aria-label="打开江湖记事">${icon('book')}<small>记事</small></button><button data-ui="theme" aria-label="切换明暗模式">${icon(ctx.theme === 'dark' ? 'sun' : 'moon')}<small>${ctx.theme === 'dark' ? '明调' : '暗调'}</small></button></div></header>
    <section class="ranger-hud" aria-label="当前时辰与随身资源"><div class="ranger-hud-item"><span>第 ${Math.floor(state.minute / 1440) + 1} 日</span><b>${hour}<i>:</i>${minute}</b><small>${esc(clockLabel(state).split(' · ')[1]?.split(' ')[0] ?? '')}</small></div><button class="ranger-hud-item ranger-money" data-ui="tab:bag" aria-label="盘缠 ${state.silver} 文，打开行囊"><span>盘缠</span><b>${state.silver}<small>文</small></b><small>查看行囊 ${icon('arrow')}</small></button><div class="ranger-hud-item ${state.stamina < 25 ? 'ranger-low' : ''}"><span>精力</span><b>${state.stamina}<small>/100</small></b><div class="ranger-stamina" aria-hidden="true"><i style="width:${Math.min(100, Math.max(0, state.stamina))}%"></i></div></div></section>
    <div class="ranger-health ${lowHealth ? 'ranger-low' : ''}"><span>${icon('leaf')} 气血 <b>${state.hp}<small> / ${hpMax}</small></b></span><span>${state.heat > 0 ? `${icon('shield')} 追缉 ${state.heat}` : state.sword > 0 ? '已有剑术傍身' : '尚未学武'}</span></div>
    <section class="ranger-location" data-section="scene"><div class="ranger-location-title"><div><span class="ranger-kicker">你在此处</span><h2>${esc(place.name)}</h2></div><button class="ranger-map-button" data-ui="tab:map">${icon('map')}地图</button></div><p class="scene-prose">${esc(placeDescription(state))}</p><button class="ranger-situation ${state.stopped || state.caseStatus === 'held' && state.minute >= 660 ? 'urgent' : ''}" data-ui="journal"><span class="ranger-status-light"></span><span>${esc(status)}</span>${icon('arrow')}</button></section>
    ${ctx.responseSection === 'scene' ? ctx.result : ''}
    ${ctx.legacy}
    ${suggestions.length ? `<section class="ranger-suggestions" data-section="suggestions" aria-label="根据眼下情况推荐的行动"><div class="ranger-section-label"><h2>${icon('spark')}眼下建议</h2><span>你来决定</span></div><div>${suggestions.map(suggestion => `<button class="ranger-suggestion" data-suggestion="${esc(suggestion.id)}" data-ui="${esc(suggestion.ui)}"><div><b>${esc(suggestion.title)}</b>${icon('arrow')}</div><p class="suggestion-reason">${esc(suggestion.reason)}</p><small class="suggestion-cost">${esc(suggestion.cost)}</small></button>`).join('')}</div>${ctx.responseSection === 'suggestions' ? ctx.result : ''}</section>` : ''}
    <section class="ranger-people" data-section="people"><div class="ranger-section-label"><h2>选择眼前的人</h2><span>${people.length} 人在场</span></div><div class="people-row">${people.map(person => `<button class="person-chip ${person.id === selected ? 'selected' : ''}" data-ui="select:${esc(person.id)}" aria-pressed="${person.id === selected}"><span class="npc-avatar tone-${esc(person.tone)}">${esc(person.initial)}</span><span><b>${esc(person.name)}</b><small>${esc(person.role)}</small></span><i aria-hidden="true"></i></button>`).join('') || '<p class="ranger-empty">此刻无人。可以歇脚，或动身去别处。</p>'}</div></section>
    <section class="ranger-action-board"><div class="person-detail"><div class="ranger-section-label"><h2>${who ? `对<span>${esc(who.name)}</span>` : '眼下的行动'}</h2><span>${who ? esc(ctx.relation(state.relations[who.id] || 0)) : '随你选择'}</span></div>${who ? `<p>${esc(who.description)}</p>` : ''}</div><div class="action-grid" data-section="actions">${personActions.map(ctx.actionCard).join('') || '<p class="ranger-empty">暂无交涉对象，看看下方能做的事。</p>'}</div>${ctx.responseSection === 'people' ? ctx.result : ''}</section>
    ${publicActions.length ? `<section class="ranger-public" data-section="public-actions"><div class="ranger-section-label"><h2>此地还能做</h2><span>${publicActions.length} 个行动</span></div><div class="action-grid">${publicActions.map(ctx.actionCard).join('')}</div>${ctx.responseSection === 'public-actions' ? ctx.result : ''}</section>` : ''}
    <section class="ranger-roads roads-section" data-section="roads"><div class="ranger-section-label"><h2>动身去别处</h2><button data-ui="tab:map">全镇地图 ${icon('arrow')}</button></div><div class="road-grid">${place.links.map(id => { const next = PLACES.find(entry => entry.id === id)!; const minutes = travelMinutes(state, next.id); return `<button class="road-card" data-ui="travel:${next.id}" ${minutes === null ? 'disabled' : ''}>${icon('pin')}<span><b>${esc(next.name)}</b><small>${esc(next.subtitle)}</small></span><span class="ranger-road-time">${minutes === null ? '先了结查问' : `${minutes} 分钟`}</span>${icon('arrow')}</button>`; }).join('')}</div></section>
  </div>`;
}
