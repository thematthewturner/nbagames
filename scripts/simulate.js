/**
 * March Madness Monte Carlo Simulation Engine (v2)
 *
 * Win probability model uses a multi-pillar approach as recommended by research:
 *   1. Betting market implied probability (highest weight, ~35-40% when available)
 *   2. Barthag / AdjEM (opponent-adjusted efficiency, ~30%)
 *   3. NET rank + WAB (official NCAA résumé metrics, ~10%)
 *   4. Four factors: eFG%, TO%, ORB%, FTr (~10%)
 *   5. Seed historical priors (~8%)
 *   6. Context: travel, rest, coaching, experience (~7%)
 *
 * Features are computed as Team A minus Team B differences (or ratios)
 * so the model is symmetric and direction is clear.
 *
 * Logit of win probability = weighted sum of standardized features,
 * then sigmoid to get probability. Weights are pre-set based on
 * literature (not fit to a training set here, but calibrated to produce
 * reasonable outputs).
 */

'use strict';

// ─── Constants ─────────────────────────────────────────────────────────────

const REGIONS = ['East', 'West', 'South', 'Midwest'];

// Historical seed win rates in Round of 64 (from decades of tournament data)
const SEED_WIN_R64 = {
  1: 0.993, 2: 0.943, 3: 0.855, 4: 0.793,
  5: 0.657, 6: 0.631, 7: 0.601, 8: 0.490,
  9: 0.510, 10: 0.399, 11: 0.369, 12: 0.343,
  13: 0.207, 14: 0.145, 15: 0.057, 16: 0.007
};

// Historical seed matchup win rates (updated through 2025)
const SEED_MATCHUP_WIN = {
  '1-16': 0.993, '2-15': 0.943, '3-14': 0.855, '4-13': 0.793,
  '5-12': 0.657, '6-11': 0.631, '7-10': 0.601, '8-9':  0.490
};

// Tournament venue coordinates (2026)
const VENUES = {
  r64_r32: [
    { city: 'Dayton, OH',       lat: 39.758, lng: -84.192,  name: 'UD Arena' },           // First Four
    { city: 'Memphis, TN',      lat: 35.149, lng: -90.052,  name: 'FedExForum' },
    { city: 'Indianapolis, IN', lat: 39.764, lng: -86.162,  name: 'Gainbridge Fieldhouse' },
    { city: 'Seattle, WA',      lat: 47.622, lng: -122.354, name: 'Climate Pledge Arena' },
    { city: 'Albany, NY',       lat: 42.657, lng: -73.754,  name: 'MVP Arena' },
    { city: 'Denver, CO',       lat: 39.749, lng: -104.985, name: 'Ball Arena' },
    { city: 'Providence, RI',   lat: 41.826, lng: -71.395,  name: 'Amica Mutual Pavilion' },
    { city: 'Lexington, KY',    lat: 38.035, lng: -84.498,  name: 'Rupp Arena' }
  ],
  s16_e8: [
    { city: 'Boston, MA',       lat: 42.366, lng: -71.062,  name: 'TD Garden' },
    { city: 'San Francisco, CA',lat: 37.768, lng: -122.388, name: 'Chase Center' },
    { city: 'Dallas, TX',       lat: 32.790, lng: -97.095,  name: 'American Airlines Center' },
    { city: 'Indianapolis, IN', lat: 39.764, lng: -86.162,  name: 'Gainbridge Fieldhouse' }
  ],
  f4_champ: { city: 'Indianapolis, IN', lat: 39.764, lng: -86.162, name: 'Lucas Oil Stadium' }
};

