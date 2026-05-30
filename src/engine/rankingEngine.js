/**
 * DIMA TRADING OS — RANKING + ELO CALIBRATION ENGINE
 * VERSION 1.0
 * =====================================================
 *
 * Two-phase system:
 *   Phase 1: Initial Calibration  → sets starting ELO from trade history
 *   Phase 2: Live ELO Tracking    → per-trade scoring after calibration
 */

// ── RANK DEFINITIONS ────────────────────────────────────────────────────────
// Score thresholds (calibration, 0-100)
// ELO floors (live tracking start point per rank)
export const RANK_DEFS = [
  { name:'Bronze',       img:'ranks/rank_bronze.png',   color:'#cd7f32', scoreMin:0,  scoreMax:20,  elo:500  },
  { name:'Silver',       img:'ranks/rank_silver.png',   color:'#a8b0b8', scoreMin:21, scoreMax:35,  elo:1000 },
  { name:'Gold',         img:'ranks/rank_gold.png',     color:'#d4a520', scoreMin:36, scoreMax:50,  elo:1500 },
  { name:'Platinum',     img:'ranks/rank_platinum.png', color:'#4ade80', scoreMin:51, scoreMax:65,  elo:2200 },
  { name:'Diamond',      img:'ranks/rank_diamond.png',  color:'#60a5fa', scoreMin:66, scoreMax:80,  elo:3000 },
  { name:'Elite',        img:'ranks/rank_elite.png',    color:'#a855f7', scoreMin:81, scoreMax:90,  elo:4000 },
  { name:'Master Trader',img:'ranks/rank_master.png',   color:'#f85149', scoreMin:91, scoreMax:100, elo:5000 },
];

// ELO bands for live tracking (starts at calibration ELO, moves up/down)
export const ELO_BANDS = [
  { name:'Bronze',       img:'ranks/rank_bronze.png',   color:'#cd7f32', min:0,    max:999   },
  { name:'Silver',       img:'ranks/rank_silver.png',   color:'#a8b0b8', min:1000, max:1499  },
  { name:'Gold',         img:'ranks/rank_gold.png',     color:'#d4a520', min:1500, max:2199  },
  { name:'Platinum',     img:'ranks/rank_platinum.png', color:'#4ade80', min:2200, max:2999  },
  { name:'Diamond',      img:'ranks/rank_diamond.png',  color:'#60a5fa', min:3000, max:3999  },
  { name:'Elite',        img:'ranks/rank_elite.png',    color:'#a855f7', min:4000, max:4999  },
  { name:'Master Trader',img:'ranks/rank_master.png',   color:'#f85149', min:5000, max:Infinity },
];

// ── EMOTIONAL DETECTION ──────────────────────────────────────────────────────
const EMOTIONAL_PATTERNS = new Set([
  'Emotional Buy','FOMO Entry','Averaging Down','No Clear Reason',
  'No Pattern','','Revenge Trade',
]);

/** Detect emotional trade — ONE violation = emotional */
export function detectEmotional(trade) {
  if (trade.emotional === true) return true;
  if (EMOTIONAL_PATTERNS.has(trade.pattern)) return true;
  if (trade.stop != null && trade.stop <= 0) return true;  // no stop defined
  return false;
}

// ── R CALCULATION ────────────────────────────────────────────────────────────
/**
 * Calculate R multiple.
 * R = (exit − entry) / |entry − stop|
 * Positive = gain in R, Negative = loss in R
 */
export function calculateR(entry, stop, exit) {
  if (!entry || !stop || !exit || stop <= 0) return null;
  const risk = Math.abs(entry - stop);
  if (risk < 0.001) return null;
  return parseFloat(((exit - entry) / risk).toFixed(2));
}

/** Estimate R using 4% assumed stop when stop is not recorded */
function estimateR(trade) {
  if (!trade.entry || !trade.exit) {
    return trade.pnl >= 0 ? 1.0 : -1.0;
  }
  const pctMove = (trade.exit - trade.entry) / trade.entry;
  const assumedStopPct = 0.04;
  return parseFloat((pctMove / assumedStopPct).toFixed(2));
}

