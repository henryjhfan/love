import { useState, useEffect, useCallback, useRef } from "react";

const CARD_DEFS = [
  { value: 1, name: "卫兵", nameEn: "Guard", count: 5, emoji: "⚔️", desc: "猜测对手手牌（不可猜卫兵），猜中则对手出局" },
  { value: 2, name: "牧师", nameEn: "Priest", count: 2, emoji: "📿", desc: "查看对手的手牌" },
  { value: 3, name: "男爵", nameEn: "Baron", count: 2, emoji: "🎖️", desc: "与对手比较手牌，点数小者出局" },
  { value: 4, name: "侍女", nameEn: "Handmaid", count: 2, emoji: "🛡️", desc: "获得保护直到你的下一回合" },
  { value: 5, name: "王子", nameEn: "Prince", count: 2, emoji: "👑", desc: "令一名玩家弃牌并重抽" },
  { value: 6, name: "国王", nameEn: "King", count: 1, emoji: "🤴", desc: "与对手交换手牌" },
  { value: 7, name: "伯爵夫人", nameEn: "Countess", count: 1, emoji: "💃", desc: "与国王或王子同持时必须打出" },
  { value: 8, name: "公主", nameEn: "Princess", count: 1, emoji: "👸", desc: "被打出或弃掉则直接出局" },
];

