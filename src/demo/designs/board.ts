import { icon } from '../icons';
import { actionsFor, clockLabel, derived, placeDescription, PLACES, travel, type DemoState, type PlaceId } from '../model';
import { escapeHTML as esc, type WorldDesignContext } from '../design-context';
import { smartSuggestions, travelMinutes } from '../suggestions';

/** A town ledger: pending matters and useful next steps, with every free action retained. */
export function renderBoard(ctx: WorldDesignContext): string {
  const { state: s, people, selected } = ctx;
  const who = people.find(person => person.id === selected);
  const personActions = who ? actionsFor(s, who.id) : [];
  const shown = new Set(personActions.map(action => action.id));
  const publicActions = actionsFor(s).filter(action => !shown.has(action.id));
  const suggestions = smartSuggestions(s).slice(0, 3);
  const health = derived(s);
  const replyAt = (section: WorldDesignContext['responseSection']) => ctx.responseSection === section ? ctx.result : '';

  return `<article class="board-view">
    <header class="board-masthead">
      <div class="board-utility"><span>江南道 · 一镇风物</span><div>
        <button data-ui="layouts" aria-label="切换界面方案">界面</button>
        <button data-ui="journal" aria-label="江湖手记">${icon('book')}</button>
        <button data-ui="theme" aria-label="切换明暗主题">${icon(ctx.theme === 'dark' ? 'sun' : 'moon')}</button>
      </div></div>
      <div class="board-title"><h1>青溪<span>江湖事</span></h1><span class="board-seal" aria-label="随心而行">随心<br>而行</span></div>
      <div class="board-dateline"><b>${esc(ctx.place.name)}</b><span>${esc(clockLabel(s))}</span></div>
      <button class="board-account" data-ui="tab:person" aria-label="查看人物与完整属性">
        <span>盘缠 <b>${s.silver}</b> 文</span><span>精力 <b>${Math.round(s.stamina)}</b></span><span class="${s.hp < health.hpMax * .4 ? 'board-alert' : ''}">气血 <b>${Math.ceil(s.hp)}</b><small>/${health.hpMax}</small></span>${icon('arrow')}
      </button>
    </header>

    ${ctx.legacy}
    ${caseBoard(s)}
    ${replyAt('scene')}

    <section class="board-next" aria-labelledby="board-next-title" data-section="suggestions">
      <div class="board-section-heading"><h2 id="board-next-title">眼下可办</h2><span>按你的处境，列几条路</span></div>
      ${replyAt('suggestions')}
      <div class="board-suggestions">${suggestions.map((suggestion, index) => `<button class="board-suggestion" data-suggestion="${esc(suggestion.id)}" data-ui="${esc(suggestion.ui)}"><span class="board-suggestion-number">${String(index + 1).padStart(2, '0')}</span><span class="board-suggestion-content"><b>${esc(suggestion.title)}</b><span class="suggestion-reason">${esc(suggestion.reason)}</span><small class="suggestion-cost">${esc(suggestion.cost)}</small></span>${icon('arrow')}</button>`).join('') || '<p class="board-quiet">此刻没有急事。找人聊两句，或顺着路走走。</p>'}</div>
      <p class="board-choice-note">只列去路，不替你做决定。也可自由选下面的事。</p>
    </section>

    <section class="board-local" data-section="observation">
      <div class="board-section-heading"><h2>此刻 · ${esc(ctx.place.name)}</h2><button data-ui="action:wait" ${s.stopped ? 'disabled' : ''}>候一刻 ${icon('clock')}</button></div>
      <p class="scene-prose">${esc(placeDescription(s))}</p>
    </section>

    <section class="board-people" data-section="people">
      <div class="board-section-heading"><h2>当地人物</h2><span>${people.length} 人在此 · 点名字交往</span></div>
      <div class="people-row">${people.map(person => `<button class="person-chip ${person.id === selected ? 'selected' : ''}" data-ui="select:${person.id}" aria-pressed="${person.id === selected}"><span class="npc-avatar tone-${esc(person.tone)}">${esc(person.initial)}</span><span><b>${esc(person.name)}</b><small>${esc(person.role)}</small></span></button>`).join('') || '<p class="board-quiet">此刻无人，倒也清静。</p>'}</div>
      ${who ? `<div class="person-detail"><div class="section-title"><h3>${esc(who.name)}</h3><span class="board-relation">${esc(ctx.relation(s.relations[who.id] ?? 0))}</span></div><p>${esc(who.description)}</p></div>` : ''}
      ${replyAt('people')}
      <div class="action-grid" data-section="actions">${personActions.map(ctx.actionCard).join('')}</div>
    </section>

    ${publicActions.length || replyAt('public-actions') ? `<section class="board-other" data-section="public-actions"><div class="board-section-heading"><h2>其他可做的事</h2><span>所有选择，都在这里</span></div>${replyAt('public-actions')}<div class="action-grid">${publicActions.map(ctx.actionCard).join('')}</div></section>` : ''}

    <section class="board-roads roads-section" data-section="roads">
      <div class="board-section-heading"><h2>离开此地</h2><button data-ui="tab:map">全镇地图 ${icon('map')}</button></div>
      <div class="road-grid">${ctx.place.links.map(id => roadButton(s, id)).join('')}</div>
    </section>
    <p class="board-colophon">读字不赶时辰，落子自有回声。</p>
  </article>`;
}