/** Get R for a trade — uses real stop if available, estimates otherwise */
export function getTradeR(trade) {
  if (trade.entry && trade.stop && trade.stop > 0 && trade.exit) {
    const r = calculateR(trade.entry, trade.stop, trade.exit);
    if (r !== null) return r;
  }
  return estimateR(trade);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — CALIBRATION COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PERFORMANCE SCORE (Weight 40%)
 * Based on total R generated across all trades.
 *
 * Scoring table:
 *   ≤ -10R → 0
 *    0R    → 50
 *   +10R   → 75
 *   +20R   → 90
 *   +30R+  → 100
 */
export function calculatePerformanceScore(trades) {
  const totalR = trades.reduce((sum, t) => sum + getTradeR(t), 0);

  const curve = [
    { r: -10, score: 0  },
    { r:   0, score: 50 },
    { r:  10, score: 75 },
    { r:  20, score: 90 },
    { r:  30, score: 100},
  ];

  if (totalR <= curve[0].r) return 0;
  if (totalR >= curve[curve.length-1].r) return 100;

  for (let i = 1; i < curve.length; i++) {
    if (totalR <= curve[i].r) {
      const { r: r0, score: s0 } = curve[i-1];
      const { r: r1, score: s1 } = curve[i];
      const t = (totalR - r0) / (r1 - r0);
      return Math.round(s0 + t * (s1 - s0));
    }
  }
  return 100;
}

/**
 * DISCIPLINE SCORE (Weight 25%)
 * Based on % of technical (non-emotional) trades.
 *
 *   100% technical → 100
 *   Every 10% loss → -10 points
 *   Below 50% → 0 (Fail)
 */
export function calculateDisciplineScore(trades) {
  if (!trades.length) return 50;
  const emotional = trades.filter(t => detectEmotional(t)).length;
  const technicalPct = ((trades.length - emotional) / trades.length) * 100;
  if (technicalPct < 50) return 0;
  return Math.round(technicalPct);
}

/**
 * CONSISTENCY SCORE (Weight 20%)
 * Rewards repeatable R outcomes, penalizes random swings.
 * Uses standard deviation of R values.
 *
 *   std dev ≤ 0.8  → 100 (Very Stable)
 *   std dev ≤ 1.5  → 80  (Stable)
 *   std dev ≤ 2.2  → 60  (Average)
 *   std dev ≤ 3.5  → 40  (Volatile)
 *   std dev > 3.5  → 20  (Chaotic)
 */
export function calculateConsistencyScore(trades) {
  if (trades.length < 3) return 60;  // not enough data
  const rValues = trades.map(t => getTradeR(t));
  const mean = rValues.reduce((s, r) => s + r, 0) / rValues.length;
  const variance = rValues.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rValues.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev <= 0.8) return 100;
  if (stdDev <= 1.5) return 80;
  if (stdDev <= 2.2) return 60;
  if (stdDev <= 3.5) return 40;
  return 20;
}

/**
 * DRAWDOWN SCORE (Weight 15%)
 * Measures capital protection via max drawdown in R units.
 *
 *   0R drawdown  → 100
 *  -5R drawdown  → 80
 * -10R drawdown  → 60
 * -15R drawdown  → 40
 * -20R drawdown  → 20
 *  < -20R        → 0
 */
export function calculateDrawdownScore(trades) {
  let peak = 0, cumR = 0, maxDD = 0;
  for (const t of trades) {
    cumR += getTradeR(t);
    if (cumR > peak) peak = cumR;
    const dd = cumR - peak;
    if (dd < maxDD) maxDD = dd;  // maxDD is negative
  }

  const curve = [
    { dd:   0, score: 100 },
    { dd:  -5, score:  80 },
    { dd: -10, score:  60 },
    { dd: -15, score:  40 },
    { dd: -20, score:  20 },
  ];

  if (maxDD >= curve[0].dd) return 100;
  if (maxDD <= curve[curve.length-1].dd) return 0;

  for (let i = 1; i < curve.length; i++) {
    if (maxDD >= curve[i].dd) {
      const { dd: d0, score: s0 } = curve[i-1];
      const { dd: d1, score: s1 } = curve[i];
      const t = (maxDD - d0) / (d1 - d0);
      return Math.round(s0 + t * (s1 - s0));
    }
  }
  return 0;
}

/**
 * CONFIDENCE LEVEL based on trade count.
 *   0-10   → Low
 *   11-25  → Medium
 *   26-100 → High
 *   100+   → Verified
 */
export function getConfidence(tradeCount) {
  if (tradeCount <= 10)  return 'Low';
  if (tradeCount <= 25)  return 'Medium';
  if (tradeCount <= 100) return 'High';
  return 'Verified';
}

/**
 * RANK from calibration score (0-100)
 */
export function getRankFromScore(score) {
  return RANK_DEFS.find(r => score >= r.scoreMin && score <= r.scoreMax)
      ?? RANK_DEFS[0];
}

/**
 * RANK from live ELO
 */
export function getRankFromElo(elo) {
  return ELO_BANDS.find(r => elo >= r.min && elo <= r.max)
      ?? ELO_BANDS[0];
}

/**
 * FULL CALIBRATION
 * Analyzes all trades and produces starting ELO.
 *
 * Formula:
 *   Final Score = Perf×0.40 + Disc×0.25 + Cons×0.20 + DD×0.15
 */
