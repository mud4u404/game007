import { ORIGINS, type OriginId } from '../model';
import { escapeHTML as esc } from '../design-context';
import { icon } from '../icons';

export function renderRoomArrival(chosenId: OriginId): string {
  const chosen = ORIGINS.find(origin => origin.id === chosenId)!;
  const notes: Record<OriginId, string> = {
    porter: '体魄好，搬货挣得多', courier: '身法好，赶路省时间',
    scholar: '悟性好，查账更在行', apprentice: '体魄、根骨均衡',
  };
  const attributes = [['body', '体魄'], ['root', '根骨'], ['agility', '身法'], ['insight', '悟性'], ['courage', '胆魄']] as const;
  return `<main class="arrival-screen room-arrival"><div class="arrival-scroll">
    <header class="room-arrival-top"><b>青溪试游</b><button class="icon-button" data-ui="layouts" aria-label="切换界面">${icon('map')}</button></header>
    <div class="room-arrival-title"><h1>先选你的来处</h1><p>无门无派，尚未习武。</p></div>
    <div class="room-origins" aria-label="选择出身">${ORIGINS.map(origin => `<button data-ui="choose-origin:${origin.id}" class="room-origin ${origin.id === chosenId ? 'chosen' : ''}" aria-pressed="${origin.id === chosenId}"><b>${esc(origin.name)}</b><span>${notes[origin.id]}</span>${origin.id === chosenId ? icon('check') : ''}</button>`).join('')}</div>
    <section class="room-origin-facts" aria-label="出身根基"><div class="room-origin-stats">${attributes.map(([key, label]) => `<div><span>${label}</span><b>${chosen.attrs[key]}</b></div>`).join('')}</div><p>${esc(chosen.description)}</p></section>
    <p class="room-starting-kit">盘缠 <b>28 文</b><span>·</span>伤药 <b>1 包</b><span>·</span>武学 <b>未入门</b></p>
  </div><div class="arrival-footer"><button class="button wide" data-ui="begin">以${esc(chosen.name)}起步 ${icon('arrow')}</button><button class="room-practice-entry" data-ui="practice">${icon('sword')}先试一场交手<span>不影响江湖进度</span></button></div></main><div id="modal-root"></div><div id="fight-root"></div><div class="sr-only" aria-live="polite" id="announcer"></div>`;
}