function caseBoard(s: DemoState): string {
  const finished = s.caseStatus === 'released';
  const to: PlaceId = s.caseStatus === 'moved' ? 'yamen' : 'dock';
  let target: PlaceId = finished ? (s.minute % 1440 >= 360 && s.minute % 1440 < 1260 ? 'tea' : 'inn') : to;
  const currentName = PLACES.find(place => place.id === target)!.name;
  const arrival = structuredClone(s);
  travel(arrival, target);
  if (!finished && arrival.caseStatus === 'moved') target = 'yamen';
  if (finished) target = arrival.minute % 1440 >= 360 && arrival.minute % 1440 < 1260 ? 'tea' : 'inn';
  const targetName = PLACES.find(place => place.id === target)!.name;
  const remaining = Math.max(0, 720 - s.minute);
  const atTarget = s.place === target;
  const evidence = actionsFor(s, s.caseStatus === 'moved' ? 'constable' : 'guard').find(action => action.id === 'rescue-evidence');
  const ready = Boolean(s.flags.ledger && s.flags.witness);
  const host = finished ? 'xu' : s.caseStatus === 'moved' ? 'constable' : 'guard';
  const hostHere = actionsFor(s, host).length > 0;
  const visitUi = atTarget ? `select:${host}` : `travel:${target}`;
  const canVisit = !s.stopped && (!atTarget || hostHere);
  const doneMethod: Record<string, string> = {
    evidence: '账目核清，人证说得明白。许青已经获释。',
    money: '六十文替许青担了保，他记下这份人情。',
    sneak: '你带许青脱了身。谁看见了，镇上自有议论。',
    fight: '你救出了许青，漕帮也记住了这场交手。',
  };

  return `<section class="board-case ${finished ? 'is-settled' : ''}" aria-labelledby="board-case-title" data-section="scene">
    <div class="board-case-heading"><div><span>${finished ? '一桩往事' : '未结 · 船工的旧账'}</span><h2 id="board-case-title">${finished ? '人已自由，情还在' : '许青，为何被扣？'}</h2></div><span class="board-case-stamp">${finished ? '已了' : '待了'}</span></div>
    <div class="board-case-location"><span>${finished ? '许青歇在' : '人仍在'}<b>${esc(currentName)}</b></span><strong>${finished ? '恩情留下了' : s.caseStatus === 'held' ? `距押送 ${remaining} 分钟` : '已过午时 · 仍可解围'}</strong></div>
    ${finished ? `<p class="board-case-prose">${esc(doneMethod[s.caseMethod ?? ''] || '事情已有了下文，镇上的人会记得。')}</p>` : `<p class="board-case-prose">他拿走的是船行账本，说东家还欠着工钱。</p><div class="board-evidence" aria-label="查证进度">${clueButton(s, 'ledger', '货单', 'street', 'inspect-ledger', '长街查账')}${clueButton(s, 'witness', '人证', 'tea', 'ask-witness', '茶棚问人')}</div>`}
    ${s.stopped ? '<p class="board-case-warning">秦捕头正拦着去路，先了结眼前的查问。</p>' : ready && !finished && evidence && !evidence.disabled ? `<button class="board-case-resolve" data-ui="action:rescue-evidence"><b>两份线索齐了 · 拿证据说话</b><small>${esc(evidence.cost)}</small>${icon('arrow')}</button>` : `<button class="board-case-visit" data-ui="${visitUi}" ${canVisit ? '' : 'disabled'}><span>${finished ? atTarget ? '与许青聊聊' : `去${targetName}看看他` : atTarget ? '问问扣人的缘由 · 也可另想办法' : `去${targetName}找人`}</span><small>${atTarget ? '先看人物与可选做法' : tripCost(s, target)}</small>${icon('arrow')}</button>`}
  </section>`;
}

function clueButton(s: DemoState, flag: 'ledger' | 'witness', name: string, to: PlaceId, actionId: string, label: string): string {
  if (s.flags[flag]) return `<div class="board-clue done"><span class="board-check">✓</span><span><b>${name}已核实</b><small>${flag === 'ledger' ? '船钱已清 · 工钱未付' : '拿账本，是为讨工钱'}</small></span></div>`;
  const minutes = travelMinutes(s, to);
  const onArrival = structuredClone(s);
  travel(onArrival, to);
  const offer = onArrival.place === to && !onArrival.stopped ? actionsFor(onArrival).find(action => action.id === actionId) : undefined;
  const present = s.place === to;
  const available = !s.stopped && offer && !offer.disabled && (present || minutes !== null);
  return `<button class="board-clue" data-ui="${present ? `action:${actionId}` : `travel:${to}`}" ${available ? '' : 'disabled'}><span class="board-check"></span><span><b>${esc(present ? offer?.label || label : label)}</b><small>${!available ? esc(s.stopped || onArrival.stopped ? '先了结巡街的查问' : offer?.disabled || '这会儿人不在，稍后再访') : present ? esc(offer.cost) : `${tripCost(s, to)} · 到达后查访`}</small></span>${icon('arrow')}</button>`;
}

function tripCost(s: DemoState, to: PlaceId): string {
  const minutes = travelMinutes(s, to);
  if (minutes === null) return '暂不能动身';
  const preview = structuredClone(s);
  travel(preview, to);
  return `行路 ${minutes} 分钟${preview.stopped ? ' · 途中会受查问' : ''}`;
}

function roadButton(s: DemoState, id: PlaceId): string {
  const place = PLACES.find(p => p.id === id)!;
  return `<button class="road-card" data-ui="travel:${place.id}" ${s.stopped ? 'disabled' : ''}><span class="board-road-mark">往</span><span><b>${esc(place.name)}</b><small>${esc(place.subtitle)} · ${tripCost(s, id)}</small></span>${icon('arrow')}</button>`;
}
