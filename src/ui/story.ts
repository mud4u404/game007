/**
 * 剧情卡片、标题画面、章回题字。
 */
import { titleAccountHTML } from './views/account-link';
import { S, load, newGame, save, saveBroken, setState, skipToYangzhou, type GameState } from '../core/state';
import { dateStr } from '../core/time';
import { $, cleanName, fmt } from '../core/util';
import { storyById } from '../content';
import type { StoryDef } from '../content/types';
import { newOutcome, run, test, textVars, type Outcome } from '../engine/dsl';
import { afterOutcome, hooks, registerHandlers, render } from './shell';

/* ---------- 剧情卡片 ---------- */

interface Playing { def: StoryDef; i: number; result?: string; next?: number; out: Outcome; onDone?: () => void }
let cur: Playing | null = null;

export function openStory(id: string, onDone?: () => void): void {
  const def = storyById(id);
  if (!def) { onDone?.(); return; }
  cur = { def, i: 0, out: newOutcome(), onDone };
  draw();
  $('#storyLayer')!.hidden = false;
}

const NAME_PICKS = ['孤舟', '听雨', '怀远', '照影', '惊澜'];

function draw(): void {
  if (!cur) return;
  const card = cur.def.cards[cur.i];
  const v = textVars();
  const nameBox = card.input === 'name'
    ? `<label class="namebox"><span>沈</span><input id="nameIn" maxlength="4" value="${S.name}" aria-label="名字" autocomplete="off"></label>
       <div class="namepicks">${NAME_PICKS.map(n => `<button data-act="stName:${n}">${n}</button>`).join('')}</div>`
    : '';
  const choices = cur.result !== undefined
    ? `<button class="choice primary" data-act="stNext"><b>继续</b></button>`
    : card.choices.map((c, k) => test(c.if) ? `<button class="choice${card.choices.length === 1 ? ' primary' : ''}" data-act="stPick:${k}"><b>${c.label}</b>${c.sub ? `<small>${c.sub}</small>` : ''}</button>` : '').join('');
  $('#storyLayer')!.innerHTML = `<div class="story-l" role="dialog" aria-label="${card.title}">
    ${card.tag ? `<span class="tag accent">${card.tag}</span>` : ''}
    <h2>${fmt(card.title, v)}</h2>
    ${card.paras.map(p => `<p class="sp">${fmt(p, v)}</p>`).join('')}
    ${card.gains ? `<div class="gains">${card.gains.map(g => `<span class="tag info">${g}</span>`).join('')}</div>` : ''}
    ${nameBox}
    ${cur.result !== undefined ? `<div class="sres">${fmt(cur.result, v)}</div>` : ''}
    <div class="choices">${choices}</div>
  </div>`;
  $('#storyLayer .story-l')!.scrollTop = 0;
}

function pick(k: number): void {
  if (!cur) return;
  const card = cur.def.cards[cur.i];
  const c = card.choices[k];
  if (!c || !test(c.if)) return;
  if (card.input === 'name') {
    const raw = ($('#nameIn') as HTMLInputElement | null)?.value || '';
    S.name = cleanName(raw) || '孤舟';
  }
  run(c.do, cur.out);
  const next = c.next ?? cur.i + 1;
  if (c.result) { cur.result = c.result; cur.next = next; draw(); return; }
  advance(next);
}

function advance(next: number): void {
  if (!cur) return;
  const out = cur.out;
  if (out.fight || out.story) { close(); afterOutcome(out); return; }
  if (next < 0 || next >= cur.def.cards.length) {
    const end = cur.def.endChapter;
    const fin = cur.onDone;
    const done = (): void => { render(); fin?.(); };
    close();
    if (end) playChapter(end.small, end.big, done); else done();
    return;
  }
  cur.i = next;
  cur.result = undefined;
  cur.next = undefined;
  draw();
}

function close(): void {
  cur = null;
  const L = $('#storyLayer')!;
  L.hidden = true;
  L.innerHTML = '';
  save();
}

/* ---------- 章回题字 ---------- */

