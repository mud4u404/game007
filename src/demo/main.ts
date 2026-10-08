import './style.css';
import './mobile.css';
import './designs/explore.css';
import './designs/board.css';
import './designs/ranger.css';
import './designs/shell.css';
import { renderExplore } from './designs/explore';
import { renderBoard } from './designs/board';
import { renderRanger } from './designs/ranger';
import type { WorldDesignContext } from './design-context';
import { icon } from './icons';
import {
  ORIGINS, PLACES, NPCS, ITEMS, MAX_SKILL_LEVEL, trainingOffer, createDemo, derived, npcsAt,
  actionsFor, act, travel, train, setStance, settleBattle,
  type DemoState, type OriginId, type PlaceId, type AttrKey, type DemoAction,
  type ActionResult, type BattleRequest,
} from './model';
import {
  createBattle, tickBattle, responses, respond, perform, ultimate, flee, takeMedicine,
  type DemoBattle, type ResponseKey,
} from './battle';

const SAVE_KEY = 'game007-sandbox-demo-v1';
const THEME_KEY = 'game007-sandbox-demo-theme';
const LAYOUT_KEY = 'game007-sandbox-demo-layout';
const LAYOUTS = [
  { id: 'cards', name: '场景探索', number: '一', note: '人在景中，路在脚下。点眼前的人，再决定怎么做。', detail: '山水长卷 · 人物定位与去路同屏' },
  { id: 'scroll', name: '事务总览', number: '二', note: '接着上回的事。线索、待办与下一步放在一起。', detail: '市井告示 · 从未完事务直接行动' },
  { id: 'compact', name: '情境操作', number: '三', note: '先看眼下处境，再选适合此刻的行动。', detail: '掌上游侠 · 状态建议与拇指快捷操作' },
] as const;
type Layout = typeof LAYOUTS[number]['id'];
let layout: Layout = 'cards';
try {
  const choice = new URLSearchParams(location.search).get('layout') ?? localStorage.getItem(LAYOUT_KEY);
  if (LAYOUTS.some(l => l.id === choice)) layout = choice as Layout;
} catch { /* the default layout also works without storage */ }
document.documentElement.dataset.layout = layout;
const root = document.querySelector<HTMLDivElement>('#demo-root')!;
const esc = (v: unknown): string => String(v).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]!);
type Tab = 'world' | 'person' | 'sword' | 'bag' | 'map';
const TABS: { id: Tab; name: string }[] = [{ id: 'world', name: '江湖' }, { id: 'person', name: '人物' }, { id: 'sword', name: '武学' }, { id: 'bag', name: '行囊' }, { id: 'map', name: '行路' }];
const ATTRS: { id: AttrKey; name: string; hint: string }[] = [
  { id: 'body', name: '体魄', hint: '承伤与劳作' }, { id: 'root', name: '根骨', hint: '内息与硬接' },
  { id: 'agility', name: '身法', hint: '赶路与闪避' }, { id: 'insight', name: '悟性', hint: '查证与拆招' },
  { id: 'courage', name: '胆魄', hint: '临敌与抢攻' },
];
const CASE_METHODS: Record<string, string> = {
  evidence: '你查明了账目，让许青获释。船工记情，捕头也认得你。',
  money: '你替许青垫下六十文担保，换来一份人情。',
  sneak: '你带许青脱了身。谁看见了这一幕，江湖自有回声。',
  fight: '你凭一剑救下许青，漕帮也记住了你的名字。',
};

function load(): DemoState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as DemoState;
    if (s.version !== 1 || !ORIGINS.some(o => o.id === s.origin) || !PLACES.some(p => p.id === s.place)) return null;
    if (!['held', 'moved', 'released'].includes(s.caseStatus) || !['steady', 'flowing'].includes(s.stance)) return null;
    const nums = [s.minute, s.hp, s.mp, s.stamina, s.silver, s.experience, s.power, s.sword, s.footwork, s.heat, s.renown, s.theftHeat];
    if (nums.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) return null;
    if (!s.attrs || ATTRS.some(a => !Number.isFinite(s.attrs[a.id]) || s.attrs[a.id] < 1 || s.attrs[a.id] > 30)) return null;
    for (const record of [s.inventory, s.relations, s.daily]) {
      if (!record || typeof record !== 'object' || Array.isArray(record) || Object.values(record).some(v => typeof v !== 'number' || !Number.isFinite(v))) return null;
    }
    if (!s.flags || typeof s.flags !== 'object' || !Array.isArray(s.log) || s.log.some(l => !l || typeof l.text !== 'string' || !Number.isFinite(l.at))) return null;
    if (s.pendingBattle && (!['guard', 'swordsman'].includes(s.pendingBattle.foe) || !['rescue', 'spar', 'arrest'].includes(s.pendingBattle.reason))) return null;
    s.name = typeof s.name === 'string' ? s.name.slice(0, 12) : '无名客';
    return s;
  } catch { return null; }
}

const loaded = load();
let state = loaded ?? createDemo('porter');
let started = Boolean(loaded);
let chosenOrigin: OriginId = 'porter';
let tab: Tab = 'world';
let selected = '';
let message = loaded ? '' : '初到青溪，渡口还没人认得你。先挣几文盘缠，或去看看岸边那场争执，都由你。';
let changes: string[] = [];
let responseSection: WorldDesignContext['responseSection'] = 'scene';
let modal: 'journal' | 'origins' | 'about' | 'layouts' | null = null;
let confirmOrigin: OriginId | null = null;
let activeFight: { request: BattleRequest; battle: DemoBattle } | null = null;
let fightPaused = false;
let tellSeconds = 0;
let hasResponded = false;
let lastBattleTick = 0;
let modalReturnFocus: string | null = null;
let storageFailed = false;
try { document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { /* private browsing */ }

function save(): void {
  if (!started) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); storageFailed = false; }
  catch { storageFailed = true; }
}