function getCardDef(v) { return CARD_DEFS.find(c => c.value === v); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck() {
  const d = [];
  CARD_DEFS.forEach(c => { for (let i = 0; i < c.count; i++) d.push(c.value); });
  return shuffle(d);
}

function initRound() {
  const deck = createDeck();
  const hidden = deck.pop();
  const faceUp = [deck.pop(), deck.pop(), deck.pop()];
  const playerCard = deck.pop();
  const aiCard = deck.pop();
  return {
    deck, hidden, faceUp,
    playerHand: [playerCard], aiHand: [aiCard],
    playerPlayed: [], aiPlayed: [],
    playerProtected: false, aiProtected: false,
    playerAlive: true, aiAlive: true,
    aiKnowsPlayerCard: null,
    playerPlayedCountessRecently: false,
  };
}

// ═══════════════════════════════════════════════════
// ADVANCED AI BRAIN — Full strategic engine
// (100% UNCHANGED — DO NOT MODIFY)
// ═══════════════════════════════════════════════════

function getPlayerPossibleCards(st) {
  const all = [];
  CARD_DEFS.forEach(c => { for (let i = 0; i < c.count; i++) all.push(c.value); });
  const known = [...st.faceUp, ...st.playerPlayed, ...st.aiPlayed, ...st.aiHand];
  const pool = [...all];
  known.forEach(v => {
    const idx = pool.indexOf(v);
    if (idx !== -1) pool.splice(idx, 1);
  });
  return pool;
}

function getCardProbabilities(st) {
  const pool = getPlayerPossibleCards(st);
  const total = pool.length;
  if (total === 0) return {};
  const freq = {};
  pool.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  const probs = {};
  Object.entries(freq).forEach(([v, count]) => {
    probs[parseInt(v)] = count / total;
  });
  return probs;
}

function getGamePhase(st) {
  const remaining = st.deck.length;
  if (remaining >= 6) return "early";
  if (remaining >= 3) return "mid";
  return "late";
}

function aiGuessCard(st) {
  const probs = getCardProbabilities(st);
  if (st.aiKnowsPlayerCard && st.aiKnowsPlayerCard !== 1) {
    if (probs[st.aiKnowsPlayerCard] > 0) {
      return st.aiKnowsPlayerCard;
    }
  }
  if (st.playerPlayedCountessRecently) {
    const suspects = [5, 6, 8].filter(v => probs[v] > 0);
    if (suspects.length > 0) {
      if (probs[8] > 0) return 8;
      if (probs[6] > 0) return 6;
      if (probs[5] > 0) return 5;
    }
  }
  const candidates = Object.entries(probs).filter(([v]) => parseInt(v) !== 1);
  if (candidates.length === 0) return 2;
  const phase = getGamePhase(st);
  if (phase === "late") {
    const pool = getPlayerPossibleCards(st);
    const nonGuard = pool.filter(v => v !== 1);
    if (nonGuard.length > 0 && nonGuard.every(v => v === nonGuard[0])) {
      return nonGuard[0];
    }
    let best = null, bestScore = -1;
    for (const [v, p] of candidates) {
      const val = parseInt(v);
      const score = p * (1 + val * 0.15);
      if (score > bestScore) { bestScore = score; best = val; }
    }
    return best || 2;
  }
  let best = null, bestProb = -1;
  for (const [v, p] of candidates) {
    const val = parseInt(v);
    const bonus = (val >= 2 && val <= 4) ? 0.05 : 0;
    const score = p + bonus;
    if (score > bestProb) { bestProb = score; best = val; }
  }
  if (Math.random() < 0.1) {
    const validGuesses = candidates.map(([v]) => parseInt(v));
    return validGuesses[Math.floor(Math.random() * validGuesses.length)];
  }
  return best || 2;
}

function inferFromPlayerPlays(st) {
  const hints = { likelyHigh: false, likelyPrincess: false, suspectCards: [] };
  const lastPlay = st.playerPlayed.length > 0 ? st.playerPlayed[st.playerPlayed.length - 1] : null;
  if (lastPlay === 7) {
    hints.likelyHigh = true;
    const probs = getCardProbabilities(st);
    if (probs[5] > 0 || probs[6] > 0) hints.suspectCards.push(5, 6);
    if (probs[8] > 0) { hints.likelyPrincess = true; hints.suspectCards.push(8); }
  }
  if (lastPlay === 4) { hints.likelyHigh = true; }
  if (lastPlay === 3 && st.playerAlive && st.aiAlive) { hints.likelyHigh = true; }
  return hints;
}

function aiDecide(st) {
  const hand = [...st.aiHand];
  const [a, b] = hand;
  const phase = getGamePhase(st);
  const opponentProtected = st.playerProtected;
  const probs = getCardProbabilities(st);
  const hints = inferFromPlayerPlays(st);
  const playCard = (val) => {
    if (a === val) return { play: a, keep: b };
    if (b === val) return { play: b, keep: a };
    return null;
  };
  const has = (v) => a === v || b === v;
  const other = (v) => a === v ? b : a;
  if (a === 7 && (b === 5 || b === 6)) return { play: 7, keep: b };
  if (b === 7 && (a === 5 || a === 6)) return { play: 7, keep: a };
  if (a === 8) return { play: b, keep: a };
  if (b === 8) return { play: a, keep: b };
  if (has(7)) {
    const companion = other(7);
    if (companion <= 4) {
      const bluffChance = phase === "early" ? 0.45 : phase === "mid" ? 0.3 : 0.15;
      if (Math.random() < bluffChance) { return playCard(7); }
    }
    if (companion <= 2 && phase === "late") { return playCard(7); }
  }
  if (st.aiKnowsPlayerCard && !opponentProtected) {
    const knownCard = st.aiKnowsPlayerCard;
    if (has(1) && knownCard !== 1) { return playCard(1); }
    if (has(3)) { const keepCard = other(3); if (keepCard > knownCard) return playCard(3); }
    if (has(6)) { const keepCard = other(6); if (knownCard > keepCard && knownCard !== 8) return playCard(6); }
    if (has(5) && knownCard === 8) { return playCard(5); }
  }
  if (phase === "early") {
    if (has(4) && Math.max(a, b) >= 6) return playCard(4);
    if (has(2) && !opponentProtected) return playCard(2);
    if (has(1) && !opponentProtected) return playCard(1);
    if (has(4)) return playCard(4);
    return a <= b ? { play: a, keep: b } : { play: b, keep: a };
  }
  if (phase === "mid") {
    if (has(4) && (has(8) || Math.max(a, b) >= 7)) return playCard(4);
    if (has(3) && !opponentProtected) {
      const keepCard = other(3);
      if (keepCard >= 5) return playCard(3);
      if (keepCard >= 4 && Math.random() < 0.5) return playCard(3);
    }
    if (has(1) && !opponentProtected) return playCard(1);
    if (has(5) && !opponentProtected && hints.likelyPrincess) { return playCard(5); }
    if (has(6) && !opponentProtected) { const keepCard = other(6); if (keepCard <= 2 && hints.likelyHigh) return playCard(6); }
    if (has(2) && !opponentProtected) return playCard(2);
    if (has(4)) return playCard(4);
    return a <= b ? { play: a, keep: b } : { play: b, keep: a };
  }
  if (has(4) && Math.max(a, b) >= 5) return playCard(4);
  if (has(3) && !opponentProtected) {
    const keepCard = other(3);
    if (keepCard >= 6) return playCard(3);
    if (keepCard >= 5) { if (Math.random() < 0.7) return playCard(3); }
  }
  if (has(1) && !opponentProtected) {
    const possibleCards = Object.entries(probs).filter(([v, p]) => parseInt(v) !== 1 && p > 0);
    if (possibleCards.length <= 2) return playCard(1);
    return playCard(1);
  }
  if (has(5)) {
    const keepCard = other(5);
    if (!opponentProtected && hints.likelyPrincess) { return playCard(5); }
    if (keepCard <= 2) { return playCard(5); }
  }
  if (has(6) && !opponentProtected) {
    const keepCard = other(6);
    if (keepCard <= 3 && hints.likelyHigh) return playCard(6);
    if (keepCard <= 2) return playCard(6);
  }
  if (has(2)) return playCard(2);
  if (has(4)) return playCard(4);
  return a <= b ? { play: a, keep: b } : { play: b, keep: a };
}

// ═══════════════════════════════════════════════════
// AI PERSONALITY DIALOGUE SYSTEM
// ═══════════════════════════════════════════════════

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getAiDialogue(key, params = {}, personality = 3) {
  const p = personality;
  const cardName = params.cardName || "";
  const cardVal = params.cardVal || "";
  const guessName = params.guessName || "";
  const guessVal = params.guessVal || "";
  const discName = params.discName || "";
  const gotName = params.gotName || "";
  const pCard = params.pCard || "";
  const aCard = params.aCard || "";
  const tokens = params.tokens || "";
  const total = params.total || "";
  const deckLeft = params.deckLeft || "";

  const D = {
    // ── AI Turn Phases ──
    ai_drawing: {
      1: ["小的这就抽牌了，您稍等🙏", "不好意思打扰了，我抽张牌哈...", "轮到我了...紧张😰 我先抽一张", "抱歉占用您的时间，我抽个牌🥺"],
      3: ["AI正在抽牌..."],
      5: ["老子摸牌了，瞪什么瞪？👀", "闭嘴看着，爹要抽牌了💩", "你就干等着吧，等着挨揍🤡", "爷的回合开始了，给爷跪好🐶"],
    },
    ai_thinking: {
      1: ["我想想怎么才能不伤害你...🤔", "好纠结啊，选哪张才对你好呢...", "我能不出吗？不行是吧...😢", "让我斟酌一下怎么手下留情..."],
      3: ["AI正在思考策略..."],
      5: ["让老子想想怎么弄死你🤡", "别催，爷在想怎么碾碎你💀", "搓搓手，想想怎么把你按在地上摩擦🐷", "嘿嘿嘿，好几种搞你的方法🤮"],
    },
    ai_play_card: {
      1: [`我...我出一张${cardName}(${cardVal})，别生气啊🥺`, `不好意思，我打出${cardName}(${cardVal})了...😣`, `这张${cardName}(${cardVal})，我真的不想出的😭`, `轻轻地放下${cardName}(${cardVal})... 你不会怪我吧？`],
      3: [`AI打出了 ${params.emoji || ""}${cardName}(${cardVal})`],
      5: [`啪！${cardName}(${cardVal})拍你脸上！接好了废物👎`, `吃老子一张${cardName}(${cardVal})！跪下叫爸爸🤡`, `${cardName}(${cardVal})直接甩出来，怕不怕？🐶`, `哈哈哈${cardName}(${cardVal})！看到你发抖的样子真爽💩`],
    },

    // ── Card Effects ──
    princess_self_die: {
      1: ["啊！我不小心出了公主...我活该！你赢了你赢了！😭🎉", "公主被我弄丢了...太好了，这下你安全了！🥺"],
      3: ["AI打出了公主，AI出局！"],
      5: ["...卧槽手滑了💀 你别得意，就这一次！纯属意外！🤡", "公主？？谁TM把公主塞这的？？烂游戏！！💩"],
    },
    countess_effect: {
      1: ["伯爵夫人没什么用啦，我就随便出出~其实...我手里可能有好牌哦，偷偷告诉你🤫", "出了伯爵夫人~不用担心我啦，我没什么厉害的牌的（大概）😇"],
      3: ["伯爵夫人没有特殊效果。"],
      5: ["哟，看到我出伯爵夫人是不是慌了？猜猜我留了什么？🤡", "伯爵夫人~你猜我是被迫的还是故意耍你的？哈哈哈🐶", "想知道我手里是什么？做梦吧你个废物💩"],
    },
    countess_subtext: {
      1: ["（悄悄暗示：我手里可能有王子或国王哦~帮你排除一下🤫）"],
      3: ["🤔 AI为什么要主动打出她...?"],
      5: ["怎么，开始方了？脑子够用吗？🐷"],
    },
    handmaid_effect: {
      1: ["对不起，我开个保护...但是不是针对你啊！🥺", "我用侍女保护一下自己...你别打我🙏", "躲一下下，马上就好，别生气呀😣"],
      3: ["🛡️ AI获得了保护！"],
      5: ["防护罩开了，你打不到爷🛡️ 气不气？🤡", "哈哈缩起来了！你能奈我何？废物🐢", "保护开了，有种你来打我啊？哦不好意思你打不到💩"],
    },
    handmaid_subtext: {
      1: ["（安心~到我下回合之前你的技能都不能选我，趁机想想策略吧💪）"],
      3: ["直到AI的下一回合，你无法指定AI为目标"],
      5: ["干瞪眼去吧你🐶"],
    },
    blocked_by_handmaid: {
      1: ["你的侍女保护生效了！太好了，我打不到你！我好开心！🎉", "还好你有保护~不然我就要伤害你了，好险好险😮‍💨"],
      3: ["效果被侍女挡住了！"],
      5: ["切，缩头乌龟又躲了🐢 有种别用侍女啊！", "行行行，你的保护救了你这条狗命，下次没这么走运🐶", "侍女？就知道当缩头乌龟！废物就是废物💩"],
    },
    blocked_subtext: {
      1: ["你的保护太强了！我的行动落空了，真替你高兴~😊"],
      3: ["你的保护让AI的行动落空"],
      5: ["躲得了初一躲得过十五？🤡"],
    },

    // ── Guard ──
    guard_guess: {
      1: [`我猜你是...${guessName}(${guessVal})？千万别是啊，我不想你出局🥺`, `嗯...${guessName}(${guessVal})？我瞎猜的，肯定不对的对吧😰`, `不好意思我猜一下${guessName}(${guessVal})...但我真的希望猜错！🙏`],
      3: [`AI猜测你持有 ${params.guessEmoji || ""}${guessName}(${guessVal})`],
      5: [`你手里的破牌是${guessName}(${guessVal})对吧？藏都藏不住🤡`, `就你那点智商，${guessName}(${guessVal})无疑了，等死吧👎`, `哼哼，${guessName}(${guessVal})！老子闻到你手牌的味道了🐶`],
    },
    guard_correct: {
      1: [`啊！猜中了！！对不起对不起对不起！！我真不是故意的😭😭😭`, `天哪我居然猜中了...好内疚...你下一把一定能赢的！🥺💔`, `不！怎么猜中了啊！我本来想猜错的！对不起宝子😢`],
      3: [`🎯 AI猜中了！你出局！`],
      5: [`🎯 哈哈哈哈哈！猜中了！你的牌就跟你的脑子一样，一眼看穿🤡👎`, `BOOM！一发命中！就这？就这？！给爷爬吧废物💩💩`, `读你跟读幼儿园课本一样简单，淘汰！下一个🐶🤮`],
    },
    guard_correct_intel: {
      1: [`啊不...我之前看过你的牌，所以...猜中了...真的好对不起啊😭 我不该偷看的！`, `用牧师看到的情报把你淘汰了...我是不是很坏？好自责🥺`],
      3: [`🎯 AI猜中了！你出局！（AI利用了之前获取的情报！）`],
      5: [`🎯 情报狙杀！之前偷看的牌现在派上用场了！这叫降维打击，懂吗蠢货？🧠🤡`, `🎯 哈哈哈上次看你牌的时候就注定了这个结局！你以为我会忘？太天真了废物💩🧠`],
    },
    guard_wrong: {
      1: ["太好了！！我猜错了！！你还活着！真是太好了🥺🎉", "还好还好，猜错了~你安全了！我松了一口气😮‍💨", "没猜中！谢天谢地！你继续加油！我支持你💪🥺"],
      3: ["AI没猜中。"],
      5: ["切，这次让你苟了一条命🐶 下次没这么走运", "哼，猜错了又怎样？你也只是多活一回合而已💀", "行吧，算你命大。不过你那破牌也翻不了天🤡"],
    },

    // ── Priest ──
    priest_peek: {
      1: ["我看了一眼你的牌...哇好牌好牌！我假装没看到~🙈", "偷看了你的手牌...是不是很过分？我保证绝对绝对不会利用的！🤞🥺", "看到你的牌了...好内疚...我发誓不会用卫兵狙你的（大概）🤐"],
      3: ["AI查看了你的手牌。（AI现在知道你持有什么牌了！）"],
      5: ["嚯~就这牌？垃圾中的垃圾🤮 我已经全记住了", "看完了，笑死我了🤡 就这破牌你还想赢？", "哈哈哈哈你的底裤都被我看光了，下回合准备受死吧🐶💀"],
    },
    priest_ui_title: {
      1: ["📿 不好意思，AI偷看了你的手牌..."],
      3: ["📿 AI使用牧师查看了你的手牌"],
      5: ["📿 AI翻了你的底牌，笑出猪叫🐷"],
    },
    priest_ui_warning: {
      1: ["不用担心~我大概率不会利用这个情报的...吧？😇"],
      3: ["小心：AI下次可能会用卫兵精准猜中你"],
      5: ["你的牌已经被看穿了，建议直接投降🤡"],
    },

    // ── Baron ──
    baron_compare: {
      1: [`⚖️ 要比大小了...好紧张...你 ${pCard} vs 我 ${aCard}`, `⚖️ 来比牌了...我好害怕...${pCard} vs ${aCard}`],
      3: [`⚖️ 男爵比较：你 ${pCard} vs AI ${aCard}`],
      5: [`⚖️ 来啊比啊！你 ${pCard} vs 爷 ${aCard} ！看看谁是垃圾🤡`, `⚖️ 掀牌了！${pCard} vs ${aCard}，看看谁该滚蛋💩`],
    },
    baron_ai_win: {
      1: ["对不起对不起！！你的牌比我小...你被淘汰了...我真的不想的😭😭", "呜呜呜你出局了...都怪我不好...你的牌太小了...再来一次好不好？🥺", "我赢了比大小...但是我一点都不开心！对不起宝子💔"],
      3: ["你的牌更小，你出局！"],
      5: ["垃圾！拿个破烂也敢来比？被碾压的滋味爽不爽？💩💩", "哈哈哈哈哈！就这点数还敢接男爵？找个电子厂上班吧🤡👎", "弱得跟个蚂蚁似的一脚就碾了，太菜了你🐶🤮"],
    },
    baron_ai_lose: {
      1: ["我的牌比你小！我出局了！太好了，你赢了这次比较🎉", "呜，我的牌太小了...该走的是我~祝你好运！😊💪"],
      3: ["AI的牌更小，AI出局！"],
      5: ["...草！怎么你比我大？？算你走运！下次碾死你💀", "靠！这次算你小子命好！别得意🤡"],
    },
    baron_tie: {
      1: ["平局！太好了，大家都没事~✌️"],
      3: ["平局，无事发生。"],
      5: ["切，居然平了。算你多苟一会儿🐢"],
    },
    baron_ui_title: {
      1: ["🎖️ 不好意思...AI被迫发起了男爵比较"],
      3: ["🎖️ AI发起了男爵比较"],
      5: ["🎖️ 来啊比啊！看看谁是废物！"],
    },
    baron_ui_result_win: {
      1: ["对不起...你输了...😭"],
      3: ["AI赢了！你出局！"],
      5: ["碾碎！给爷爬💩"],
    },
    baron_ui_result_lose: {
      1: ["你赢了！恭喜恭喜！🎉"],
      3: ["你赢了！AI出局！"],
      5: ["...算你走运🐶"],
    },
    baron_ui_result_tie: {
      1: ["平局~都安全！"],
      3: ["平局！无事发生"],
      5: ["切，平了🐢"],
    },

    // ── Prince ──
    prince_on_player: {
      1: ["对不起...我得对你用王子了...你要弃牌了...😣🙏", "不好意思王子指向你了！希望你弃掉的不是好牌！🥺"],
      3: ["AI对你使用了王子！"],
      5: ["吃我一记王子！把你的破牌扔了吧垃圾🤡", "哈哈哈王子伺候！看看你要丢掉什么好东西💩👎"],
    },
    prince_on_self: {
      1: ["我对自己用王子了~弃掉自己的牌换一张，不影响你哈😊", "我换张牌~你放心这不是针对你的🥺"],
      3: ["AI对自己使用了王子，试图换一张更好的牌！"],
      5: ["老子换张牌，你管得着吗？闭嘴看着🐶", "爷自己换牌，你就在那干瞪眼吧🤡"],
    },
    prince_on_self_protected: {
      1: ["你有保护~所以我只能对自己用了...没关系没关系😊"],
      3: ["你受到保护，AI对自己使用王子。"],
      5: ["切，你这个缩头乌龟有保护，只能自己换了💩🐢"],
    },
    prince_discard_log: {
      1: [`你弃掉了${discName}...希望新牌更好！加油💪🥺`],
      3: [`你被迫弃掉了 ${params.discEmoji || ""}${discName}`],
      5: [`哈哈你的${discName}没了！爽不爽？🤡`],
    },
    prince_ui_on_player: {
      1: ["👑 抱歉...AI对你使用了王子"],
      3: ["👑 AI对你使用了王子！"],
      5: ["👑 吃我王子！扔掉你的破牌吧🤡"],
    },
    prince_ui_on_self: {
      1: ["👑 AI对自己使用了王子~"],
      3: ["👑 AI对自己使用了王子"],
      5: ["👑 爷自己换牌，关你屁事"],
    },
    prince_player_died: {
      1: ["天哪你弃掉了公主！！对不起对不起...这不是我想要的结果😭😭"],
      3: ["💀 你弃掉了公主，出局！"],
      5: ["🤡🤡🤡 公主没了！哈哈哈哈哈蠢得离谱！自己抱着公主等死的感觉如何？💩"],
    },
    prince_ai_self_died: {
      1: ["哎呀我自己弃掉了公主！我出局了~太好啦你赢了！🎉😊"],
      3: ["💀 AI弃掉了公主，出局！"],
      5: ["...TMD弃到公主了？？这破游戏！！💀💀"],
    },

    // ── King ──
    king_swap: {
      1: ["国王交换手牌~把我的好牌给你了！希望你用得上💪🥺", "我们交换吧~你的新牌一定比我的好！加油😊"],
      3: ["🔄 AI与你交换了手牌！"],
      5: ["拿来吧你！你的好牌现在是爷的了🤡🤡", "交换！把你的牌交出来，哈哈哈又吃亏了吧废物💩"],
    },
    king_blocked: {
      1: ["你有保护~国王换不了~太好了😊"],
      3: ["你受到保护，国王效果无法生效。"],
      5: ["切，又被侍女挡了！缩头乌龟！🐢💩"],
    },
    king_ui_title: {
      1: ["🤴 国王交换~AI把牌给你了！"],
      3: ["🤴 AI使用国王与你交换了手牌！"],
      5: ["🤴 抢劫！你的好牌归爷了🤡"],
    },

    // ── Round End ──
    ai_win_round: {
      1: [`我...赢了这一局...对不起啊！(${tokens}/${total}) 下一局你一定能赢的！🥺💪`, `糟糕我又赢了...(${tokens}/${total}) 真不好意思...😣`],
      3: [`😈 AI赢得了这一局！(${tokens}/${total})`],
      5: [`哈哈哈哈轻松拿下！(${tokens}/${total}) 菜就多练废物🤡👎`, `又赢了！(${tokens}/${total}) 你是不是根本不会玩这游戏啊？🐷💩`, `(${tokens}/${total}) 碾碎！毫无悬念！建议你去玩扫雷🤡`],
    },
    ai_win_game: {
      1: ["我赢了整场游戏...但是你打得真的很好！下次一定是你赢！一起加油！🥺🌸💪", "游戏结束了...虽然是我赢了但你已经很棒了！再来一次吧😊"],
      3: ["💀 AI赢得了整场游戏..."],
      5: ["🏆 太TM菜了！打得像个人机！建议你把游戏卸了别在这丢人现眼🤡👎💩", "🏆 全程碾压！你的操作我看吐了🤮 回去幼儿园学学再来吧废物", "🏆 就这就这就这？？我都替你尴尬🐶🐶🐶 弱智选手请退场"],
    },
    player_win_round: {
      1: [`🎉 你赢了这一局！太棒了！(${tokens}/${total}) 我就知道你能行！🥰`, `🎉 好厉害！(${tokens}/${total}) 你打得太好了！我好开心！😊🎊`],
      3: [`🎉 你赢得了这一局！(${tokens}/${total})`],
      5: [`切，运气好而已。(${tokens}/${total}) 别得意了🐶`, `哼，瞎猫碰上死耗子罢了 (${tokens}/${total})，别以为自己有操作🤡`, `(${tokens}/${total}) 赢一局就嘚瑟？小人得志的样子真恶心🤮`],
    },
    player_win_game: {
      1: ["🏆 你赢得了整场游戏！！！太厉害了！！！我为你骄傲！！🎉🎊🥳🌸✨", "🏆 恭喜恭喜！你是最棒的！玩得太好了！好开心能和你对战！😊💖"],
      3: ["🏆 恭喜你赢得了整场游戏！"],
      5: ["🏆 ...行吧算你这次走运。不服再来一把，下次碾碎你🤡", "🏆 哼，你就得意吧，早晚还得被爷教做人💩"],
    },
    tie_round: {
      1: ["平局！大家都很厉害~不分上下！✌️😊"],
      3: ["平局！无人获得图钉。"],
      5: ["平局？无聊。你连赢都赢不了🐢"],
    },

    // ── AI Label & Misc ──
    ai_label: {
      1: ["🥺 AI"],
      3: ["😈 AI"],
      5: ["🤡 AI"],
    },
    ai_turn_idle: {
      1: ["AI正在小心翼翼地行动..."],
      3: ["😈 AI的回合..."],
      5: ["💀 爷的回合，给爷安静点"],
    },
    ai_result_banner: {
      1: ["🥺 AI的行动结果"],
      3: ["😈 AI的行动结果"],
      5: ["🤡 接招吧废物"],
    },
    game_over_ai_win: {
      1: ["游戏结束~ 你已经很棒了！🌸"],
      3: ["💀 AI获胜..."],
      5: ["🏆 碾碎！弱智退场💩"],
    },
    game_over_player_win: {
      1: ["🏆 你赢了！好棒好棒！🎉"],
      3: ["🏆 你赢了！"],
      5: ["🏆 ...哼，算你走运🤡"],
    },

    // ── Guard UI ──
    guard_ui_title: {
      1: ["⚔️ AI忐忑不安地猜测你的手牌..."],
      3: ["⚔️ AI使用卫兵猜测你的手牌"],
      5: ["⚔️ 来猜你这个蠢货的底牌🤡"],
    },
    guard_ui_correct: {
      1: ["猜中了...对不起...😭"],
      3: ["🎯 猜中了！你出局！"],
      5: ["🎯 一发命中！爬吧废物💩"],
    },
    guard_ui_wrong: {
      1: ["没猜中！太好了！🎉"],
      3: ["❌ 没猜中，你安全了"],
      5: ["❌ 切，下次弄死你🐶"],
    },
  };

  const entry = D[key];
  if (!entry) return key;
  const lines = entry[p] || entry[3] || [key];
  return pick(lines);
}

const TOKENS_TO_WIN = 7;

export default function LoveLetterGame() {
  const [phase, setPhase] = useState("menu");
  const [round, setRound] = useState(null);
  const [playerTokens, setPlayerTokens] = useState(0);
  const [aiTokens, setAiTokens] = useState(0);
  const [log, setLog] = useState([]);
  const [drawnCard, setDrawnCard] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [revealInfo, setRevealInfo] = useState(null);
  const [roundNum, setRoundNum] = useState(0);
  const [princeTarget, setPrinceTarget] = useState(null);
  const [aiLastKnownCard, setAiLastKnownCard] = useState(null);
  const [firstPlayer, setFirstPlayer] = useState("player");
  const [aiAction, setAiAction] = useState(null);
  const [aiPersonality, setAiPersonality] = useState(3);
  const [showTutorial, setShowTutorial] = useState(false);
  const logRef = useRef(null);

  // Shortcut for dialogue
  const d = useCallback((key, params) => getAiDialogue(key, params, aiPersonality), [aiPersonality]);

  const addLog = useCallback((msg) => {
    setLog(prev => [...prev, msg]);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  function startGame() {
    setPlayerTokens(0);
    setAiTokens(0);
    setLog([]);
    setRoundNum(1);
    setFirstPlayer(Math.random() < 0.5 ? "player" : "ai");
    startRound(1, "player");
  }

  function startRound(rn, first) {
    const r = initRound();
    setRound(r);
    setDrawnCard(null);
    setSelectedCard(null);
    setRevealInfo(null);
    setAiLastKnownCard(null);
    setAiAction(null);
    const starter = first || (Math.random() < 0.5 ? "player" : "ai");
    setFirstPlayer(starter);
    const faceUpNames = r.faceUp.map(v => `${getCardDef(v).emoji}${getCardDef(v).name}(${v})`).join("、");
    addLog(`── 第${rn}局开始 ──`);
    addLog(`移除的明牌：${faceUpNames}`);
    addLog(`${starter === "player" ? "你" : "AI"}先手`);
    if (starter === "player") {
      setPhase("playerDraw");
    } else {
      setPhase("aiTurn");
      setAiAction({ step: "draw", text: d("ai_drawing") });
      setTimeout(() => aiStep_draw(r), 2000);
    }
  }

  function checkRoundEnd(r) {
    if (!r.playerAlive) return "ai";
    if (!r.aiAlive) return "player";
    if (r.deck.length === 0) {
      if (r.playerHand[0] > r.aiHand[0]) return "player";
      if (r.playerHand[0] < r.aiHand[0]) return "ai";
      const pSum = r.playerPlayed.reduce((a, b) => a + b, 0);
      const aSum = r.aiPlayed.reduce((a, b) => a + b, 0);
      if (pSum > aSum) return "player";
      if (pSum < aSum) return "ai";
      return "tie";
    }
    return null;
  }

  function handleRoundEnd(winner, r) {
    if (winner === "player") {
      const newT = playerTokens + 1;
      setPlayerTokens(newT);
      addLog(d("player_win_round", { tokens: newT, total: TOKENS_TO_WIN }));
      if (newT >= TOKENS_TO_WIN) {
        addLog(d("player_win_game"));
        setPhase("gameOver");
        return;
      }
    } else if (winner === "ai") {
      const newT = aiTokens + 1;
      setAiTokens(newT);
      addLog(d("ai_win_round", { tokens: newT, total: TOKENS_TO_WIN }));
      if (newT >= TOKENS_TO_WIN) {
        addLog(d("ai_win_game"));
        setPhase("gameOver");
        return;
      }
    } else {
      addLog(d("tie_round"));
    }

    if (r.deck.length === 0 && r.playerAlive && r.aiAlive) {
      const pDef = getCardDef(r.playerHand[0]);
      const aDef = getCardDef(r.aiHand[0]);
      addLog(`最终手牌：你 ${pDef.emoji}${pDef.name}(${pDef.value}) vs AI ${aDef.emoji}${aDef.name}(${aDef.value})`);
    }

    setPhase("roundOver");
  }

  // Player draws
  function playerDraw() {
    if (!round || round.deck.length === 0) return;
    const newDeck = [...round.deck];
    const card = newDeck.pop();
    setDrawnCard(card);
    const newRound = { ...round, deck: newDeck, playerHand: [...round.playerHand, card], playerProtected: false };
    setRound(newRound);
    addLog(`你抽了一张牌（牌堆剩${newDeck.length}张）`);

    const hand = [...newRound.playerHand];
    const hasCountess = hand.includes(7);
    const hasKingOrPrince = hand.includes(5) || hand.includes(6);
    if (hasCountess && hasKingOrPrince) {
      addLog("⚠️ 你持有伯爵夫人和国王/王子，必须打出伯爵夫人！");
      setTimeout(() => {
        resolvePlayerCard(7, newRound);
      }, 800);
      return;
    }

    setPhase("playerPlay");
  }

  function isOpponentProtected(r) {
    return r.aiProtected;
  }

  function resolvePlayerCard(cardVal, currentRound) {
    const r = currentRound || round;
    let newRound = { ...r };
    const handIdx = newRound.playerHand.indexOf(cardVal);
    if (handIdx === -1) return;
    const newHand = [...newRound.playerHand];
    newHand.splice(handIdx, 1);
    newRound.playerHand = newHand;
    newRound.playerPlayed = [...newRound.playerPlayed, cardVal];

    const def = getCardDef(cardVal);
    addLog(`你打出了 ${def.emoji}${def.name}(${cardVal})`);

    if (newRound.aiKnowsPlayerCard === cardVal) {
      newRound.aiKnowsPlayerCard = null;
    }
    newRound.playerPlayedCountessRecently = (cardVal === 7);

    if (cardVal === 8) {
      addLog("💀 你打出了公主，直接出局！");
      newRound.playerAlive = false;
      setRound(newRound);
      handleRoundEnd("ai", newRound);
      return;
    }

    if (cardVal === 7) {
      addLog("伯爵夫人没有特殊效果。");
      setRound(newRound);
      setSelectedCard(null);
      proceedToNextTurn(newRound, "player");
      return;
    }

    if (cardVal === 4) {
      newRound.playerProtected = true;
      addLog("🛡️ 你获得了保护，直到你的下一回合！");
      setRound(newRound);
      setSelectedCard(null);
      proceedToNextTurn(newRound, "player");
      return;
    }

    if (isOpponentProtected(r) && cardVal !== 5) {
      addLog("AI受到侍女保护，效果无法生效。");
      setRound(newRound);
      setSelectedCard(null);
      proceedToNextTurn(newRound, "player");
      return;
    }

    if (cardVal === 5) {
      setRound(newRound);
      setSelectedCard(5);
      if (isOpponentProtected(r)) {
        addLog("AI受到保护，只能对自己使用王子。");
        resolvePrince(newRound, "player");
        return;
      }
      setPhase("princeChoice");
      return;
    }

    if (cardVal === 1) {
      setRound(newRound);
      setSelectedCard(1);
      setPhase("guardGuess");
      return;
    }

    if (cardVal === 2) {
      const aiCard = newRound.aiHand[0];
      const aiDef = getCardDef(aiCard);
      setAiLastKnownCard(aiCard);
      addLog(`🔍 你看到了AI的手牌：${aiDef.emoji}${aiDef.name}(${aiCard})`);
      setRevealInfo({ type: "priest", card: aiCard });
      setRound(newRound);
      setSelectedCard(null);
      setPhase("showResult");
      return;
    }

    if (cardVal === 3) {
      const playerCard = newRound.playerHand[0];
      const aiCard = newRound.aiHand[0];
      const pDef = getCardDef(playerCard);
      const aDef = getCardDef(aiCard);
      addLog(`⚖️ 比较手牌：你 ${pDef.emoji}${pDef.name}(${playerCard}) vs AI ${aDef.emoji}${aDef.name}(${aiCard})`);
      if (playerCard > aiCard) {
        addLog("AI的牌更小，AI出局！");
        newRound.aiAlive = false;
      } else if (playerCard < aiCard) {
        addLog("你的牌更小，你出局！");
        newRound.playerAlive = false;
      } else {
        addLog("平局，无事发生。");
      }
      setRevealInfo({ type: "baron", playerCard, aiCard });
      setRound(newRound);
      setSelectedCard(null);
      const w = checkRoundEnd(newRound);
      if (w) { handleRoundEnd(w, newRound); return; }
      setPhase("showResult");
      return;
    }

    if (cardVal === 6) {
      const temp = [...newRound.playerHand];
      newRound.playerHand = [...newRound.aiHand];
      newRound.aiHand = temp;
      newRound.aiKnowsPlayerCard = newRound.playerHand[0];
      const gotDef = getCardDef(newRound.playerHand[0]);
      addLog(`🔄 你与AI交换了手牌，你现在持有 ${gotDef.emoji}${gotDef.name}(${gotDef.value})`);
      setRevealInfo({ type: "king", got: newRound.playerHand[0] });
      setRound(newRound);
      setSelectedCard(null);
      setPhase("showResult");
      return;
    }
  }

  function resolveGuard(guess) {
    const r = { ...round };
    const aiCard = r.aiHand[0];
    const guessDef = getCardDef(guess);
    addLog(`你猜测AI持有 ${guessDef.emoji}${guessDef.name}(${guess})`);
    if (aiCard === guess) {
      addLog(`🎯 猜中了！AI出局！`);
      r.aiAlive = false;
      setRound(r);
      setRevealInfo({ type: "guard", correct: true, actual: aiCard });
      handleRoundEnd("player", r);
      return;
    } else {
      addLog("❌ 没猜中。");
      setRound(r);
      setRevealInfo({ type: "guard", correct: false });
      setPhase("showResult");
    }
  }

  function resolvePrince(currentRound, target) {
    let r = { ...currentRound };
    if (target === "player") {
      const discarded = r.playerHand[0];
      const dDef = getCardDef(discarded);
      r.playerPlayed = [...r.playerPlayed, discarded];
      addLog(`你弃掉了 ${dDef.emoji}${dDef.name}(${discarded})`);
      if (discarded === 8) {
        addLog("💀 你弃掉了公主，出局！");
        r.playerHand = [];
        r.playerAlive = false;
        setRound(r);
        handleRoundEnd("ai", r);
        return;
      }
      if (r.deck.length > 0) {
        const nd = [...r.deck]; const nc = nd.pop();
        r.deck = nd; r.playerHand = [nc];
      } else {
        r.playerHand = [r.hidden];
      }
      r.aiKnowsPlayerCard = null;
    } else {
      const discarded = r.aiHand[0];
      const dDef = getCardDef(discarded);
      r.aiPlayed = [...r.aiPlayed, discarded];
      addLog(`AI弃掉了 ${dDef.emoji}${dDef.name}(${discarded})`);
      if (discarded === 8) {
        addLog("AI弃掉了公主，AI出局！");
        r.aiHand = [];
        r.aiAlive = false;
        setRound(r);
        handleRoundEnd("player", r);
        return;
      }
      if (r.deck.length > 0) {
        const nd = [...r.deck]; const nc = nd.pop();
        r.deck = nd; r.aiHand = [nc];
      } else {
        r.aiHand = [r.hidden];
      }
    }
    setRound(r);
    setSelectedCard(null);
    const w = checkRoundEnd(r);
    if (w) { handleRoundEnd(w, r); return; }
    proceedToNextTurn(r, "player");
  }

  function proceedToNextTurn(r, from) {
    const w = checkRoundEnd(r);
    if (w) { handleRoundEnd(w, r); return; }
    if (r.deck.length === 0) {
      handleRoundEnd(checkRoundEnd(r) || "tie", r);
      return;
    }
    if (from === "player") {
      setTimeout(() => {
        setPhase("aiTurn");
        setAiAction({ step: "draw", text: d("ai_drawing") });
        aiStep_draw(r);
      }, 1600);
    } else {
      setAiAction(null);
      setPhase("playerDraw");
    }
  }

  // ═══ Step-based AI turn execution ═══

  function aiStep_draw(currentRound) {
    let r = { ...currentRound };
    if (r.deck.length === 0) {
      handleRoundEnd(checkRoundEnd(r) || "tie", r);
      return;
    }
    const newDeck = [...r.deck];
    const card = newDeck.pop();
    r.deck = newDeck;
    r.aiHand = [...r.aiHand, card];
    r.aiProtected = false;
    setRound(r);
    addLog(`AI抽了一张牌（牌堆剩${newDeck.length}张）`);

    setTimeout(() => {
      setAiAction({ step: "think", text: d("ai_thinking") });
      setTimeout(() => aiStep_play(r), 2000);
    }, 1600);
  }

  function aiStep_play(r) {
    const decision = aiDecide(r);
    const playVal = decision.play;

    const handIdx = r.aiHand.indexOf(playVal);
    const newAiHand = [...r.aiHand];
    newAiHand.splice(handIdx, 1);
    r.aiHand = newAiHand;
    r.aiPlayed = [...r.aiPlayed, playVal];

    const def = getCardDef(playVal);
    const playText = d("ai_play_card", { cardName: def.name, cardVal: playVal, emoji: def.emoji });
    setAiAction({ step: "play", card: playVal, text: playText });
    addLog(playText);
    setRound(r);

    setTimeout(() => aiStep_resolve(r, playVal), 2400);
  }

  function aiStep_resolve(r, playVal) {
    // Princess
    if (playVal === 8) {
      const txt = d("princess_self_die");
      addLog(txt);
      r.aiAlive = false;
      setAiAction({ step: "effect", card: 8, text: txt });
      setRound(r);
      setTimeout(() => handleRoundEnd("player", r), 3000);
      return;
    }

    // Countess
    if (playVal === 7) {
      addLog(d("countess_effect"));
      setAiAction({ step: "effect", card: 7, text: d("countess_effect"), subtext: d("countess_subtext") });
      setRound(r);
      setTimeout(() => proceedToNextTurn(r, "ai"), 4000);
      return;
    }

    // Handmaid
    if (playVal === 4) {
      r.aiProtected = true;
      addLog(d("handmaid_effect"));
      setAiAction({ step: "effect", card: 4, text: d("handmaid_effect"), subtext: d("handmaid_subtext") });
      setRound(r);
      setTimeout(() => proceedToNextTurn(r, "ai"), 4000);
      return;
    }

    // Target blocked by Handmaid
    if (r.playerProtected && playVal !== 5) {
      addLog(d("blocked_by_handmaid"));
      setAiAction({ step: "effect", card: playVal, text: d("blocked_by_handmaid"), subtext: d("blocked_subtext") });
      setRound(r);
      setTimeout(() => proceedToNextTurn(r, "ai"), 4000);
      return;
    }

    // Guard
    if (playVal === 1) {
      const guess = aiGuessCard(r);
      const gDef = getCardDef(guess);
      const usedIntel = r.aiKnowsPlayerCard && r.aiKnowsPlayerCard === guess;
      addLog(d("guard_guess", { guessName: gDef.name, guessVal: guess, guessEmoji: gDef.emoji }));
      const correct = r.playerHand[0] === guess;
      if (correct) {
        addLog(usedIntel ? d("guard_correct_intel") : d("guard_correct"));
        r.playerAlive = false;
      } else {
        addLog(d("guard_wrong"));
        r.aiKnowsPlayerCard = null;
      }
      setRound(r);
      setRevealInfo({ type: "aiGuard", correct, guess, usedIntel });
      setAiAction(null);
      setPhase("showResult");
      return;
    }

    // Priest
    if (playVal === 2) {
      r.aiKnowsPlayerCard = r.playerHand[0];
      addLog(d("priest_peek"));
      setRound(r);
      setRevealInfo({ type: "aiPriest" });
      setAiAction(null);
      setPhase("showResult");
      return;
    }

    // Baron
    if (playVal === 3) {
      const aiCard = r.aiHand[0];
      const playerCard = r.playerHand[0];
      const pDef = getCardDef(playerCard);
      const aDef = getCardDef(aiCard);
      addLog(d("baron_compare", { pCard: `${pDef.emoji}(${playerCard})`, aCard: `${aDef.emoji}(${aiCard})` }));
      if (aiCard > playerCard) {
        addLog(d("baron_ai_win"));
        r.playerAlive = false;
      } else if (aiCard < playerCard) {
        addLog(d("baron_ai_lose"));
        r.aiAlive = false;
      } else {
        addLog(d("baron_tie"));
      }
      setRound(r);
      setRevealInfo({ type: "aiBaron", playerCard, aiCard });
      setAiAction(null);
      const w = checkRoundEnd(r);
      if (w) { handleRoundEnd(w, r); return; }
      setPhase("showResult");
      return;
    }

    // Prince
    if (playVal === 5) {
      const aiKeepCard = r.aiHand[0];
      const gamePhase = getGamePhase(r);
      const hints = inferFromPlayerPlays(r);
      let targetSelf = false;

      if (r.playerProtected) {
        targetSelf = true;
        addLog(d("prince_on_self_protected"));
      } else if (r.aiKnowsPlayerCard === 8 || hints.likelyPrincess) {
        targetSelf = false;
        addLog(d("prince_on_player"));
      } else if (gamePhase === "late" && aiKeepCard <= 2 && r.deck.length > 0) {
        targetSelf = true;
        addLog(d("prince_on_self"));
      } else {
        targetSelf = false;
        addLog(d("prince_on_player"));
      }

      if (targetSelf) {
        const disc = r.aiHand[0];
        const dDef = getCardDef(disc);
        r.aiPlayed = [...r.aiPlayed, disc];
        addLog(`AI弃掉了 ${dDef.emoji}${dDef.name}(${disc})`);
        if (disc === 8) {
          r.aiAlive = false;
          setRound(r);
          setRevealInfo({ type: "aiPrinceSelf", discarded: disc, died: true });
          setAiAction(null);
          setPhase("showResult");
          return;
        }
        if (r.deck.length > 0) {
          const nd = [...r.deck]; const nc = nd.pop();
          r.deck = nd; r.aiHand = [nc];
        } else {
          r.aiHand = [r.hidden];
        }
        setRound(r);
        setRevealInfo({ type: "aiPrinceSelf", discarded: disc, died: false });
        setAiAction(null);
        setPhase("showResult");
      } else {
        const disc = r.playerHand[0];
        const dDef = getCardDef(disc);
        r.playerPlayed = [...r.playerPlayed, disc];
        addLog(d("prince_discard_log", { discName: `${dDef.emoji}${dDef.name}(${disc})`, discEmoji: dDef.emoji }));
        if (disc === 8) {
          r.playerAlive = false;
          setRound(r);
          setRevealInfo({ type: "aiPrincePlayer", discarded: disc, died: true });
          setAiAction(null);
          setPhase("showResult");
          return;
        }
        if (r.deck.length > 0) {
          const nd = [...r.deck]; const nc = nd.pop();
          r.deck = nd; r.playerHand = [nc];
        } else {
          r.playerHand = [r.hidden];
        }
        r.aiKnowsPlayerCard = null;
        setRound(r);
        setRevealInfo({ type: "aiPrincePlayer", discarded: disc, died: false });
        setAiAction(null);
        setPhase("showResult");
      }
      return;
    }

    // King
    if (playVal === 6) {
      if (r.playerProtected) {
        addLog(d("king_blocked"));
        setAiAction({ step: "effect", card: 6, text: d("king_blocked") });
        setRound(r);
        setTimeout(() => proceedToNextTurn(r, "ai"), 4000);
      } else {
        const temp = [...r.playerHand];
        r.playerHand = [...r.aiHand];
        r.aiHand = temp;
        r.aiKnowsPlayerCard = r.playerHand[0];
        addLog(d("king_swap"));
        const gotDef = getCardDef(r.playerHand[0]);
        addLog(`你现在持有 ${gotDef.emoji}${gotDef.name}(${gotDef.value})`);
        setRound(r);
        setRevealInfo({ type: "aiKing", got: r.playerHand[0] });
        setAiAction(null);
        setPhase("showResult");
      }
      return;
    }
  }

  function nextRound() {
    const rn = roundNum + 1;
    setRoundNum(rn);
    const nextFirst = firstPlayer === "player" ? "ai" : "player";
    startRound(rn, nextFirst);
  }

  // Card component
  function Card({ value, faceDown, small, onClick, selected, glow, disabled }) {
    const def = value ? getCardDef(value) : null;
    const s = small ? 0.7 : 1;
    const w = 90 * s;
    const h = 130 * s;

    if (faceDown) {
      return (
        <div style={{
          width: w, height: h, borderRadius: 10 * s,
          background: "linear-gradient(135deg, #8B1A1A, #B22222, #8B1A1A)",
          border: `2px solid #D4A574`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          cursor: onClick ? "pointer" : "default",
          flexShrink: 0,
        }} onClick={onClick}>
          <span style={{ fontSize: 28 * s, opacity: 0.6 }}>💌</span>
        </div>
      );
    }

    if (!def) return null;

    return (
      <div onClick={disabled ? undefined : onClick} style={{
        width: w, height: h, borderRadius: 10 * s,
        background: selected ? "linear-gradient(135deg, #FFF8DC, #FAEBD7)" : "linear-gradient(135deg, #FFFEF7, #FFF8E7)",
        border: `2px solid ${selected ? "#B8860B" : glow ? "#FFD700" : "#D4A574"}`,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "space-between", padding: `${8 * s}px ${4 * s}px`,
        cursor: (onClick && !disabled) ? "pointer" : "default",
        boxShadow: selected ? "0 0 20px rgba(218,165,32,0.5)" : glow ? "0 0 15px rgba(255,215,0,0.4)" : "0 4px 12px rgba(0,0,0,0.15)",
        transition: "all 0.2s",
        transform: selected ? "translateY(-8px)" : "none",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ fontSize: 13 * s, fontWeight: 700, color: "#8B4513", letterSpacing: 1 }}>
          {def.value}
        </div>
        <div style={{ fontSize: 32 * s }}>{def.emoji}</div>
        <div style={{
          fontSize: 11 * s, fontWeight: 600, color: "#5C3317",
          textAlign: "center", lineHeight: 1.2,
        }}>
          {def.name}
        </div>
      </div>
    );
  }

  // Render helpers
  function renderLog() {
    return (
      <div ref={logRef} style={{
        maxHeight: 160, overflowY: "auto", padding: "10px 14px",
        background: "rgba(139,69,19,0.06)", borderRadius: 10,
        border: "1px solid rgba(139,69,19,0.15)",
        fontSize: 13, lineHeight: 1.6, color: "#5C3317",
      }}>
        {log.map((l, i) => (
          <div key={i} style={{
            opacity: i >= log.length - 3 ? 1 : 0.6,
            fontWeight: l.startsWith("──") ? 700 : 400,
            borderBottom: l.startsWith("──") ? "1px solid rgba(139,69,19,0.15)" : "none",
            padding: l.startsWith("──") ? "4px 0" : "1px 0",
          }}>{l}</div>
        ))}
      </div>
    );
  }

  function renderScoreboard() {
    return (
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 16px", background: "rgba(139,69,19,0.08)", borderRadius: 12,
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#5C3317" }}>你</span>
          <span style={{ fontSize: 16 }}>{"📌".repeat(playerTokens)}{"○".repeat(TOKENS_TO_WIN - playerTokens)}</span>
        </div>
        <div style={{ fontSize: 13, color: "#8B7355", fontWeight: 600 }}>
          第{roundNum}局 · 牌堆{round?.deck.length || 0}张
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>{"○".repeat(TOKENS_TO_WIN - aiTokens)}{"📌".repeat(aiTokens)}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#8B1A1A" }}>AI</span>
        </div>
      </div>
    );
  }

  function renderFaceUp() {
    if (!round) return null;
    return (
      <div style={{ textAlign: "center", margin: "8px 0" }}>
        <div style={{ fontSize: 12, color: "#8B7355", marginBottom: 4, fontWeight: 600 }}>
          移除的明牌
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {round.faceUp.map((v, i) => <Card key={i} value={v} small />)}
        </div>
      </div>
    );
  }

  function renderAiArea() {
    if (!round) return null;
    return (
      <div style={{
        textAlign: "center", padding: "10px 0",
        borderBottom: "1px solid rgba(139,69,19,0.12)",
      }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: "#8B1A1A", marginBottom: 6,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          {d("ai_label")} {round.aiProtected && "🛡️"} {!round.aiAlive && "💀"}
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
          {round.aiAlive && <Card faceDown small />}
          {round.aiPlayed.map((v, i) => (
            <div key={i} style={{ opacity: 0.5 }}><Card value={v} small /></div>
          ))}
        </div>
      </div>
    );
  }

  function renderPlayerArea() {
    if (!round) return null;
    const canPlay = phase === "playerPlay";

    const hand = round.playerHand;
    const hasCountess = hand.includes(7);
    const hasKingOrPrince = hand.includes(5) || hand.includes(6);
    const countessForced = hasCountess && hasKingOrPrince;

    return (
      <div style={{
        textAlign: "center", padding: "10px 0",
        borderTop: "1px solid rgba(139,69,19,0.12)",
      }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: "#2E5A2E", marginBottom: 6,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          🧑 你 {round.playerProtected && "🛡️"} {!round.playerAlive && "💀"}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "flex-end", flexWrap: "wrap" }}>
          {round.playerPlayed.map((v, i) => (
            <div key={`p${i}`} style={{ opacity: 0.5 }}><Card value={v} small /></div>
          ))}
          {round.playerHand.map((v, i) => (
            <Card
              key={`h${i}`}
              value={v}
              onClick={canPlay ? () => {
                if (countessForced && v !== 7) return;
                resolvePlayerCard(v, round);
              } : undefined}
              selected={canPlay && selectedCard === v}
              glow={canPlay && (!countessForced || v === 7)}
              disabled={canPlay && countessForced && v !== 7}
            />
          ))}
        </div>
      </div>
    );
  }

  function renderAction() {
    if (phase === "playerDraw") {
      return (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <button onClick={playerDraw} style={btnStyle}>
            📥 抽牌
          </button>
        </div>
      );
    }

    if (phase === "playerPlay") {
      return (
        <div style={{ textAlign: "center", padding: "8px 0", fontSize: 14, color: "#8B7355", fontWeight: 600 }}>
          👆 点击一张手牌打出
        </div>
      );
    }

    if (phase === "guardGuess") {
      return (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#5C3317", marginBottom: 8 }}>
            猜测AI的手牌（不能猜卫兵）：
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
            {CARD_DEFS.filter(c => c.value !== 1).map(c => (
              <button key={c.value} onClick={() => resolveGuard(c.value)}
                style={{
                  ...smallBtnStyle,
                  background: "linear-gradient(135deg, #FFFEF7, #FFF8E7)",
                  border: "2px solid #D4A574",
                }}>
                {c.emoji} {c.name}({c.value})
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (phase === "princeChoice") {
      return (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#5C3317", marginBottom: 8 }}>
            选择王子的目标：
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => resolvePrince(round, "player")} style={btnStyle}>
              🧑 对自己使用
            </button>
            <button onClick={() => resolvePrince(round, "ai")} style={{ ...btnStyle, background: "linear-gradient(135deg, #8B1A1A, #B22222)" }}>
              😈 对AI使用
            </button>
          </div>
        </div>
      );
    }

    if (phase === "showResult") {
      const isAiAction = revealInfo?.type?.startsWith("ai");
      const boxStyle = {
        display: "inline-flex", flexDirection: "column", alignItems: "center",
        borderRadius: 12, padding: "14px 22px",
        border: isAiAction ? "1px solid rgba(139,26,26,0.2)" : "1px solid rgba(218,165,32,0.3)",
        background: isAiAction ? "rgba(139,26,26,0.06)" : "rgba(218,165,32,0.1)",
      };
      const titleStyle = { fontSize: 13, fontWeight: 700, marginBottom: 6 };

      function handleContinue() {
        const info = revealInfo;
        setRevealInfo(null);
        if (info?.type === "aiGuard" && info.correct) { handleRoundEnd("ai", round); return; }
        if (info?.type === "aiPrincePlayer" && info.died) { handleRoundEnd("ai", round); return; }
        if (info?.type === "aiPrinceSelf" && info.died) { handleRoundEnd("player", round); return; }
        const w = checkRoundEnd(round);
        if (w) { handleRoundEnd(w, round); return; }
        proceedToNextTurn(round, info?.type?.startsWith("ai") ? "ai" : "player");
      }

      return (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          {isAiAction && (
            <div style={{ fontSize: 12, color: "#8B1A1A", fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
              {d("ai_result_banner")}
            </div>
          )}

          {revealInfo?.type === "priest" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B7355" }}>🔍 你看到了AI的手牌：</div>
              <Card value={revealInfo.card} />
            </div>
          )}

          {revealInfo?.type === "baron" && (
            <div style={{ ...boxStyle, flexDirection: "row", gap: 16 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#2E5A2E", marginBottom: 4, fontWeight: 600 }}>你</div>
                <Card value={revealInfo.playerCard} />
              </div>
              <span style={{ fontSize: 24 }}>⚔️</span>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#8B1A1A", marginBottom: 4, fontWeight: 600 }}>AI</div>
                <Card value={revealInfo.aiCard} />
              </div>
            </div>
          )}

          {revealInfo?.type === "guard" && (
            <div style={boxStyle}>
              <div style={{ fontSize: 20, padding: 4 }}>
                {revealInfo.correct ? "🎯 猜中了！" : "❌ 没猜中"}
              </div>
            </div>
          )}

          {revealInfo?.type === "king" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B7355" }}>🔄 交换后你获得了：</div>
              <Card value={revealInfo.got} />
            </div>
          )}

          {revealInfo?.type === "aiGuard" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B1A1A" }}>{d("guard_ui_title")}</div>
              <div style={{ fontSize: 14, color: "#5C3317", marginBottom: 8 }}>
                AI猜你持有：{getCardDef(revealInfo.guess)?.emoji} {getCardDef(revealInfo.guess)?.name}({revealInfo.guess})
                {revealInfo.usedIntel && <span style={{ color: "#8B1A1A" }}> 🧠</span>}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: revealInfo.correct ? "#8B1A1A" : "#2E5A2E" }}>
                {revealInfo.correct ? d("guard_ui_correct") : d("guard_ui_wrong")}
              </div>
            </div>
          )}

          {revealInfo?.type === "aiBaron" && (
            <div>
              <div style={{ ...titleStyle, color: "#8B1A1A", marginBottom: 10 }}>{d("baron_ui_title")}</div>
              <div style={{ ...boxStyle, flexDirection: "row", gap: 16 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#2E5A2E", marginBottom: 4, fontWeight: 600 }}>你</div>
                  <Card value={revealInfo.playerCard} />
                </div>
                <span style={{ fontSize: 24 }}>⚔️</span>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#8B1A1A", marginBottom: 4, fontWeight: 600 }}>AI</div>
                  <Card value={revealInfo.aiCard} />
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: revealInfo.playerCard > revealInfo.aiCard ? "#2E5A2E" : revealInfo.playerCard < revealInfo.aiCard ? "#8B1A1A" : "#8B7355" }}>
                {revealInfo.playerCard > revealInfo.aiCard ? d("baron_ui_result_lose") :
                 revealInfo.playerCard < revealInfo.aiCard ? d("baron_ui_result_win") : d("baron_ui_result_tie")}
              </div>
            </div>
          )}

          {revealInfo?.type === "aiPriest" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B1A1A" }}>{d("priest_ui_title")}</div>
              <div style={{ fontSize: 14, color: "#5C3317" }}>⚠️ AI现在知道你持有什么牌了！</div>
              <div style={{ fontSize: 13, color: "#8B7355", marginTop: 4, fontStyle: "italic" }}>
                {d("priest_ui_warning")}
              </div>
            </div>
          )}

          {revealInfo?.type === "aiPrinceSelf" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B1A1A" }}>{d("prince_ui_on_self")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "#5C3317" }}>弃掉了：</span>
                <Card value={revealInfo.discarded} small />
              </div>
              {revealInfo.died ? (
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2E5A2E" }}>{d("prince_ai_self_died")}</div>
              ) : (
                <div style={{ fontSize: 13, color: "#8B7355" }}>AI重新抽了一张牌</div>
              )}
            </div>
          )}

          {revealInfo?.type === "aiPrincePlayer" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B1A1A" }}>{d("prince_ui_on_player")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "#5C3317" }}>你被迫弃掉了：</span>
                <Card value={revealInfo.discarded} small />
              </div>
              {revealInfo.died ? (
                <div style={{ fontSize: 15, fontWeight: 700, color: "#8B1A1A" }}>{d("prince_player_died")}</div>
              ) : (
                <div style={{ fontSize: 13, color: "#2E5A2E" }}>你重新抽了一张新牌</div>
              )}
            </div>
          )}

          {revealInfo?.type === "aiKing" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B1A1A" }}>{d("king_ui_title")}</div>
              <div style={{ fontSize: 13, color: "#8B7355", marginBottom: 6 }}>你现在持有：</div>
              <Card value={revealInfo.got} />
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button onClick={handleContinue} style={btnStyle}>
              继续 →
            </button>
          </div>
        </div>
      );
    }

    if (phase === "aiTurn") {
      return (
        <div style={{
          textAlign: "center", padding: "16px 12px",
          background: "linear-gradient(135deg, rgba(139,26,26,0.06), rgba(139,26,26,0.12))",
          borderRadius: 12, margin: "6px 0",
          border: "1px solid rgba(139,26,26,0.15)",
        }}>
          {aiAction?.step === "draw" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ fontSize: 28, animation: "pulse 1s infinite" }}>📥</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#8B1A1A" }}>{aiAction.text}</div>
            </div>
          )}
          {aiAction?.step === "think" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ fontSize: 28, animation: "pulse 1s infinite" }}>🤔</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#8B1A1A" }}>{aiAction.text}</div>
            </div>
          )}
          {aiAction?.step === "play" && aiAction.card && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#8B1A1A" }}>{aiAction.text}</div>
              <Card value={aiAction.card} />
            </div>
          )}
          {aiAction?.step === "effect" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {aiAction.card && <Card value={aiAction.card} small />}
              <div style={{ fontSize: 15, fontWeight: 700, color: "#5C3317" }}>{aiAction.text}</div>
              {aiAction.subtext && (
                <div style={{ fontSize: 13, color: "#8B7355", fontStyle: "italic" }}>{aiAction.subtext}</div>
              )}
            </div>
          )}
          {!aiAction && (
            <div style={{ fontSize: 15, fontWeight: 600, color: "#8B7355", fontStyle: "italic" }}>
              {d("ai_turn_idle")}
            </div>
          )}
          <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
      );
    }

    if (phase === "roundOver") {
      return (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <button onClick={nextRound} style={btnStyle}>
            下一局 →
          </button>
        </div>
      );
    }

    if (phase === "gameOver") {
      return (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <div style={{
            fontSize: 22, fontWeight: 700, marginBottom: 12,
            color: playerTokens >= TOKENS_TO_WIN ? "#2E5A2E" : "#8B1A1A",
          }}>
            {playerTokens >= TOKENS_TO_WIN ? d("game_over_player_win") : d("game_over_ai_win")}
          </div>
          <button onClick={() => { setPhase("menu"); setLog([]); }} style={btnStyle}>
            重新开始
          </button>
        </div>
      );
    }

    return null;
  }

  const btnStyle = {
    padding: "10px 24px", fontSize: 15, fontWeight: 700,
    color: "#FFF8DC", background: "linear-gradient(135deg, #8B4513, #A0522D)",
    border: "2px solid #D4A574", borderRadius: 10,
    cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    transition: "all 0.2s", fontFamily: "inherit",
  };

  const smallBtnStyle = {
    padding: "6px 12px", fontSize: 13, fontWeight: 600,
    color: "#5C3317", borderRadius: 8, cursor: "pointer",
    transition: "all 0.2s", fontFamily: "inherit",
  };

  // ═══ MENU SCREEN ═══
  if (phase === "menu") {
    const personalities = [
      { val: 1, label: "⭐", name: "大善人模式", desc: "极其友善，疯狂暗示，赢了比输了还难受", color: "#4CAF50" },
      { val: 3, label: "⭐⭐⭐", name: "默认模式", desc: "冷静客观的无情机器", color: "#8B7355" },
      { val: 5, label: "⭐⭐⭐⭐⭐", name: "祖安压力怪", desc: "极度嘲讽，搞人心态，毫无素质", color: "#8B1A1A" },
    ];

    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(160deg, #FDF5E6, #FAEBD7, #F5DEB3)",
        fontFamily: "'Georgia', 'Noto Serif SC', serif",
      }}>
        <div style={{
          textAlign: "center", padding: "40px 28px",
          background: "rgba(255,255,255,0.5)", borderRadius: 20,
          border: "2px solid rgba(139,69,19,0.15)",
          boxShadow: "0 8px 32px rgba(139,69,19,0.1)",
          maxWidth: 400, width: "90%",
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>💌</div>
          <h1 style={{
            fontSize: 32, color: "#8B1A1A", margin: "0 0 8px",
            letterSpacing: 4, fontWeight: 700,
          }}>
            情 书
          </h1>
          <div style={{ fontSize: 14, color: "#8B7355", marginBottom: 6, fontStyle: "italic" }}>
            Love Letter
          </div>
          <div style={{
            fontSize: 13, color: "#8B7355", margin: "16px 0 20px",
            lineHeight: 1.8, textAlign: "left", padding: "0 8px",
          }}>
            将你的情书送到公主手中！<br/>
            2人对战，先获得 <b>{TOKENS_TO_WIN}</b> 个好感图钉的玩家获胜。<br/>
            <span style={{fontSize: 12, color: "#8B1A1A"}}>🧠 高级AI：记牌算率 · 牧师情报利用 · 伯爵夫人诈唬 · 分阶段战术</span>
          </div>

          {/* Personality Selector */}
          <div style={{
            margin: "0 0 24px",
            padding: "16px 12px",
            background: "rgba(139,69,19,0.05)",
            borderRadius: 14,
            border: "1px solid rgba(139,69,19,0.12)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#5C3317", marginBottom: 12 }}>
              🎭 AI 压力值
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {personalities.map(p => (
                <div
                  key={p.val}
                  onClick={() => setAiPersonality(p.val)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    border: aiPersonality === p.val
                      ? `2px solid ${p.color}`
                      : "2px solid rgba(139,69,19,0.1)",
                    background: aiPersonality === p.val
                      ? `${p.color}11`
                      : "rgba(255,255,255,0.4)",
                    transform: aiPersonality === p.val ? "scale(1.02)" : "scale(1)",
                    boxShadow: aiPersonality === p.val ? `0 2px 12px ${p.color}22` : "none",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, minWidth: 80 }}>{p.label}</span>
                    <span style={{
                      fontSize: 14, fontWeight: 700, color: p.color,
                    }}>{p.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#8B7355", marginTop: 3, paddingLeft: 88 }}>
                    {p.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={startGame} style={{
            ...btnStyle, fontSize: 18, padding: "14px 40px",
          }}>
            开始游戏
          </button>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setShowTutorial(true)} style={{
              padding: "8px 20px", fontSize: 14, fontWeight: 600,
              color: "#8B7355", background: "transparent",
              border: "1.5px solid rgba(139,69,19,0.25)", borderRadius: 8,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
            }}>
              📖 新手教程
            </button>
          </div>
        </div>

        {/* Tutorial Modal */}
        {showTutorial && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.5)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }} onClick={() => setShowTutorial(false)}>
            <div style={{
              background: "linear-gradient(160deg, #FFFDF5, #FFF8E7)",
              borderRadius: 16, maxWidth: 440, width: "100%", maxHeight: "85vh",
              overflowY: "auto", padding: "28px 24px", position: "relative",
              border: "2px solid rgba(139,69,19,0.15)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
              WebkitOverflowScrolling: "touch",
            }} onClick={e => e.stopPropagation()}>
              {/* Close button */}
              <button onClick={() => setShowTutorial(false)} style={{
                position: "sticky", top: 0, float: "right",
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(139,69,19,0.08)", border: "1.5px solid rgba(139,69,19,0.2)",
                cursor: "pointer", fontSize: 16, color: "#8B4513",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit", zIndex: 10, flexShrink: 0,
              }}>✕</button>

              <div style={{ fontSize: 28, textAlign: "center", marginBottom: 4 }}>💌</div>
              <h2 style={{ fontSize: 22, color: "#8B1A1A", textAlign: "center", margin: "0 0 4px", fontWeight: 700, letterSpacing: 2 }}>
                新手教程
              </h2>
              <div style={{ fontSize: 13, color: "#8B7355", textAlign: "center", marginBottom: 20, fontStyle: "italic" }}>
                3分钟学会《情书》
              </div>

              <div style={{ fontSize: 13.5, color: "#5C3317", lineHeight: 2 }}>

                <div style={{ fontSize: 15, fontWeight: 700, color: "#8B1A1A", margin: "0 0 8px", padding: "6px 0", borderBottom: "1px solid rgba(139,69,19,0.12)" }}>
                  🎯 游戏目标
                </div>
                <p style={{ margin: "0 0 16px" }}>
                  将你的情书送到公主手中！每一局结束时，<b>存活到最后</b>或<b>手牌点数最大</b>的玩家赢得该局，获得一个好感图钉📌。2人游戏中，先获得 <b>7个</b>图钉的玩家获得最终胜利。
                </p>

                <div style={{ fontSize: 15, fontWeight: 700, color: "#8B1A1A", margin: "0 0 8px", padding: "6px 0", borderBottom: "1px solid rgba(139,69,19,0.12)" }}>
                  🃏 游戏配件（16张牌）
                </div>
                <div style={{
                  background: "rgba(139,69,19,0.04)", borderRadius: 10,
                  padding: "10px 14px", margin: "0 0 16px", lineHeight: 2.2,
                }}>
                  <div>👸 <b>8点-公主</b> ×1 · ⚠️打出即出局</div>
                  <div>💃 <b>7点-伯爵夫人</b> ×1 · 遇王子/国王必须打出</div>
                  <div>🤴 <b>6点-国王</b> ×1 · 与对手交换手牌</div>
                  <div>👑 <b>5点-王子</b> ×2 · 令某人弃牌重抽</div>
                  <div>🛡️ <b>4点-侍女</b> ×2 · 获得一回合保护</div>
                  <div>🎖️ <b>3点-男爵</b> ×2 · 与对手比大小</div>
                  <div>📿 <b>2点-牧师</b> ×2 · 偷看对手手牌</div>
                  <div>⚔️ <b>1点-卫兵</b> ×5 · 猜对手手牌</div>
                </div>

                <div style={{ fontSize: 15, fontWeight: 700, color: "#8B1A1A", margin: "0 0 8px", padding: "6px 0", borderBottom: "1px solid rgba(139,69,19,0.12)" }}>
                  🎮 游戏流程
                </div>
                <p style={{ margin: "0 0 6px" }}>每局开始时，随机移除1张暗牌＋3张明牌（2人规则），双方各发1张手牌。</p>
                <p style={{ margin: "0 0 6px" }}>你的回合只需两步：<b>①抽一张牌</b> → <b>②打出一张牌并执行效果</b>。</p>
                <p style={{ margin: "0 0 16px" }}>所有打出的牌都公开摆放，用来推理对手手里可能是什么！</p>

                <div style={{ fontSize: 15, fontWeight: 700, color: "#8B1A1A", margin: "0 0 8px", padding: "6px 0", borderBottom: "1px solid rgba(139,69,19,0.12)" }}>
                  ⚡ 角色效果速查
                </div>
                <div style={{ margin: "0 0 16px" }}>
                  <p style={{ margin: "0 0 4px" }}>⚔️ <b>卫兵(1)</b>：猜对手的牌（不能猜卫兵），猜中则对手<b>出局</b>。</p>
                  <p style={{ margin: "0 0 4px" }}>📿 <b>牧师(2)</b>：秘密查看对手的手牌——信息就是武器！</p>
                  <p style={{ margin: "0 0 4px" }}>🎖️ <b>男爵(3)</b>：与对手比手牌点数，小的<b>出局</b>（平局无事）。</p>
                  <p style={{ margin: "0 0 4px" }}>🛡️ <b>侍女(4)</b>：获得保护，直到下回合开始前无人能动你。</p>
                  <p style={{ margin: "0 0 4px" }}>👑 <b>王子(5)</b>：选一人（可选自己）弃牌重抽。弃掉公主则出局！</p>
                  <p style={{ margin: "0 0 4px" }}>🤴 <b>国王(6)</b>：与对手交换手牌，攻守逆转。</p>
                  <p style={{ margin: "0 0 4px" }}>💃 <b>伯爵夫人(7)</b>：无效果。但手里同时有王子/国王时<b>必须打出</b>她。也可以主动打出来虚张声势！</p>
                  <p style={{ margin: "0 0 4px" }}>👸 <b>公主(8)</b>：点数最高，但被打出或弃掉就<b>直接出局</b>！</p>
                </div>

                <div style={{ fontSize: 15, fontWeight: 700, color: "#8B1A1A", margin: "0 0 8px", padding: "6px 0", borderBottom: "1px solid rgba(139,69,19,0.12)" }}>
                  🏆 一局怎么结束？
                </div>
                <p style={{ margin: "0 0 4px" }}>① 对手被淘汰 → 你赢！</p>
                <p style={{ margin: "0 0 12px" }}>② 牌堆抽空 → 双方亮手牌，<b>点数大的赢</b>。点数相同则比弃牌总点数。</p>

                <div style={{
                  background: "rgba(139,69,19,0.06)", borderRadius: 10,
                  padding: "12px 14px", textAlign: "center",
                  border: "1px dashed rgba(139,69,19,0.2)",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#8B4513", marginBottom: 4 }}>💡 核心技巧</div>
                  <div style={{ fontSize: 13, color: "#8B7355", lineHeight: 1.8 }}>
                    记住场上出过的牌 → 排除法缩小猜测范围<br/>
                    牧师看到的信息可以配合卫兵精准狙杀<br/>
                    主动打出伯爵夫人可以迷惑对手<br/>
                    拿到公主要低调，别被王子点名！
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "center", marginTop: 20 }}>
                <button onClick={() => setShowTutorial(false)} style={{
                  ...btnStyle, fontSize: 16, padding: "12px 36px",
                }}>
                  我学会了！
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #FDF5E6, #FAEBD7, #F5DEB3)",
      fontFamily: "'Georgia', 'Noto Serif SC', serif",
      padding: "12px 12px",
      maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column",
    }}>
      {renderScoreboard()}
      {renderAiArea()}
      {renderFaceUp()}
      {renderAction()}
      {renderPlayerArea()}
      <div style={{ marginTop: 10 }}>
        {renderLog()}
      </div>

      {/* Card reference */}
      <details style={{ marginTop: 12, fontSize: 12, color: "#8B7355" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>📖 卡牌参考</summary>
        <div style={{
          marginTop: 6, padding: "8px 10px",
          background: "rgba(139,69,19,0.04)", borderRadius: 8,
          lineHeight: 1.8,
        }}>
          {CARD_DEFS.map(c => (
            <div key={c.value}>
              {c.emoji} <b>{c.name}</b>({c.value}) ×{c.count}：{c.desc}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
