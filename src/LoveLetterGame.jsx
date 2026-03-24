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
    aiKnowsPlayerCard: null,         // AI memory: card seen via Priest
    playerPlayedCountessRecently: false, // Track Countess bluff inference
  };
}

// ═══════════════════════════════════════════════════
// ADVANCED AI BRAIN — Full strategic engine
// ═══════════════════════════════════════════════════

// --- Card counting & probability ---

function getPlayerPossibleCards(st) {
  // Build full deck, remove all known cards (faceUp, played, AI hand)
  const all = [];
  CARD_DEFS.forEach(c => { for (let i = 0; i < c.count; i++) all.push(c.value); });
  const known = [...st.faceUp, ...st.playerPlayed, ...st.aiPlayed, ...st.aiHand];
  const pool = [...all];
  known.forEach(v => {
    const idx = pool.indexOf(v);
    if (idx !== -1) pool.splice(idx, 1);
  });
  // pool = cards that could be in: player hand, deck, or hidden card
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

// --- Smart Guard guess ---
function aiGuessCard(st) {
  const probs = getCardProbabilities(st);

  // If AI saw player's card via Priest and it hasn't changed, snipe it
  if (st.aiKnowsPlayerCard && st.aiKnowsPlayerCard !== 1) {
    // Verify it's still possible
    if (probs[st.aiKnowsPlayerCard] > 0) {
      return st.aiKnowsPlayerCard;
    }
  }

  // Inference: if player played Countess voluntarily, they likely have King(6)/Prince(5)/Princess(8)
  if (st.playerPlayedCountessRecently) {
    const suspects = [5, 6, 8].filter(v => probs[v] > 0);
    if (suspects.length > 0) {
      // Princess is highest value target
      if (probs[8] > 0) return 8;
      if (probs[6] > 0) return 6;
      if (probs[5] > 0) return 5;
    }
  }

  // Remove Guard (can't guess 1), build weighted candidates
  const candidates = Object.entries(probs).filter(([v]) => parseInt(v) !== 1);
  if (candidates.length === 0) return 2;

  const phase = getGamePhase(st);

  // Late game: higher value cards are more dangerous, weight them up
  if (phase === "late") {
    // If only 1 possible card, guaranteed hit
    const pool = getPlayerPossibleCards(st);
    const nonGuard = pool.filter(v => v !== 1);
    if (nonGuard.length > 0 && nonGuard.every(v => v === nonGuard[0])) {
      return nonGuard[0]; // 100% certain!
    }
    // Weight higher cards more (they're more threatening in endgame)
    let best = null, bestScore = -1;
    for (const [v, p] of candidates) {
      const val = parseInt(v);
      const score = p * (1 + val * 0.15); // bias toward high cards
      if (score > bestScore) { bestScore = score; best = val; }
    }
    return best || 2;
  }

  // Early/mid: guess the most probable card
  // Prefer cards with 2 copies (2,3,4,5) as they're more likely to be held
  let best = null, bestProb = -1;
  for (const [v, p] of candidates) {
    const val = parseInt(v);
    // Slight bonus for mid-range cards that people tend to hold
    const bonus = (val >= 2 && val <= 4) ? 0.05 : 0;
    const score = p + bonus;
    if (score > bestProb) { bestProb = score; best = val; }
  }

  // Add some unpredictability (10% chance to pick a random valid guess)
  if (Math.random() < 0.1) {
    const validGuesses = candidates.map(([v]) => parseInt(v));
    return validGuesses[Math.floor(Math.random() * validGuesses.length)];
  }

  return best || 2;
}

// --- Inference engine: deduce from player behavior ---
function inferFromPlayerPlays(st) {
  const hints = { likelyHigh: false, likelyPrincess: false, suspectCards: [] };

  const lastPlay = st.playerPlayed.length > 0 ? st.playerPlayed[st.playerPlayed.length - 1] : null;

  // If player played Countess, they might have King/Prince/Princess
  if (lastPlay === 7) {
    hints.likelyHigh = true;
    // Check if King/Prince forced it or it was voluntary
    const probs = getCardProbabilities(st);
    if (probs[5] > 0 || probs[6] > 0) hints.suspectCards.push(5, 6);
    if (probs[8] > 0) { hints.likelyPrincess = true; hints.suspectCards.push(8); }
  }

  // If player played Handmaid, they're likely protecting a high card
  if (lastPlay === 4) {
    hints.likelyHigh = true;
  }

  // If player played Baron and won (AI is still alive so it was a tie or player won vs someone else)
  // In 2p if Baron was played and both alive => tie, meaning same card value
  if (lastPlay === 3 && st.playerAlive && st.aiAlive) {
    // Player kept their card after Baron - they had a high card if they chose to Baron
    hints.likelyHigh = true;
  }

  return hints;
}

// --- Main AI decision engine ---
function aiDecide(st) {
  const hand = [...st.aiHand]; // 2 cards after drawing
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

  // ═══ FORCED RULES ═══

  // Must play Countess if paired with King or Prince
  if (a === 7 && (b === 5 || b === 6)) return { play: 7, keep: b };
  if (b === 7 && (a === 5 || a === 6)) return { play: 7, keep: a };

  // Never play Princess (instant loss)
  if (a === 8) return { play: b, keep: a };
  if (b === 8) return { play: a, keep: b };

  // ═══ COUNTESS BLUFF ═══
  // If we have Countess + a low card (not King/Prince), sometimes bluff
  if (has(7)) {
    const companion = other(7);
    // Bluff: play Countess to make opponent think we have King/Prince
    // More likely to bluff in early game, less in late game
    if (companion <= 4) {
      const bluffChance = phase === "early" ? 0.45 : phase === "mid" ? 0.3 : 0.15;
      if (Math.random() < bluffChance) {
        return playCard(7); // Strategic bluff!
      }
    }
    // If companion is low and opponent not protected, Countess is dead weight
    if (companion <= 2 && phase === "late") {
      return playCard(7);
    }
  }

  // ═══ KNOWN CARD EXPLOITATION ═══
  // If we know player's card (from Priest), exploit it
  if (st.aiKnowsPlayerCard && !opponentProtected) {
    const knownCard = st.aiKnowsPlayerCard;

    // Guard: snipe them if we know their card
    if (has(1) && knownCard !== 1) {
      return playCard(1); // Will guess their exact card
    }

    // Baron: compare if we'll win
    if (has(3)) {
      const keepCard = other(3);
      if (keepCard > knownCard) return playCard(3); // Guaranteed win
    }

    // King: swap if they have a better card
    if (has(6)) {
      const keepCard = other(6);
      if (knownCard > keepCard && knownCard !== 8) return playCard(6);
    }

    // Prince: force them to discard Princess
    if (has(5) && knownCard === 8) {
      return playCard(5); // Kills Princess holder!
    }
  }

  // ═══ STRATEGIC PLAYS BY PHASE ═══

  if (phase === "early") {
    // Early game: gather info, play low, protect high cards

    // Handmaid + high card => protect immediately
    if (has(4) && Math.max(a, b) >= 6) return playCard(4);

    // Priest: gather intelligence (prefer over Guard early)
    if (has(2) && !opponentProtected) return playCard(2);

    // Guard: use for info gathering, guess common cards
    if (has(1) && !opponentProtected) return playCard(1);

    // Handmaid: always decent to play early
    if (has(4)) return playCard(4);

    // Default: play lower card to keep higher for endgame
    return a <= b ? { play: a, keep: b } : { play: b, keep: a };
  }

  if (phase === "mid") {
    // Mid game: start using deduction for targeted attacks

    // Handmaid + Princess/Countess => protect
    if (has(4) && (has(8) || Math.max(a, b) >= 7)) return playCard(4);

    // Baron with high card (5+) => assassinate
    if (has(3) && !opponentProtected) {
      const keepCard = other(3);
      if (keepCard >= 5) return playCard(3);
      // Even with 4, Baron is okay mid-game (likely beats Guard/Priest)
      if (keepCard >= 4 && Math.random() < 0.5) return playCard(3);
    }

    // Guard: targeted guess based on card counting
    if (has(1) && !opponentProtected) return playCard(1);

    // Prince: if we suspect opponent has Princess
    if (has(5) && !opponentProtected && hints.likelyPrincess) {
      return playCard(5);
    }

    // King: swap if holding low card and suspect opponent has high
    if (has(6) && !opponentProtected) {
      const keepCard = other(6);
      if (keepCard <= 2 && hints.likelyHigh) return playCard(6);
    }

    // Priest for info
    if (has(2) && !opponentProtected) return playCard(2);

    // Handmaid as safe play
    if (has(4)) return playCard(4);

    // Default: play lower
    return a <= b ? { play: a, keep: b } : { play: b, keep: a };
  }

  // ═══ LATE GAME (deck ≤ 2) ═══
  // Priority: keep highest card for final showdown

  // Handmaid: excellent late game protection
  if (has(4) && Math.max(a, b) >= 5) return playCard(4);

  // Baron with very high card => attempt knockout
  if (has(3) && !opponentProtected) {
    const keepCard = other(3);
    if (keepCard >= 6) return playCard(3); // Very likely to win
    if (keepCard >= 5) {
      // Good odds, go for it
      if (Math.random() < 0.7) return playCard(3);
    }
  }

  // Guard: last chance snipe with good intel
  if (has(1) && !opponentProtected) {
    // If we can narrow down to 1-2 possibilities, worth trying
    const possibleCards = Object.entries(probs).filter(([v, p]) => parseInt(v) !== 1 && p > 0);
    if (possibleCards.length <= 2) return playCard(1);
    // Even without perfect info, Guard is low value to keep
    return playCard(1);
  }

  // Prince on self: if holding a very low card (1-2), discard and redraw for better endgame card
  if (has(5)) {
    const keepCard = other(5);
    if (!opponentProtected && hints.likelyPrincess) {
      return playCard(5); // Target opponent to kill Princess
    }
    // Self-prince if our keep card is very low
    if (keepCard <= 2) {
      // Will use on self to get a better card
      return playCard(5);
    }
  }

  // King: swap if we have low and opponent likely has high
  if (has(6) && !opponentProtected) {
    const keepCard = other(6);
    if (keepCard <= 3 && hints.likelyHigh) return playCard(6);
    // Late game King with low card is risky to keep, play it
    if (keepCard <= 2) return playCard(6);
  }

  // Priest: low value late game, play it to keep higher card
  if (has(2)) return playCard(2);

  // Handmaid: safe play
  if (has(4)) return playCard(4);

  // Default: play lower card to keep higher for showdown
  return a <= b ? { play: a, keep: b } : { play: b, keep: a };
}

const TOKENS_TO_WIN = 7; // 2-player

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
  const [aiAction, setAiAction] = useState(null); // { step, card, text, subtext }
  const logRef = useRef(null);

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
      setAiAction({ step: "draw", text: "AI正在抽牌..." });
      setTimeout(() => aiStep_draw(r), 1000);
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
      addLog(`🎉 你赢得了这一局！(${newT}/${TOKENS_TO_WIN})`);
      if (newT >= TOKENS_TO_WIN) {
        addLog("🏆 恭喜你赢得了整场游戏！");
        setPhase("gameOver");
        return;
      }
    } else if (winner === "ai") {
      const newT = aiTokens + 1;
      setAiTokens(newT);
      addLog(`😈 AI赢得了这一局！(${newT}/${TOKENS_TO_WIN})`);
      if (newT >= TOKENS_TO_WIN) {
        addLog("💀 AI赢得了整场游戏...");
        setPhase("gameOver");
        return;
      }
    } else {
      addLog("平局！无人获得图钉。");
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

    // Check Countess forced
    const hand = [...newRound.playerHand];
    const hasCountess = hand.includes(7);
    const hasKingOrPrince = hand.includes(5) || hand.includes(6);
    if (hasCountess && hasKingOrPrince) {
      addLog("⚠️ 你持有伯爵夫人和国王/王子，必须打出伯爵夫人！");
      // Force play countess
      setTimeout(() => {
        resolvePlayerCard(7, newRound);
      }, 800);
      return;
    }

    setPhase("playerPlay");
  }

  // Check if all opponents protected (in 2p, just AI)
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

    // ── AI Knowledge Tracking ──
    // If player played the card AI knew about, AI loses knowledge
    if (newRound.aiKnowsPlayerCard === cardVal) {
      newRound.aiKnowsPlayerCard = null;
    }
    // Track Countess play for inference
    newRound.playerPlayedCountessRecently = (cardVal === 7);

    // Princess
    if (cardVal === 8) {
      addLog("💀 你打出了公主，直接出局！");
      newRound.playerAlive = false;
      setRound(newRound);
      handleRoundEnd("ai", newRound);
      return;
    }

    // Countess, Handmaid
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

    // Cards needing target
    if (isOpponentProtected(r) && cardVal !== 5) {
      addLog("AI受到侍女保护，效果无法生效。");
      setRound(newRound);
      setSelectedCard(null);
      proceedToNextTurn(newRound, "player");
      return;
    }

    if (cardVal === 5) {
      // Prince: need to choose target
      setRound(newRound);
      setSelectedCard(5);
      if (isOpponentProtected(r)) {
        // Must target self
        addLog("AI受到保护，只能对自己使用王子。");
        resolvePrince(newRound, "player");
        return;
      }
      setPhase("princeChoice");
      return;
    }

    if (cardVal === 1) {
      // Guard: need guess
      setRound(newRound);
      setSelectedCard(1);
      setPhase("guardGuess");
      return;
    }

    // Auto-target opponent
    if (cardVal === 2) {
      // Priest: see AI hand
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
      // Baron: compare
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
      // King: swap — AI knows what card the player now holds (it was AI's card)
      const temp = [...newRound.playerHand];
      newRound.playerHand = [...newRound.aiHand];
      newRound.aiHand = temp;
      newRound.aiKnowsPlayerCard = newRound.playerHand[0]; // AI knows its old card
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
      r.aiKnowsPlayerCard = null; // Player got new card, AI loses knowledge
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
        setAiAction({ step: "draw", text: "AI正在抽牌..." });
        aiStep_draw(r);
      }, 800);
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
      setAiAction({ step: "think", text: "AI正在思考策略..." });
      setTimeout(() => aiStep_play(r), 1000);
    }, 800);
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
    setAiAction({ step: "play", card: playVal, text: `AI打出了 ${def.emoji}${def.name}(${playVal})` });
    addLog(`AI打出了 ${def.emoji}${def.name}(${playVal})`);
    setRound(r);

    setTimeout(() => aiStep_resolve(r, playVal), 1200);
  }

  function aiStep_resolve(r, playVal) {
    // Princess
    if (playVal === 8) {
      addLog("AI打出了公主，AI出局！");
      r.aiAlive = false;
      setAiAction({ step: "effect", card: 8, text: "💀 AI打出了公主，直接出局！" });
      setRound(r);
      setTimeout(() => handleRoundEnd("player", r), 1500);
      return;
    }

    // Countess - no effect, auto-proceed
    if (playVal === 7) {
      addLog("伯爵夫人没有特殊效果。");
      setAiAction({ step: "effect", card: 7, text: "伯爵夫人没有特殊效果", subtext: "🤔 AI为什么要主动打出她...?" });
      setRound(r);
      setTimeout(() => proceedToNextTurn(r, "ai"), 2000);
      return;
    }

    // Handmaid - auto-proceed
    if (playVal === 4) {
      r.aiProtected = true;
      addLog("🛡️ AI获得了保护！");
      setAiAction({ step: "effect", card: 4, text: "🛡️ AI获得了保护！", subtext: "直到AI的下一回合，你无法指定AI为目标" });
      setRound(r);
      setTimeout(() => proceedToNextTurn(r, "ai"), 2000);
      return;
    }

    // Target blocked by Handmaid
    if (r.playerProtected && playVal !== 5) {
      addLog("你受到侍女保护，AI的效果无法对你生效。");
      setAiAction({ step: "effect", card: playVal, text: "效果被侍女挡住了！", subtext: "你的保护让AI的行动落空" });
      setRound(r);
      setTimeout(() => proceedToNextTurn(r, "ai"), 2000);
      return;
    }

    // Guard - show guess result with continue button
    if (playVal === 1) {
      const guess = aiGuessCard(r);
      const gDef = getCardDef(guess);
      const usedIntel = r.aiKnowsPlayerCard && r.aiKnowsPlayerCard === guess;
      addLog(`AI猜测你持有 ${gDef.emoji}${gDef.name}(${guess})${usedIntel ? " 🧠" : ""}`);
      const correct = r.playerHand[0] === guess;
      if (correct) {
        addLog(`🎯 AI猜中了！你出局！${usedIntel ? "（AI利用了之前获取的情报！）" : ""}`);
        r.playerAlive = false;
      } else {
        addLog("AI没猜中。");
        r.aiKnowsPlayerCard = null;
      }
      setRound(r);
      setRevealInfo({ type: "aiGuard", correct, guess, usedIntel });
      setAiAction(null);
      if (correct) {
        setPhase("showResult");
      } else {
        setPhase("showResult");
      }
      return;
    }

    // Priest - show "AI saw your card" with continue
    if (playVal === 2) {
      r.aiKnowsPlayerCard = r.playerHand[0];
      addLog(`AI查看了你的手牌。（AI现在知道你持有什么牌了！）`);
      setRound(r);
      setRevealInfo({ type: "aiPriest" });
      setAiAction(null);
      setPhase("showResult");
      return;
    }

    // Baron - show comparison with continue
    if (playVal === 3) {
      const aiCard = r.aiHand[0];
      const playerCard = r.playerHand[0];
      const pDef = getCardDef(playerCard);
      const aDef = getCardDef(aiCard);
      addLog(`⚖️ 男爵比较：你 ${pDef.emoji}(${playerCard}) vs AI ${aDef.emoji}(${aiCard})`);
      if (aiCard > playerCard) {
        addLog("你的牌更小，你出局！");
        r.playerAlive = false;
      } else if (aiCard < playerCard) {
        addLog("AI的牌更小，AI出局！");
        r.aiAlive = false;
      } else {
        addLog("平局，无事发生。");
      }
      setRound(r);
      setRevealInfo({ type: "aiBaron", playerCard, aiCard });
      setAiAction(null);
      const w = checkRoundEnd(r);
      if (w) { handleRoundEnd(w, r); return; }
      setPhase("showResult");
      return;
    }

    // Prince - show result with continue
    if (playVal === 5) {
      const aiKeepCard = r.aiHand[0];
      const gamePhase = getGamePhase(r);
      const hints = inferFromPlayerPlays(r);
      let targetSelf = false;

      if (r.playerProtected) {
        targetSelf = true;
        addLog("你受到保护，AI对自己使用王子。");
      } else if (r.aiKnowsPlayerCard === 8 || hints.likelyPrincess) {
        targetSelf = false;
        addLog("AI对你使用了王子！");
      } else if (gamePhase === "late" && aiKeepCard <= 2 && r.deck.length > 0) {
        targetSelf = true;
        addLog("AI对自己使用了王子，试图换一张更好的牌！");
      } else {
        targetSelf = false;
        addLog("AI对你使用了王子！");
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
        addLog(`你被迫弃掉了 ${dDef.emoji}${dDef.name}(${disc})`);
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

    // King - show swap with continue
    if (playVal === 6) {
      if (r.playerProtected) {
        addLog("你受到保护，国王效果无法生效。");
        setAiAction({ step: "effect", card: 6, text: "效果被侍女挡住了！" });
        setRound(r);
        setTimeout(() => proceedToNextTurn(r, "ai"), 2000);
      } else {
        const temp = [...r.playerHand];
        r.playerHand = [...r.aiHand];
        r.aiHand = temp;
        r.aiKnowsPlayerCard = r.playerHand[0];
        addLog("🔄 AI与你交换了手牌！");
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
          😈 AI {round.aiProtected && "🛡️"} {!round.aiAlive && "💀"}
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

    // Check Countess forced
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
              😈 AI的行动结果
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
              <div style={{ ...titleStyle, color: "#8B1A1A" }}>⚔️ AI使用卫兵猜测你的手牌</div>
              <div style={{ fontSize: 14, color: "#5C3317", marginBottom: 8 }}>
                AI猜你持有：{getCardDef(revealInfo.guess)?.emoji} {getCardDef(revealInfo.guess)?.name}({revealInfo.guess})
                {revealInfo.usedIntel && <span style={{ color: "#8B1A1A" }}> 🧠 情报狙杀</span>}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: revealInfo.correct ? "#8B1A1A" : "#2E5A2E" }}>
                {revealInfo.correct ? "🎯 猜中了！你出局！" : "❌ 没猜中，你安全了"}
              </div>
            </div>
          )}

          {revealInfo?.type === "aiBaron" && (
            <div>
              <div style={{ ...titleStyle, color: "#8B1A1A", marginBottom: 10 }}>🎖️ AI发起了男爵比较</div>
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
                {revealInfo.playerCard > revealInfo.aiCard ? "你赢了！AI出局！" :
                 revealInfo.playerCard < revealInfo.aiCard ? "AI赢了！你出局！" : "平局！无事发生"}
              </div>
            </div>
          )}

          {revealInfo?.type === "aiPriest" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B1A1A" }}>📿 AI使用牧师查看了你的手牌</div>
              <div style={{ fontSize: 14, color: "#5C3317" }}>⚠️ AI现在知道你持有什么牌了！</div>
              <div style={{ fontSize: 13, color: "#8B7355", marginTop: 4, fontStyle: "italic" }}>
                小心：AI下次可能会用卫兵精准猜中你
              </div>
            </div>
          )}

          {revealInfo?.type === "aiPrinceSelf" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B1A1A" }}>👑 AI对自己使用了王子</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "#5C3317" }}>弃掉了：</span>
                <Card value={revealInfo.discarded} small />
              </div>
              {revealInfo.died ? (
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2E5A2E" }}>💀 AI弃掉了公主，出局！</div>
              ) : (
                <div style={{ fontSize: 13, color: "#8B7355" }}>AI重新抽了一张牌</div>
              )}
            </div>
          )}

          {revealInfo?.type === "aiPrincePlayer" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B1A1A" }}>👑 AI对你使用了王子！</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "#5C3317" }}>你被迫弃掉了：</span>
                <Card value={revealInfo.discarded} small />
              </div>
              {revealInfo.died ? (
                <div style={{ fontSize: 15, fontWeight: 700, color: "#8B1A1A" }}>💀 你弃掉了公主，出局！</div>
              ) : (
                <div style={{ fontSize: 13, color: "#2E5A2E" }}>你重新抽了一张新牌</div>
              )}
            </div>
          )}

          {revealInfo?.type === "aiKing" && (
            <div style={boxStyle}>
              <div style={{ ...titleStyle, color: "#8B1A1A" }}>🤴 AI使用国王与你交换了手牌！</div>
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
              😈 AI的回合...
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
            {playerTokens >= TOKENS_TO_WIN ? "🏆 你赢了！" : "💀 AI获胜..."}
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

  // Menu screen
  if (phase === "menu") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(160deg, #FDF5E6, #FAEBD7, #F5DEB3)",
        fontFamily: "'Georgia', 'Noto Serif SC', serif",
      }}>
        <div style={{
          textAlign: "center", padding: "40px 32px",
          background: "rgba(255,255,255,0.5)", borderRadius: 20,
          border: "2px solid rgba(139,69,19,0.15)",
          boxShadow: "0 8px 32px rgba(139,69,19,0.1)",
          maxWidth: 380,
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
            fontSize: 13, color: "#8B7355", margin: "16px 0 24px",
            lineHeight: 1.8, textAlign: "left", padding: "0 8px",
          }}>
            将你的情书送到公主手中！<br/>
            2人对战，先获得 <b>{TOKENS_TO_WIN}</b> 个好感图钉的玩家获胜。<br/>
            <span style={{fontSize: 12, color: "#8B1A1A"}}>🧠 高级AI：记牌算率 · 牧师情报利用 · 伯爵夫人诈唬 · 分阶段战术</span>
          </div>
          <button onClick={startGame} style={{
            ...btnStyle, fontSize: 18, padding: "14px 40px",
          }}>
            开始游戏
          </button>
        </div>
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
