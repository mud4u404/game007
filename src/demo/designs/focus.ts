import { derived, type DemoState, type PlaceId } from '../model';
import { icon } from '../icons';
import { escapeHTML as esc, type WorldDesignContext } from '../design-context';

const scenePositions: Record<PlaceId, [number, number]> = {
  dock: [0, 0], street: [100, 0], tea: [0, 50],
  yard: [100, 50], inn: [0, 100], yamen: [100, 100],
};
const portraitIds = ['docker', 'guard', 'xu', 'merchant', 'teaman', 'swordsman', 'innkeeper', 'constable'];

/** Scene copy follows the people and events that are actually here now. */
function sceneLine(state: DemoState): string {
  if (state.stopped) return '铁尺横在面前，秦捕头认出了你。';
  const hour = Math.floor(state.minute % 1440 / 60);
  const night = hour < 6 || hour >= 20;
  switch (state.place) {
    case 'dock': return state.caseStatus === 'held' ? '护卫横刀拦路，船工手里攥着一本旧账。'
      : state.caseStatus === 'moved' ? '木桩边空了。许青被押去了镇公所。'
        : night ? '船已靠岸，绳桩旁不再有人被扣着。' : '绳索解开了，船工们重新搬起货。';
    case 'street': return night ? '铺面落了板，长街渐渐安静下来。'
      : state.flags.purseTaken ? '钱袋不见了。方掌柜留意着过路的人。' : '算盘声里，账册和药包摆在同一张柜上。';
    case 'tea': return state.caseStatus === 'released' && hour >= 6 && hour < 21 ? '许青松了绑，正在棚下歇脚。'
      : hour < 5 || hour >= 22 ? '茶棚打烊了，长凳还留在檐下。' : '陆婆婆添了热水，邻桌说起岸上的事。';
    case 'yard': return hour < 7 || hour >= 20 ? '练武的人散了，白灰线还留在地上。' : '灰衣剑客收了势，剑尖垂在身侧。';
    case 'inn': return state.caseStatus === 'released' && (hour < 6 || hour >= 21) ? '许青在客栈歇下，宋娘子还留着热汤。'
      : night ? '门廊亮着灯，还能投店歇脚。' : '柜上留着热汤，门廊有条空长凳。';
    case 'yamen': return state.caseStatus === 'moved' ? '许青坐在廊下，卫衡仍守着他。'
      : state.caseStatus === 'released' ? '船工已获自由，公所里仍有人当值。' : '秦捕头坐在石阶前，翻着今日的案牍。';
  }
}

/** An invitation opens a choice; it never spends time or selects an action. */
function sceneInvitation(ctx: WorldDesignContext, needsRest: boolean): { label: string; ui: string; target?: string } {
  const present = (id: string) => ctx.people.some(person => person.id === id);
  if (ctx.state.stopped) return { label: '应对捕头的查问', ui: 'focus-actions', target: 'constable' };
  if (needsRest) return { label: '先歇脚，缓一缓', ui: 'focus-actions' };
  if (present('xu')) return { label: ctx.state.caseStatus === 'held' ? '问问这场争执' : ctx.state.caseStatus === 'moved' ? '问问许青的处境' : '和许青说两句', ui: 'select:xu', target: 'xu' };
  const invitation: Record<string, string> = {
    docker: '找一份码头的活', merchant: '去柜台看看', teaman: '找陆婆婆坐坐',
    swordsman: ctx.state.sword ? '向剑客请教' : '看看他的剑',
    innkeeper: '进店歇歇脚', constable: '找捕头说说话',
  };
  const target = ctx.people.find(person => invitation[person.id]);
  return target ? { label: invitation[target.id], ui: `select:${target.id}`, target: target.id }
    : { label: '去别处走走', ui: 'tab:map' };
}