let chapDone: (() => void) | null = null;
let chapTimer = 0;
export function playChapter(small: string, big: string, done: () => void): void {
  render();
  const L = $('#chapLayer')!;
  L.innerHTML = `<div class="chap" data-act="chapDone"><small>${small}</small><div class="cw">${big}</div><p>点击继续</p></div>`;
  L.hidden = false;
  chapDone = done;
  clearTimeout(chapTimer);
  chapTimer = window.setTimeout(finishChapter, 3200);
}
function finishChapter(): void {
  const L = $('#chapLayer')!;
  L.hidden = true;
  L.innerHTML = '';
  const fn = chapDone;
  chapDone = null;
  fn?.();
}

/* ---------- 标题画面 ---------- */

function chapterLabel(s: GameState): string {
  return s.chapter === 0 ? '序章 · 瓜洲渡' : '第一回 · 扬州';
}

/** showTitle(true) 时若有存档会显示「继续」 */
export function showTitle(allowContinue = true): void {
  const saved = allowContinue ? load() : null;
  const rain = Array.from({ length: 36 }, (_, i) =>
    `<i style="left:${(i * 137) % 100}%;animation-duration:${(0.6 + (i % 7) * 0.12).toFixed(2)}s;animation-delay:-${((i % 11) * 0.17).toFixed(2)}s"></i>`).join('');
  const L = $('#titleLayer')!;
  const warn = saveBroken()
    ? '<p class="t-warn">原来的存档读不出来了，已经原样另存一份，不会丢。请告诉维护者；在「人物 → 存档 → 找回备份」里可以导出它。</p>'
    : '';
  L.innerHTML = `<div class="title"><div class="rain">${rain}</div>
    <div class="t-word">江湖夜雨</div>
    <p class="t-verse">桃李春风一杯酒　江湖夜雨十年灯</p>
    ${warn}<div class="t-btns" id="tBtns"></div></div>`;
  L.hidden = false;
  titleButtons(saved);
}

function titleButtons(saved: GameState | null, confirm?: 'new' | 'skip'): void {
  const box = $('#tBtns');
  if (!box) return;
  if (confirm) {
    box.innerHTML = `<p class="t-warn">这会覆盖现在的进度。</p>
      <button class="t-btn" data-act="tGo:${confirm}">确定，重新开始</button>
      <button class="t-btn ghost" data-act="tBack">算了</button>`;
    return;
  }
  box.innerHTML = saved
    ? `<button class="t-btn" data-act="tContinue">继续<small>${chapterLabel(saved)} · ${dateStr(saved)}</small></button>
       <button class="t-btn ghost" data-act="tNew:new">新的江湖</button>
       <button class="t-link" data-act="tNew:skip">跳过序章，直接去扬州</button>${titleAccountHTML()}`
    : `<button class="t-btn" data-act="tGo:new">新的江湖</button>
       <button class="t-link" data-act="tGo:skip">跳过序章，直接去扬州</button>${titleAccountHTML()}`;
  box.insertAdjacentHTML('beforeend', '<a class="t-link" href="./demo.html">青溪试游 · 自由江湖演示</a>');
}

function hideTitle(): void {
  const L = $('#titleLayer')!;
  L.hidden = true;
  L.innerHTML = '';
}

registerHandlers({
  stPick: v => pick(Number(v)),
  stNext: () => { if (cur) advance(cur.next ?? cur.i + 1); },
  stName: v => { const el = $('#nameIn') as HTMLInputElement | null; if (el) el.value = v; },
  chapDone: () => { clearTimeout(chapTimer); finishChapter(); },
  tContinue: () => {
    const saved = load();
    if (!saved) return;
    setState(saved);
    hideTitle();
    render();
  },
  tNew: v => titleButtons(load(), v === 'skip' ? 'skip' : 'new'),
  tBack: () => titleButtons(load()),
  tGo: v => {
    hideTitle();
    if (v === 'skip') {
      setState(skipToYangzhou());
      playChapter('第一回', '扬州', render);
    } else {
      setState(newGame());
      render();
      openStory('p_open');
    }
    save();
  }
});

hooks.openStory = openStory;
