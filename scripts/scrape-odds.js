/**
 * Fetch current NCAAB odds (spreads + moneylines) from The Odds API.
 *
 * Free tier: ~500 requests/month. Provides current tournament game lines.
 * Historical closing lines require a paid plan — excluded here.
 *
 * API docs: https://the-odds-api.com/
 * Get a free key at: https://the-odds-api.com/#get-access
 *
 * Preferred bookmakers (in order): DraftKings, FanDuel, BetMGM, consensus
 *
 * Usage:
 *   ODDS_API_KEY=your_key node scripts/scrape-odds.js
 *   OR set key in data/config.json: { "oddsApiKey": "your_key" }
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(DATA_DIR, 'odds.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const PREFERRED_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'bovada'];

function getApiKey() {
  if (process.env.ODDS_API_KEY) return process.env.ODDS_API_KEY;
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (cfg.oddsApiKey && cfg.oddsApiKey !== 'YOUR_KEY_HERE') return cfg.oddsApiKey;
    } catch {}
  }
  return null;
}

/** Convert American odds to implied probability */
function americanToProb(american) {
  const v = parseFloat(american);
  if (isNaN(v)) return null;
  if (v > 0) return 100 / (v + 100);
  return Math.abs(v) / (Math.abs(v) + 100);
}

/** Remove vig from two implied probabilities */
function removeVig(prob1, prob2) {
  if (!prob1 || !prob2) return { p1: prob1, p2: prob2 };
  const total = prob1 + prob2;
  return { p1: prob1 / total, p2: prob2 / total };
}

/** Pick the best available bookmaker line */
function extractLine(bookmakers, awayTeam, homeTeam) {
  let spread = null;
  let spreadFavor = null; // which team the spread is relative to
  let awayML = null, homeML = null;
  let awayWinProb = null, homeWinProb = null;

  for (const preferredBook of PREFERRED_BOOKS) {
    const bk = bookmakers.find(b => b.key === preferredBook);
    if (!bk) continue;

    for (const market of (bk.markets || [])) {
      if (market.key === 'spreads') {
        for (const outcome of (market.outcomes || [])) {
          if (outcome.name === homeTeam) {
            spread = outcome.point;
            spreadFavor = outcome.point < 0 ? homeTeam : awayTeam;
          }
        }
      }
      if (market.key === 'h2h') {
        for (const outcome of (market.outcomes || [])) {
          if (outcome.name === awayTeam) awayML = outcome.price;
          if (outcome.name === homeTeam) homeML = outcome.price;
        }
      }
    }

    if (spread !== null || awayML !== null) break; // found a book with data
  }

  // Fallback: use any bookmaker
  if (spread === null && awayML === null) {
    for (const bk of bookmakers) {
      for (const market of (bk.markets || [])) {
        if (market.key === 'spreads' && !spread) {
          const h = market.outcomes.find(o => o.name === homeTeam);
          if (h) { spread = h.point; spreadFavor = h.point < 0 ? homeTeam : awayTeam; }
        }
        if (market.key === 'h2h' && !awayML) {
          const a = market.outcomes.find(o => o.name === awayTeam);
          const h = market.outcomes.find(o => o.name === homeTeam);
          if (a) awayML = a.price;
          if (h) homeML = h.price;
        }
      }
      if (spread !== null || awayML !== null) break;
    }
  }

  // Convert to no-vig probabilities
  if (awayML !== null && homeML !== null) {
    const raw1 = americanToProb(awayML);
    const raw2 = americanToProb(homeML);
    const { p1, p2 } = removeVig(raw1, raw2);
    awayWinProb = p1;
    homeWinProb = p2;
  }

  return { spread, spreadFavor, awayML, homeML, awayWinProb, homeWinProb };
}

async function scrapeOdds() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('No Odds API key found.');
    console.warn('Set ODDS_API_KEY env var OR add { "oddsApiKey": "your_key" } to data/config.json');
    console.warn('Get a free key at https://the-odds-api.com/#get-access');
    const out = { source: 'the-odds-api.com', fetchedAt: new Date().toISOString(), games: {}, error: 'No API key' };
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
    return out;
  }

  const url = 'https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds';
  const params = {
    regions: 'us',
    markets: 'h2h,spreads',
    oddsFormat: 'american',
    apiKey
  };

  console.log('Fetching NCAAB odds from The Odds API...');
  let resp;
  try {
    resp = await axios.get(url, { params, timeout: 30000 });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error(`Failed to fetch odds: ${msg}`);
    const out = { source: 'the-odds-api.com', fetchedAt: new Date().toISOString(), games: {}, error: msg };
    fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
    return out;
  }

  const remaining = resp.headers['x-requests-remaining'];
  const used = resp.headers['x-requests-used'];
  console.log(`Odds API requests used: ${used}, remaining: ${remaining}`);

  const games = {};
  for (const event of (resp.data || [])) {
    const { away_team, home_team, commence_time, bookmakers = [] } = event;
    const line = extractLine(bookmakers, away_team, home_team);

    // Key by sorted team pair for easy lookup
    const key = [away_team, home_team].sort().join(' vs ');
    games[key] = {
      awayTeam: away_team,
      homeTeam: home_team,
      commenceTime: commence_time,
      ...line
    };
  }

  const out = {
    source: 'the-odds-api.com',
    fetchedAt: new Date().toISOString(),
    requestsRemaining: remaining,
    games
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`Saved ${Object.keys(games).length} games to ${OUT_FILE}`);
  return out;
}

if (require.main === module) {
  scrapeOdds().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { scrapeOdds };