export function calculateCalibration(trades) {
  if (!trades || trades.length === 0) {
    return {
      tradesAnalyzed: 0,
      performance: 50, discipline: 50, consistency: 60, drawdown: 80,
      finalScore: 58,
      rank: RANK_DEFS.find(r => r.scoreMin <= 58 && r.scoreMax >= 58) ?? RANK_DEFS[2],
      startingElo: 1500,
      confidence: 'Low',
      totalR: 0, maxDrawdown: 0, technicalPct: 100,
    };
  }

  const perf  = calculatePerformanceScore(trades);
  const disc  = calculateDisciplineScore(trades);
  const cons  = calculateConsistencyScore(trades);
  const dd    = calculateDrawdownScore(trades);
  const finalScore = Math.round(perf * 0.40 + disc * 0.25 + cons * 0.20 + dd * 0.15);
  const rank  = getRankFromScore(finalScore);

  // Supporting metrics
  const totalR = parseFloat(trades.reduce((s, t) => s + getTradeR(t), 0).toFixed(2));
  let peak = 0, cumR2 = 0, maxDD2 = 0;
  for (const t of trades) { cumR2 += getTradeR(t); if (cumR2 > peak) peak = cumR2; const d = cumR2 - peak; if (d < maxDD2) maxDD2 = d; }
  const emotional = trades.filter(t => detectEmotional(t)).length;
  const technicalPct = trades.length ? ((trades.length - emotional) / trades.length) * 100 : 100;

  return {
    tradesAnalyzed: trades.length,
    performance:    perf,
    discipline:     disc,
    consistency:    cons,
    drawdown:       dd,
    finalScore,
    rank,
    startingElo:    rank.elo,
    confidence:     getConfidence(trades.length),
    totalR,
    maxDrawdown:    parseFloat(maxDD2.toFixed(2)),
    technicalPct:   parseFloat(technicalPct.toFixed(1)),
    emotionalTrades: emotional,
    calibrationDate: new Date().toISOString().split('T')[0],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — LIVE ELO ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LIVE TRADE SCORE
 * Formula: (R × 100) + Execution Bonus − Emotional Penalty
 *
 *   Execution: followedPlan +10, perfectEntry +10, cleanExit +5 → max +25
 *   Emotional: -150 flat, no exceptions
 */
export function calculateTradeScore(trade) {
  const isEmotional = detectEmotional(trade);
  const r = getTradeR(trade);
  const perfScore = Math.max(-300, Math.min(300, Math.round(r * 100)));
  const exec = trade.execution || {};
  const execBonus = (exec.followedPlan ? 10 : 0) + (exec.perfectEntry ? 10 : 0) + (exec.cleanExit ? 5 : 0);
  const emoPenalty = isEmotional ? 150 : 0;
  const total = perfScore + execBonus - emoPenalty;

  return { total, perfScore, execBonus, emoPenalty, r: parseFloat(r.toFixed(2)), isEmotional };
}

/**
 * UPDATE ELO with a new trade score.
 * Returns new ELO (never goes below 0).
 */
export function updateElo(currentElo, tradeScore) {
  return Math.max(0, currentElo + tradeScore);
}

/**
 * PROMOTION CHECK
 * Cannot promote on ELO alone.
 * Requires: ELO threshold + last 20 trades ≥70% technical + avg R ≥0
 */
export function checkPromotion(currentElo, trades) {
  const nextBand = ELO_BANDS.find(b => b.min > currentElo);
  if (!nextBand) return { eligible: false, reason: 'Already at maximum rank', atMax: true };

  // ELO threshold check
  if (currentElo < nextBand.min) {
    return { eligible: false, reason: `Need ${nextBand.min - currentElo} more ELO (${currentElo}/${nextBand.min})`, technicalPct: 0, avgR: 0 };
  }

  // Consistency filter: last 20 trades
  const last20 = trades.slice(-Math.min(20, trades.length));
  if (last20.length < 5) {
    return { eligible: false, reason: 'Need at least 5 trades for promotion check' };
  }
  const emotional = last20.filter(t => detectEmotional(t)).length;
  const technicalPct = ((last20.length - emotional) / last20.length) * 100;
  const avgR = last20.reduce((s, t) => s + getTradeR(t), 0) / last20.length;

  if (technicalPct < 70) {
    return { eligible: false, reason: `${technicalPct.toFixed(0)}% technical in last 20 — need 70%`, technicalPct, avgR };
  }
  if (avgR < 0) {
    return { eligible: false, reason: `Avg R is ${avgR.toFixed(2)} — need ≥0`, technicalPct, avgR };
  }

  return { eligible: true, reason: `Eligible for ${nextBand.name}`, technicalPct, avgR, nextRank: nextBand };
}

/**
 * FULL RANK REPORT
 * Generates the complete state for display.
 */
export function generateRankReport(calibration, calibrationElo, newTrades) {
  // Live ELO = calibration starting ELO + all new trade scores
  let liveElo = calibrationElo;
  const scoredTrades = newTrades.map(t => {
    const score = calculateTradeScore(t);
    liveElo = updateElo(liveElo, score.total);
    return { ...t, _score: score, _eloAfter: liveElo };
  });

  const currentRank = getRankFromElo(liveElo);
  const promotion   = checkPromotion(liveElo, newTrades);
  const eloToNext   = ELO_BANDS.find(b => b.min > liveElo);

  return {
    calibration,
    currentElo:    liveElo,
    currentRank,
    scoredNewTrades: scoredTrades,
    promotion,
    eloToNext:     eloToNext ? eloToNext.min - liveElo : null,
    nextRank:      eloToNext ?? null,
  };
}

/**
 * Points needed to reach next ELO band.
 */
export function pointsToNextRank(elo) {
  const next = ELO_BANDS.find(b => b.min > elo);
  return next ? next.min - elo : null;
}
