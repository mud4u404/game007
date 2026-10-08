import { derived, type DemoState, type PlaceId } from '../model';
import { icon } from '../icons';
import { escapeHTML as esc, type WorldDesignContext } from '../design-context';

/** A sentence about the actual scene, rather than a second quest summary. */
function sceneLine(state: DemoState): string {
  if (state.stopped) return '秦捕头拦住了你的去路。';
  const hour = Math.floor(state.minute % 1440 / 60);
  const night = hour < 6 || hour >= 20;
  switch (state.place) {
    case 'dock': return state.caseStatus === 'held' ? '一个船工被扣在岸边，午时押走。'
      : state.caseStatus === 'moved' ? '木桩边空了，许青已被押往镇公所。'
        : night ? '船已靠岸，许青也恢复了自由。' : '绳索已解开，船工们重新搬起货。';
    case 'street': return night ? '铺面已落板，街上渐渐安静下来。'
      : state.flags.purseTaken ? '钱袋不见了，方掌柜留意着来往的人。' : '方掌柜的柜台前，账册和药包摆在一起。';
    case 'tea': return state.caseStatus === 'released' && hour >= 6 && hour < 21 ? '许青松了绑，正在棚下歇脚。'
      : hour < 5 || hour >= 22 ? '茶棚打烊了，长凳还留在檐下。' : '陆婆婆添了热水，等你坐下说话。';
    case 'yard': return hour < 7 || hour >= 20 ? '练武的人散了，场地空着。' : '顾行舟垂下剑尖，看向停步的你。';
    case 'inn': return state.caseStatus === 'released' && (hour < 6 || hour >= 21) ? '许青在客栈歇下，宋娘子还留着热汤。'
      : night ? '门廊亮着灯，还能投店歇脚。' : '宋娘子留了热汤，门廊也能歇脚。';
    case 'yamen': return state.caseStatus === 'moved' ? '许青坐在廊下，卫衡仍守着他。'
      : state.caseStatus === 'released' ? '船工已获自由，公所里仍有人当值。' : '秦捕头坐在阶前，翻着今日的案牍。';
  }
}

/** Top-down place outlines: they distinguish water, buildings and open ground. */
function placePlan(place: PlaceId): string {
  const plans: Record<PlaceId, string> = {
    dock: `<path class="focus-water" d="M218 0H360V360H275L211 263 248 159Z"/><path class="focus-shore" d="M218 0 248 159 211 263 275 360"/><path class="focus-ground" d="M-12 113H148V211H-12M25 114V212M50 114V212M75 114V212M100 114V212M126 114V212"/><path class="focus-structure" d="M-12 30H119V66H-12M265 159l60-10 13 13-7 14-60 9Z"/><path class="focus-path" d="M148 162H196L235 308"/>`,
    street: `<path class="focus-ground" d="M-5 130H130V-5M216-5V130H365M365 220H216V365M130 365V220H-5"/><path class="focus-structure" d="M25 29H104V107H25ZM243 26H332V106H243ZM23 246H103V328H23ZM244 247H333V329H244Z"/><path class="focus-path" d="M172 6V351M2 175H353"/>`,
    tea: `<path class="focus-water" d="M0 0H360V54L0 113Z"/><path class="focus-shore" d="M0 113 360 54"/><path class="focus-ground" d="M73 143H289V300H73Z"/><path class="focus-structure" d="M105 167H145V179H105ZM216 167H256V179H216ZM105 264H145V276H105ZM216 264H256V276H216Z"/><path class="focus-path" d="M-5 340H180V298"/>`,
    yard: `<path class="focus-ground" d="M46 43H314V320H227M135 320H46V43"/><circle class="focus-structure" cx="180" cy="178" r="89"/><path class="focus-structure" d="M78 74H118M78 82H118M241 277H281M241 285H281"/><path class="focus-path" d="M181 359V277"/>`,
    inn: `<path class="focus-ground" d="M32 55H328V292H217M142 292H32V55"/><path class="focus-structure" d="M32 117H328M110 55V117M187 55V117M261 55V117M80 175H131V213H80ZM222 175H274V213H222Z"/><path class="focus-path" d="M180 358V264M145 260H219"/>`,
    yamen: `<path class="focus-ground" d="M32 49H328V192H32Z"/><path class="focus-structure" d="M61 79H137V146H61ZM222 79H298V146H222ZM87 207H273M87 219H273M87 231H273"/><path class="focus-path" d="M180 247V360M31 286H328"/>`,
  };
  return `<svg class="focus-plan" viewBox="0 0 360 360" fill="none" aria-hidden="true" preserveAspectRatio="none">${plans[place]}</svg>`;
}