// ─── Math Utilities ─────────────────────────────────────────────────────────

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function logit(p) {
  const clamped = Math.max(0.001, Math.min(0.999, p));
  return Math.log(clamped / (1 - clamped));
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

/** Haversine great-circle distance in miles */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─── Win Probability Model ──────────────────────────────────────────────────

/**
 * Compute win probability for teamA vs teamB.
 *
 * @param {object} a - Enriched team object for Team A
 * @param {object} b - Enriched team object for Team B
 * @param {object} opts - { weights, toggles, round, venue, odds }
 * @returns {{ prob: number, factors: object }} win prob for A and per-factor breakdown
 */
function calculateWinProb(a, b, opts = {}) {
  const { weights = DEFAULT_WEIGHTS, toggles = DEFAULT_TOGGLES, round = 1, venue = null, oddsWinProb = null } = opts;

  const factors = {};
  let logitSum = 0;

  // ── Pillar 1: Betting market (if available) ─────────────────────────────
  // This is the single strongest signal in the literature.
  // We only use it when odds are explicitly provided for this matchup.
  if (toggles.odds && oddsWinProb !== null) {
    const oddsLogit = logit(clamp(oddsWinProb, 0.05, 0.95));
    const contribution = oddsLogit * (weights.odds / 100) * 3.0;
    factors.odds = { value: oddsWinProb, contribution };
    logitSum += contribution;
  }

  // ── Pillar 2: Opponent-adjusted efficiency (Barthag / AdjEM) ───────────
  {
    let effContrib = 0;

    // Barthag (pythagorean win% from efficiencies) — best single number
    if (a.barthag != null && b.barthag != null) {
      const diff = clamp(a.barthag - b.barthag, -0.5, 0.5);
      // logit(Barthag) is better-behaved than raw difference
      const aLogit = logit(clamp(a.barthag, 0.05, 0.95));
      const bLogit = logit(clamp(b.barthag, 0.05, 0.95));
      effContrib = (aLogit - bLogit) * (weights.barthag / 100) * 1.5;
      factors.barthag = { a: a.barthag, b: b.barthag, diff, contribution: effContrib };
    } else if (a.adjEM != null && b.adjEM != null) {
      // Fallback to AdjEM if Barthag unavailable
      const diff = clamp(a.adjEM - b.adjEM, -30, 30);
      effContrib = diff * 0.05 * (weights.adjEM / 100) * 2.0;
      factors.adjEM = { a: a.adjEM, b: b.adjEM, diff, contribution: effContrib };
    } else if (a.seed != null && b.seed != null) {
      // Last resort: seed-based
      const key = [Math.min(a.seed, b.seed), Math.max(a.seed, b.seed)].join('-');
      const hist = SEED_MATCHUP_WIN[key] || 0.5;
      const aIsLower = a.seed <= b.seed;
      const seedProb = aIsLower ? hist : 1 - hist;
      effContrib = logit(seedProb) * (weights.barthag / 100);
      factors.seed_proxy = { a: a.seed, b: b.seed, prob: seedProb, contribution: effContrib };
    }

    logitSum += effContrib;
  }

  // ── Pillar 2b: Offensive and Defensive efficiency separately ───────────
  // Matchup advantage: A's offense vs B's defense, and vice versa
  if (toggles.fourFactors && a.adj_o != null && b.adj_d != null && a.adj_d != null && b.adj_o != null) {
    const offEdge = (a.adj_o - b.adj_d) - (b.adj_o - a.adj_d);  // A's net pts-per-100 advantage
    const contribution = offEdge * 0.005 * (weights.fourFactors / 100) * 1.0;
    factors.effMatchup = { offEdge, contribution };
    logitSum += contribution;
  }

  // ── Pillar 3: Seed historical prior ─────────────────────────────────────
  if (toggles.seedHist && a.seed != null && b.seed != null) {
    const key = [Math.min(a.seed, b.seed), Math.max(a.seed, b.seed)].join('-');
    const hist = SEED_MATCHUP_WIN[key];
    let seedProb = 0.5;
    if (hist !== undefined) {
      seedProb = a.seed <= b.seed ? hist : 1 - hist;
    } else {
      // Generic: lower seed wins more often; empirical slope
      const diff = b.seed - a.seed;
      seedProb = sigmoid(diff * 0.18);
    }
    const contribution = logit(seedProb) * (weights.seedHist / 100) * 0.8;
    factors.seedHist = { a: a.seed, b: b.seed, prob: seedProb, contribution };
    logitSum += contribution;
  }

  // ── Pillar 4: NET rank + WAB ─────────────────────────────────────────────
  if (toggles.netRank && a.net_rank != null && b.net_rank != null) {
    // NET rank: lower is better, so B - A is the advantage for A
    const maxRank = 360;
    const netDiff = clamp((b.net_rank - a.net_rank) / maxRank, -1, 1);
    const contribution = netDiff * (weights.netRank / 100) * 1.5;
    factors.netRank = { a: a.net_rank, b: b.net_rank, diff: b.net_rank - a.net_rank, contribution };
    logitSum += contribution;
  }

  if (toggles.wab && a.wab != null && b.wab != null) {
    const wabDiff = clamp((a.wab - b.wab) / 10, -1, 1);
    const contribution = wabDiff * (weights.wab / 100) * 1.0;
    factors.wab = { a: a.wab, b: b.wab, diff: a.wab - b.wab, contribution };
    logitSum += contribution;
  }

  // ── Pillar 5: Four Factors (tempo-free style rates) ──────────────────────
  if (toggles.fourFactors) {
    let ffContrib = 0;

    // eFG% advantage: A offense vs B offense (and defensive counterparts)
    if (a.efg != null && b.efg_d != null) {
      const aEdge = (a.efg - b.efg_d) * 100;  // percentage points
      const bEdge = (b.efg - a.efg_d) * 100;
      const edgeRaw = (aEdge - bEdge) * 0.02;
      ffContrib += edgeRaw;
      factors.efgEdge = { aEdge, bEdge, raw: edgeRaw };
    }

    // Turnover rate: lower is better. Positive edge means A turns it over less.
    if (a.tov != null && b.tov_d != null) {
      const aEdge = (b.tov_d - a.tov) * 100;   // A's TO advantage
      const bEdge = (a.tov_d - b.tov) * 100;
      const edgeRaw = (aEdge - bEdge) * 0.015;
      ffContrib += edgeRaw;
      factors.tovEdge = { aEdge, bEdge, raw: edgeRaw };
    }

    // ORB rate: higher is better.
    if (a.orb != null && b.drb != null) {
      const aEdge = (a.orb - (1 - b.drb)) * 100;
      const bEdge = (b.orb - (1 - a.drb)) * 100;
      const edgeRaw = (aEdge - bEdge) * 0.01;
      ffContrib += edgeRaw;
      factors.orbEdge = { aEdge, bEdge, raw: edgeRaw };
    }

    // FT rate: higher is better (more foul drawing = free points)
    if (a.ftr != null && b.ftr_d != null) {
      const aEdge = (a.ftr - b.ftr_d) * 100;
      const bEdge = (b.ftr - a.ftr_d) * 100;
      const edgeRaw = (aEdge - bEdge) * 0.005;
      ffContrib += edgeRaw;
      factors.ftrEdge = { aEdge, bEdge, raw: edgeRaw };
    }

    const contribution = clamp(ffContrib, -0.3, 0.3) * (weights.fourFactors / 100);
    factors.fourFactors = { total: ffContrib, contribution };
    logitSum += contribution;
  }

  // ── Pillar 6: Context (travel, rest, coaching, experience) ──────────────

  // Travel distance to venue
  if (toggles.travel && venue && a.lat && b.lat) {
    const distA = haversine(a.lat, a.lng, venue.lat, venue.lng);
    const distB = haversine(b.lat, b.lng, venue.lat, venue.lng);
    // A travels less → small advantage (log ratio, capped)
    const ratio = distB > 0 && distA > 0 ? Math.log(distB / distA) : 0;
    const contribution = clamp(ratio, -1, 1) * 0.05 * (weights.travel / 100);
    factors.travel = { distA: Math.round(distA), distB: Math.round(distB), contribution };
    logitSum += contribution;
  }

  // Coaching experience
  if (toggles.coaching && a.coachExp != null && b.coachExp != null) {
    const diff = clamp(a.coachExp - b.coachExp, -30, 30);
    const contribution = diff * 0.003 * (weights.coaching / 100);
    factors.coaching = { a: a.coachExp, b: b.coachExp, diff, contribution };
    logitSum += contribution;
  }

  // Roster experience (using Q1 win rate as a proxy for "battle-tested" teams)
  if (toggles.q1WinRate && a.q1_win_rate != null && b.q1_win_rate != null) {
    const diff = a.q1_win_rate - b.q1_win_rate;
    const contribution = diff * 0.3 * (weights.q1WinRate / 100);
    factors.q1WinRate = { a: a.q1_win_rate, b: b.q1_win_rate, diff, contribution };
    logitSum += contribution;
  }

  // Round penalty for freshmen-heavy teams (experience matters in tournament pressure)
  if (toggles.experience && a.froshMin != null && b.froshMin != null) {
    const roundPenaltyScale = Math.min(round - 1, 3) * 0.3;
    const diff = (b.froshMin - a.froshMin) * roundPenaltyScale;  // B being fresher hurts B
    const contribution = diff * 0.02 * (weights.experience / 100);
    factors.experience = { a: a.froshMin, b: b.froshMin, contribution };
    logitSum += contribution;
  }

  // Chaos (upsets): shrink logit toward 0
  const chaos = clamp(opts.chaosLevel || 0, 0, 1);
  logitSum *= (1 - chaos * 0.7);

  const prob = clamp(sigmoid(logitSum), 0.02, 0.98);
  return { prob, factors };
}

// ─── Default Config ──────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS = {
  odds:       35,  // betting market (only when available)
  barthag:    30,  // Barthag / AdjEM efficiency
  adjEM:      30,  // fallback if no Barthag
  seedHist:   8,   // historical seed priors
  netRank:    8,   // NET rank
  wab:        5,   // Wins Above Bubble
  fourFactors:10,  // eFG%, TO%, ORB%, FTr
  travel:     4,   // distance to venue
  coaching:   3,   // coach experience
  q1WinRate:  4,   // Q1 win rate (battle-tested)
  experience: 3    // frosh minutes
};

