/** A small, local Jianghu sandbox. All actions are checked here, not in the UI. */
export type OriginId = 'porter' | 'courier' | 'scholar' | 'apprentice';
export type PlaceId = 'dock' | 'street' | 'tea' | 'yard' | 'inn' | 'yamen';
export type AttrKey = 'body' | 'root' | 'agility' | 'insight' | 'courage';
export type Stance = 'steady' | 'flowing';
export interface DemoLog { id: number; at: number; text: string; tone: 'normal' | 'good' | 'bad' | 'world' }
export interface BattleRequest { foe: 'guard' | 'swordsman'; reason: 'rescue' | 'spar' | 'arrest'; name: string }
export interface DemoState {
  version: 1; origin: OriginId; name: string; attrs: Record<AttrKey, number>;
  place: PlaceId; minute: number; hp: number; mp: number; stamina: number;
  silver: number; experience: number; power: number; sword: number; footwork: number;
  stance: Stance; inventory: Record<string, number>; flags: Record<string, boolean>;
  relations: Record<string, number>; heat: number; renown: number; log: DemoLog[];
  caseStatus: 'held' | 'moved' | 'released'; caseMethod?: string;
  daily: Record<string, number>; pendingBattle?: BattleRequest; stopped?: boolean;
  theftHeat: number;
}
export interface DemoAction {
  id: string; label: string; description: string; cost: string;
  tone?: 'normal' | 'danger' | 'accent'; disabled?: string;
}
export interface ActionResult { text: string; battle?: BattleRequest; changes?: string[] }
export interface OriginDef { id: OriginId; name: string; title: string; description: string; attrs: Record<AttrKey, number>; perk: string }
export interface PlaceDef { id: PlaceId; name: string; subtitle: string; description: string; links: PlaceId[]; x: number; y: number }
export interface NpcDef { id: string; name: string; initial: string; role: string; place: PlaceId; description: string; tone: string }

export const ITEMS: Record<string, { name: string; description: string }> = {
  old_sword: { name: '旧铁剑', description: '剑鞘磨旧了，刃口还齐整。随身佩着，交手时便用它。' },
  cloth_bundle: { name: '粗布包袱', description: '两件换洗衣裳，一条汗巾。用布角打个结，便是全部家当。' },
  practice_sword: { name: '练习木剑', description: '顾行舟借给你的木剑。剑脊上留着旧磕痕，正好从握剑、收势练起。' },
  medicine: { name: '金疮药', description: '洗净伤口后敷上，一包恢复六十点气血。' },
};

export const ORIGINS: OriginDef[] = [
  { id: 'porter', name: '渡口脚夫', title: '肩上有力，手中无剑', description: '替人扛过几年货。识不得几卷书，一身气力靠营生练来，还不懂武功。', attrs: { body: 16, root: 12, agility: 11, insight: 10, courage: 15 }, perk: '气血厚实，搬货挣得多；从怎样握剑开始学。' },
  { id: 'courier', name: '山路信使', title: '走得远，也跑得快', description: '一封信翻过几座山。脚程是走出来的，却从没学过提气纵跃的轻功。', attrs: { body: 11, root: 11, agility: 17, insight: 12, courage: 13 }, perk: '赶路省时，跑腿挣得多；学会轻功后更善脱身。' },
  { id: 'scholar', name: '落第书生', title: '书读过，江湖还没走过', description: '旧书换了盘缠。认得账上的字，还没摸过剑，也不知内功该从何练起。', attrs: { body: 10, root: 15, agility: 12, insight: 17, courage: 10 }, perk: '查账用时少，抄书有进项；学会内功后内力较充足。' },
  { id: 'apprentice', name: '武馆杂役', title: '扫过练武场，还没握过剑', description: '扫院担水时偷看过拳脚，跟着站过几回桩。还没正式入门，师父也没传过一招。', attrs: { body: 14, root: 14, agility: 12, insight: 11, courage: 13 }, perk: '体魄与根骨均衡；认得练武的规矩，仍须从头请教。' },
];

export const PLACES: PlaceDef[] = [
  { id: 'dock', name: '青石渡', subtitle: '运河 · 船来船往', description: '缆绳绷得笔直，船工踩着湿木板卸货。漕帮护卫横刀守在岸上，一个年轻船工被扣在木桩旁。', links: ['street', 'tea'], x: 18, y: 71 },
  { id: 'street', name: '长街', subtitle: '市井 · 各有生计', description: '药摊挨着账房，挑担的人避开积水。一张招工纸被风掀起，柜台边搁着掌柜的钱袋。', links: ['dock', 'tea', 'inn', 'yamen'], x: 49, y: 52 },
  { id: 'tea', name: '桥头茶棚', subtitle: '一碗粗茶 · 半城消息', description: '旧棚下摆着几条长凳。茶婆添了热水，过路人便肯多坐一阵，说些岸上听不见的话。', links: ['dock', 'street', 'yard'], x: 22, y: 29 },
  { id: 'yard', name: '旧武场', subtitle: '以武会友 · 点到为止', description: '白灰画的圈已被踩散。一个灰衣剑客独自练剑，见你停步，便把剑尖垂了下来。', links: ['tea', 'inn'], x: 61, y: 18 },
  { id: 'inn', name: '听雨客栈', subtitle: '歇脚养伤 · 灯火可亲', description: '楼下有热饭，楼上有干净被褥。门廊留着一条长凳，没钱的行人也能避雨歇脚。', links: ['street', 'yard'], x: 79, y: 43 },
  { id: 'yamen', name: '镇公所', subtitle: '是非与规矩', description: '门前悬着一面旧鼓。捕头坐在石阶上磨刀，旁边摊着今日送来的案牍。', links: ['street'], x: 77, y: 79 },
];

