import { icon } from '../icons';
import { actionsFor, clockLabel, derived, PLACES, placeDescription } from '../model';
import { escapeHTML as esc, type WorldDesignContext } from '../design-context';

/** Landscape first: people are touch targets, roads are choices, prose opens on demand. */
export function renderExplore(ctx: WorldDesignContext): string {
  const { state, place, people, selected } = ctx;
  const stats = derived(state);
  const person = people.find(npc => npc.id === selected);
  const personal = person ? actionsFor(state, person.id) : [];
  const personalIds = new Set(personal.map(action => action.id));
  const publicActions = actionsFor(state).filter(action => !personalIds.has(action.id));
  const minutes = Math.max(4, Math.round(10 * stats.travelFactor));
  const night = state.minute % 1440 >= 1080 || state.minute % 1440 < 360;
  const known = state.renown >= 12 ? '渐有人识' : state.renown ? '略有耳闻' : '无名初至';
  const roads = place.links.map(id => PLACES.find(candidate => candidate.id === id)!);
  const available = publicActions.filter(action => !action.disabled);
  const actionsLead = available.find(action => action.id !== 'wait' && action.id !== 'free-rest');
  const sceneResult = ctx.responseSection === 'scene';
  const publicResult = ctx.responseSection === 'public-actions' && publicActions.length > 0;
  return `<div class="explore-world">
    <header class="explore-header">
      <button class="explore-self" data-ui="tab:person" aria-label="查看${esc(state.name)}的人物属性"><span class="explore-seal">${esc(state.name.slice(0, 1))}</span><span><b>${esc(state.name)}</b><small>${esc(ctx.originName)} · ${known}</small></span></button>
      <div class="explore-tools"><button data-ui="layouts" aria-label="切换界面">${icon('map')}<span>界面</span></button><button data-ui="journal" aria-label="打开江湖手记">${icon('book')}<span>手记</span></button><button data-ui="theme" aria-label="切换${ctx.theme === 'dark' ? '日间' : '夜间'}配色">${icon(ctx.theme === 'dark' ? 'sun' : 'moon')}<span>${ctx.theme === 'dark' ? '日间' : '夜间'}</span></button></div>
    </header>
    <div class="explore-vitals" aria-label="当前状态"><span class="explore-health"><i>气血</i><b>${Math.ceil(state.hp)}<small>/${stats.hpMax}</small></b><span class="explore-health-track"><i style="width:${Math.max(0, Math.min(100, state.hp / stats.hpMax * 100))}%"></i></span></span><span><i>精力</i><b class="${state.stamina < 25 ? 'low' : ''}">${Math.round(state.stamina)}<small>/100</small></b></span><span><i>盘缠</i><b>${state.silver}<small>文</small></b></span>${state.heat > 0 ? `<button class="explore-heat" data-ui="tab:person">${icon('shield')}追缉 ${state.heat}</button>` : ''}</div>
    ${ctx.legacy}
    <section class="explore-atlas" data-section="scene" aria-label="${esc(place.name)}的场景与可交互人物">
      <div class="explore-landscape ${night ? 'at-night' : ''} ${roads.length > 3 ? 'many-roads' : ''}">
        <img class="explore-painting" src="./demo/harbor.webp" alt="青溪的柳岸、客船与远山" width="1857" height="847">
        <div class="explore-landmark"><span>江南道 · 青溪镇</span><h1>${esc(place.name)}</h1><small>${esc(place.subtitle)}</small></div>
        <div class="explore-weather"><span>${night ? '月下' : '初晴'}</span><i>青<br>溪</i></div>
        <div class="explore-local-time">${icon('clock')}${esc(clockLabel(state))}<span>读字时，江湖等你</span></div>
        <div class="explore-people" data-section="people"><span class="explore-map-key">眼前的人 · 轻点交谈</span><div class="people-row explore-markers count-${people.length}">${people.map(npc => `<button class="person-chip explore-marker ${npc.id === selected ? 'selected' : ''}" data-ui="select:${npc.id}" aria-pressed="${npc.id === selected}" aria-label="找${esc(npc.name)}，${esc(npc.role)}"><span class="npc-avatar">${esc(npc.initial)}</span><span><b>${esc(npc.name)}</b><small>${esc(npc.role)}</small></span>${npc.id === selected ? '<i class="explore-here">交谈中</i>' : ''}</button>`).join('') || '<p class="explore-no-one">此刻无人，听得水声。</p>'}</div></div>
        <nav class="explore-signposts" data-section="roads" aria-label="离开此处的道路">${roads.map(road => `<button data-ui="travel:${road.id}" ${state.stopped ? 'disabled' : ''}><span>${esc(road.name)}${icon('arrow')}</span><small>${state.stopped ? '先应付盘查' : `步行 ${minutes} 分钟`}</small></button>`).join('')}<button class="explore-map-link" data-ui="tab:map" aria-label="展开全镇地图">${icon('map')}<small>全镇</small></button></nav>
      </div>
      <details class="explore-look"><summary><span>${icon('leaf')}看看四周</span><small>景物与动静</small>${icon('arrow')}</summary><p class="scene-prose">${esc(placeDescription(state))}</p><button class="text-button" data-ui="action:wait">在此候一刻 · 15 分钟 ${icon('clock')}</button></details>
    </section>
    ${sceneResult && ctx.result ? `<div class="explore-scene-response">${ctx.result}</div>` : ''}
    <section class="explore-interaction" aria-label="眼前人物与行动">
      <span class="explore-margin-label">眼前事</span>
      <div class="explore-interaction-body">${person ? `<div class="person-detail"><div class="section-title"><h2>${esc(person.name)}</h2><span>${esc(ctx.relation(state.relations[person.id] ?? 0))}</span></div><p>${esc(person.description)}</p></div>` : '<div class="person-detail"><h2>且在此歇脚</h2><p>无人应声，也可以做些自己的事。</p></div>'}
      ${!sceneResult && !publicResult ? ctx.result : ''}
      <div class="action-grid" data-section="actions">${personal.map(ctx.actionCard).join('') || publicActions.slice(0, 1).map(ctx.actionCard).join('')}</div>
      </div>
    </section>
    <div class="explore-rumor">${ctx.notice}</div>
    ${publicActions.length ? `<details class="explore-other-actions" data-section="public-actions" ${state.stopped || (publicResult && ctx.result) ? 'open' : ''}><summary><span><b>在这里，还可以</b><small>${state.stopped ? '应付查问、用药、交涉' : `${actionsLead ? esc(actionsLead.label) + '、' : ''}歇脚、候时`}</small></span><span class="explore-action-count">${publicActions.length} 项${icon('arrow')}</span></summary>${publicResult ? ctx.result : ''}<div class="action-grid">${publicActions.map(ctx.actionCard).join('')}</div></details>` : ''}
    <footer class="explore-end"><span>路向四方，去留随心。</span><button data-ui="tab:map">展开全镇 ${icon('arrow')}</button></footer>
  </div>`;
}
