import { useState, useEffect, useCallback, useRef } from "react";

// ═══ Card definitions & helpers ═══
const CARDS = [
  { v: 1, name: "卫兵", emoji: "⚔️", n: 5, desc: "猜测对手手牌（不可猜卫兵），猜中则对手出局" },
  { v: 2, name: "牧师", emoji: "📿", n: 2, desc: "查看对手的手牌" },
  { v: 3, name: "男爵", emoji: "🎖️", n: 2, desc: "与对手比较手牌，点数小者出局" },
  { v: 4, name: "侍女", emoji: "🛡️", n: 2, desc: "获得保护直到你的下一回合" },
  { v: 5, name: "王子", emoji: "👑", n: 2, desc: "令一名玩家弃牌并重抽" },
  { v: 6, name: "国王", emoji: "🤴", n: 1, desc: "与对手交换手牌" },
  { v: 7, name: "伯爵夫人", emoji: "💃", n: 1, desc: "与国王或王子同持时必须打出" },
  { v: 8, name: "公主", emoji: "👸", n: 1, desc: "被打出或弃掉则直接出局" },
];
const C = (v) => CARDS.find(c => c.v === v);
const cStr = (v) => { const c = C(v); return `${c.emoji}${c.name}(${v})`; };
const fullDeck = () => { const d = []; CARDS.forEach(c => { for (let i = 0; i < c.n; i++) d.push(c.v); }); return d; };
function shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
function initRound() {
  const deck = shuffle(fullDeck()), hidden = deck.pop(), faceUp = [deck.pop(), deck.pop(), deck.pop()];
  return { deck, hidden, faceUp, playerHand: [deck.pop()], aiHand: [deck.pop()], playerPlayed: [], aiPlayed: [], playerProtected: false, aiProtected: false, playerAlive: true, aiAlive: true, aiKnowsPlayerCard: null, playerPlayedCountessRecently: false };
}
function draw(r) { return r.deck.length > 0 ? (() => { const d = [...r.deck], c = d.pop(); return [d, c]; })() : [r.deck, r.hidden]; }

// ═══ AI Brain (logic untouched) ═══
function possibleCards(st) { const pool = fullDeck(); [...st.faceUp, ...st.playerPlayed, ...st.aiPlayed, ...st.aiHand].forEach(v => { const i = pool.indexOf(v); if (i !== -1) pool.splice(i, 1); }); return pool; }
function probs(st) { const pool = possibleCards(st), t = pool.length; if (!t) return {}; const f = {}; pool.forEach(v => { f[v] = (f[v] || 0) + 1; }); const p = {}; Object.entries(f).forEach(([v, c]) => { p[parseInt(v)] = c / t; }); return p; }
function phase(st) { return st.deck.length >= 6 ? "early" : st.deck.length >= 3 ? "mid" : "late"; }

function aiGuessCard(st) {
  const pr = probs(st);
  if (st.aiKnowsPlayerCard && st.aiKnowsPlayerCard !== 1 && pr[st.aiKnowsPlayerCard] > 0) return st.aiKnowsPlayerCard;
  if (st.playerPlayedCountessRecently) { for (const v of [8, 6, 5]) if (pr[v] > 0) return v; }
  const cands = Object.entries(pr).filter(([v]) => parseInt(v) !== 1);
  if (!cands.length) return 2;
  const ph = phase(st);
  if (ph === "late") {
    const ng = possibleCards(st).filter(v => v !== 1);
    if (ng.length > 0 && ng.every(v => v === ng[0])) return ng[0];
    let best = null, bs = -1; for (const [v, p] of cands) { const val = parseInt(v), s = p * (1 + val * 0.15); if (s > bs) { bs = s; best = val; } } return best || 2;
  }
  let best = null, bp = -1; for (const [v, p] of cands) { const val = parseInt(v), s = p + ((val >= 2 && val <= 4) ? 0.05 : 0); if (s > bp) { bp = s; best = val; } }
  if (Math.random() < 0.1) { const valid = cands.map(([v]) => parseInt(v)); return valid[Math.floor(Math.random() * valid.length)]; }
  return best || 2;
}

function infer(st) {
  const h = { likelyHigh: false, likelyPrincess: false }, last = st.playerPlayed[st.playerPlayed.length - 1];
  if (last === 7) { h.likelyHigh = true; if (probs(st)[8] > 0) h.likelyPrincess = true; }
  if (last === 4 || (last === 3 && st.playerAlive && st.aiAlive)) h.likelyHigh = true;
  return h;
}

function aiDecide(st) {
  const [a, b] = st.aiHand, ph = phase(st), prot = st.playerProtected, hints = infer(st);
  const play = v => a === v ? { play: a, keep: b } : { play: b, keep: a };
  const has = v => a === v || b === v, other = v => a === v ? b : a;
  const low = () => a <= b ? { play: a, keep: b } : { play: b, keep: a };
  if (a === 7 && (b === 5 || b === 6)) return { play: 7, keep: b };
  if (b === 7 && (a === 5 || a === 6)) return { play: 7, keep: a };
  if (a === 8) return { play: b, keep: a }; if (b === 8) return { play: a, keep: b };
  if (has(7)) { const c = other(7); if (c <= 4 && Math.random() < (ph === "early" ? 0.45 : ph === "mid" ? 0.3 : 0.15)) return play(7); if (c <= 2 && ph === "late") return play(7); }
  if (st.aiKnowsPlayerCard && !prot) { const k = st.aiKnowsPlayerCard; if (has(1) && k !== 1) return play(1); if (has(3) && other(3) > k) return play(3); if (has(6) && k > other(6) && k !== 8) return play(6); if (has(5) && k === 8) return play(5); }
  if (ph === "early") { if (has(4) && Math.max(a, b) >= 6) return play(4); if (has(2) && !prot) return play(2); if (has(1) && !prot) return play(1); if (has(4)) return play(4); return low(); }
  if (ph === "mid") { if (has(4) && (has(8) || Math.max(a, b) >= 7)) return play(4); if (has(3) && !prot) { const k = other(3); if (k >= 5 || (k >= 4 && Math.random() < 0.5)) return play(3); } if (has(1) && !prot) return play(1); if (has(5) && !prot && hints.likelyPrincess) return play(5); if (has(6) && !prot && other(6) <= 2 && hints.likelyHigh) return play(6); if (has(2) && !prot) return play(2); if (has(4)) return play(4); return low(); }
  if (has(4) && Math.max(a, b) >= 5) return play(4);
  if (has(3) && !prot) { const k = other(3); if (k >= 6 || (k >= 5 && Math.random() < 0.7)) return play(3); }
  if (has(1) && !prot) return play(1);
  if (has(5)) { if (!prot && hints.likelyPrincess) return play(5); if (other(5) <= 2) return play(5); }
  if (has(6) && !prot) { const k = other(6); if ((k <= 3 && hints.likelyHigh) || k <= 2) return play(6); }
  if (has(2)) return play(2); if (has(4)) return play(4); return low();
}