export const NPCS: NpcDef[] = [
  { id: 'docker', name: '陶三', initial: '陶', role: '船行领班', place: 'dock', description: '肩上搭着汗巾，正数着今日少了几个脚夫。', tone: 'amber' },
  { id: 'guard', name: '卫衡', initial: '卫', role: '漕帮护卫', place: 'dock', description: '刀鞘抵在船板上。他奉命拿人，也不愿把事情闹大。', tone: 'red' },
  { id: 'xu', name: '许青', initial: '许', role: '被扣的船工', place: 'dock', description: '袖口沾着墨。他攥紧一本旧账，说那上面有全船人的工钱。', tone: 'jade' },
  { id: 'merchant', name: '方掌柜', initial: '方', role: '账房兼药商', place: 'street', description: '算盘珠拨得响，几张货单按在镇纸下面。', tone: 'amber' },
  { id: 'teaman', name: '陆婆婆', initial: '陆', role: '茶棚主人', place: 'tea', description: '倒茶时总要先看看客人的手，猜他是做什么营生的。', tone: 'jade' },
  { id: 'swordsman', name: '顾行舟', initial: '顾', role: '游方剑客', place: 'yard', description: '剑穗磨得发白，收势时却纹丝不动。', tone: 'blue' },
  { id: 'innkeeper', name: '宋娘子', initial: '宋', role: '客栈掌柜', place: 'inn', description: '柜台上摆着一碗热汤，留给还没赶到的客人。', tone: 'purple' },
  { id: 'constable', name: '秦捕头', initial: '秦', role: '镇上捕头', place: 'yamen', description: '先听人把话说完，再把案牍翻开。腰间铁尺已有年头。', tone: 'blue' },
];

export const MAX_SKILL_LEVEL = 6;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const day = (s: DemoState) => Math.floor(s.minute / 1440);
const hour = (s: DemoState) => Math.floor(s.minute % 1440 / 60);
const dayCount = (s: DemoState, key: string) => s.daily[`${day(s)}:${key}`] ?? 0;
function count(s: DemoState, key: string, amount = 1) { s.daily[`${day(s)}:${key}`] = dayCount(s, key) + amount; }
function log(s: DemoState, text: string, tone: DemoLog['tone'] = 'normal') {
  s.log.push({ id: (s.log.at(-1)?.id ?? 0) + 1, at: s.minute, text, tone });
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}
function finish(s: DemoState, text: string, tone: DemoLog['tone'] = 'normal', changes?: string[]): ActionResult {
  log(s, text, tone);
  return { text, changes };
}
function advance(s: DemoState, minutes: number) {
  const before = s.minute;
  s.minute += minutes;
  if (s.caseStatus === 'held' && before < 660 && s.minute >= 660) {
    log(s, '有人从渡口传话：午时一到，许青就要被押去镇公所。想问他的事，最好趁早。', 'world');
  }
  if (s.caseStatus === 'held' && s.minute >= 720) {
    s.caseStatus = 'moved';
    log(s, '午鼓响了。卫衡把许青押往镇公所，旧账也一并送去。此事还没定案，可以继续追查。', 'world');
  }
  if (Math.floor(before / 1440) < day(s)) {
    const passedDays = day(s) - Math.floor(before / 1440);
    s.heat = Math.max(0, s.heat - passedDays * 8);
    s.theftHeat = Math.max(0, s.theftHeat - passedDays * 8);
    log(s, '又过了一夜。船行重新招工，顾行舟也愿意陪人过几招。街头的议论渐渐淡了些。', 'world');
  }
}

