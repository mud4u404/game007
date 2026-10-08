import { responses, type BattleRequest, type DemoBattle, type ResponseKey } from '../battle';
import { escapeHTML as esc } from '../design-context';
import { icon } from '../icons';

export interface RoomCombatContext {
  battle: DemoBattle;
  request: BattleRequest;
  playerName: string;
  stance: 'steady' | 'flowing';
  paused: boolean;
  tellSeconds: number;
  hasResponded: boolean;
  medicine: number;
  practice?: boolean;
}

const percent = (value: number, max: number): number => max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
const responseIcons: Record<ResponseKey, string> = { block: 'shield', dodge: 'step', parry: 'cross', rush: 'arrow' };

function battleIcon(name: string): string {
  const paths: Record<string, string> = {
    pause: '<circle cx="12" cy="12" r="9"/><path d="M9 8v8M15 8v8"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    cross: '<path d="m3 3 5 2 11 14-2 2L5 8zM21 3l-5 2L5 19l2 2L19 8zM3 16l5 5M16 21l5-5"/>',
    step: '<circle cx="15" cy="4" r="2"/><path d="m12 8 4 3 4-1M6 10l5-3 2 6-5 3-4 5M13 13l4 3-2 5"/>',
    medicine: '<path d="M9 3h6M10 3v4l-4 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9l-4-4V3M6 12h12M10 16h4M12 14v4"/>',
  };
  return paths[name] ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>` : icon(name);
}

function resource(label: string, value: number, max: number, kind: string, low = false): string {
  if (max <= 0) return `<div class="room-battle-resource ${kind}" aria-label="${label}尚未入门"><span>${label}</span><b>未入门</b><i class="room-battle-meter" aria-hidden="true"></i></div>`;
  return `<div class="room-battle-resource ${kind}${low ? ' low' : ''}"><span>${label}</span><b>${Math.ceil(value)}${kind === 'rage' ? '' : `<small>/${max}</small>`}</b><i class="room-battle-meter" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.ceil(value)}"><i style="width:${percent(value, max)}%"></i></i></div>`;
}

function tellSummary(request: BattleRequest): string {
  return request.reason === 'arrest' ? '翻尺扣腕，直拿关节。'
    : request.foe === 'swordsman' ? '旋身横剑，剑光贴水而来。'
    : '沉腰压刀，直取中门。';
}