// ═══ Dialogue System ═══
const pick = a => a[Math.floor(Math.random() * a.length)];
function dlg(key, p = {}, pers = 3) {
  const { cardName: cn = "", cardVal: cv = "", emoji: em = "", guessName: gn = "", guessVal: gv = "", guessEmoji: ge = "", discName: dn = "", discEmoji: de = "", pCard: pc = "", aCard: ac = "", tokens: tk = "", total: tt = "" } = p;
  const D = {
    ai_drawing: { 1: ["小的这就抽牌了，您稍等🙏", "不好意思打扰了，我抽张牌哈...", "轮到我了...紧张😰 我先抽一张"], 3: ["AI正在抽牌..."], 5: ["老子摸牌了，瞪什么瞪？👀", "闭嘴看着，爹要抽牌了💩", "爷的回合开始了，给爷跪好🐶"] },
    ai_thinking: { 1: ["我想想怎么才能不伤害你...🤔", "好纠结啊，选哪张才对你好呢...", "让我斟酌一下怎么手下留情..."], 3: ["AI正在思考策略..."], 5: ["让老子想想怎么弄死你🤡", "别催，爷在想怎么碾碎你💀", "嘿嘿嘿，好几种搞你的方法🤮"] },
    ai_play_card: { 1: [`我...我出一张${cn}(${cv})，别生气啊🥺`, `不好意思，我打出${cn}(${cv})了...😣`, `轻轻地放下${cn}(${cv})... 你不会怪我吧？`], 3: [`AI打出了 ${em}${cn}(${cv})`], 5: [`啪！${cn}(${cv})拍你脸上！接好了废物👎`, `吃老子一张${cn}(${cv})！跪下叫爸爸🤡`, `${cn}(${cv})直接甩出来，怕不怕？🐶`] },
    princess_self_die: { 1: ["啊！我不小心出了公主...我活该！你赢了！😭🎉"], 3: ["AI打出了公主，AI出局！"], 5: ["...卧槽手滑了💀 纯属意外！🤡", "公主？？烂游戏！！💩"] },
    countess_effect: { 1: ["伯爵夫人没什么用啦~其实...我手里可能有好牌哦🤫", "出了伯爵夫人~我没什么厉害的牌的（大概）😇"], 3: ["伯爵夫人没有特殊效果。"], 5: ["哟，看到我出伯爵夫人是不是慌了？猜猜我留了什么？🤡", "你猜我是被迫的还是故意耍你的？🐶"] },
    countess_sub: { 1: ["（悄悄暗示：我手里可能有王子或国王哦~🤫）"], 3: ["🤔 AI为什么要主动打出她...?"], 5: ["怎么，开始方了？脑子够用吗？🐷"] },
    handmaid_effect: { 1: ["对不起，我开个保护...不是针对你啊！🥺", "我用侍女保护一下自己...你别打我🙏"], 3: ["🛡️ AI获得了保护！"], 5: ["防护罩开了，你打不到爷🛡️ 气不气？🤡", "保护开了，有种你来打我啊？💩"] },
    handmaid_sub: { 1: ["（安心~到我下回合之前你的技能都不能选我💪）"], 3: ["直到AI的下一回合，你无法指定AI为目标"], 5: ["干瞪眼去吧你🐶"] },
    blocked: { 1: ["你的侍女保护生效了！太好了，我打不到你！🎉", "还好你有保护~好险好险😮‍💨"], 3: ["效果被侍女挡住了！"], 5: ["切，缩头乌龟又躲了🐢 有种别用侍女啊！", "侍女？就知道当缩头乌龟！废物💩"] },
    blocked_sub: { 1: ["你的保护太强了！真替你高兴~😊"], 3: ["你的保护让AI的行动落空"], 5: ["躲得了初一躲得过十五？🤡"] },
    guard_guess: { 1: [`我猜你是...${gn}(${gv})？千万别是啊🥺`, `${gn}(${gv})？我瞎猜的😰`], 3: [`AI猜测你持有 ${ge}${gn}(${gv})`], 5: [`你手里是${gn}(${gv})对吧？藏都藏不住🤡`, `${gn}(${gv})无疑了，等死吧👎`] },
    guard_hit: { 1: ["啊！猜中了！！对不起！！我真不是故意的😭😭", "不！怎么猜中了！对不起宝子😢"], 3: ["🎯 AI猜中了！你出局！"], 5: ["🎯 哈哈哈！一眼看穿🤡👎", "BOOM！一发命中！给爷爬吧废物💩"] },
    guard_hit_intel: { 1: ["用牧师情报把你淘汰了...好自责🥺"], 3: ["🎯 AI猜中了！你出局！（AI利用了情报！）"], 5: ["🎯 情报狙杀！降维打击懂吗蠢货？🧠🤡"] },
    guard_miss: { 1: ["太好了！猜错了！你还活着！🥺🎉", "没猜中！谢天谢地！💪"], 3: ["AI没猜中。"], 5: ["切，苟了一条命🐶 下次没这么走运", "算你命大🤡"] },
    priest_peek: { 1: ["我看了你的牌...我假装没看到~🙈", "看到你的牌了...我发誓不会用卫兵狙你的（大概）🤐"], 3: ["AI查看了你的手牌。（AI现在知道你持有什么牌了！）"], 5: ["嚯~就这牌？垃圾🤮 我全记住了", "哈哈你的底裤被我看光了🐶💀"] },
    priest_title: { 1: ["📿 不好意思，AI偷看了你的手牌..."], 3: ["📿 AI使用牧师查看了你的手牌"], 5: ["📿 AI翻了你的底牌🐷"] },
    priest_warn: { 1: ["我大概率不会利用情报的...吧？😇"], 3: ["小心：AI下次可能会用卫兵精准猜中你"], 5: ["你的牌已经被看穿了，建议投降🤡"] },
    baron_cmp: { 1: [`⚖️ 要比大小了...你 ${pc} vs 我 ${ac}`], 3: [`⚖️ 男爵比较：你 ${pc} vs AI ${ac}`], 5: [`⚖️ 来啊比啊！你 ${pc} vs 爷 ${ac}🤡`] },
    baron_win: { 1: ["对不起！你的牌比我小...你被淘汰了😭😭", "我赢了比大小...但我一点都不开心！对不起宝子💔"], 3: ["你的牌更小，你出局！"], 5: ["垃圾！被碾压爽不爽？💩", "就这点数？找个电子厂上班吧🤡👎"] },
    baron_lose: { 1: ["我的牌比你小！我出局了！太好了🎉"], 3: ["AI的牌更小，AI出局！"], 5: ["...草！算你走运！💀", "靠！别得意🤡"] },
    baron_tie: { 1: ["平局！大家都没事~✌️"], 3: ["平局，无事发生。"], 5: ["切，平了🐢"] },
    baron_title: { 1: ["🎖️ 不好意思...AI发起了男爵比较"], 3: ["🎖️ AI发起了男爵比较"], 5: ["🎖️ 来啊比啊！看看谁是废物！"] },
    baron_ui_w: { 1: ["对不起...你输了😭"], 3: ["AI赢了！你出局！"], 5: ["碾碎！给爷爬💩"] },
    baron_ui_l: { 1: ["你赢了！恭喜！🎉"], 3: ["你赢了！AI出局！"], 5: ["...算你走运🐶"] },
    baron_ui_t: { 1: ["平局~都安全！"], 3: ["平局！无事发生"], 5: ["切，平了🐢"] },
    prince_player: { 1: ["对不起...我得对你用王子了😣🙏"], 3: ["AI对你使用了王子！"], 5: ["吃我王子！把你的破牌扔了吧🤡"] },
    prince_self: { 1: ["我对自己用王子~不影响你哈😊"], 3: ["AI对自己使用了王子！"], 5: ["老子换张牌，你管得着吗？🐶"] },
    prince_self_prot: { 1: ["你有保护~所以我只能对自己用了😊"], 3: ["你受到保护，AI对自己使用王子。"], 5: ["切，缩头乌龟有保护，只能自己换了💩🐢"] },
    prince_disc: { 1: [`你弃掉了${dn}...希望新牌更好！💪🥺`], 3: [`你被迫弃掉了 ${de}${dn}`], 5: [`哈哈你的${dn}没了！🤡`] },
    prince_ui_p: { 1: ["👑 抱歉...AI对你使用了王子"], 3: ["👑 AI对你使用了王子！"], 5: ["👑 吃我王子！🤡"] },
    prince_ui_s: { 1: ["👑 AI对自己使用了王子~"], 3: ["👑 AI对自己使用了王子"], 5: ["👑 爷自己换牌，关你屁事"] },
    prince_p_die: { 1: ["天哪你弃掉了公主！对不起😭😭"], 3: ["💀 你弃掉了公主，出局！"], 5: ["🤡🤡🤡 公主没了！蠢得离谱💩"] },
    prince_s_die: { 1: ["我弃掉了公主！太好啦你赢了！🎉😊"], 3: ["💀 AI弃掉了公主，出局！"], 5: ["...TMD弃到公主了？？💀💀"] },
    king_swap: { 1: ["国王交换~希望你用得上💪🥺"], 3: ["🔄 AI与你交换了手牌！"], 5: ["拿来吧你！🤡🤡", "交换！哈哈又吃亏了吧💩"] },
    king_block: { 1: ["你有保护~国王换不了~太好了😊"], 3: ["你受到保护，国王效果无法生效。"], 5: ["切，又被侍女挡了！🐢💩"] },
    king_title: { 1: ["🤴 国王交换~AI把牌给你了！"], 3: ["🤴 AI使用国王与你交换了手牌！"], 5: ["🤴 抢劫！好牌归爷了🤡"] },
    ai_win_r: { 1: [`我赢了...(${tk}/${tt}) 下一局你一定能赢！🥺💪`], 3: [`😈 AI赢得了这一局！(${tk}/${tt})`], 5: [`哈哈拿下！(${tk}/${tt}) 菜就多练🤡👎`, `(${tk}/${tt}) 碾碎！建议玩扫雷🤡`] },
    ai_win_g: { 1: ["我赢了整场...但你打得真的很好！🥺🌸💪"], 3: ["💀 AI赢得了整场游戏..."], 5: ["🏆 太TM菜了！建议卸载🤡👎💩", "🏆 全程碾压！你的操作我看吐了🤮"] },
    p_win_r: { 1: [`🎉 你赢了！(${tk}/${tt}) 我就知道你能行！🥰`], 3: [`🎉 你赢得了这一局！(${tk}/${tt})`], 5: [`切，运气好(${tk}/${tt}) 别得意🐶`, `瞎猫碰上死耗子(${tk}/${tt})🤡`] },
    p_win_g: { 1: ["🏆 你赢了！！太厉害了！！🎉🎊🥳🌸✨"], 3: ["🏆 恭喜你赢得了整场游戏！"], 5: ["🏆 ...算你走运。下次碾碎你🤡"] },
    tie: { 1: ["平局！大家都很厉害~✌️😊"], 3: ["平局！无人获得图钉。"], 5: ["平局？你连赢都赢不了🐢"] },
    ai_label: { 1: ["🥺 AI"], 3: ["😈 AI"], 5: ["🤡 AI"] },
    ai_idle: { 1: ["AI正在小心翼翼地行动..."], 3: ["😈 AI的回合..."], 5: ["💀 爷的回合，给爷安静点"] },
    ai_banner: { 1: ["🥺 AI的行动结果"], 3: ["😈 AI的行动结果"], 5: ["🤡 接招吧废物"] },
    go_ai: { 1: ["游戏结束~ 你已经很棒了！🌸"], 3: ["💀 AI获胜..."], 5: ["🏆 碾碎！弱智退场💩"] },
    go_p: { 1: ["🏆 你赢了！好棒！🎉"], 3: ["🏆 你赢了！"], 5: ["🏆 ...哼，算你走运🤡"] },
    g_ui_title: { 1: ["⚔️ AI忐忑不安地猜测你的手牌..."], 3: ["⚔️ AI使用卫兵猜测你的手牌"], 5: ["⚔️ 来猜你的底牌🤡"] },
    g_ui_hit: { 1: ["猜中了...对不起😭"], 3: ["🎯 猜中了！你出局！"], 5: ["🎯 爬吧废物💩"] },
    g_ui_miss: { 1: ["没猜中！太好了！🎉"], 3: ["❌ 没猜中，你安全了"], 5: ["❌ 切，下次弄死你🐶"] },
  };
  const e = D[key]; if (!e) return key;
  return pick(e[pers] || e[3] || [key]);
}

