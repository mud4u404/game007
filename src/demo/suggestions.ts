import {
  actionsFor, derived, npcsAt, PLACES, travel,
  type DemoAction, type DemoState, type PlaceId,
} from './model';

export interface Suggestion {
  id: string;
  title: string;
  reason: string;
  cost: string;
  ui: string;
}

/** Actions are still authorized by the world model when the player taps them. */
export function availableActions(s: DemoState): DemoAction[] {
  const unique = new Map<string, DemoAction>();
  for (const a of [...actionsFor(s), ...npcsAt(s).flatMap(n => actionsFor(s, n.id))]) {
    if (!a.disabled && !unique.has(a.id)) unique.set(a.id, a);
  }
  return [...unique.values()];
}

function previewTrip(s: DemoState, to: PlaceId): DemoState | null {
  if (s.pendingBattle || s.stopped || !PLACES.some(p => p.id === to)) return null;
  // Use the real routing/time rules on a copy, including an intermediate patrol,
  // the noon transfer and shop closing times. Merely looking never spends time.
  const preview = structuredClone(s);
  travel(preview, to);
  return preview;
}

/** Actual time to arrival (or to an intervening patrol); null means blocked. */
export function travelMinutes(s: DemoState, to: PlaceId): number | null {
  const preview = previewTrip(s, to);
  return preview ? preview.minute - s.minute : null;
}