const place = () => PLACES.find(p => p.id === state.place)!;
const origin = () => ORIGINS.find(o => o.id === state.origin)!;
const knownAs = () => state.renown >= 12 ? '镇上渐有人识' : state.renown > 0 ? '略有耳闻' : '默默无名';
const pill = (text: string, tone = '') => `<span class="pill ${tone}">${esc(text)}</span>`;
const bar = (label: string, now: number, max: number, cls: string) => `<div class="resource ${cls}"><div><span>${label}</span><b>${max > 0 ? `${Math.ceil(now)}<small> / ${max}</small>` : '未习内功'}</b></div><div class="track"><i style="width:${max > 0 ? Math.max(0, Math.min(100, now / max * 100)) : 0}%"></i></div></div>`;

function originCard(o: typeof ORIGINS[number], arrival = false): string {
  const on = arrival ? o.id === chosenOrigin : o.id === state.origin;
  return `<button class="origin-card ${on ? 'chosen' : ''}" data-ui="${arrival ? 'choose-origin' : 'origin'}:${o.id}" aria-pressed="${on}"><div class="section-title"><h3>${esc(o.name)}</h3>${pill(arrival && on ? '选此出身' : o.title)}</div><p>${esc(o.description)}</p><div class="origin-attrs">${ATTRS.map(a => `<span>${a.name}<b>${o.attrs[a.id]}</b></span>`).join('')}</div><small>${esc(o.perk)}</small>${!arrival && confirmOrigin === o.id ? '<strong class="confirm-note">再点一次，确认重新开始</strong>' : ''}</button>`;
}

function arrivalView(): string {
  return `<main class="arrival-screen"><div class="arrival-scroll"><div class="arrival-scene"><img src="./demo/harbor.webp" alt="微雨初晴的青溪渡口"><button class="button secondary" data-ui="layouts">${icon('map')} 挑一种界面</button></div><div class="arrival-heading"><span class="eyebrow">江湖夜雨 · 青溪试游</span><h1>还不会武功的你，<br>先从哪里来？</h1><p>身上二十八文，一包行李。<br>先谋一口饭，或去认识一个教你握剑的人。</p><span class="pill green">四种出身 · 都从未入门开始</span></div><div class="arrival-origins" aria-label="选择出身">${ORIGINS.map(o => originCard(o, true)).join('')}</div></div><div class="arrival-footer"><button class="button wide" data-ui="begin">以${esc(ORIGINS.find(o => o.id === chosenOrigin)!.name)}起步 ${icon('arrow')}</button><p>出身决定起点，往后的路由你自己走。</p></div></main><div id="modal-root"></div><div id="fight-root"></div><div class="sr-only" aria-live="polite" id="announcer"></div>`;
}

function layoutPicker(): string {
  return `<p class="modal-intro">比较三种操作方式：从场景找人、接着未完的事，或按眼下处境行动。切换保留同一份进度。</p><div class="layout-picker">${LAYOUTS.map(l => `<button class="layout-option ${layout === l.id ? 'chosen' : ''}" data-ui="layout:${l.id}" aria-pressed="${layout === l.id}"><div class="layout-sample sample-${l.id}" aria-hidden="true"><div class="layout-sample-scene"></div><div class="layout-sample-lines"><i></i><i></i><i></i></div><div class="layout-sample-actions"><i></i><i></i><i></i></div></div><div><span class="eyebrow">方案${l.number}${layout === l.id ? ' · 正在用' : ''}</span><h3>${l.name}</h3><p>${l.note}</p><small>${l.detail}</small></div></button>`).join('')}</div><button class="button wide" data-ui="close">${started ? '回到江湖' : '继续选出身'} ${icon('arrow')}</button>`;
}

function quickDock(): string {
  return tab === 'world' ? `<nav class="quick-dock" aria-label="当前地点快捷操作"><button data-ui="quick:people">${icon('person')}找人</button><button data-ui="quick:actions">${icon('leaf')}做事</button><button data-ui="quick:roads">${icon('pin')}动身</button></nav>` : '';
}

function nav(cls: string): string {
  return `<nav class="${cls}" aria-label="主要页面">${TABS.map(t => `<button data-ui="tab:${t.id}" class="${tab === t.id ? 'active' : ''}" ${tab === t.id ? 'aria-current="page"' : ''}>${icon(t.id)}<span>${t.name}</span>${cls === 'side-nav' ? '<i>›</i>' : ''}</button>`).join('')}</nav>`;
}

function miniStats(): string {
  const d = derived(state);
  return `<section class="panel player-strip"><button class="player-id" data-ui="tab:person"><span class="seal-avatar">${esc(state.name[0])}</span><span><b>${esc(state.name)}</b><small>${knownAs()} · ${esc(origin().name)}</small></span></button><div class="mini-resources">${bar('气血', state.hp, d.hpMax, 'hp')}${bar('内力', state.mp, d.mpMax, 'mp')}</div><div class="pocket-strip"><span>${icon('coin')}${state.silver} 文</span><span>${icon('leaf')}精力 ${Math.round(state.stamina)} / 100</span></div></section>`;
}