// ═══ Constants ═══
const WIN = 7;
const TM = { trans: 1600, draw: 2000, think: 1600, resolve: 2400, effect: 4000, death: 3000, forced: 800 };

// ═══ Component ═══
export default function LoveLetterGame() {
  const [phase, setPhase] = useState("menu");
  const [round, setRound] = useState(null);
  const [pTok, setPTok] = useState(0);
  const [aTok, setATok] = useState(0);
  const [log, setLog] = useState([]);
  const [selCard, setSelCard] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [rNum, setRNum] = useState(0);
  const [first, setFirst] = useState("player");
  const [aiAct, setAiAct] = useState(null);
  const [pers, setPers] = useState(3);
  const [tut, setTut] = useState(false);
  const logRef = useRef(null);
  const busyRef = useRef(false); // global transition lock

  const d = useCallback((k, p) => dlg(k, p, pers), [pers]);
  const addLog = useCallback(m => setLog(prev => [...prev, m]), []);
  const sync = r => setRound({ ...r });

  useEffect(() => { logRef.current && (logRef.current.scrollTop = logRef.current.scrollHeight); }, [log]);

  function startGame() { setPTok(0); setATok(0); setLog([]); setRNum(1); startRound(1, "player"); }

  function startRound(rn, f) {
    busyRef.current = false;
    const r = initRound(); sync(r); setSelCard(null); setReveal(null); setAiAct(null);
    const s = f || (Math.random() < 0.5 ? "player" : "ai"); setFirst(s);
    addLog(`── 第${rn}局开始 ──`); addLog(`移除的明牌：${r.faceUp.map(cStr).join("、")}`); addLog(`${s === "player" ? "你" : "AI"}先手`);
    if (s === "player") setPhase("playerDraw");
    else { setPhase("aiTurn"); setAiAct({ step: "draw", text: d("ai_drawing") }); setTimeout(() => aiDraw(r), TM.draw); }
  }

  function checkEnd(r) {
    if (!r.playerAlive) return "ai"; if (!r.aiAlive) return "player";
    if (r.deck.length === 0) { const [p, a] = [r.playerHand[0], r.aiHand[0]]; if (p !== a) return p > a ? "player" : "ai"; const ps = r.playerPlayed.reduce((x, y) => x + y, 0), as = r.aiPlayed.reduce((x, y) => x + y, 0); return ps > as ? "player" : ps < as ? "ai" : "tie"; }
    return null;
  }

  function handleEnd(w, r) {
    if (w === "player") { const t = pTok + 1; setPTok(t); addLog(d("p_win_r", { tokens: t, total: WIN })); if (t >= WIN) { addLog(d("p_win_g")); setPhase("gameOver"); return; } }
    else if (w === "ai") { const t = aTok + 1; setATok(t); addLog(d("ai_win_r", { tokens: t, total: WIN })); if (t >= WIN) { addLog(d("ai_win_g")); setPhase("gameOver"); return; } }
    else addLog(d("tie"));
    if (r.deck.length === 0 && r.playerAlive && r.aiAlive) addLog(`最终手牌：你 ${cStr(r.playerHand[0])} vs AI ${cStr(r.aiHand[0])}`);
    setPhase("roundOver");
  }

  function nextTurn(r, from) {
    const w = checkEnd(r); if (w) { handleEnd(w, r); return; }
    if (r.deck.length === 0) { handleEnd(checkEnd(r) || "tie", r); return; }
    if (from === "player") { busyRef.current = true; setTimeout(() => { setPhase("aiTurn"); setAiAct({ step: "draw", text: d("ai_drawing") }); aiDraw(r); }, TM.trans); }
    else { setAiAct(null); setPhase("playerDraw"); }
  }

  // ── Player ──
  function playerDraw() {
    if (!round || round.deck.length === 0 || busyRef.current) return;
    const [nd, card] = draw(round);
    const r = { ...round, deck: nd, playerHand: [...round.playerHand, card], playerProtected: false }; setRound(r);
    addLog(`── 🧑 你的回合 ──`);
    addLog(`你抽了一张牌（牌堆剩${nd.length}张）`);
    if (r.playerHand.includes(7) && (r.playerHand.includes(5) || r.playerHand.includes(6))) { addLog("⚠️ 你持有伯爵夫人和国王/王子，必须打出伯爵夫人！"); setTimeout(() => playCard(7, r), TM.forced); return; }
    setPhase("playerPlay");
  }

  function playCard(cv, cur) {
    const r = { ...(cur || round) }; const idx = r.playerHand.indexOf(cv); if (idx === -1) return;
    r.playerHand = [...r.playerHand]; r.playerHand.splice(idx, 1); r.playerPlayed = [...r.playerPlayed, cv];
    addLog(`你打出了 ${cStr(cv)}`);
    if (r.aiKnowsPlayerCard === cv) r.aiKnowsPlayerCard = null;
    r.playerPlayedCountessRecently = cv === 7;
    const done = () => { sync(r); setSelCard(null); };
    if (cv === 8) { addLog("💀 你打出了公主，直接出局！"); r.playerAlive = false; sync(r); handleEnd("ai", r); return; }
    if (cv === 7) { addLog("伯爵夫人没有特殊效果。"); done(); nextTurn(r, "player"); return; }
    if (cv === 4) { r.playerProtected = true; addLog("🛡️ 你获得了保护！"); done(); nextTurn(r, "player"); return; }
    if (r.aiProtected && cv !== 5) { addLog("AI受到侍女保护，效果无法生效。"); done(); nextTurn(r, "player"); return; }
    if (cv === 5) { sync(r); setSelCard(5); if (r.aiProtected) { addLog("AI受到保护，只能对自己使用王子。"); doPrince(r, "player"); return; } setPhase("princeChoice"); return; }
    if (cv === 1) { sync(r); setSelCard(1); setPhase("guardGuess"); return; }
    if (cv === 2) { const ac = r.aiHand[0], ad = C(ac); addLog(`🔍 你看到了AI的手牌：${ad.emoji}${ad.name}(${ac})`); setReveal({ type: "priest", card: ac }); done(); setPhase("showResult"); return; }
    if (cv === 3) { const [pc, ac] = [r.playerHand[0], r.aiHand[0]]; addLog(`⚖️ 比较手牌：你 ${cStr(pc)} vs AI ${cStr(ac)}`); if (pc > ac) { addLog("AI出局！"); r.aiAlive = false; } else if (pc < ac) { addLog("你出局！"); r.playerAlive = false; } else addLog("平局。"); setReveal({ type: "baron", playerCard: pc, aiCard: ac }); done(); const w = checkEnd(r); if (w) { handleEnd(w, r); return; } setPhase("showResult"); return; }
    if (cv === 6) { const t = r.playerHand; r.playerHand = [...r.aiHand]; r.aiHand = [...t]; r.aiKnowsPlayerCard = r.playerHand[0]; addLog(`🔄 你与AI交换，你现在持有 ${cStr(r.playerHand[0])}`); setReveal({ type: "king", got: r.playerHand[0] }); done(); setPhase("showResult"); return; }
  }

  function doGuard(guess) {
    const r = { ...round }; addLog(`你猜测AI持有 ${cStr(guess)}`);
    if (r.aiHand[0] === guess) { addLog("🎯 猜中了！AI出局！"); r.aiAlive = false; sync(r); setReveal({ type: "guard", correct: true }); handleEnd("player", r); }
    else { addLog("❌ 没猜中。"); sync(r); setReveal({ type: "guard", correct: false }); setPhase("showResult"); }
  }

  function doPrince(cur, target) {
    const r = { ...cur }, self = target === "player";
    const disc = self ? r.playerHand[0] : r.aiHand[0], dd = C(disc);
    if (self) r.playerPlayed = [...r.playerPlayed, disc]; else r.aiPlayed = [...r.aiPlayed, disc];
    addLog(`${self ? "你" : "AI"}弃掉了 ${dd.emoji}${dd.name}(${disc})`);
    if (disc === 8) { addLog(self ? "💀 你弃掉了公主，出局！" : "AI弃掉了公主，出局！"); if (self) { r.playerHand = []; r.playerAlive = false; } else { r.aiHand = []; r.aiAlive = false; } sync(r); handleEnd(self ? "ai" : "player", r); return; }
    const [nd, nc] = draw(r); r.deck = nd;
    if (self) { r.playerHand = [nc]; r.aiKnowsPlayerCard = null; } else r.aiHand = [nc];
    sync(r); setSelCard(null); const w = checkEnd(r); if (w) { handleEnd(w, r); return; } nextTurn(r, "player");
  }

  // ── AI Steps ──
  function aiDraw(cur) {
    busyRef.current = true;
    const r = { ...cur }; if (r.deck.length === 0) { busyRef.current = false; handleEnd(checkEnd(r) || "tie", r); return; }
    const [nd, card] = draw(r); r.deck = nd; r.aiHand = [...r.aiHand, card]; r.aiProtected = false;
    sync(r); addLog(`── 😈 AI的回合 ──`); addLog(`AI抽了一张牌（牌堆剩${nd.length}张）`);
    setTimeout(() => { setAiAct({ step: "think", text: d("ai_thinking") }); setTimeout(() => aiPlay(r), TM.draw); }, TM.think);
  }

  function aiPlay(r) {
    const { play: pv } = aiDecide(r), i = r.aiHand.indexOf(pv); r.aiHand = [...r.aiHand]; r.aiHand.splice(i, 1); r.aiPlayed = [...r.aiPlayed, pv];
    const def = C(pv), txt = d("ai_play_card", { cardName: def.name, cardVal: pv, emoji: def.emoji });
    setAiAct({ step: "play", card: pv, text: txt }); addLog(txt); sync(r);
    setTimeout(() => aiResolve(r, pv), TM.resolve);
  }

  function aiResult(r, info) { busyRef.current = false; sync(r); setReveal(info); setAiAct(null); setPhase("showResult"); }
  function aiAuto(r, card, text, sub) {
    setAiAct({ step: "effect", card, text, subtext: sub }); sync(r);
    // Auto-proceed cards (Handmaid/Countess/blocked) never end the round,
    // so skip checkEnd and directly hand turn to player — avoids stale closure issues
    setTimeout(() => { busyRef.current = false; setAiAct(null); setPhase("playerDraw"); }, TM.effect);
  }

  function aiResolve(r, pv) {
    if (pv === 8) { const t = d("princess_self_die"); addLog(t); r.aiAlive = false; setAiAct({ step: "effect", card: 8, text: t }); sync(r); setTimeout(() => { busyRef.current = false; handleEnd("player", r); }, TM.death); return; }
    if (pv === 7) { const t = d("countess_effect"), s = d("countess_sub"); addLog(t); aiAuto(r, 7, t, s); return; }
    if (pv === 4) { r.aiProtected = true; const t = d("handmaid_effect"), s = d("handmaid_sub"); addLog(t); aiAuto(r, 4, t, s); return; }
    if (r.playerProtected && pv !== 5) { const t = d("blocked"), s = d("blocked_sub"); addLog(t); aiAuto(r, pv, t, s); return; }
    if (pv === 1) {
      const g = aiGuessCard(r), gd = C(g), intel = r.aiKnowsPlayerCard === g, hit = r.playerHand[0] === g;
      addLog(d("guard_guess", { guessName: gd.name, guessVal: g, guessEmoji: gd.emoji }));
      if (hit) { addLog(intel ? d("guard_hit_intel") : d("guard_hit")); r.playerAlive = false; } else { addLog(d("guard_miss")); r.aiKnowsPlayerCard = null; }
      aiResult(r, { type: "aiGuard", correct: hit, guess: g, usedIntel: intel }); return;
    }
    if (pv === 2) { r.aiKnowsPlayerCard = r.playerHand[0]; addLog(d("priest_peek")); aiResult(r, { type: "aiPriest" }); return; }
    if (pv === 3) {
      const [ac, pc] = [r.aiHand[0], r.playerHand[0]], pd = C(pc), ad = C(ac);
      addLog(d("baron_cmp", { pCard: `${pd.emoji}(${pc})`, aCard: `${ad.emoji}(${ac})` }));
      if (ac > pc) { addLog(d("baron_win")); r.playerAlive = false; } else if (ac < pc) { addLog(d("baron_lose")); r.aiAlive = false; } else addLog(d("baron_tie"));
      aiResult(r, { type: "aiBaron", playerCard: pc, aiCard: ac }); const w = checkEnd(r); if (w) handleEnd(w, r); return;
    }
    if (pv === 5) {
      const hints = infer(r); let self = r.playerProtected;
      if (!self && (r.aiKnowsPlayerCard === 8 || hints.likelyPrincess)) self = false;
      else if (!self && phase(r) === "late" && r.aiHand[0] <= 2 && r.deck.length > 0) self = true;
      else if (!r.playerProtected) self = false;
      addLog(self ? (r.playerProtected ? d("prince_self_prot") : d("prince_self")) : d("prince_player"));
      const tgt = self ? "ai" : "player", disc = tgt === "ai" ? r.aiHand[0] : r.playerHand[0], dd = C(disc);
      if (tgt === "ai") r.aiPlayed = [...r.aiPlayed, disc]; else r.playerPlayed = [...r.playerPlayed, disc];
      addLog(tgt === "player" ? d("prince_disc", { discName: `${dd.emoji}${dd.name}(${disc})`, discEmoji: dd.emoji }) : `AI弃掉了 ${dd.emoji}${dd.name}(${disc})`);
      if (disc === 8) { if (tgt === "ai") r.aiAlive = false; else r.playerAlive = false; aiResult(r, { type: tgt === "ai" ? "aiPrinceS" : "aiPrinceP", disc, died: true }); return; }
      const [nd, nc] = draw(r); r.deck = nd; if (tgt === "ai") r.aiHand = [nc]; else { r.playerHand = [nc]; r.aiKnowsPlayerCard = null; }
      aiResult(r, { type: tgt === "ai" ? "aiPrinceS" : "aiPrinceP", disc, died: false }); return;
    }
    if (pv === 6) {
      if (r.playerProtected) { const t = d("king_block"); addLog(t); aiAuto(r, 6, t); return; }
      const t = r.playerHand; r.playerHand = [...r.aiHand]; r.aiHand = [...t]; r.aiKnowsPlayerCard = r.playerHand[0];
      addLog(d("king_swap")); addLog(`你现在持有 ${cStr(r.playerHand[0])}`);
      aiResult(r, { type: "aiKing", got: r.playerHand[0] }); return;
    }
  }

  function nextRound() { const rn = rNum + 1; setRNum(rn); startRound(rn, first === "player" ? "ai" : "player"); }

  // ═══ UI ═══
  function Card({ value, faceDown, small, onClick, selected, glow, disabled }) {
    const def = value ? C(value) : null, s = small ? 0.7 : 1, w = 90 * s, h = 130 * s;
    const base = { width: w, height: h, borderRadius: 10 * s, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
    if (faceDown) return <div style={{ ...base, background: "linear-gradient(135deg,#8B1A1A,#B22222,#8B1A1A)", border: "2px solid #D4A574", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", cursor: onClick ? "pointer" : "default" }} onClick={onClick}><span style={{ fontSize: 28 * s, opacity: 0.6 }}>💌</span></div>;
    if (!def) return null;
    return <div onClick={disabled ? undefined : onClick} style={{ ...base, flexDirection: "column", justifyContent: "space-between", padding: `${8*s}px ${4*s}px`, background: selected ? "linear-gradient(135deg,#FFF8DC,#FAEBD7)" : "linear-gradient(135deg,#FFFEF7,#FFF8E7)", border: `2px solid ${selected ? "#B8860B" : glow ? "#FFD700" : "#D4A574"}`, cursor: onClick && !disabled ? "pointer" : "default", boxShadow: selected ? "0 0 20px rgba(218,165,32,0.5)" : glow ? "0 0 15px rgba(255,215,0,0.4)" : "0 4px 12px rgba(0,0,0,0.15)", transition: "all 0.2s", transform: selected ? "translateY(-8px)" : "none", opacity: disabled ? 0.5 : 1, position: "relative", overflow: "hidden" }}>
      <div style={{ fontSize: 13*s, fontWeight: 700, color: "#8B4513", letterSpacing: 1 }}>{def.v}</div>
      <div style={{ fontSize: 32*s }}>{def.emoji}</div>
      <div style={{ fontSize: 11*s, fontWeight: 600, color: "#5C3317", textAlign: "center", lineHeight: 1.2 }}>{def.name}</div>
    </div>;
  }
  function BaronVs({ pc, ac }) {
    return <div style={{ display: "inline-flex", gap: 16, alignItems: "center", borderRadius: 12, padding: "14px 22px", border: "1px solid rgba(139,69,19,0.15)", background: "rgba(139,69,19,0.06)" }}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, color: "#2E5A2E", marginBottom: 4, fontWeight: 600 }}>你</div><Card value={pc} /></div>
      <span style={{ fontSize: 24 }}>⚔️</span>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, color: "#8B1A1A", marginBottom: 4, fontWeight: 600 }}>AI</div><Card value={ac} /></div>
    </div>;
  }

  const btn = { padding: "10px 24px", fontSize: 15, fontWeight: 700, color: "#FFF8DC", background: "linear-gradient(135deg,#8B4513,#A0522D)", border: "2px solid #D4A574", borderRadius: 10, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.2)", transition: "all 0.2s", fontFamily: "inherit" };
  const sBtn = { padding: "6px 12px", fontSize: 13, fontWeight: 600, color: "#5C3317", borderRadius: 8, cursor: "pointer", transition: "all 0.2s", fontFamily: "inherit" };
  const secH = { fontSize: 15, fontWeight: 700, color: "#8B1A1A", margin: "0 0 8px", padding: "6px 0", borderBottom: "1px solid rgba(139,69,19,0.12)" };

  function renderAction() {
    if (phase === "playerDraw") return <div style={{ textAlign: "center", padding: "12px 0" }}><button onClick={playerDraw} style={btn}>📥 抽牌</button></div>;
    if (phase === "playerPlay") return <div style={{ textAlign: "center", padding: "8px 0", fontSize: 14, color: "#8B7355", fontWeight: 600 }}>👆 点击一张手牌打出</div>;
    if (phase === "guardGuess") return <div style={{ textAlign: "center", padding: "10px 0" }}><div style={{ fontSize: 14, fontWeight: 600, color: "#5C3317", marginBottom: 8 }}>猜测AI的手牌（不能猜卫兵）：</div><div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>{CARDS.filter(c => c.v !== 1).map(c => <button key={c.v} onClick={() => doGuard(c.v)} style={{ ...sBtn, background: "linear-gradient(135deg,#FFFEF7,#FFF8E7)", border: "2px solid #D4A574" }}>{c.emoji} {c.name}({c.v})</button>)}</div></div>;
    if (phase === "princeChoice") return <div style={{ textAlign: "center", padding: "10px 0" }}><div style={{ fontSize: 14, fontWeight: 600, color: "#5C3317", marginBottom: 8 }}>选择王子的目标：</div><div style={{ display: "flex", gap: 10, justifyContent: "center" }}><button onClick={() => doPrince(round, "player")} style={btn}>🧑 对自己使用</button><button onClick={() => doPrince(round, "ai")} style={{ ...btn, background: "linear-gradient(135deg,#8B1A1A,#B22222)" }}>😈 对AI使用</button></div></div>;

    if (phase === "showResult") {
      const ri = reveal, isAi = ri?.type?.startsWith("ai");
      const box = (ex = {}) => ({ display: "inline-flex", flexDirection: "column", alignItems: "center", borderRadius: 12, padding: "14px 22px", border: isAi ? "1px solid rgba(139,26,26,0.2)" : "1px solid rgba(218,165,32,0.3)", background: isAi ? "rgba(139,26,26,0.06)" : "rgba(218,165,32,0.1)", ...ex });
      const tt = { fontSize: 13, fontWeight: 700, marginBottom: 6 };
      function onCont() {
        if (busyRef.current) return; // prevent double-click
        const info = reveal;
        setReveal(null);
        // Deaths → end round
        if (info?.type === "aiGuard" && info.correct) { handleEnd("ai", round); return; }
        if (info?.type === "aiPrinceP" && info.died) { handleEnd("ai", round); return; }
        if (info?.type === "aiPrinceS" && info.died) { handleEnd("player", round); return; }
        // Check if round naturally ended (baron kill, deck empty, etc)
        const w = checkEnd(round);
        if (w) { handleEnd(w, round); return; }
        if (round.deck.length === 0) { handleEnd("tie", round); return; }
        // Transition to next player's turn directly
        if (info?.type?.startsWith("ai")) {
          setAiAct(null);
          setPhase("playerDraw");
        } else {
          busyRef.current = true; // lock until aiDraw takes over
          setTimeout(() => {
            setPhase("aiTurn");
            setAiAct({ step: "draw", text: d("ai_drawing") });
            aiDraw(round);
          }, TM.trans);
        }
      }
      return <div style={{ textAlign: "center", padding: "10px 0" }}>
        {isAi && <div style={{ fontSize: 12, color: "#8B1A1A", fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>{d("ai_banner")}</div>}
        {ri?.type === "priest" && <div style={box()}><div style={{ ...tt, color: "#8B7355" }}>🔍 你看到了AI的手牌：</div><Card value={ri.card} /></div>}
        {ri?.type === "baron" && <BaronVs pc={ri.playerCard} ac={ri.aiCard} />}
        {ri?.type === "guard" && <div style={box()}><div style={{ fontSize: 20, padding: 4 }}>{ri.correct ? "🎯 猜中了！" : "❌ 没猜中"}</div></div>}
        {ri?.type === "king" && <div style={box()}><div style={{ ...tt, color: "#8B7355" }}>🔄 交换后你获得了：</div><Card value={ri.got} /></div>}
        {ri?.type === "aiGuard" && <div style={box()}><div style={{ ...tt, color: "#8B1A1A" }}>{d("g_ui_title")}</div><div style={{ fontSize: 14, color: "#5C3317", marginBottom: 8 }}>AI猜你持有：{cStr(ri.guess)}{ri.usedIntel && <span style={{ color: "#8B1A1A" }}> 🧠</span>}</div><div style={{ fontSize: 18, fontWeight: 700, color: ri.correct ? "#8B1A1A" : "#2E5A2E" }}>{ri.correct ? d("g_ui_hit") : d("g_ui_miss")}</div></div>}
        {ri?.type === "aiBaron" && <div><div style={{ ...tt, color: "#8B1A1A", marginBottom: 10 }}>{d("baron_title")}</div><BaronVs pc={ri.playerCard} ac={ri.aiCard} /><div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: ri.playerCard > ri.aiCard ? "#2E5A2E" : ri.playerCard < ri.aiCard ? "#8B1A1A" : "#8B7355" }}>{ri.playerCard > ri.aiCard ? d("baron_ui_l") : ri.playerCard < ri.aiCard ? d("baron_ui_w") : d("baron_ui_t")}</div></div>}
        {ri?.type === "aiPriest" && <div style={box()}><div style={{ ...tt, color: "#8B1A1A" }}>{d("priest_title")}</div><div style={{ fontSize: 14, color: "#5C3317" }}>⚠️ AI现在知道你持有什么牌了！</div><div style={{ fontSize: 13, color: "#8B7355", marginTop: 4, fontStyle: "italic" }}>{d("priest_warn")}</div></div>}
        {ri?.type === "aiPrinceS" && <div style={box()}><div style={{ ...tt, color: "#8B1A1A" }}>{d("prince_ui_s")}</div><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ fontSize: 13, color: "#5C3317" }}>弃掉了：</span><Card value={ri.disc} small /></div>{ri.died ? <div style={{ fontSize: 15, fontWeight: 700, color: "#2E5A2E" }}>{d("prince_s_die")}</div> : <div style={{ fontSize: 13, color: "#8B7355" }}>AI重新抽了一张牌</div>}</div>}
        {ri?.type === "aiPrinceP" && <div style={box()}><div style={{ ...tt, color: "#8B1A1A" }}>{d("prince_ui_p")}</div><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ fontSize: 13, color: "#5C3317" }}>你被迫弃掉了：</span><Card value={ri.disc} small /></div>{ri.died ? <div style={{ fontSize: 15, fontWeight: 700, color: "#8B1A1A" }}>{d("prince_p_die")}</div> : <div style={{ fontSize: 13, color: "#2E5A2E" }}>你重新抽了一张新牌</div>}</div>}
        {ri?.type === "aiKing" && <div style={box()}><div style={{ ...tt, color: "#8B1A1A" }}>{d("king_title")}</div><div style={{ fontSize: 13, color: "#8B7355", marginBottom: 6 }}>你现在持有：</div><Card value={ri.got} /></div>}
        <div style={{ marginTop: 12 }}><button onClick={onCont} style={btn}>继续 →</button></div>
      </div>;
    }

    if (phase === "aiTurn") return <div style={{ textAlign: "center", padding: "16px 12px", background: "linear-gradient(135deg,rgba(139,26,26,0.06),rgba(139,26,26,0.12))", borderRadius: 12, margin: "6px 0", border: "1px solid rgba(139,26,26,0.15)" }}>
      {aiAct?.step === "draw" && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}><div style={{ fontSize: 28, animation: "pulse 1s infinite" }}>📥</div><div style={{ fontSize: 15, fontWeight: 600, color: "#8B1A1A" }}>{aiAct.text}</div></div>}
      {aiAct?.step === "think" && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}><div style={{ fontSize: 28, animation: "pulse 1s infinite" }}>🤔</div><div style={{ fontSize: 15, fontWeight: 600, color: "#8B1A1A" }}>{aiAct.text}</div></div>}
      {aiAct?.step === "play" && aiAct.card && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}><div style={{ fontSize: 15, fontWeight: 700, color: "#8B1A1A" }}>{aiAct.text}</div><Card value={aiAct.card} /></div>}
      {aiAct?.step === "effect" && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>{aiAct.card && <Card value={aiAct.card} small />}<div style={{ fontSize: 15, fontWeight: 700, color: "#5C3317" }}>{aiAct.text}</div>{aiAct.subtext && <div style={{ fontSize: 13, color: "#8B7355", fontStyle: "italic" }}>{aiAct.subtext}</div>}</div>}
      {!aiAct && <div style={{ fontSize: 15, fontWeight: 600, color: "#8B7355", fontStyle: "italic" }}>{d("ai_idle")}</div>}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>;
    if (phase === "roundOver") return <div style={{ textAlign: "center", padding: "12px 0" }}><button onClick={nextRound} style={btn}>下一局 →</button></div>;
    if (phase === "gameOver") return <div style={{ textAlign: "center", padding: "16px 0" }}><div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, color: pTok >= WIN ? "#2E5A2E" : "#8B1A1A" }}>{pTok >= WIN ? d("go_p") : d("go_ai")}</div><button onClick={() => { setPhase("menu"); setLog([]); }} style={btn}>重新开始</button></div>;
    return null;
  }

  // ═══ Menu ═══
  if (phase === "menu") {
    const modes = [{ val: 1, label: "⭐", name: "大善人模式", desc: "极其友善，疯狂暗示", color: "#4CAF50" }, { val: 3, label: "⭐⭐⭐", name: "默认模式", desc: "冷静客观的无情机器", color: "#8B7355" }, { val: 5, label: "⭐⭐⭐⭐⭐", name: "祖安压力怪", desc: "极度嘲讽，搞人心态", color: "#8B1A1A" }];
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#FDF5E6,#FAEBD7,#F5DEB3)", fontFamily: "'Georgia','Noto Serif SC',serif" }}>
      <div style={{ textAlign: "center", padding: "40px 28px", background: "rgba(255,255,255,0.5)", borderRadius: 20, border: "2px solid rgba(139,69,19,0.15)", boxShadow: "0 8px 32px rgba(139,69,19,0.1)", maxWidth: 400, width: "90%" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>💌</div>
        <h1 style={{ fontSize: 32, color: "#8B1A1A", margin: "0 0 8px", letterSpacing: 4, fontWeight: 700 }}>情 书</h1>
        <div style={{ fontSize: 14, color: "#8B7355", marginBottom: 6, fontStyle: "italic" }}>Love Letter</div>
        <div style={{ fontSize: 13, color: "#8B7355", margin: "16px 0 20px", lineHeight: 1.8, textAlign: "left", padding: "0 8px" }}>将你的情书送到公主手中！<br/>2人对战，先获得 <b>{WIN}</b> 个好感图钉的玩家获胜。<br/><span style={{ fontSize: 12, color: "#8B1A1A" }}>🧠 高级AI：记牌算率 · 情报利用 · 伯爵夫人诈唬 · 分阶段战术</span></div>
        <div style={{ margin: "0 0 24px", padding: "16px 12px", background: "rgba(139,69,19,0.05)", borderRadius: 14, border: "1px solid rgba(139,69,19,0.12)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#5C3317", marginBottom: 12 }}>🎭 AI 压力值</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{modes.map(m => <div key={m.val} onClick={() => setPers(m.val)} style={{ padding: "10px 14px", borderRadius: 10, cursor: "pointer", transition: "all 0.2s", textAlign: "left", border: pers === m.val ? `2px solid ${m.color}` : "2px solid rgba(139,69,19,0.1)", background: pers === m.val ? `${m.color}11` : "rgba(255,255,255,0.4)", transform: pers === m.val ? "scale(1.02)" : "scale(1)", boxShadow: pers === m.val ? `0 2px 12px ${m.color}22` : "none" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 13, minWidth: 80 }}>{m.label}</span><span style={{ fontSize: 14, fontWeight: 700, color: m.color }}>{m.name}</span></div><div style={{ fontSize: 12, color: "#8B7355", marginTop: 3, paddingLeft: 88 }}>{m.desc}</div></div>)}</div>
        </div>
        <button onClick={startGame} style={{ ...btn, fontSize: 18, padding: "14px 40px" }}>开始游戏</button>
        <div style={{ marginTop: 12 }}><button onClick={() => setTut(true)} style={{ padding: "8px 20px", fontSize: 14, fontWeight: 600, color: "#8B7355", background: "transparent", border: "1.5px solid rgba(139,69,19,0.25)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>📖 新手教程</button></div>
      </div>
      {tut && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setTut(false)}>
        <div style={{ background: "linear-gradient(160deg,#FFFDF5,#FFF8E7)", borderRadius: 16, maxWidth: 440, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: "28px 24px", position: "relative", border: "2px solid rgba(139,69,19,0.15)", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", WebkitOverflowScrolling: "touch" }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setTut(false)} style={{ position: "sticky", top: 0, float: "right", width: 32, height: 32, borderRadius: "50%", background: "rgba(139,69,19,0.08)", border: "1.5px solid rgba(139,69,19,0.2)", cursor: "pointer", fontSize: 16, color: "#8B4513", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", zIndex: 10 }}>✕</button>
          <div style={{ fontSize: 28, textAlign: "center", marginBottom: 4 }}>💌</div>
          <h2 style={{ fontSize: 22, color: "#8B1A1A", textAlign: "center", margin: "0 0 4px", fontWeight: 700, letterSpacing: 2 }}>新手教程</h2>
          <div style={{ fontSize: 13, color: "#8B7355", textAlign: "center", marginBottom: 20, fontStyle: "italic" }}>3分钟学会《情书》</div>
          <div style={{ fontSize: 13.5, color: "#5C3317", lineHeight: 2 }}>
            <div style={secH}>🎯 游戏目标</div>
            <p style={{ margin: "0 0 16px" }}>将你的情书送到公主手中！<b>存活到最后</b>或<b>手牌点数最大</b>的玩家赢得该局，获得图钉📌。先获得 <b>7个</b>图钉获胜。</p>
            <div style={secH}>🃏 游戏配件（16张牌）</div>
            <div style={{ background: "rgba(139,69,19,0.04)", borderRadius: 10, padding: "10px 14px", margin: "0 0 16px", lineHeight: 2.2 }}>{[...CARDS].reverse().map(c => <div key={c.v}>{c.emoji} <b>{c.v}点-{c.name}</b> ×{c.n} · {c.desc}</div>)}</div>
            <div style={secH}>🎮 游戏流程</div>
            <p style={{ margin: "0 0 6px" }}>每局移除1张暗牌＋3张明牌，双方各发1张。</p>
            <p style={{ margin: "0 0 16px" }}>你的回合：<b>①抽牌</b> → <b>②打出一张并执行效果</b>。所有弃牌公开！</p>
            <div style={secH}>🏆 一局怎么结束？</div>
            <p style={{ margin: "0 0 4px" }}>① 对手被淘汰 → 你赢！</p>
            <p style={{ margin: "0 0 12px" }}>② 牌堆抽空 → 亮手牌，<b>点数大的赢</b>。</p>
            <div style={{ background: "rgba(139,69,19,0.06)", borderRadius: 10, padding: "12px 14px", textAlign: "center", border: "1px dashed rgba(139,69,19,0.2)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#8B4513", marginBottom: 4 }}>💡 核心技巧</div>
              <div style={{ fontSize: 13, color: "#8B7355", lineHeight: 1.8 }}>记住出过的牌 → 排除法猜牌<br/>牧师+卫兵 = 精准狙杀<br/>主动出伯爵夫人 = 迷惑对手<br/>拿到公主要低调！</div>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 20 }}><button onClick={() => setTut(false)} style={{ ...btn, fontSize: 16, padding: "12px 36px" }}>我学会了！</button></div>
        </div>
      </div>}
    </div>;
  }

  // ═══ Game Screen ═══
  const hand = round?.playerHand || [], cf = hand.includes(7) && (hand.includes(5) || hand.includes(6)), canP = phase === "playerPlay";
  return <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#FDF5E6,#FAEBD7,#F5DEB3)", fontFamily: "'Georgia','Noto Serif SC',serif", padding: 12, maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "rgba(139,69,19,0.08)", borderRadius: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 14, fontWeight: 600, color: "#5C3317" }}>你</span><span style={{ fontSize: 16 }}>{"📌".repeat(pTok)}{"○".repeat(WIN - pTok)}</span></div>
      <div style={{ fontSize: 13, color: "#8B7355", fontWeight: 600 }}>第{rNum}局 · 牌堆{round?.deck.length || 0}张</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 16 }}>{"○".repeat(WIN - aTok)}{"📌".repeat(aTok)}</span><span style={{ fontSize: 14, fontWeight: 600, color: "#8B1A1A" }}>AI</span></div>
    </div>
    {round && <div style={{ textAlign: "center", padding: "10px 0", borderBottom: "1px solid rgba(139,69,19,0.12)" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#8B1A1A", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{d("ai_label")} {round.aiProtected && "🛡️"} {!round.aiAlive && "💀"}</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>{round.aiAlive && <Card faceDown small />}{round.aiPlayed.map((v, i) => <div key={i} style={{ opacity: 0.5 }}><Card value={v} small /></div>)}</div>
    </div>}
    {round && <div style={{ textAlign: "center", margin: "8px 0" }}><div style={{ fontSize: 12, color: "#8B7355", marginBottom: 4, fontWeight: 600 }}>移除的明牌</div><div style={{ display: "flex", gap: 6, justifyContent: "center" }}>{round.faceUp.map((v, i) => <Card key={i} value={v} small />)}</div></div>}
    {renderAction()}
    {round && <div style={{ textAlign: "center", padding: "10px 0", borderTop: "1px solid rgba(139,69,19,0.12)" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#2E5A2E", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>🧑 你 {round.playerProtected && "🛡️"} {!round.playerAlive && "💀"}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "flex-end", flexWrap: "wrap" }}>
        {round.playerPlayed.map((v, i) => <div key={`p${i}`} style={{ opacity: 0.5 }}><Card value={v} small /></div>)}
        {round.playerHand.map((v, i) => <Card key={`h${i}`} value={v} onClick={canP ? () => { if (!cf || v === 7) playCard(v, round); } : undefined} selected={canP && selCard === v} glow={canP && (!cf || v === 7)} disabled={canP && cf && v !== 7} />)}
      </div>
    </div>}
    <div style={{ marginTop: 10 }}><div ref={logRef} style={{ maxHeight: 220, overflowY: "auto", padding: "10px 14px", background: "rgba(139,69,19,0.06)", borderRadius: 10, border: "1px solid rgba(139,69,19,0.15)", fontSize: 13, lineHeight: 1.6, color: "#5C3317" }}>{log.map((l, i) => {
      const isTurn = l.startsWith("── 🧑") || l.startsWith("── 😈");
      const isSection = l.startsWith("──");
      return <div key={i} style={{ opacity: i >= log.length - 6 ? 1 : 0.5, fontWeight: isSection ? 700 : 400, borderBottom: isSection ? "1px solid rgba(139,69,19,0.15)" : "none", padding: isSection ? "4px 0" : "1px 0", fontSize: isTurn ? 12 : 13, color: isTurn ? (l.includes("🧑") ? "#2E5A2E" : "#8B1A1A") : "#5C3317", marginTop: isTurn ? 6 : 0 }}>{l}</div>;
    })}</div></div>
    <details style={{ marginTop: 12, fontSize: 12, color: "#8B7355" }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>📖 卡牌参考</summary><div style={{ marginTop: 6, padding: "8px 10px", background: "rgba(139,69,19,0.04)", borderRadius: 8, lineHeight: 1.8 }}>{CARDS.map(c => <div key={c.v}>{c.emoji} <b>{c.name}</b>({c.v}) ×{c.n}：{c.desc}</div>)}</div></details>
  </div>;
}