export function derived(s: DemoState) {
  return {
    hpMax: 90 + s.attrs.body * 5 + s.power * 12,
    mpMax: s.power > 0 ? 35 + s.attrs.root * 4 + s.power * 12 : 0,
    travelFactor: Math.max(.6, 1 - (s.attrs.agility - 10) * .035 - (s.footwork - 1) * .025),
  };
}
export function createDemo(origin: OriginId, name = '无名客'): DemoState {
  const def = ORIGINS.find(o => o.id === origin) ?? ORIGINS[0];
  const s: DemoState = {
    version: 1, origin: def.id, name: name.trim().slice(0, 8) || '无名客', attrs: { ...def.attrs },
    place: 'dock', minute: 540, hp: 0, mp: 0, stamina: 100, silver: 28,
    experience: 0, power: 0, sword: 0, footwork: 0, stance: 'steady',
    inventory: { medicine: 1, cloth_bundle: 1 }, flags: {}, relations: {}, heat: 0, renown: 0, log: [],
    caseStatus: 'held', daily: {}, theftHeat: 0,
  };
  const d = derived(s); s.hp = d.hpMax; s.mp = d.mpMax;
  log(s, `你曾是${def.name}，如今带着二十八文钱、一只布包袱来到青溪镇。还没学过武功，也无人认识你。先找活计，去武场看看，或管一桩闲事，都随你。`, 'world');
  log(s, '许青被漕帮扣在渡口，午时要押去镇公所。他说账本上记着船工的血汗钱。', 'world');
  return s;
}
export function clockLabel(s: DemoState): string {
  const h = hour(s); const m = Math.floor(s.minute % 60);
  const shichen = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'][Math.floor((h + 1) % 24 / 2)];
  return `第${day(s) + 1}日 · ${shichen}时 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function npcsAt(s: DemoState): NpcDef[] {
  const h = hour(s);
  return NPCS.flatMap(n => {
    let place = n.place;
    if (n.id === 'constable' && s.stopped) place = s.place;
    if (n.id === 'xu') {
      place = s.caseStatus === 'released' ? (h >= 6 && h < 21 ? 'tea' : 'inn') : s.caseStatus === 'moved' ? 'yamen' : 'dock';
    } else if (n.id === 'guard') {
      if (s.caseStatus === 'released') return [];
      place = s.caseStatus === 'moved' ? 'yamen' : 'dock';
    } else if (n.id === 'swordsman' && (h < 7 || h >= 20)) return [];
    else if (n.id === 'docker' && (h < 6 || h >= 19)) return [];
    else if (n.id === 'merchant' && (h < 6 || h >= 20)) return [];
    else if (n.id === 'teaman' && (h < 5 || h >= 22)) return [];
    if (place !== s.place) return [];
    const description = n.id === 'xu' && s.caseStatus === 'released' ? '手上还留着绳印。他看见你，起身让出半条凳子。' : n.description;
    return [{ ...n, place, description, role: n.id === 'xu' && s.caseStatus === 'released' ? '记着你恩情的船工' : n.role }];
  });
}
export function placeDescription(s: DemoState): string {
  let text = PLACES.find(p => p.id === s.place)!.description;
  if (s.place === 'dock' && s.caseStatus !== 'held') text = s.caseStatus === 'released' ? '绳索已经解开，船工们重新搬起货。有人认出你，默默朝你点了点头。' : '潮水漫过低处的石阶，木桩边已经空了。许青被押去镇公所，船工们干活时都不说话。';
  if (s.place === 'street' && s.flags.purseTaken) text = '药摊旁的柜台空出一角。方掌柜的钱袋不见了，这条街多了几道打量生人的目光。';
  if (s.place === 'yamen' && s.caseStatus === 'moved') text += ' 许青坐在廊下，卫衡仍守着他，案子还等着发落。';
  if (hour(s) < 6 || hour(s) >= 20) text += ' 夜深了，大半铺面已经落板。';
  if (s.stopped) text += ` 秦捕头认出了你，拦住去路。交罚钱、随他查问${s.sword > 0 ? '，或拔剑闯关' : ''}，你得先作个决定。`;
  else if (s.heat >= 35) text += ' 巡街的人正拿着口供辨认过路客，你得留心自己的行踪。';
  return text;
}

function checkResources(s: DemoState, silver = 0, stamina = 0, duringStop = false): string | undefined {
  if (s.pendingBattle) return '先了结眼前的交手。';
  if (s.stopped && !duringStop) return '巡街的人还拦着你，先交涉了结眼前的查问。';
  if (s.silver < silver) return `还缺 ${silver - s.silver} 文钱。`;
  if (s.stamina < stamina) return `至少需要 ${stamina} 点精力，先歇歇脚。`;
  return undefined;
}
function sneakChance(s: DemoState) { return clamp(.22 + (s.attrs.agility - 10) * .045 + s.footwork * .07 + (s.flags.witness ? .1 : 0) - (s.caseStatus === 'moved' ? .12 : 0), .12, .92); }
function ownerOpen(s: DemoState, id: string) { return npcsAt(s).some(n => n.id === id); }
function action(s: DemoState, id: string, label: string, description: string, cost: string, silver = 0, stamina = 0, disabled?: string, tone?: DemoAction['tone']): DemoAction {
  const duringStop = id.startsWith('talk:') || ['settle-fine', 'submit-check', 'arrest-fight', 'use-medicine'].includes(id);
  return { id, label, description, cost, tone, disabled: checkResources(s, silver, stamina, duringStop) ?? disabled };
}
function patrolActions(s: DemoState): DemoAction[] {
  return [
    action(s, 'settle-fine', '认罚了结', '交清罚钱，官府不再追你；欠下的人情与恩怨仍要自己还。', `半小时 · ${fine(s)} 文`, fine(s)),
    action(s, 'submit-check', '随捕头走一趟', '去公所交代经过，耗两个小时。按身上余钱赔付，身无分文也能获释，人情恩怨仍留下。', `两小时 · 至多 ${Math.min(s.silver, 12 + Math.floor(s.heat / 5))} 文`),
    action(s, 'arrest-fight', '闯出拦查', '打退拦路的人，追缉会更紧。身上有伤时尤其凶险。', '交手 · 12 精力', 0, 12, s.sword < 1 ? '还不会剑术。眼下先认罚或随捕头查问，日后可到旧武场请教。' : s.hp < 20 ? '伤势太重，先敷药或随捕头走一趟。' : undefined, 'danger'),
  ];
}
function medicineAction(s: DemoState): DemoAction {
  return action(s, 'use-medicine', '敷金疮药', '消耗一包，恢复六十点气血。', '五分钟 · 伤药 ×1', 0, 0, s.hp >= derived(s).hpMax ? '身上没有伤，先把药留着。' : undefined);
}
function caseActions(s: DemoState): DemoAction[] {
  if (s.caseStatus === 'released' || (s.caseStatus === 'held' ? s.place !== 'dock' : s.place !== 'yamen')) return [];
  return [
    action(s, 'rescue-evidence', '拿证据说话', '货单与人证对得上，便能请他们撤下绳子。', '一刻钟 · 两份线索', 0, 0, !s.flags.ledger || !s.flags.witness ? '需要核过长街货单，并听过茶棚的人证。' : undefined, 'accent'),
    action(s, 'rescue-money', '出钱担保', '替许青垫上争议的船钱。护卫放人，你替他担了责任。', '十分钟 · 60 文', 60, 0, undefined, 'accent'),
    action(s, 'rescue-sneak', '轻身带人走', s.footwork > 0 ? `借绳桩与人流脱身，约有 ${Math.round(sneakChance(s) * 100)}% 把握。失手会露出行藏，成功也可能被认出。` : '平日脚快，还不等于会轻功。带着人越过窄板，需要先学会轻身步法。', '一刻钟 · 22 精力', 0, 22, s.footwork < 1 ? '尚未学过轻功，先去旧武场向顾行舟请教。' : undefined, 'danger'),
    action(s, 'rescue-fight', '拔剑拦人', '赢下护卫，让许青先走。众人会认得你，漕帮也会记住这一剑。', '交手 · 12 精力', 0, 12, s.sword < 1 ? '尚未学过剑术，先去旧武场向顾行舟请教。' : s.hp < 20 ? '伤势太重，先养伤。' : undefined, 'danger'),
  ];
}

export function actionsFor(s: DemoState, target?: string): DemoAction[] {
  const list: DemoAction[] = [];
  const add = (...a: DemoAction[]) => list.push(...a);
  if (s.stopped) {
    if (target) {
      const npc = npcsAt(s).find(n => n.id === target);
      if (!npc) return [];
      add(action(s, `talk:${target}`, target === 'constable' ? '交涉' : '交谈', `听听${npc.name}怎么说。`, '两分钟'));
    }
    if (!target || target === 'constable') add(...patrolActions(s));
    if (!target && (s.inventory.medicine ?? 0) > 0) add(medicineAction(s));
    return list;
  }
  if (target) {
    const npc = npcsAt(s).find(n => n.id === target);
    if (!npc) return [];
    add(action(s, `talk:${target}`, '交谈', `听听${npc.name}怎么说。`, '两分钟'));
    if (target === 'xu' || target === 'guard' || target === 'constable') add(...caseActions(s));
    if (target === 'xu' && s.caseStatus === 'released') add(action(s, 'xu-gift', '接下船工的心意', '许青替你留了一包伤药。「这份情，我们记着。」', '一包伤药', 0, 0, s.flags.xuGift ? '这份心意已经收下。' : undefined));
  }
  const has = (id: string) => target ? target === id : ownerOpen(s, id);
  if (s.place === 'dock' && has('docker')) add(action(s, 'work-cargo', '替船行搬货', `体魄 ${s.attrs.body}，一趟可得 ${cargoPay(s)} 文。船工也会慢慢认得你。`, '四十五分钟 · 22 精力', 0, 22, s.heat >= 60 ? '风声太紧，领班不敢用你。' : undefined));
  if (s.place === 'street' && has('merchant')) {
    add(action(s, 'work-courier', '沿街送信', `身法 ${s.attrs.agility}，一趟可得 ${courierPay(s)} 文。`, '三十五分钟 · 18 精力', 0, 18, s.heat >= 60 ? '方掌柜暂时不肯把货交给你。' : undefined));
    add(action(s, 'work-copy', '替账房誊抄', `悟性 ${s.attrs.insight}，一趟可得 ${copyPay(s)} 文。`, '四十分钟 · 12 精力', 0, 12, s.flags.theftWitnessed && s.flags.purseTaken ? '先把方掌柜的钱袋还回来。' : undefined));
    add(action(s, 'inspect-ledger', '核对运货账', '查明许青拿走的账本，究竟记着什么。读得懂账，便少费些工夫。', s.attrs.insight >= 15 ? '十分钟' : '三十五分钟', 0, 0, s.flags.ledger ? '货单已经核过：船钱缴清，工钱仍欠着。' : undefined));
    add(action(s, 'buy-medicine', '买一包金疮药', '包扎外伤，可在行路时恢复六十点气血。', '五分钟 · 18 文', 18));
    add(action(s, 'take-purse', '顺走柜边钱袋', '钱袋里有三十五文。白天人多眼杂，露面会留下案底。', '五分钟 · 8 精力', 0, 8, s.flags.purseTaken || s.flags.purseReturned ? '柜边已经没有钱袋可拿。' : undefined, 'danger'));
    if (s.flags.purseTaken) add(action(s, 'return-purse', '还钱赔不是', '归还三十五文，修补与掌柜的关系。这笔失窃的追查也就消了。', '十分钟 · 35 文', 35));
  }
  if (s.place === 'tea' && has('teaman')) {
    add(action(s, 'ask-witness', '问问清晨的船', '陆婆婆看见过许青取账。她不愿一个孩子平白担上罪名。', '一刻钟', 0, 0, s.flags.witness ? '人证已记下：许青拿账，是为了讨工钱。' : undefined));
    add(action(s, 'hear-rumor', '坐听江湖消息', '听旁人怎样讲你做过的事，也听镇上新动静。', '十分钟'));
  }
  if (s.place === 'yard' && has('swordsman')) {
    add(action(s, 'observe-sword', '看一遍收剑', '顾行舟放慢动作，让你看清重心怎样收回脚下。', '二十分钟 · 初次得 8 历练', 0, 0, s.flags.observedSword ? '这一式已经看明白了，该自己练练。' : undefined));
    for (const [id, key, label, description] of [
      ['learn-sword', 'sword', '请教第一招剑术', '从握剑、起手与收势学起。顾行舟会借你一柄练习木剑。'],
      ['learn-inner', 'power', '请教第一口吐纳', '先坐稳，辨清一呼一吸，学养息功的入门练法。'],
      ['learn-footwork', 'footwork', '请教第一步轻功', '沿白灰线换步，把脚程练成能收得住的穿巷步。'],
    ] as const) {
      add(action(s, id, label, description, '一刻钟 · 10 精力 · 免费', 0, 10,
        s[key] > 0 ? '已经入门，可在武学页把近来的见闻练进功夫里。' : !s.flags.observedSword ? '先看一遍顾行舟收剑，认清立足与收势，再开口请教。' : undefined, 'accent'));
    }
    add(action(s, 'spar', '请教几招', dayCount(s, 'spar') < 2 ? '点到为止，输了也能有所体会。每日前两场可得历练。' : '今日已经印证过两场，再试招只练手，不添历练。', '交手 · 10 精力', 0, 10, s.sword < 1 ? '还没学过剑术，先观摩，再请教第一招。' : s.hp < 20 ? '伤势太重，先养伤。' : undefined, 'accent'));
  }
  if ((s.place === 'tea' && has('teaman')) || (s.place === 'inn' && has('innkeeper'))) add(action(s, 'eat', '吃碗热面', '恢复三十五点精力、二十点气血。', '二十分钟 · 10 文', 10));
  if (s.place === 'inn' && has('innkeeper')) add(action(s, 'sleep', '投店睡一觉', `四个时辰，一夜好眠。气血、${s.power > 0 ? '内力、' : ''}精力恢复，镇上的事照常往前走。`, '八小时 · 18 文', 18));
  if (s.place === 'yamen' && has('constable') && s.heat > 0) {
    add(...patrolActions(s));
  }
  if (!target) {
    add(action(s, 'free-rest', '找个避风处歇脚', `不花钱也能缓过来。恢复四十点精力、三十五点气血${s.power > 0 ? '、二十五点内力' : ''}。`, '两小时 · 免费'));
    add(action(s, 'wait', '留步等一等', '看一刻钟里，镇上有没有新的动静。', '一刻钟'));
    if ((s.inventory.medicine ?? 0) > 0) add(medicineAction(s));
  }
  return list;
}

function cargoPay(s: DemoState) { return 24 + (s.attrs.body - 10) * 3; }
function courierPay(s: DemoState) { return 19 + (s.attrs.agility - 10) * 2; }
function copyPay(s: DemoState) { return 18 + (s.attrs.insight - 10) * 2; }
function fine(s: DemoState) { return 20 + s.heat; }
function recover(s: DemoState, hp: number, mp: number, stamina: number) {
  const d = derived(s); s.hp = Math.min(d.hpMax, s.hp + hp); s.mp = Math.min(d.mpMax, s.mp + mp); s.stamina = Math.min(100, s.stamina + stamina);
}
function release(s: DemoState, method: string) {
  if (s.caseStatus === 'released') return;
  s.caseStatus = 'released'; s.caseMethod = method; s.relations.xu = (s.relations.xu ?? 0) + 3;
  s.experience += 18; s.renown += method === 'sneak' ? 1 : 3;
  s.flags.caseRewarded = true;
}
function beginBattle(s: DemoState, request: BattleRequest): ActionResult {
  s.pendingBattle = request;
  const text = request.reason === 'spar' ? '顾行舟横剑一礼。「尽管使来，咱们点到为止。」' : request.reason === 'rescue' ? '你把剑横在两人之间。卫衡退开半步，缓缓抽出刀来。' : '秦捕头横过铁尺，堵住去路。「想清楚，拔剑可就不是原来的事了。」';
  log(s, text); return { text, battle: request };
}

export function act(s: DemoState, id: string, rng: () => number = Math.random): ActionResult {
  const available = [...actionsFor(s), ...npcsAt(s).flatMap(n => actionsFor(s, n.id))];
  const choice = available.find(a => a.id === id);
  if (!choice) return { text: '眼下不能这样做。看看身边的人和地方。' };
  if (choice.disabled) return { text: choice.disabled };
  if (id.startsWith('talk:')) {
    const who = id.slice(5); advance(s, 2);
    const words: Record<string, string> = {
      docker: s.caseStatus === 'released' ? '陶三拍拍你的肩：「许青的事，多谢了。想挣口饭吃，随时来找我。」' : '陶三压低声音：「许青拿的是东家的账。船钱和工钱搅在一块儿，长街方掌柜那儿有货单可对。」',
      guard: '卫衡看了一眼账本：「我只管拿人。拿出凭据，或有人出六十文担保，我就放他。午时之后，去公所说。」',
      xu: s.caseStatus === 'released' ? '许青给你倒了碗水：「工钱还要慢慢讨，可这回我知道，岸上也有肯替人说话的。」' : '许青抬起头：「账是我拿的。船钱早付了，东家却拿它抵我们的工钱。陆婆婆看见我上船，她能作证。」',
      merchant: s.flags.theftWitnessed && s.flags.purseTaken ? '方掌柜把算盘一扣：「你先把钱袋的事说清楚。」' : '方掌柜指指案头：「识字便替我抄账，脚快便帮我送信。只要事情办妥，钱少不了。」',
      teaman: '陆婆婆把茶碗推近：「有的人拿了账，算贼；有的人欠着工钱，倒还算东家。唉，话得听两边。」',
      swordsman: s.sword + s.power + s.footwork === 0 ? '顾行舟看了看你的双手：「没学过不碍事。先看我如何站稳、收剑。肯学，我便教你握剑、吐纳和换步，不收束脩。」' : '顾行舟道：「剑术是手上的事，内功是身里的事。入门的练法有了，再把见闻印证进去，才会长进。」',
      innkeeper: '宋娘子道：「一碗面十文，住一夜十八文。手头紧就歇门廊，别硬撑着赶路。」',
      constable: s.heat ? '秦捕头认出你的样貌：「有些事，认罚能了结。人家的东西、人家的信任，还得你自己还。」' : '秦捕头把刀收起：「账本、人证，拿来一起看。有理的人不必凭嗓门大。」',
    };
    return finish(s, words[who] ?? '你们说了几句闲话。');
  }
  switch (id) {
    case 'work-cargo': case 'work-courier': case 'work-copy': {
      const cargo = id === 'work-cargo'; const copy = id === 'work-copy';
      const pay = cargo ? cargoPay(s) : copy ? copyPay(s) : courierPay(s);
      s.stamina -= cargo ? 22 : copy ? 12 : 18; s.silver += pay;
      const xp = Math.max(0, Math.min(4, 16 - dayCount(s, 'workXp'))); count(s, 'workXp', xp); s.experience += xp;
      if (cargo) s.relations.docker = Math.min(3, (s.relations.docker ?? 0) + 1);
      advance(s, cargo ? 45 : copy ? 40 : 35);
      return finish(s, `${cargo ? '你把最后一包货稳稳放下，陶三数出铜钱。' : copy ? '你核完末行数字，把誊好的账页压在砚台下。' : '你穿过几条小巷，按时把信送到人家手里。'}挣得 ${pay} 文${xp ? `，添了 ${xp} 点历练` : '，今日的营生已做熟了'}。`, 'good', [`银钱 +${pay}`, ...(xp ? [`历练 +${xp}`] : [])]);
    }
    case 'inspect-ledger':
      s.flags.ledger = true; s.experience += 5; advance(s, s.attrs.insight >= 15 ? 10 : 35);
      return finish(s, '货单上的印记对得上：船钱已缴清，欠下的是船工的工钱。你抄下两行关键账目，方掌柜按了手印。', 'good', ['得到：货单抄件', '历练 +5']);
    case 'ask-witness':
      s.flags.witness = true; s.experience += 4; advance(s, 15);
      return finish(s, '陆婆婆愿意作证：许青取账前讨过三次工钱，东家一直不见。她还指出船尾有一条窄板，搬货时没人看守。', 'good', ['得到：茶棚人证', '轻身带人更有把握', '历练 +4']);
    case 'rescue-evidence':
      release(s, 'evidence'); s.relations.guard = 1; s.relations.constable = 1; advance(s, 15);
      return finish(s, '货单与人证摆在一处，卫衡终于收起刀。许青松了绑，账本由公所收存，欠薪另查。你替他说清了话，也没替他抹掉拿账这件事。', 'good', ['许青记住了你', '历练 +18', '名声 +3']);
    case 'rescue-money':
      s.silver -= 60; release(s, 'money'); advance(s, 10);
      return finish(s, '你把六十文放在船板上，签下担保。许青重获自由，欠薪的账还没了结。他低声说：「这钱，我会慢慢还你。」', 'good', ['银钱 −60', '许青欠你一份情', '历练 +18']);
    case 'rescue-sneak': {
      s.stamina -= 22;
      const success = rng() < sneakChance(s); const witnessed = success && rng() >= clamp(.28 + (s.attrs.agility - 10) * .055 + s.footwork * .025, .2, .8);
      if (success) { release(s, 'sneak'); if (witnessed) { s.heat += 24; s.flags.rescueWitnessed = true; } }
      else { s.heat += 16; s.relations.guard = -1; }
      advance(s, 15);
      return finish(s, success ? (witnessed ? '你带许青翻过货堆，踏着窄板到了岸边。身后一声喝问：有人看清了你的脸。人救出来了，巡街也有了你的样貌。' : '趁搬货的人挡住视线，你解开绳子，带许青从船尾绕走。岸上无人叫出你的名字，只有许青记得这份恩情。') : '窄板在脚下响了一声，卫衡转身拦住去路。你退了回来，人还没救出，护卫却已记住你的样貌。别的办法仍能试。', success ? 'good' : 'bad', success ? ['许青获释', ...(witnessed ? ['追缉 +24'] : ['无人认出']), '历练 +18'] : ['追缉 +16', '精力 −22']);
    }
    case 'rescue-fight': s.stamina -= 12; return beginBattle(s, { foe: 'guard', reason: 'rescue', name: '卫衡' });
    case 'spar': s.stamina -= 10; return beginBattle(s, { foe: 'swordsman', reason: 'spar', name: '顾行舟' });
    case 'arrest-fight': s.stamina -= 12; return beginBattle(s, { foe: 'guard', reason: 'arrest', name: '秦捕头' });
    case 'observe-sword':
      s.flags.observedSword = true; s.experience += 8; advance(s, 20);
      return finish(s, '顾行舟收剑时，后脚先稳住了。你空着手比画两下，才知道手脚还不听使唤。他点点头：「看出难处了，就从头学。」', 'good', ['可以请教入门练法', '历练 +8']);
    case 'learn-sword':
      s.sword = 1; s.stamina -= 10; s.inventory.practice_sword = 1; advance(s, 15);
      return finish(s, '顾行舟递来一柄木剑，替你正了握法。起手、平刺、收势，你慢慢走完一遍，剑尖终于不再乱晃。「这才是头一招，往后还长着呢。」', 'good', ['渡水剑入门', '得到：练习木剑', '精力 −10']);
    case 'learn-inner':
      s.power = 1; s.stamina -= 10; s.mp = Math.min(derived(s).mpMax, 30); advance(s, 15);
      return finish(s, '你随顾行舟坐下，按他的节奏一呼一吸。许久，胸口的憋闷缓了，才隐约摸到一点温热的气息。「养息功，先求平稳，切莫贪急。」', 'good', ['养息功入门', '内力初生 · 30', '精力 −10']);
    case 'learn-footwork':
      s.footwork = 1; s.stamina -= 10; advance(s, 15);
      return finish(s, '顾行舟在白灰线上落脚，让你跟着换步。几次踉跄后，你终于能在转身时收住脚。「这叫穿巷步。先走稳，日后再求轻快。」', 'good', ['穿巷步入门', '精力 −10']);
    case 'take-purse': {
      const seen = rng() >= clamp((s.attrs.agility - 8) * .045 + s.footwork * .025, .12, .7);
      s.flags.purseTaken = true; s.silver += 35; s.stamina -= 8;
      if (seen) { s.flags.theftWitnessed = true; s.theftHeat = 30; s.heat += 30; s.relations.merchant = -3; }
      advance(s, 5);
      return finish(s, seen ? '钱袋刚入袖，方掌柜便抬起了头。你揣着三十五文离开柜边，街坊却已认下你的样貌。' : '趁掌柜转身拿药，你将钱袋滑进袖里。得了三十五文，暂时没人认出是谁。', seen ? 'bad' : 'normal', ['银钱 +35', ...(seen ? ['追缉 +30', '方掌柜与你有隙'] : ['无人认出'])]);
    }
    case 'return-purse':
      s.silver -= 35; s.flags.purseTaken = false; s.flags.purseReturned = true;
      s.heat = Math.max(0, s.heat - s.theftHeat); s.theftHeat = 0;
      s.relations.merchant = s.flags.theftWitnessed ? -1 : 1; advance(s, 10);
      return finish(s, '你把钱凑齐，连钱袋一起交回去。方掌柜收起报失的状纸，点了点头。生意还可以做，信任却要慢慢挣。', 'good', ['银钱 −35', '失窃追查了结']);
    case 'settle-fine': {
      const paid = fine(s); s.silver -= paid; s.heat = 0; s.theftHeat = 0; s.stopped = false; advance(s, 30);
      return finish(s, '秦捕头收了罚钱，在名册上划去你的名字。「官面上的事了了。街坊肯不肯信你，还得看往后。」', 'good', [`银钱 −${paid}`, '追缉清零']);
    }
    case 'submit-check': {
      const paid = Math.min(s.silver, 12 + Math.floor(s.heat / 5));
      s.silver -= paid; s.heat = 0; s.theftHeat = 0; s.stopped = false; s.place = 'yamen';
      advance(s, 120);
      return finish(s, `你随秦捕头去公所，把经过写进供状。${paid ? `赔了 ${paid} 文` : '身上无钱，暂免赔付'}，两个小时后获准离开。官府的追查了结了，街坊的心结还在。`, 'normal', ['两个小时过去', ...(paid ? [`银钱 −${paid}`] : []), '追缉清零']);
    }
    case 'buy-medicine': s.silver -= 18; s.inventory.medicine = (s.inventory.medicine ?? 0) + 1; advance(s, 5); return finish(s, '方掌柜把伤药包好，叮嘱你先洗净伤口再敷。', 'good', ['银钱 −18', '金疮药 +1']);
    case 'use-medicine': s.inventory.medicine -= 1; recover(s, 60, 0, 0); advance(s, 5); return finish(s, '洗净伤口，敷上药末，疼痛渐渐缓了下来。', 'good', ['气血 +60']);
    case 'eat': s.silver -= 10; recover(s, 20, 0, 35); advance(s, 20); return finish(s, '热汤下肚，肩背松快了许多。窗外来往的人还在忙着各自的营生。', 'good', ['银钱 −10', '精力 +35', '气血 +20']);
    case 'sleep': s.silver -= 18; advance(s, 480); recover(s, 9999, 9999, 100); return finish(s, `你把随身家当放在枕边，安稳睡了一觉。醒来时，肩背的酸痛已散了${s.power > 0 ? '，内息也平顺了' : ''}。`, 'good', ['银钱 −18', `气血、${s.power > 0 ? '内力、' : ''}精力恢复`]);
    case 'free-rest': advance(s, 120); recover(s, 35, 25, 40); return finish(s, '你找了个避风处坐下，慢慢调匀呼吸。没有热饭软床，也总能把力气一点点养回来。', 'good', ['精力 +40', '气血 +35', ...(s.power > 0 ? ['内力 +25'] : [])]);
    case 'wait': advance(s, 15); return finish(s, '你停留片刻，看着人来人往。镇上的钟没有停。');
    case 'xu-gift': s.flags.xuGift = true; s.inventory.medicine = (s.inventory.medicine ?? 0) + 1; advance(s, 2); return finish(s, '许青把一包伤药塞进你掌心。「往后到渡口，叫一声就成。」', 'good', ['金疮药 +1']);
    case 'hear-rumor': {
      advance(s, 10);
      let rumor = s.caseStatus === 'moved' ? '邻桌说，许青已经押到了公所，船行的欠薪却仍没个说法。' : '邻桌说，船行缺脚夫，旧武场有位剑客，肯教没摸过剑的人几手入门功夫。';
      if (s.caseStatus === 'released') rumor = s.caseMethod === 'fight' ? `有人比画着剑势：「那个叫${s.name}的，把漕帮护卫逼退了！」另一个人却说，漕帮未必肯罢休。` : s.caseMethod === 'evidence' ? `有人提起${s.name}：「年轻归年轻，肯把账查明白再开口。」船工们听了，纷纷点头。` : s.caseMethod === 'money' ? `有人说，${s.name}掏钱替船工担了保。「钱不多，肯替生人担事，这份胆气难得。」` : s.flags.rescueWitnessed ? `有人说见过${s.name}带人跃过船板，巡街的人也在问同样的事。` : '有人说许青自己脱了身，也有人说是旧相识来接。真正出手的是谁，茶棚里没人说得准。';
      if (s.flags.theftWitnessed && !s.flags.purseReturned) rumor += ' 还有人在议论方掌柜丢钱的事，描述的样貌与你相像。';
      return finish(s, rumor, 'world');
    }
    default: return { text: '眼下不能这样做。' };
  }
}

export function travel(s: DemoState, to: PlaceId): ActionResult {
  if (s.pendingBattle) return { text: '交手尚未了结，先应付眼前的人。' };
  if (s.stopped) return { text: '巡街的人拦住了去路，先交涉了结眼前的查问。' };
  if (to === s.place) return { text: '你已经在这里了。' };
  if (!PLACES.some(p => p.id === to)) return { text: '这里没有通往那个地方的路。' };
  const queue: PlaceId[][] = [[s.place]]; const seen = new Set<PlaceId>([s.place]); let route: PlaceId[] | undefined;
  while (queue.length) {
    const path = queue.shift()!; const last = path.at(-1)!;
    if (last === to) { route = path; break; }
    for (const next of PLACES.find(p => p.id === last)!.links) if (!seen.has(next)) { seen.add(next); queue.push([...path, next]); }
  }
  if (!route) return { text: '路被隔断了，暂时过不去。' };
  // A direct map trip still passes through intermediate streets; wanted people cannot skip a patrol by picking a farther destination.
  const stopAt = s.heat >= 35 ? route.findIndex((p, i) => i > 0 && (p === 'street' || p === 'yamen')) : -1;
  if (stopAt > 0) route = route.slice(0, stopAt + 1);
  to = route.at(-1)!;
  const minutes = Math.max(4, Math.round((route.length - 1) * 10 * derived(s).travelFactor));
  s.place = to; advance(s, minutes);
  let text = `你${route.length > 2 ? '穿过' + route.slice(1, -1).map(id => PLACES.find(p => p.id === id)!.name).join('、') + '，' : ''}来到${PLACES.find(p => p.id === to)!.name}，走了 ${minutes} 分钟。`;
  if (s.heat >= 35 && (to === 'yamen' || to === 'street')) {
    s.stopped = true;
    text += ` 秦捕头对照口供认出了你，横身拦住去路。可以交罚钱、随他查问${s.sword > 0 ? '，也可以冒险闯出去' : ''}。`;
  }
  return finish(s, text);
}

export function trainingOffer(s: DemoState, kind: 'sword' | 'inner' | 'footwork'): { cost: number; minutes: number; disabled?: string } {
  if (!['sword', 'inner', 'footwork'].includes(kind)) return { cost: 0, minutes: 0, disabled: '还没有这种练法。' };
  const key = kind === 'inner' ? 'power' : kind;
  const level = s[key]; const cost = 8 + level * 4;
  const minutes = Math.max(20, 50 - (kind === 'inner' ? s.attrs.root : kind === 'footwork' ? s.attrs.agility : s.attrs.insight));
  const disabled = checkResources(s, 0, 15)
    ?? (level < 1 ? '还没学过这门功夫，先去旧武场观摩，再向顾行舟请教入门练法。' : undefined)
    ?? (!['yard', 'inn', 'tea'].includes(s.place) ? '这里人多脚杂，先去旧武场、茶棚或客栈，找个安稳地方练功。' : undefined)
    ?? (level >= MAX_SKILL_LEVEL ? '这门入门功夫已练到眼下的尽头，还需更好的师承与见识。' : undefined)
    ?? (s.experience < cost ? `这次修炼需要 ${cost} 点历练。先出去做事，或找顾行舟印证几招。` : undefined);
  return { cost, minutes, disabled };
}

export function train(s: DemoState, kind: 'sword' | 'inner' | 'footwork'): ActionResult {
  const offer = trainingOffer(s, kind);
  if (offer.disabled) return { text: offer.disabled };
  const key = kind === 'inner' ? 'power' : kind;
  const level = s[key]; const cost = offer.cost;
  s.experience -= cost; s.stamina -= 15; s[key] += 1;
  advance(s, offer.minutes);
  const name = kind === 'inner' ? '内功根基' : kind === 'sword' ? '基础剑术' : '轻身步法';
  const detail = kind === 'inner' ? '内息在经脉里走得更稳。日后换心法，练出的这份功力仍属于你。' : kind === 'sword' ? '从起手到收剑，你试着让每一分力都落到剑上。握剑的手比先前稳了。' : '你沿着砖缝来回换步，终于能在转身时不惊起脚边的灰。';
  return finish(s, `你把近来的见闻一点点印证到功夫里。${name}长进了一层。${detail}`, 'good', [`${name} ${level} → ${level + 1}`, `历练 −${cost}`, '精力 −15']);
}
export function setStance(s: DemoState, stance: Stance): void {
  if (s.pendingBattle || !['steady', 'flowing'].includes(stance)) return;
  s.stance = stance;
}

export function settleBattle(s: DemoState, request: BattleRequest, result: 'win' | 'lose' | 'flee', hp: number, mp: number): string {
  const pending = s.pendingBattle;
  if (!pending || pending.foe !== request.foe || pending.reason !== request.reason || pending.name !== request.name) return '这场交手已经了结。';
  delete s.pendingBattle;
  const d = derived(s); s.hp = clamp(Number.isFinite(hp) ? hp : 1, 1, d.hpMax); s.mp = clamp(Number.isFinite(mp) ? mp : 0, 0, d.mpMax);
  let text: string;
  if (request.reason === 'spar') {
    const reward = dayCount(s, 'spar') < 2 && result !== 'flee' ? (result === 'win' ? 10 : 5) : 0;
    count(s, 'spar'); s.experience += reward; s.hp = Math.max(s.hp, Math.round(d.hpMax * .35));
    if (result === 'win') s.relations.swordsman = Math.min(3, (s.relations.swordsman ?? 0) + 1);
    text = result === 'win' ? '顾行舟收剑笑道：「这一手不错，再稳些就更好了。」' : result === 'flee' ? '你退到圈外，顾行舟便停了剑。「想练时再来。」' : '顾行舟及时收住剑尖，指给你看刚才露出的空门。输了几招，人却无碍。';
    text += reward ? `这场印证得了 ${reward} 点历练。` : '今日的试招没有再添历练。';
  } else if (request.reason === 'rescue') {
    if (result === 'win') {
      release(s, 'fight'); s.heat += 35; s.relations.guard = -2; s.flags.rescueWitnessed = true;
      text = '你逼退卫衡，解开绳索，让许青先走。船工看见了这一剑，漕帮也记下了你的名字。许青获释，历练增了十八，追缉增了三十五。';
    } else if (result === 'lose') {
      const lost = Math.min(12, s.silver); s.silver -= lost; s.hp = Math.max(s.hp, Math.round(d.hpMax * .25)); s.heat += 12;
      text = `卫衡缴下你手中的剑，警告后又掷还过来。你带伤退出，损了 ${lost} 文钱。许青仍被扣着，还可以另想办法。`;
    } else { s.heat += 8; text = '你借一步空隙退了出去。许青还没能脱身，护卫已记下你的样貌。'; }
  } else {
    s.stopped = false;
    s.heat += result === 'win' ? 30 : 15;
    if (result === 'lose') { s.silver = Math.max(0, s.silver - Math.min(20, s.silver)); s.hp = Math.max(s.hp, Math.round(d.hpMax * .25)); }
    s.place = 'street';
    text = result === 'win' ? '你逼退拦路的人，闯回长街。身后追缉的呼声更紧，靠剑挣来的去路，也要靠自己承担后果。' : result === 'flee' ? '你借街角的货堆脱身，绕回长街。眼下逃开了，巡街的人却记住了你。' : '你被扣下盘问，赔掉身上部分钱财才获放行。伤能养好，这次教训却没那么快忘。';
  }
  advance(s, 15); log(s, text, result === 'win' ? 'good' : result === 'lose' ? 'bad' : 'normal'); return text;
}