/** Presentation only: the caller owns clocks, inventory and every battle action. */
export function renderRoomCombat(ctx: RoomCombatContext): string {
  const { battle: b, request, paused, hasResponded } = ctx;
  const result = b.phase === 'result';
  const tell = b.phase === 'tell';
  const countdown = tell && hasResponded && !paused;
  const seconds = Math.max(0, Math.ceil(ctx.tellSeconds));
  const urgency = countdown ? seconds <= 3 ? 'critical' : 'warning' : 'calm';
  const lowHealth = !result && b.playerHp <= b.playerMaxHp * .25;
  const resultTitle = b.result === 'win' ? '收剑，承让。' : b.result === 'flee' ? '借隙脱身' : '棋差一着';
  const resultText = ctx.practice ? '这一场的伤与消耗，留在试招场。'
    : b.result === 'win' ? request.reason === 'rescue' ? '刀锋垂落，眼前的路让了出来。' : '对方收起兵刃，抱拳退开。'
    : '先收起兵刃，再走一程江湖。';
  const performDisabled = !b.player.power || !b.player.sword || b.cooldown > 0 || b.playerMp < b.performCost || paused;
  const performNote = !b.player.sword ? '尚未学会渡水剑' : !b.player.power ? '尚未学会养息功'
    : b.cooldown ? `调息 ${b.cooldown} 合` : b.playerMp < b.performCost ? `内力不足 · 需 ${b.performCost}` : `耗内 ${b.performCost}`;
  const ultDisabled = !b.player.sword || b.rage < 100 || paused;
  const ultNote = !b.player.sword ? '尚未学会渡水剑' : b.rage < 100 ? `怒气 ${Math.floor(b.rage)} / 100` : '怒气已满 · 可出招';
  const foeRole = request.reason === 'arrest' ? '捕头' : request.foe === 'guard' ? '护卫' : '剑客';
  const decision = result
    ? `<div class="room-battle-decision battle-result"><span class="room-decision-label">${ctx.practice ? '试招结束' : '交手已毕'}</span><h2>${resultTitle}</h2><p>${resultText}</p></div>`
    : tell
      ? `<div class="room-battle-decision room-tell"><div class="tell-heading"><div><span class="room-decision-label">${paused ? '已暂停' : !hasResponded ? '先看清，再出手' : urgency === 'critical' ? '立即应对' : '敌招将至'}</span><h2>${battleIcon('cross')}${esc(b.tell?.name ?? '来势陡变')}</h2><p class="tell-prose">${tellSummary(request)}</p></div>${countdown ? `<div class="room-countdown" aria-label="${seconds} 秒后自行应对"><strong>${seconds}</strong><span>秒</span><i><i style="width:${Math.min(100, seconds / 8 * 100)}%"></i></i></div>` : `<div class="room-battle-reading">${battleIcon(paused ? 'pause' : 'clock')}<span>${paused ? '时间已停' : '不计时'}</span></div>`}</div></div>`
      : `<div class="room-battle-decision room-exchange"><span class="room-decision-label">${paused ? '已暂停' : '平稳交锋'}</span><h2>${battleIcon(paused ? 'pause' : 'cross')}${paused ? '歇一口气' : '自动对拆中'}</h2><p>${paused ? '点右上角继续交手。' : '把握出招时机，留意对手变招。'}</p></div>`;
  const actions = result
    ? `<div class="room-battle-actions room-result-actions">${ctx.practice ? '<button class="button wide" data-ui="fight:retry-practice">再试一场</button>' : ''}<button class="button wide ${ctx.practice ? 'room-finish-practice' : ''}" data-ui="fight:finish">${ctx.practice ? '结束试招' : '回到江湖'}${icon('arrow')}</button>${ctx.practice ? '' : '<p>这场交手的结果，将带回江湖。</p>'}</div>`
    : tell
      ? `<div class="room-battle-actions response-grid">${responses(b).map(r => {
        const unavailable = r.skill.includes('未入门') ? '尚未入门' : r.disabled && b.playerMp < r.cost ? '内力不足' : r.cost ? `耗内 ${r.cost}` : '不耗内力';
        return `<button class="response-button" data-ui="respond:${r.key}" ${r.disabled || paused ? 'disabled' : ''} aria-label="${esc(r.label)}，${esc(r.skill)}，成算 ${Math.round(r.chance * 100)}%，${unavailable}"><div class="room-response-top">${battleIcon(responseIcons[r.key])}<b>${r.label}</b><strong>${Math.round(r.chance * 100)}<small>%</small></strong></div><span>${esc(r.skill)}</span><small class="room-response-cost">${unavailable}</small></button>`;
      }).join('')}</div>`
      : `<div class="room-battle-actions moves-grid"><button class="move-button" data-ui="fight:perform" ${performDisabled ? 'disabled' : ''}>${battleIcon('cross')}<span>绝招</span><b>${esc(b.performName)}</b><small>${performNote}</small></button><button class="move-button ultimate" data-ui="fight:ultimate" ${ultDisabled ? 'disabled' : ''}>${icon('sword')}<span>杀招</span><b>${esc(b.ultName)}</b><small>${ultNote}</small></button></div>`;

  return `<div class="battle-scrim room-battle-scrim"><section class="battle room-battle" role="dialog" aria-modal="true" aria-label="${ctx.practice ? '试招：' : ''}与${esc(b.foeName)}交手" data-phase="${b.phase}" data-urgency="${urgency}" data-paused="${paused}">
    <header class="battle-header"><h1>${ctx.practice ? '试招' : '交锋'}</h1><span>第 ${b.round} 合</span><button class="room-battle-pause" data-ui="fight:pause" aria-label="${paused ? '继续交手' : '暂停交手'}" ${result ? 'disabled' : ''}>${battleIcon(paused ? 'play' : 'pause')}<span>${paused ? '继续' : '暂停'}</span></button></header>
    <section class="room-battle-foe" aria-label="对手状态"><div><h2>${esc(b.foeName)}<small>${foeRole}</small></h2><span>气血 <b>${b.foeHp}<small>/${b.foeMaxHp}</small></b></span></div><i class="room-battle-meter" role="meter" aria-label="对手气血" aria-valuemin="0" aria-valuemax="${b.foeMaxHp}" aria-valuenow="${b.foeHp}"><i style="width:${percent(b.foeHp, b.foeMaxHp)}%"></i></i></section>
    <div class="room-battle-momentum" aria-label="攻守势 ${b.momentum}"><span>守</span><div><i style="left:${Math.max(0, Math.min(100, b.momentum))}%"></i></div><span>攻</span></div>
    <div class="battle-log" aria-label="最近交锋记录" aria-live="polite" aria-relevant="additions">${b.logs.slice(-6).map(l => `<p class="battle-line ${l.tone}">${esc(l.text)}</p>`).join('')}</div>
    <section class="room-battle-player" aria-label="自身状态"><div class="room-player-title"><h2>${esc(ctx.playerName)}</h2>${lowHealth ? '<span class="room-low-health">气血危急</span>' : ''}<span class="room-battle-stance">${ctx.stance === 'steady' ? '守中' : '逐流'}</span></div><div class="room-battle-resources">${resource('气血', b.playerHp, b.playerMaxHp, 'hp', lowHealth)}${resource('内力', b.playerMp, b.playerMaxMp, 'mp')}${resource('怒气', b.rage, 100, 'rage')}</div></section>
    <div class="room-battle-controls">${decision}${actions}<div class="battle-utility">${!result ? `<button data-ui="fight:medicine" ${ctx.medicine <= 0 || b.playerHp >= b.playerMaxHp || paused ? 'disabled' : ''}>${battleIcon('medicine')}<span>伤药 <b>${ctx.medicine}</b></span></button><button data-ui="fight:flee" ${paused ? 'disabled' : ''}>${battleIcon('step')}<span>${request.reason === 'spar' ? '认输' : '脱身'}</span></button>` : `<span class="room-battle-ended">${ctx.practice ? '试招不影响江湖进度。' : '兵刃已收，点击上方离场。'}</span>`}${ctx.practice && !result ? `<button class="room-exit-practice" data-ui="fight:exit-practice">退出试招</button>` : ''}</div></div>
  </section></div>`;
}