const DEFAULT_TOGGLES = {
  odds: true, barthag: true, seedHist: true, netRank: true,
  wab: true, fourFactors: true, travel: true, coaching: true,
  q1WinRate: true, experience: true
};

// ─── Bracket Logic ──────────────────────────────────────────────────────────

/** Standard bracket pairing: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15 */
const BRACKET_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];

function arrangeForBracket(seedMap) {
  return BRACKET_ORDER.map(seed => seedMap[seed]).filter(Boolean);
}

function simulateRegion(teams, weights, toggles, chaosLevel, venuePool, rng) {
  let current = [...teams];
  const roundVenues = [
    venuePool[0] || null, venuePool[0] || null,
    venuePool[1] || null, null
  ];

  for (let round = 0; round < 4; round++) {
    const winners = [];
    const venue = roundVenues[round];
    for (let i = 0; i < current.length; i += 2) {
      const a = current[i];
      const b = current[i + 1];
      if (!a) { winners.push(b); continue; }
      if (!b) { winners.push(a); continue; }

      const { prob } = calculateWinProb(a, b, { weights, toggles, round: round + 1, venue, chaosLevel });
      winners.push(rng() < prob ? a : b);
    }
    current = winners;
  }
  return current[0]; // regional champion
}

/**
 * Run Monte Carlo bracket simulation.
 *
 * @param {object} params
 *   bracket   - bracket.json structure (regions + seeds)
 *   teams     - enriched team data keyed by name
 *   weights   - factor weights
 *   toggles   - enable/disable factors
 *   chaosLevel - 0-1 chaos factor
 *   numSims   - number of simulations
 * @returns {{ teams: object, bracket: object }}
 */
