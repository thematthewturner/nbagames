/**
 * Scrape Bart Torvik bulk team ratings for NCAA March Madness predictor.
 *
 * Torvik explicitly offers bulk data endpoints to avoid scraping the UI.
 * URL pattern: https://barttorvik.com/YEAR_team_results.json
 *
 * Columns returned (array per team):
 *  [0]  rank
 *  [1]  team
 *  [2]  conf
 *  [3]  g (games played)
 *  [4]  rec (record "W-L")
 *  [5]  adj_o  (adjusted offensive efficiency, pts/100 poss)
 *  [6]  adj_d  (adjusted defensive efficiency, pts/100 poss, lower=better)
 *  [7]  barthag (pythag win% from efficiencies)
 *  [8]  efg%   (effective FG%)
 *  [9]  efg_d% (opponent eFG%)
 *  [10] tov%   (turnover rate)
 *  [11] tov_d% (opponent TO rate)
 *  [12] orb%   (offensive rebound rate)
 *  [13] drb%   (defensive rebound rate)
 *  [14] ftr    (FT attempt rate)
 *  [15] ftr_d  (opponent FT attempt rate)
 *  [16] 2p%    (2-point FG%)
 *  [17] 2p_d%  (opponent 2-point FG%)
 *  [18] 3p%    (3-point FG%)
 *  [19] 3p_d%  (opponent 3-point FG%)
 *  [20] 3pr    (3-point attempt rate: 3PA/FGA)
 *  [21] adj_t  (adjusted tempo: possessions/40min)
 *  [22] wab    (wins above bubble)
 *
 * Usage: node scripts/scrape-torvik.js [year]
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(DATA_DIR, 'torvik.json');
const YEAR = process.argv[2] || new Date().getFullYear();

const COLUMN_MAP = [
  'rank', 'team', 'conf', 'g', 'rec',
  'adj_o', 'adj_d', 'barthag',
  'efg', 'efg_d', 'tov', 'tov_d',
  'orb', 'drb', 'ftr', 'ftr_d',
  'fg2', 'fg2_d', 'fg3', 'fg3_d', 'fg3r',
  'adj_t', 'wab'
];

async function fetchTorvik(year) {
  const url = `https://barttorvik.com/${year}_team_results.json`;
  console.log(`Fetching Torvik data from: ${url}`);

  let resp;
  try {
    resp = await axios.get(url, {
      headers: {
        'User-Agent': 'march-madness-predictor/2.0 (educational; bulk endpoint)'
      },
      timeout: 30000
    });
  } catch (err) {
    console.error(`Failed to fetch Torvik data: ${err.message}`);
    console.error('Tip: Try a different year or check your internet connection.');
    process.exit(1);
  }

  // The endpoint returns { teams: [[...], [...], ...] } or just an array
  let raw = resp.data;
  let rows;
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && Array.isArray(raw.teams)) {
    rows = raw.teams;
  } else {
    console.error('Unexpected response shape from Torvik:', JSON.stringify(raw).slice(0, 200));
    process.exit(1);
  }

  const teams = {};
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const obj = {};
    for (let i = 0; i < COLUMN_MAP.length; i++) {
      const col = COLUMN_MAP[i];
      const val = row[i];
      // parse numbers, keep strings as-is
      obj[col] = (typeof val === 'string' && !isNaN(val) && val.trim() !== '') ? parseFloat(val) : val;
    }
    // Derived: AdjEM = AdjO - AdjD
    obj.adjEM = (parseFloat(obj.adj_o) || 0) - (parseFloat(obj.adj_d) || 0);

    const name = (obj.team || '').trim();
    if (name) teams[name] = obj;
  }

  const out = {
    source: 'barttorvik.com',
    year,
    fetchedAt: new Date().toISOString(),
    teams
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`Saved ${Object.keys(teams).length} teams to ${OUT_FILE}`);
  return out;
}

if (require.main === module) {
  fetchTorvik(YEAR);
}

module.exports = { fetchTorvik };