/** The world is the place itself. Interactions open only after an explicit tap. */
export function renderFocus(ctx: WorldDesignContext): string {
  const { state, place } = ctx;
  const people = ctx.people.slice(0, 4);
  const hour = String(Math.floor(state.minute % 1440 / 60)).padStart(2, '0');
  const minute = String(Math.floor(state.minute % 60)).padStart(2, '0');
  const hpMax = derived(state).hpMax;
  const lowHp = state.hp < hpMax * .4;
  const lowStamina = state.stamina < 25;
  const warnings = state.stopped ? ['去路被拦，先应对查问']
    : [lowHp ? '气血不足' : '', lowStamina ? '精力将尽' : ''].filter(Boolean);
  const points = people.length <= 1 ? [[53, 39]]
    : people.length === 2 ? [[29, 35], [73, 52]]
      : people.length === 3 ? [[27, 30], [72, 42], [34, 64]]
        : [[27, 26], [72, 26], [27, 59], [72, 59]];

  return `<div class="focus-world">
    <header class="focus-top"><b>青溪</b><time>第 ${Math.floor(state.minute / 1440) + 1} 日 <span>${hour}:${minute}</span></time><button data-ui="menu" aria-label="打开菜单"><svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button></header>
    <section class="focus-location" data-section="scene"><h1>${esc(place.name)}</h1><p>${esc(sceneLine(state))}</p></section>
    <section class="focus-scene-map focus-place-${esc(place.id)}" aria-label="${esc(place.name)}附近的人，点姓名交涉">
      ${placePlan(place.id)}
      ${people.map((person, i) => `<button class="focus-npc" style="--node-x:${points[i][0]}%;--node-y:${points[i][1]}%" data-ui="select:${esc(person.id)}" aria-label="与${esc(person.name)}交涉，${esc(person.role)}"><span class="focus-npc-mark">${icon('person')}</span><b>${esc(person.name)}</b></button>`).join('')}
      <div class="focus-you"><span aria-hidden="true"></span><b>你</b></div>
      ${people.length ? '' : '<p class="focus-empty">附近无人</p>'}
    </section>
    ${ctx.result ? `<div class="focus-feedback" data-section="result">${ctx.result}</div>` : ''}
    ${warnings.length ? `<button class="focus-warning" data-ui="focus-actions">${icon('shield')}<span>${esc(warnings.join(' · '))}${!state.stopped ? '，先歇脚养伤' : ''}</span>${icon('arrow')}</button>` : ''}
    <button class="focus-resources" data-ui="status" aria-label="查看状态：气血 ${Math.ceil(state.hp)} / ${hpMax}，精力 ${Math.round(state.stamina)}，盘缠 ${state.silver} 文"><span class="${lowHp ? 'is-low' : ''}"><i class="focus-health-dot" aria-hidden="true"></i><small>气血</small><b>${Math.ceil(state.hp)}<small>/${hpMax}</small></b></span><span class="${lowStamina ? 'is-low' : ''}"><small>精力</small><b>${Math.round(state.stamina)}</b></span><span><small>盘缠</small><b>${state.silver}<small>文</small></b></span></button>
    <div class="focus-scene-actions"><button class="focus-primary" data-ui="focus-actions">做点什么 ${icon('arrow')}</button><button class="focus-secondary" data-ui="tab:map">${icon('map')} 去别处</button></div>
  </div>`;
}