function runMonteCarlo({ bracket, teams, weights = DEFAULT_WEIGHTS, toggles = DEFAULT_TOGGLES, chaosLevel = 0, numSims = 10000 }) {
  if (!bracket || !bracket.regions) {
    throw new Error('Invalid bracket: missing regions');
  }

  // Build seed → team object per region
  const regionSeedMaps = {};
  for (const [region, rData] of Object.entries(bracket.regions)) {
    regionSeedMaps[region] = {};
    for (const [seedStr, teamInfo] of Object.entries(rData.seeds || {})) {
      const seed = parseInt(seedStr);
      const name = teamInfo.name || teamInfo;
      const enriched = teams[name] || {};
      regionSeedMaps[region][seed] = {
        name,
        seed,
        region,
        lat: teamInfo.lat || enriched.lat,
        lng: teamInfo.lng || enriched.lng,
        ...enriched
      };
    }
  }

  const regionNames = Object.keys(regionSeedMaps);

  // Track round-by-round advancement counts
  const counts = {};
  for (const [, seedMap] of Object.entries(regionSeedMaps)) {
    for (const team of Object.values(seedMap)) {
      counts[team.name] = { r64: 0, r32: 0, s16: 0, e8: 0, f4: 0, champ: 0 };
    }
  }

  // Venue assignment: pair regions to venue pools
  const regionVenueMap = {};
  regionNames.forEach((r, i) => {
    regionVenueMap[r] = [VENUES.r64_r32[i % VENUES.r64_r32.length], VENUES.s16_e8[i % VENUES.s16_e8.length]];
  });

  const f4Venue = VENUES.f4_champ;

  // Simple seeded PRNG for reproducibility (optional; use Math.random by default)
  const rng = Math.random;

  for (let sim = 0; sim < numSims; sim++) {
    const regionalChamps = [];

    for (const region of regionNames) {
      const seedMap = regionSeedMaps[region];
      const arranged = arrangeForBracket(seedMap);

      // Track advancement within this region
      let current = [...arranged];
      arranged.forEach(t => t && counts[t.name] && counts[t.name].r64++);

      for (let round = 0; round < 4; round++) {
        const winners = [];
        const venue = regionVenueMap[region][round > 1 ? 1 : 0] || null;

        for (let i = 0; i < current.length; i += 2) {
          const a = current[i], b = current[i + 1];
          if (!a) { winners.push(b); continue; }
          if (!b) { winners.push(a); continue; }

          const { prob } = calculateWinProb(a, b, { weights, toggles, round: round + 1, venue, chaosLevel });
          const winner = rng() < prob ? a : b;
          winners.push(winner);

          // Track advancement
          if (round === 0) counts[winner.name].r32++;
          else if (round === 1) counts[winner.name].s16++;
          else if (round === 2) counts[winner.name].e8++;
          else if (round === 3) counts[winner.name].f4++;
        }
        current = winners;
      }

      if (current[0]) regionalChamps.push(current[0]);
    }

    // Final Four (2 semis)
    const f4Winners = [];
    for (let i = 0; i < regionalChamps.length; i += 2) {
      const a = regionalChamps[i], b = regionalChamps[i + 1];
      if (!a || !b) { f4Winners.push(a || b); continue; }
      const { prob } = calculateWinProb(a, b, { weights, toggles, round: 5, venue: f4Venue, chaosLevel });
      f4Winners.push(rng() < prob ? a : b);
    }

    // Championship
    if (f4Winners.length >= 2) {
      const [a, b] = f4Winners;
      const { prob } = calculateWinProb(a, b, { weights, toggles, round: 6, venue: f4Venue, chaosLevel });
      const champion = rng() < prob ? a : b;
      counts[champion.name].champ++;
    }
  }

  // Convert to percentages
  const results = {};
  for (const [name, c] of Object.entries(counts)) {
    results[name] = {
      r64:   c.r64   / numSims,
      r32:   c.r32   / numSims,
      s16:   c.s16   / numSims,
      e8:    c.e8    / numSims,
      f4:    c.f4    / numSims,
      champ: c.champ / numSims
    };
  }

  return { teams: results, numSims };
}