export function renderFocus(ctx: WorldDesignContext): string {
  const { state, place } = ctx;
  const hour = Math.floor(state.minute % 1440 / 60);
  const clock = `${String(hour).padStart(2, '0')}:${String(Math.floor(state.minute % 60)).padStart(2, '0')}`;
  const night = hour < 6 || hour >= 20;
  const hpMax = derived(state).hpMax;
  const lowHp = state.hp < hpMax * .4;
  const lowStamina = state.stamina < 25;
  const invitation = sceneInvitation(ctx, lowHp || lowStamina);
  const people = [...ctx.people].sort((a, b) => Number(b.id === invitation.target) - Number(a.id === invitation.target)).slice(0, 4);
  const [sceneX, sceneY] = scenePositions[place.id];
  const urgency = state.stopped ? '去路被拦'
    : state.caseStatus === 'held' && state.place === 'dock' ? '午时押走'
      : state.caseStatus === 'moved' && state.place === 'yamen' ? '尚未发落' : '';
  const warning = state.stopped ? '先了结眼前的查问，才能动身。'
    : lowHp && lowStamina ? '伤势未愈，精力也快耗尽。' : lowHp ? '伤势未愈，歇脚或敷药能恢复气血。'
      : lowStamina ? '精力将尽，歇脚后再上路。' : '';

  return `<div class="focus-world">
    <section class="focus-scene focus-place-${esc(place.id)}${night ? ' is-night' : ''}" data-section="scene" aria-label="${esc(place.name)}">
      <div class="focus-scene-art" style="--scene-x:${sceneX}%;--scene-y:${sceneY}%" role="img" aria-label="${esc(place.name)}的景象"></div>
      <header class="focus-top"><b>青溪<span>第 ${Math.floor(state.minute / 1440) + 1} 日</span></b><time>${clock}${icon(night ? 'moon' : 'sun')}</time><button data-ui="menu" aria-label="打开菜单"><svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button></header>
      <div class="focus-location">${urgency ? `<span class="focus-scene-urgency${state.stopped ? ' is-danger' : ''}"><i></i>${esc(urgency)}</span>` : ''}<h1>${esc(place.name)}</h1><p>${esc(sceneLine(state))}</p></div>
    </section>
    <div class="focus-console">
      <section class="focus-people" data-section="people" data-count="${people.length}" aria-label="附近的人">
        <div class="focus-people-heading"><h2>${people.length ? '眼前的人' : '此处暂时无人'}</h2></div>
        <div class="focus-people-cards">${people.map(person => `<button class="focus-npc${person.id === invitation.target ? ' is-involved' : ''}" data-ui="select:${esc(person.id)}" aria-label="与${esc(person.name)}交涉，${esc(person.role)}"><span class="cinema-portrait" style="--portrait-index:${portraitIds.indexOf(person.id)}" aria-hidden="true"></span><span class="focus-npc-copy"><b>${esc(person.name)}</b><small>${esc(person.role)}</small></span>${icon('arrow')}</button>`).join('')}</div>
      </section>
      ${ctx.result ? `<div class="focus-feedback" data-section="result">${ctx.result}</div>` : ''}
      ${warning ? `<button class="focus-warning" data-ui="focus-actions">${icon('shield')}<span>${esc(warning)}</span>${icon('arrow')}</button>` : ''}
      <button class="focus-resources" data-ui="status" aria-label="查看状态：气血 ${Math.ceil(state.hp)} / ${hpMax}，精力 ${Math.round(state.stamina)}，盘缠 ${state.silver} 文"><span class="${lowHp ? 'is-low' : ''}"><i class="focus-health-dot" aria-hidden="true"></i><small>气血</small><b>${Math.ceil(state.hp)}<small>/${hpMax}</small></b></span><span class="${lowStamina ? 'is-low' : ''}"><small>精力</small><b>${Math.round(state.stamina)}</b></span><span><small>盘缠</small><b>${state.silver}<small>文</small></b></span>${icon('arrow')}</button>
      <div class="focus-scene-actions"><button class="focus-primary" data-ui="${esc(invitation.ui)}">${esc(invitation.label)} ${icon('arrow')}</button><button class="focus-secondary" data-ui="focus-actions">行动 ${icon('spark')}</button></div>
    </div>
  </div>`;
}