function mapMarkup(compact = false): string {
  const edges = new Set<string>();
  const lines = PLACES.flatMap(p => p.links.map(id => {
    const q = PLACES.find(x => x.id === id)!;
    const key = [p.id, q.id].sort().join(':');
    if (edges.has(key)) return '';
    edges.add(key);
    return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`;
  })).join('');
  return `<div class="town-map ${compact ? 'compact-map' : ''}" role="group" aria-label="青溪镇地图"><span class="map-water-label">青 溪</span><svg class="map-roads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="river" d="M-10 80 Q 10 60 35 78 T 110 62"/>${lines}</svg>${PLACES.map(p => `<button class="map-node ${p.id === state.place ? 'here' : ''}" data-ui="travel:${p.id}" style="left:${p.x}%;top:${p.y}%" ${p.id === state.place ? 'aria-current="location"' : ''}><i></i><span>${esc(p.name)}</span></button>`).join('')}<span class="map-north">北 ↑</span></div>`;
}

function journalEntries(limit = 6): string {
  return [...state.log].slice(-limit).reverse().map(l => `<li class="journal-entry ${esc(l.tone)}"><span class="journal-dot"></span><div><small>${formatAt(l.at)}</small><p>${esc(l.text)}</p></div></li>`).join('');
}

function formatAt(min: number): string {
  const h = Math.floor((min % 1440) / 60), m = Math.floor(min % 60);
  return `第${Math.floor(min / 1440) + 1}日 · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function sidebar(): string {
  return `<aside class="world-sidebar"><section class="panel"><div class="section-title"><h2>青溪一隅</h2><span>六处可往</span></div>${mapMarkup(true)}<p class="fine-print">点地名动身。路上会花时间，读字时江湖等你。</p></section><section class="panel rumor-panel"><div class="section-title"><h2>${icon('book')} 江湖回声</h2><button class="text-button" data-ui="journal">翻看手记</button></div><ol class="journal-list">${journalEntries(4)}</ol></section><div class="side-note"><span>此间江湖</span><p>名声从脚下走来，<br>功夫从身上练起。</p><button class="text-button" data-ui="about">关于这段试游 ${icon('arrow')}</button></div></aside>`;
}

function render(): void {
  document.documentElement.dataset.page = started ? tab : 'arrival';
  if (!started) {
    const scroll = document.querySelector('.arrival-scroll')?.scrollTop ?? 0;
    root.innerHTML = arrivalView();
    const scroller = document.querySelector('.arrival-scroll');
    if (scroller) scroller.scrollTop = scroll;
    renderModal();
    return;
  }
  save();
  const mainScroll = document.querySelector('.play-scroll')?.scrollTop ?? 0;
  const openDetails = Array.from(root.querySelectorAll('details[open]'), el => el.getAttribute('data-section') ?? el.className);
  root.innerHTML = `<div class="demo-layout"><aside class="brand-rail"><a class="brand" href="./index.html" aria-label="回到江湖夜雨原版"><span class="brand-mark">江<br>湖</span><div>江湖夜雨<small>一身本事，一段江湖。</small></div></a><div class="edition"><span></span> 青溪试游 · 概念试玩</div>${nav('side-nav')}<div class="rail-bottom"><span class="rail-verse">一蓑烟雨任平生</span><button class="rail-link" data-ui="origins">${icon('reset')} 换一种起步</button><a class="rail-link" href="./index.html">${icon('back')} 回到原版</a></div></aside><div class="play-column">${tab === 'world' ? '' : `<header class="topbar"><div><span class="eyebrow">江湖夜雨 <i>/</i> 青溪试游</span><h1>${{ person: '此身江湖', sword: '一身本事', bag: '随身行囊', map: '行路江南' }[tab]}</h1></div><div class="top-actions"><button class="icon-button layout-trigger" data-ui="layouts" aria-label="切换界面方案">界面</button><button class="icon-button" data-ui="journal" aria-label="江湖手记">${icon('book')}</button><button class="icon-button" data-ui="theme" aria-label="切换明暗主题">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button></div></header>`}<main class="play-scroll" id="main-content">${tab !== 'world' ? miniStats() : ''}${tab === 'world' ? worldView() : tab === 'person' ? personView() : tab === 'sword' ? skillsView() : tab === 'bag' ? bagView() : mapView()}<footer class="save-note">${icon(storageFailed ? 'shield' : 'check')}${storageFailed ? '浏览器未能保存进度，请暂勿关闭此页' : '进度保存在本机 · 原版存档独立保留'}</footer></main>${quickDock()}${nav('bottom-nav')}</div>${sidebar()}</div><div id="modal-root"></div><div id="fight-root"></div><div class="sr-only" aria-live="polite" id="announcer"></div>`;
  const scroller = document.querySelector('.play-scroll');
  for (const el of root.querySelectorAll<HTMLDetailsElement>('details')) {
    if (openDetails.includes(el.getAttribute('data-section') ?? el.className)) el.open = true;
  }
  if (scroller) scroller.scrollTop = mainScroll;
  renderModal();
  renderFight();
}

function resultCard(): string {
  return message ? `<section class="reply-card" aria-live="polite"><span class="reply-line"></span><div><p>${esc(message)}</p>${changes.length ? `<div class="change-tags">${changes.map(x => pill(x)).join('')}</div>` : ''}</div><button data-ui="dismiss" aria-label="收起回应">${icon('close')}</button></section>` : '';
}

function actionCard(a: DemoAction): string {
  return `<button class="action-card ${a.tone ?? ''}" data-ui="action:${esc(a.id)}" ${a.disabled ? 'disabled' : ''}><div class="action-top"><b>${esc(a.label)}</b><span>${esc(a.cost)}</span>${icon('arrow')}</div><p>${esc(a.disabled || a.description)}</p></button>`;
}

function caseNote(): string {
  if (state.caseStatus === 'released') return `<button class="world-notice settled" data-ui="journal">${icon('leaf')}<span><b>一桩事，已有了下文</b><small>${esc(CASE_METHODS[state.caseMethod ?? ''] || '镇上的人开始谈起你的名字。')}</small></span>${icon('arrow')}</button>`;
  const left = Math.max(0, 720 - state.minute);
  return `<button class="world-notice" data-ui="journal">${icon('book')}<span><b>${state.caseStatus === 'held' ? '渡口风声 · 船工的旧账' : '风声有变 · 人已押往镇公所'}</b><small>${state.caseStatus === 'held' ? `许青被扣在岸边。再过${Math.ceil(left / 15)}刻，便要押走。` : '事情还没结束。去镇公所，也许还能见到他。'}</small></span>${icon('arrow')}</button>`;
}

function worldView(): string {
  const people = npcsAt(state);
  if (!people.some(n => n.id === selected)) {
    selected = state.stopped && people.some(n => n.id === 'constable') ? 'constable' : people[0]?.id || '';
  }
  const ctx: WorldDesignContext = {
    state, place: place(), people, selected, originName: origin().name,
    notice: caseNote(), result: resultCard(), responseSection,
    legacy: state.inventory.old_sword > 0 ? `<button class="world-notice" data-ui="origins">${icon('reset')}<span><b>体验新的起点</b><small>旧进度可以继续，也可以换出身，从学武前开始。</small></span>${icon('arrow')}</button>` : '',
    theme: document.documentElement.dataset.theme ?? 'light', actionCard, relation: relationText,
  };
  return layout === 'cards' ? renderExplore(ctx) : layout === 'scroll' ? renderBoard(ctx) : renderRanger(ctx);
}

const relationText = (n: number) => n >= 3 ? '记着你的情' : n >= 1 ? '有些交情' : n <= -1 ? '心有芥蒂' : '素不相识';

function personView(): string {
  const d = derived(state);
  const notes: Record<AttrKey, string> = {
    body: `气血上限 ${d.hpMax}。码头扛货时，身板会影响工钱。`,
    root: d.mpMax ? `内力上限 ${d.mpMax}。临敌硬接，靠的是这口气。` : '尚未习得内功。根骨是调息的底子，找到教你运气的人，才会练出内力。',
    agility: `行路耗时约为常人的 ${Math.round(d.travelFactor * 100)}%。轻身脱困与闪避，也看脚下功夫。`,
    insight: '看账目能否找出疑处，交手能否拆开来招，都有它的用处。',
    courage: '临敌敢不敢抢先出手，出手时有几分把握，与胆魄有关。',
  };
  return `<section class="panel identity-panel"><span class="identity-seal">${esc(state.name[0])}</span><div><span class="eyebrow">${state.sword ? '初识武学，仍在问路' : '尚未习武，江湖初见'}</span><h2>${esc(state.name)}</h2><p>${esc(origin().description)}</p></div><button class="text-button" data-ui="origins">换一种起步 ${icon('arrow')}</button></section><section class="panel"><div class="section-title"><h2>五项根基</h2><span>底子不同，各有所长</span></div><div class="attribute-list">${ATTRS.map(a => `<div class="attribute-row"><div class="attribute-value"><span>${a.name}</span><b>${state.attrs[a.id]}</b></div><div class="attribute-explain"><div class="attribute-track"><i style="width:${state.attrs[a.id] / 20 * 100}%"></i></div><p>${notes[a.id]}</p></div></div>`).join('')}</div></section><section class="panel"><div class="section-title"><h2>眼下的处境</h2></div><div class="facts-grid"><div><span>身份</span><b>${esc(origin().name)}</b></div><div><span>师承</span><b>无门无派</b></div><div><span>盘缠</span><b>${state.silver} 文</b></div><div><span>精力</span><b>${Math.round(state.stamina)} / 100</b></div><div><span>镇上名声</span><b>${knownAs()}</b></div><div><span>官府留意</span><b class="${state.heat ? 'text-danger' : ''}">${state.heat >= 30 ? '有人在寻你' : state.heat > 0 ? '留了印象' : '无人留意'}${state.heat ? ` · ${state.heat}` : ''}</b></div></div></section><section class="panel"><div class="section-title"><h2>相识的人</h2><span>每个人各自记得</span></div>${NPCS.filter(n => state.relations[n.id]).map(n => `<div class="relation-row"><span class="npc-avatar tone-${esc(n.tone)}">${esc(n.initial)}</span><div><b>${esc(n.name)}</b><small>${esc(n.role)}</small></div>${pill(relationText(state.relations[n.id]))}</div>`).join('') || '<p class="empty-note">还没有深交。借一次船、切磋一回、替谁说句话，江湖便从这里开始。</p>'}</section>${resultCard()}`;
}

function skillsView(): string {
  const skills: { kind: 'inner' | 'sword' | 'footwork'; title: string; sub: string; value: number; text: string; icon: string }[] = [
    { kind: 'sword', title: '渡水剑', sub: '剑法 · 从握剑开始', value: state.sword, text: '先站稳，再把剑递出去。第一回有人替你摆正手腕，比剑谱上的名字更要紧。', icon: 'sword' },
    { kind: 'inner', title: '养息功', sub: '内功 · 第一口吐纳', value: state.power, text: '平日的体力不是内力。有人指点呼吸与运气之后，才算摸到内功的门。', icon: 'leaf' },
    { kind: 'footwork', title: '穿巷步', sub: '轻功 · 从脚程到步法', value: state.footwork, text: '跑得快是生活磨出的本领。怎样换步、收力与避锋，还得从头学。', icon: 'world' },
  ];
  const firstSteps = `<section class="panel first-steps"><span class="eyebrow">学武之前，也能行走江湖</span><h2>第一招，要有人教。</h2><p>你有谋生的本领，还没有武学师承。旧武场的顾行舟肯教初学者；先看一遍收剑，再请教握剑、吐纳或步法。</p><ol><li class="${state.flags.observedSword ? 'done' : ''}">看一遍收剑，认清重心</li><li class="${state.sword || state.power || state.footwork ? 'done' : ''}">请教一门入门功夫</li><li>带着这点本事，去生活里印证</li></ol><p class="fine-print">不用交钱，不必拜入门派。你也可以先谋生、查账、交朋友。</p><button class="button wide" data-ui="travel:yard">去旧武场，认识顾行舟 ${icon('arrow')}</button></section>`;
  const stances = state.sword > 0 ? `<section class="panel"><div class="section-title"><h2>使剑的路数</h2><span>开战前可换</span></div><div class="stance-options"><button class="stance-card ${state.stance === 'steady' ? 'on' : ''}" data-ui="stance:steady" aria-pressed="${state.stance === 'steady'}">${icon('shield')}<b>守中</b><span>站稳，留三分余地</span><p>${state.power ? '护身更稳，回锋反击。' : '先守好门户，回锋再试。'}<br>出手留力。</p>${state.stance === 'steady' ? pill('正在用', 'green') : '<small>换成这路剑</small>'}</button><button class="stance-card ${state.stance === 'flowing' ? 'on' : ''}" data-ui="stance:flowing" aria-pressed="${state.stance === 'flowing'}">${icon('sword')}<b>逐流</b><span>剑随人走，抢一步先</span><p>抢攻更强，锋芒更盛。<br>护身稍弱。</p>${state.stance === 'flowing' ? pill('正在用', 'green') : '<small>换成这路剑</small>'}</button></div></section>` : '';
  const cards = skills.map(k => {
    const offer = trainingOffer(state, k.kind);
    const lesson = actionsFor(state, 'swordsman').find(a => a.id === `learn-${k.kind}`);
    const button = k.value > 0
      ? `<button class="button secondary" data-ui="train:${k.kind}" ${offer.disabled ? 'disabled' : ''}>静修 ${icon('arrow')}</button>`
      : lesson
        ? `<button class="button secondary" data-ui="action:${lesson.id}" ${lesson.disabled ? 'disabled' : ''}>请教入门 ${icon('arrow')}</button>`
        : `<button class="button secondary" data-ui="travel:yard">去请教 ${icon('arrow')}</button>`;
    const cost = k.value > 0
      ? `${offer.cost} 历练 · 15 精力 · ${offer.minutes} 分钟${offer.disabled ? `<br>${esc(offer.disabled)}` : ''}`
      : `初学免费 · 10 精力 · 15 分钟${lesson?.disabled ? `<br>${esc(lesson.disabled)}` : '<br>先在旧武场看一遍收剑，再向顾行舟请教。'}`;
    return `<section class="panel skill-card"><div class="skill-title">${icon(k.icon)}<div><h2>${k.title}</h2><span>${k.sub}</span></div>${pill(k.value ? `火候 ${k.value}` : '尚未入门')}</div><p>${k.text}</p><p class="training-cost">${cost}</p><div class="skill-foot"><span>${Array.from({ length: MAX_SKILL_LEVEL }, (_, i) => `<i class="${i < k.value ? 'lit' : ''}"></i>`).join('')}</span>${button}</div></section>`;
  }).join('');
  return `${state.sword + state.power + state.footwork === 0 ? firstSteps : ''}<section class="panel training-summary"><div><span class="eyebrow">行走江湖，积下的见识</span><h2>${state.experience}<small> 历练</small></h2></div>${icon('sword')}<p>先学会入门，再消化经历。做事、切磋都能长见识，静修会花时间和精力。</p></section>${stances}${cards}${resultCard()}<button class="button wide" data-ui="travel:yard">去旧武场 ${icon('arrow')}</button>`;
}

function bagView(): string {
  const items = Object.entries(state.inventory).filter(([, n]) => n > 0);
  return `<section class="panel money-card">${icon('coin')}<div><span>随身盘缠</span><h2>${state.silver}<small> 文</small></h2></div><p>吃一碗热面，添一包伤药。<br>身上有钱，脚下多一条路。</p></section><section class="panel"><div class="section-title"><h2>随身物件</h2><span>${items.length} 种</span></div>${items.map(([id, n]) => { const item = ITEMS[id]; return `<div class="inventory-row"><span class="item-glyph">${id.includes('medicine') ? '药' : id.includes('sword') ? '剑' : id.includes('ledger') ? '簿' : '物'}</span><div><b>${esc(item?.name ?? id)}</b><p>${esc(item?.description ?? '随身带着，或许用得上。')}</p></div><span class="item-count">×${n}</span>${id === 'medicine' ? `<button class="button secondary small" data-ui="medicine" ${state.hp >= derived(state).hpMax ? 'disabled' : ''}>${state.hp >= derived(state).hpMax ? '无伤' : '敷药'}</button>` : ''}</div>`; }).join('') || '<p class="empty-note">行囊空了。去长街看看，或先在码头挣些盘缠。</p>'}</section>${resultCard()}<div class="two-buttons"><button class="button secondary" data-ui="travel:street">去长街 ${icon('arrow')}</button><button class="button secondary" data-ui="travel:inn">投店歇脚 ${icon('arrow')}</button></div>`;
}

function mapView(): string {
  return `<section class="panel large-map-panel"><div class="section-title"><div><span class="eyebrow">江南道 · 一隅</span><h2>青溪镇</h2></div>${pill('点地名即可动身', 'green')}</div>${mapMarkup()}<div class="map-legend"><span><i></i>你在这里</span><span>沿路行走 · 游戏时间推进</span></div></section><div class="place-list">${PLACES.map(p => `<button class="panel place-card ${p.id === state.place ? 'current' : ''}" data-ui="travel:${p.id}"><span class="place-number">${String(PLACES.indexOf(p) + 1).padStart(2, '0')}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.subtitle)}</p></div>${p.id === state.place ? pill('此刻所在', 'green') : icon('arrow')}</button>`).join('')}</div>${resultCard()}`;
}

function renderModal(): void {
  const host = document.querySelector('#modal-root')!;
  if (!modal) { host.innerHTML = ''; return; }
  const title = modal === 'journal' ? '江湖手记' : modal === 'origins' ? '换一种起步' : modal === 'layouts' ? '挑一种界面' : '青溪试游';
  let content = '';
  if (modal === 'layouts') {
    content = layoutPicker();
  } else if (modal === 'journal') {
    content = `<div class="journal-intro"><span class="eyebrow">你的脚步，留下的回声</span><p>谁记着你的好，谁见过你出手，谁还在等你。一件件，都在这里。</p></div><div class="case-record"><span>${pill(state.caseStatus === 'released' ? '已有下文' : '尚未了结', state.caseStatus === 'released' ? 'green' : 'amber')}</span><h3>船工的旧账</h3><p>${state.caseStatus === 'released' ? esc(CASE_METHODS[state.caseMethod ?? ''] || '许青已经离开押送队伍。') : state.caseStatus === 'held' ? '许青拿走了东家的账本，说上面记着船工被拖欠的工钱。午时前人还在渡口；长街的货单、茶棚的人证，也许能说清这场争执。' : '午时已过，许青被押到镇公所。去问问值守的捕头，事情仍有余地。'}</p><div class="change-tags">${state.flags.ledger ? pill('看过账目', 'green') : ''}${state.flags.witness ? pill('问过船客', 'green') : ''}</div></div><ol class="journal-list full-journal">${journalEntries(80)}</ol>`;
  } else if (modal === 'origins') {
    content = `<p class="modal-intro">同一个青溪镇，带着不同的底子再走一次。四种出身都从未入门开始。换出身会重新开始这段试游。</p>${ORIGINS.map(o => originCard(o)).join('')}`;
  } else {
    content = `<div class="about-illustration"><img src="./demo/harbor.webp" alt="青溪渡口"></div><p class="modal-intro">从一个无名小人物开始，在一座小镇里自由走动、谋生、练武，也试试出手的分量。</p><div class="about-points"><p><b>根基有用。</b>身板影响劳作，悟性帮助查账，身法给你另一条脱身的路。</p><p><b>江湖会动。</b>赶路、休息、练功都会花时间。押送会继续，事情也有后来。</p><p><b>行动有回声。</b>救人、拿走别人的东西、与人切磋，影响各自的人情与官府的留意。</p></div><p class="fine-print">这是玩法概念演示，范围为青溪镇与一桩风波，成长尺度用于短时试玩。离线暂停；演示进度单独保存在这台浏览器，不读取原版存档。</p><button class="button wide" data-ui="close">入这段江湖 ${icon('arrow')}</button>`;
  }
  host.innerHTML = `<div class="modal-scrim" data-ui="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">${title}</h2><button class="icon-button" data-ui="close" aria-label="关闭">${icon('close')}</button></header><div class="modal-body">${content}</div></section></div>`;
}

function openModal(value: typeof modal): void {
  modalReturnFocus = (document.activeElement as HTMLElement)?.dataset.ui ?? null;
  modal = value;
  confirmOrigin = null;
  renderModal();
  document.querySelector<HTMLButtonElement>('.modal [data-ui="close"]')?.focus();
}

function closeModal(): void {
  modal = null;
  confirmOrigin = null;
  renderModal();
  if (modalReturnFocus) Array.from(document.querySelectorAll<HTMLButtonElement>('[data-ui]')).find(el => el.dataset.ui === modalReturnFocus)?.focus();
}

function announce(text: string): void {
  const a = document.querySelector('#announcer');
  if (a) a.textContent = text;
}

function outcome(result: ActionResult): void {
  message = result.text;
  changes = result.changes ?? [];
  if (result.battle) beginFight(result.battle);
  render();
  announce(result.text);
  if (!result.battle) document.querySelector('.reply-card')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function beginFight(request: BattleRequest): void {
  const d = derived(state);
  activeFight = { request, battle: createBattle({ name: state.name, hp: state.hp, mp: state.mp, hpMax: d.hpMax, mpMax: d.mpMax, attrs: state.attrs, power: state.power, sword: state.sword, footwork: state.footwork, stance: state.stance }, request) };
  tellSeconds = 0;
  hasResponded = false;
  fightPaused = false;
  lastBattleTick = Date.now();
}

function renderFight(): void {
  const host = document.querySelector('#fight-root');
  if (!host) return;
  if (!activeFight) { host.innerHTML = ''; return; }
  const b = activeFight.battle;
  const focusBefore = (document.activeElement as HTMLElement)?.dataset.ui;
  const tell = b.phase === 'tell';
  const result = b.phase === 'result';
  host.innerHTML = `<div class="battle-scrim"><section class="battle" role="dialog" aria-modal="true" aria-label="与${esc(b.foeName)}交手"><header class="battle-header"><span>${pill(activeFight.request.reason === 'spar' ? '以武会友' : activeFight.request.reason === 'arrest' ? '脱身' : '渡口风波', 'amber')}<small>第 ${b.round} 合</small></span><button class="icon-button" data-ui="fight:pause" aria-label="${fightPaused ? '继续交手' : '暂停交手'}" ${result ? 'disabled' : ''}>${fightPaused ? '▶' : 'Ⅱ'}</button></header><div class="battle-foe"><span class="foe-stamp">${esc(b.foeName[0])}</span><div><span class="eyebrow">${activeFight.request.reason === 'arrest' ? '巡街捕头 · 铁尺拦路' : activeFight.request.foe === 'guard' ? '横刀拦路 · 漕帮护卫' : '旧武场 · 以剑相试'}</span><h2>${esc(b.foeName)}</h2>${bar('气血', b.foeHp, b.foeMaxHp, 'hp')}</div></div><div class="momentum"><span>守</span><div><i style="left:${Math.max(0, Math.min(100, b.momentum))}%"></i></div><span>攻</span></div><div class="battle-log" aria-live="polite" aria-relevant="additions">${b.logs.slice(-12).map(l => `<p class="battle-line ${l.tone}">${esc(l.text)}</p>`).join('')}</div><div class="battle-player"><div class="battle-player-title"><b>${esc(state.name)}</b><span>${state.stance === 'steady' ? '守中 · 留力回锋' : '逐流 · 抢步争先'}</span></div><div class="battle-resources">${bar('气血', b.playerHp, b.playerMaxHp, 'hp')}${bar('内力', b.playerMp, b.playerMaxMp, 'mp')}${bar('怒气', b.rage, 100, 'rage')}</div></div><div class="battle-controls">${result ? `<div class="battle-result"><span class="eyebrow">${b.result === 'win' ? '这一场，有了分晓' : b.result === 'flee' ? '留得青山在' : '胜负，也是历练'}</span><h2>${b.result === 'win' ? '收剑，承让。' : b.result === 'flee' ? '借隙脱身' : '棋差一着'}</h2><p>${b.result === 'win' ? activeFight.request.reason === 'rescue' ? '拦路的刀垂了下去。身后的许青，终于松了一口气。' : '对方收起兵刃，重新打量了你一眼。' : '这一回的伤与见识，都会带回江湖。'}</p><button class="button wide" data-ui="fight:finish">回到江湖 ${icon('arrow')}</button></div>` : tell ? `<div class="tell-heading"><span>${pill('见招拆招', 'amber')}<b>${esc(b.tell?.name ?? '来势陡变')}</b></span><small>${hasResponded ? `${tellSeconds} 息` : '先看清，再出手'}</small></div><p class="tell-prose">${esc(b.tell?.text ?? '')}</p><div class="response-grid">${responses(b).map(r => `<button class="response-button" data-ui="respond:${r.key}" ${r.disabled || fightPaused ? 'disabled' : ''}><div><b>${r.label}</b><strong>${Math.round(r.chance * 100)}<small>%</small></strong></div><span>${esc(r.skill)} · ${r.cost ? `耗内 ${r.cost}` : '不耗内力'}</span></button>`).join('')}</div><p class="response-hint">成算来自根基与火候。时限耗尽，会自行择机应对。</p>` : `<div class="moves-grid"><button class="move-button" data-ui="fight:perform" ${b.player.power === 0 || b.cooldown > 0 || b.playerMp < b.performCost || fightPaused ? 'disabled' : ''}><span>绝招</span><b>${esc(b.performName)}</b><small>${b.player.power === 0 ? '先请教学会养息功' : b.cooldown ? `调息 ${b.cooldown} 合` : `内力 ${b.performCost}`}</small></button><button class="move-button ultimate" data-ui="fight:ultimate" ${b.rage < 100 || fightPaused ? 'disabled' : ''}><span>杀招</span><b>${esc(b.ultName)}</b><small>${b.rage < 100 ? `怒气 ${Math.floor(b.rage)} / 100` : '此刻可用'}</small></button></div>`}${result ? '' : `<div class="battle-utility"><span>${fightPaused ? '已暂停，点右上角继续' : tell ? '先判断，再拆招' : '自动对拆中 · 你来决定出招时机'}</span><button data-ui="fight:medicine" ${!(state.inventory.medicine > 0) || b.playerHp >= b.playerMaxHp || fightPaused ? 'disabled' : ''}>伤药 ${state.inventory.medicine || 0}</button><button data-ui="fight:flee" ${fightPaused ? 'disabled' : ''}>${activeFight.request.reason === 'spar' ? '认输' : '脱身'}</button></div>`}</div></section></div>`;
  const log = host.querySelector('.battle-log');
  if (log) log.scrollTop = log.scrollHeight;
  if (focusBefore) Array.from(host.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).find(el => el.dataset.ui === focusBefore)?.focus({ preventScroll: true });
}

root.addEventListener('click', e => {
  const button = (e.target as HTMLElement).closest<HTMLElement>('[data-ui]');
  if (!button || (button instanceof HTMLButtonElement && button.disabled)) return;
  const [cmd, val] = button.dataset.ui!.split(':');
  if (activeFight && !['fight', 'respond'].includes(cmd)) return;
  if (cmd === 'choose-origin' && !started) {
    if (ORIGINS.some(o => o.id === val)) chosenOrigin = val as OriginId;
    render();
  } else if (cmd === 'begin' && !started) {
    state = createDemo(chosenOrigin); started = true;
    message = '';
    render();
  } else if (cmd === 'layout' && LAYOUTS.some(l => l.id === val)) {
    layout = val as Layout;
    document.documentElement.dataset.layout = layout;
    try { localStorage.setItem(LAYOUT_KEY, layout); } catch { /* preference is optional */ }
    try { const url = new URL(location.href); url.searchParams.set('layout', layout); history.replaceState(null, '', url); } catch { /* file previews may restrict history */ }
    modal = null; render();
    document.querySelector('.play-scroll')?.scrollTo(0, 0);
    document.querySelector<HTMLButtonElement>('[data-ui="layouts"]')?.focus({ preventScroll: true });
  } else if (cmd === 'quick') {
    document.querySelector(`[data-section="${val}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } else if (cmd === 'tab') { tab = val as Tab; message = ''; changes = []; render(); document.querySelector('.play-scroll')?.scrollTo(0, 0); }
  else if (cmd === 'select') {
    selected = val; message = ''; render();
    document.querySelector('[data-section="actions"] button:not([disabled])')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  else if (cmd === 'action') {
    responseSection = button.closest('[data-suggestion]') ? 'suggestions'
      : button.closest('[data-section="public-actions"]') ? 'public-actions'
      : button.closest('[data-section="scene"]') ? 'scene' : 'people';
    outcome(act(state, button.dataset.ui!.slice(7)));
  }
  else if (cmd === 'travel') { tab = 'world'; selected = ''; responseSection = 'scene'; outcome(travel(state, val as PlaceId)); document.querySelector('.play-scroll')?.scrollTo(0, 0); }
  else if (cmd === 'dismiss') { message = ''; render(); }
  else if (cmd === 'train') outcome(train(state, val as 'inner' | 'sword' | 'footwork'));
  else if (cmd === 'stance' && state.sword > 0) { setStance(state, val as 'steady' | 'flowing'); message = `你收剑定了定神，接下来走${val === 'steady' ? '稳守回锋' : '抢步争先'}的路数。`; changes = []; render(); }
  else if (cmd === 'medicine') outcome(act(state, 'use-medicine'));
  else if (cmd === 'theme') {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* theme still works */ }
    render();
  } else if (cmd === 'journal' || cmd === 'origins' || cmd === 'about' || cmd === 'layouts') openModal(cmd);
  else if (cmd === 'close' || (cmd === 'backdrop' && e.target === button)) closeModal();
  else if (cmd === 'origin') {
    if (confirmOrigin !== val) { confirmOrigin = val as OriginId; renderModal(); return; }
    state = createDemo(val as OriginId); started = true; selected = ''; tab = 'world'; modal = null; confirmOrigin = null;
    message = ''; changes = []; responseSection = 'scene'; render();
    document.querySelector('.play-scroll')?.scrollTo(0, 0);
  } else if (activeFight && cmd === 'respond') {
    const b = activeFight.battle;
    if (fightPaused) return;
    respond(b, val as ResponseKey); hasResponded = true; lastBattleTick = Date.now(); renderFight();
  } else if (activeFight && cmd === 'fight') {
    const b = activeFight.battle;
    if (val === 'pause') { fightPaused = !fightPaused; lastBattleTick = Date.now(); }
    else if (val === 'finish' && b.phase === 'result' && b.result) {
      message = settleBattle(state, activeFight.request, b.result, b.playerHp, b.playerMp);
      responseSection = 'scene';
      changes = []; activeFight = null; render(); announce(message); return;
    } else if (!fightPaused) {
      if (val === 'perform') perform(b);
      else if (val === 'ultimate') ultimate(b);
      else if (val === 'flee') flee(b);
      else if (val === 'medicine' && state.inventory.medicine > 0 && takeMedicine(b)) { state.inventory.medicine--; save(); }
    }
    renderFight();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal) { closeModal(); return; }
  const dialog = document.querySelector<HTMLElement>('.modal, .battle');
  if (e.key !== 'Tab' || !dialog) return;
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, [tabindex="0"]'));
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (!first) return;
  if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
});

setInterval(() => {
  if (!activeFight || fightPaused || document.hidden || activeFight.battle.phase === 'result') { lastBattleTick = Date.now(); return; }
  const b = activeFight.battle;
  const now = Date.now();
  if (b.phase === 'tell') {
    if (!hasResponded || now - lastBattleTick < 1000) return;
    lastBattleTick = now;
    tellSeconds--;
    if (tellSeconds <= 0) {
      const best = responses(b).filter(r => !r.disabled).sort((a, c) => c.chance - a.chance)[0];
      if (best) respond(b, best.key);
    }
    renderFight();
  } else if (now - lastBattleTick >= 1600) {
    lastBattleTick = now;
    tickBattle(b);
    if (activeFight.battle.phase === 'tell') tellSeconds = 8;
    renderFight();
  }
}, 200);

if (state.pendingBattle) beginFight(state.pendingBattle);
render();