// ─── Most Likely Bracket ─────────────────────────────────────────────────────

/**
 * Pick the most likely winner of each game (greedy bracket prediction).
 * Returns the expected bracket structure for display.
 */
function predictBracket({ bracket, teams, weights = DEFAULT_WEIGHTS, toggles = DEFAULT_TOGGLES, chaosLevel = 0 }) {
  if (!bracket?.regions) return null;

  const regionSeedMaps = {};
  for (const [region, rData] of Object.entries(bracket.regions)) {
    regionSeedMaps[region] = {};
    for (const [seedStr, teamInfo] of Object.entries(rData.seeds || {})) {
      const seed = parseInt(seedStr);
      const name = teamInfo.name || teamInfo;
      const enriched = teams[name] || {};
      regionSeedMaps[region][seed] = { name, seed, region, ...teamInfo, ...enriched };
    }
  }

  const predicted = { regions: {}, finalFour: [], champion: null, games: [] };

  for (const [region, seedMap] of Object.entries(regionSeedMaps)) {
    let current = arrangeForBracket(seedMap);
    predicted.regions[region] = { rounds: [[...current.map(t => t?.name)]] };

    for (let round = 0; round < 4; round++) {
      const winners = [];
      for (let i = 0; i < current.length; i += 2) {
        const a = current[i], b = current[i + 1];
        if (!a) { winners.push(b); continue; }
        if (!b) { winners.push(a); continue; }
        const { prob, factors } = calculateWinProb(a, b, { weights, toggles, round: round + 1, chaosLevel });
        const winner = prob >= 0.5 ? a : b;
        predicted.games.push({
          round: round + 1, region,
          teamA: a.name, teamB: b.name,
          probA: prob, winner: winner.name, factors
        });
        winners.push(winner);
      }
      current = winners;
      predicted.regions[region].rounds.push(current.map(t => t?.name));
    }
    predicted.finalFour.push(current[0]);
  }

  // Final Four
  const f4 = predicted.finalFour;
  const f4Winners = [];
  for (let i = 0; i < f4.length; i += 2) {
    const a = f4[i], b = f4[i + 1];
    if (!a || !b) { f4Winners.push(a || b); continue; }
    const { prob } = calculateWinProb(a, b, { weights, toggles, round: 5, chaosLevel });
    f4Winners.push(prob >= 0.5 ? a : b);
  }
  predicted.finalFourWinners = f4Winners.map(t => t?.name);

  if (f4Winners.length >= 2) {
    const a = f4Winners[0], b = f4Winners[1];
    const { prob } = calculateWinProb(a, b, { weights, toggles, round: 6, chaosLevel });
    predicted.champion = (prob >= 0.5 ? a : b)?.name;
  }

  return predicted;
}

module.exports = {
  runMonteCarlo, predictBracket, calculateWinProb,
  DEFAULT_WEIGHTS, DEFAULT_TOGGLES, VENUES, SEED_WIN_R64
};