/** Up to three optional, currently useful choices. Never acts on the player. */
export function smartSuggestions(s: DemoState): Suggestion[] {
  if (s.pendingBattle) return [];
  const available = availableActions(s);
  const result: Suggestion[] = [];
  const add = (suggestion: Suggestion) => {
    if (result.length < 3 && !result.some(item => item.ui === suggestion.ui)) result.push(suggestion);
  };
  const action = (id: string, reason: string, title?: string) => {
    const a = available.find(item => item.id === id);
    if (!a) return false;
    add({ id: `action:${id}`, ui: `action:${id}`, title: title ?? a.label, reason,
      cost: id === 'xu-gift' ? '两分钟 · 获赠伤药 ×1' : a.cost });
    return true;
  };
  const trip = (to: PlaceId, title: string, reason: string, nextAction?: string) => {
    if (to === s.place) return false;
    const preview = previewTrip(s, to);
    if (!preview || preview.place !== to || preview.stopped) return false;
    if (nextAction && !availableActions(preview).some(a => a.id === nextAction)) return false;
    const minutes = preview.minute - s.minute;
    add({ id: `travel:${to}`, ui: `travel:${to}`, title, reason, cost: `${minutes} 分钟 · 仅赶路` });
    return true;
  };

  if (s.stopped) {
    const canPay = action('settle-fine', '交清罚钱便能离开，街坊间的人情恩怨仍会留下。');
    if (!canPay) action('submit-check', '手头不够交罚钱，也能随捕头交代经过。两个小时后可以离开。');
    if (s.hp < derived(s).hpMax * .45) action('use-medicine', '先处理伤口，查问期间也可以敷药。');
    if (canPay) action('submit-check', '也可以花两个小时把事情说清，按余钱赔付，不必交足罚钱。');
    return result;
  }

  const needsHealing = s.hp < derived(s).hpMax * .45;
  if (needsHealing && !action('use-medicine', '气血已不足一半。包扎后能恢复六十点气血。')) {
    action('free-rest', '伤势未愈，身边又没有伤药。歇脚不用钱，镇上的时间仍会往前走。');
  }
  const effortActions = new Set(['work-cargo', 'work-courier', 'work-copy', 'learn-sword', 'learn-inner', 'learn-footwork', 'spar']);
  const tooTired = s.stamina < 10 || actionsFor(s).some(a => effortActions.has(a.id) && a.disabled?.includes('精力'));
  if (tooTired) {
    if (!action('eat', '精力不足，热面能恢复三十五点精力，比在路边歇脚省时。')) {
      action('free-rest', '有些活计已经使不上力。歇脚能恢复四十点精力，不花钱。');
    }
  }

  const unresolved = s.caseStatus !== 'released';
  const evidenceReady = s.flags.ledger && s.flags.witness;
  if (unresolved && evidenceReady) {
    if (!action('rescue-evidence', '货单与人证都在，可以把两边的话放在一起核验。')) {
      // Do not send the player to an empty dock if noon will pass on the road.
      let to: PlaceId = s.caseStatus === 'held' ? 'dock' : 'yamen';
      if (previewTrip(s, to)?.caseStatus === 'moved') to = 'yamen';
      trip(to, to === 'dock' ? '回渡口递交证据' : '去公所递交证据',
        to === 'dock' ? '货单与人证齐了，许青还在渡口。到场后再决定如何开口。' : '许青的案子要在公所核验。到场后再决定如何开口。', 'rescue-evidence');
    }
  }
  if (unresolved && !s.flags.ledger) action('inspect-ledger', '账房就在眼前。先核对货单，查清这笔账，不急着下定论。');
  if (unresolved && !s.flags.witness) action('ask-witness', '陆婆婆见过清晨的船。可以先听听她知道什么。');

  // Offer one next lesson, instead of filling the screen with an entire syllabus.
  const lesson = !s.flags.observedSword ? 'observe-sword' : s.sword < 1 ? 'learn-sword'
    : s.power < 1 ? 'learn-inner' : s.footwork < 1 ? 'learn-footwork' : undefined;
  if (lesson) action(lesson, lesson === 'observe-sword'
    ? '顾行舟正在练剑。还没学过功夫，也能先看他怎样站稳、收势。'
    : '已经看过立足与收势，可以当面请教一门尚未学会的功夫。');
  if (unresolved && !evidenceReady) action('rescue-money', '身上的钱够作担保。这能先让许青脱身，欠薪的事仍待查清。');
  if (!unresolved) action('xu-gift', '许青已经自由了。他为帮过自己的人留了一份心意。');

  const job = s.origin === 'scholar' ? 'work-copy' : s.origin === 'courier' ? 'work-courier' : 'work-cargo';
  const jobPlace: PlaceId = job === 'work-cargo' ? 'dock' : 'street';
  const localJob = available.find(a => a.id === job);
  if (localJob) action(job, localJob.description);

  if (unresolved && !evidenceReady) {
    if (!s.flags.ledger) trip('street', '去长街查一查账', '长街有货单可核。先找线索，不必急着替谁断是非。', 'inspect-ledger');
    else if (!s.flags.witness) trip('tea', '去茶棚听听人证', '货单看过了，清晨船上的经过还可以问问陆婆婆。', 'ask-witness');
  }
  if (lesson) trip('yard', '去旧武场看看', '顾行舟愿意指点入门功夫。先去看看，是否习武由你决定。', lesson);
  else if (!needsHealing && !tooTired) action('spar', '已经学过剑术，可以和顾行舟印证几招，点到为止。');

  trip(jobPlace, job === 'work-cargo' ? '去渡口找活计' : job === 'work-copy' ? '去长街找抄写活' : '去长街接送信活',
    job === 'work-cargo' ? '一身气力能换盘缠，陶三还在招脚夫。' : job === 'work-copy' ? '认字算账是你的长处，账房有誊抄的活计。' : '熟悉脚程是你的长处，方掌柜有信要送。', job);
  for (const id of ['work-cargo', 'work-copy', 'work-courier']) {
    const a = available.find(item => item.id === id);
    if (a) action(id, a.description);
  }
  if (!lesson && !needsHealing && !tooTired) trip('yard', '去旧武场切磋', '顾行舟还在武场，可以试试近来练的剑术。到场后再决定是否出手。', 'spar');
  if (!unresolved) action('hear-rumor', '风波过去了，茶棚里的人也许正在谈论后来发生的事。');
  const atInn = (previewTrip(s, 'inn')?.minute ?? s.minute) % 1440;
  if (result.length < 3 && (atInn >= 1200 || atInn < 360)) {
    trip('inn', '去客栈歇歇脚', '天色已晚，客栈仍有热饭和落脚处，到店后再选。');
  }
  if (result.length === 0) action('free-rest', '眼下没有急事可做，找个避风处歇脚，镇上的时间也会往前走。');
  return result;
}
