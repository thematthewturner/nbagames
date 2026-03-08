/**
 * March Madness Predictor — Local Express Server
 *
 * Serves the React frontend and provides REST API endpoints for:
 *  - Bracket data (load/save bracket.json)
 *  - Enriched team data (Torvik + NCAA + Odds merged)
 *  - Monte Carlo simulation (server-side, full speed)
 *  - Triggering data scrapers
 *
 * Usage: node server.js  (or: npm start)
 * Then open: http://localhost:3000
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR));

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJson(file, fallback = null) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function writeJson(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

/** Fuzzy team name lookup: try exact, then lowercase, then partial */
function findTeam(teamName, lookup) {
  if (!teamName || !lookup) return null;
  if (lookup[teamName]) return lookup[teamName];
  const lower = teamName.toLowerCase();
  for (const [k, v] of Object.entries(lookup)) {
    if (k.toLowerCase() === lower) return v;
  }
  // partial match
  for (const [k, v] of Object.entries(lookup)) {
    if (k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())) return v;
  }
  return null;
}

/** Merge all data sources into a single per-team object */
function buildEnrichedTeams(bracket, torvik, ncaa, odds) {
  const enriched = {};
  const tervikTeams = torvik?.teams || {};
  const ncaaTeams = ncaa?.teams || {};

  // Start from bracket teams
  const bracketTeams = bracket?.regions
    ? Object.values(bracket.regions).flatMap(r => Object.values(r.seeds || {}))
    : [];

  const allNames = new Set([
    ...bracketTeams.map(t => t.name),
    ...Object.keys(tervikTeams),
    ...Object.keys(ncaaTeams)
  ]);

  for (const name of allNames) {
    const bracketTeam = bracketTeams.find(t => t.name === name) || {};
    const torv = findTeam(name, tervikTeams) || {};
    const net = findTeam(name, ncaaTeams) || {};

    enriched[name] = {
      name,
      // Bracket fields
      seed: bracketTeam.seed || null,
      region: bracketTeam.region || null,
      lat: bracketTeam.lat || null,
      lng: bracketTeam.lng || null,
      conf: bracketTeam.conf || torv.conf || net.conf || null,
      coachExp: bracketTeam.coachExp || null,

      // Torvik fields
      adj_o: torv.adj_o || null,
      adj_d: torv.adj_d || null,
      adj_t: torv.adj_t || null,
      adjEM: torv.adjEM || null,
      barthag: torv.barthag || null,
      efg: torv.efg || null,
      efg_d: torv.efg_d || null,
      tov: torv.tov || null,
      tov_d: torv.tov_d || null,
      orb: torv.orb || null,
      drb: torv.drb || null,
      ftr: torv.ftr || null,
      ftr_d: torv.ftr_d || null,
      fg3r: torv.fg3r || null,
      wab_torvik: torv.wab || null,
      rec: torv.rec || null,

      // NCAA NET fields
      net_rank: net.net_rank || null,
      prev_net: net.prev_net || null,
      net_sos: net.net_sos || null,
      net_nc_sos: net.net_nc_sos || null,
      wab: net.wab || torv.wab || null,
      wab_rank: net.wab_rank || null,
      q1: net.q1 || null,
      q2: net.q2 || null,
      q3: net.q3 || null,
      q4: net.q4 || null,
      q1_win_rate: net.q1_win_rate || null,
      road: net.road || null,

      // Overrides from bracket.json (manual/curated data wins)
      ...bracketTeam.overrides
    };
  }
  return enriched;
}

// ─── API Routes ─────────────────────────────────────────────────────────────

// GET /api/bracket — Return the current bracket.json (drop-in format)
app.get('/api/bracket', (req, res) => {
  const bracket = readJson('bracket.json');
  if (!bracket) return res.status(404).json({ error: 'No bracket.json found. Drop in data/bracket.json on Selection Sunday.' });
  res.json(bracket);
});

// POST /api/bracket — Save/update bracket.json
app.post('/api/bracket', (req, res) => {
  try {
    writeJson('bracket.json', req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data — All enriched team data merged from all sources
app.get('/api/data', (req, res) => {
  const bracket = readJson('bracket.json');
  const torvik = readJson('torvik.json');
  const ncaa = readJson('ncaa-net.json');
  const odds = readJson('odds.json');
  const lastUpdate = readJson('last-update.json');

  const teams = buildEnrichedTeams(bracket, torvik, ncaa, odds);

  res.json({
    teams,
    bracket: bracket || null,
    odds: odds?.games || {},
    meta: {
      torvik: { fetchedAt: torvik?.fetchedAt, teams: Object.keys(torvik?.teams || {}).length },
      ncaa: { fetchedAt: ncaa?.fetchedAt, teams: Object.keys(ncaa?.teams || {}).length },
      odds: { fetchedAt: odds?.fetchedAt, games: Object.keys(odds?.games || {}).length },
      lastUpdate
    }
  });
});

// POST /api/simulate — Run Monte Carlo simulation server-side
app.post('/api/simulate', (req, res) => {
  const { bracket, teams, weights, toggles, chaosLevel, numSims = 10000 } = req.body;

  if (!bracket || !teams) {
    return res.status(400).json({ error: 'bracket and teams are required' });
  }

  try {
    const { runMonteCarlo } = require('./scripts/simulate');
    const results = runMonteCarlo({ bracket, teams, weights, toggles, chaosLevel, numSims });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scrape/:source — Trigger individual scrapers
app.post('/api/scrape/:source', async (req, res) => {
  const { source } = req.params;
  const year = req.body.year || new Date().getFullYear();

  try {
    let result;
    if (source === 'torvik') {
      const { fetchTorvik } = require('./scripts/scrape-torvik');
      result = await fetchTorvik(year);
    } else if (source === 'ncaa') {
      const { scrapeNCAA } = require('./scripts/scrape-ncaa');
      result = await scrapeNCAA();
    } else if (source === 'odds') {
      const { scrapeOdds } = require('./scripts/scrape-odds');
      result = await scrapeOdds();
    } else if (source === 'all') {
      const { fetchTorvik } = require('./scripts/scrape-torvik');
      const { scrapeNCAA } = require('./scripts/scrape-ncaa');
      const { scrapeOdds } = require('./scripts/scrape-odds');
      await Promise.allSettled([fetchTorvik(year), scrapeNCAA(), scrapeOdds()]);
      result = { ok: true };
    } else {
      return res.status(400).json({ error: `Unknown source: ${source}` });
    }
    res.json({ ok: true, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/status — Data freshness status
app.get('/api/status', (req, res) => {
  const torvik = readJson('torvik.json');
  const ncaa = readJson('ncaa-net.json');
  const odds = readJson('odds.json');
  const bracket = readJson('bracket.json');

  res.json({
    torvik: torvik ? { fetchedAt: torvik.fetchedAt, teams: Object.keys(torvik.teams || {}).length } : null,
    ncaa: ncaa ? { fetchedAt: ncaa.fetchedAt, teams: Object.keys(ncaa.teams || {}).length } : null,
    odds: odds ? { fetchedAt: odds.fetchedAt, games: Object.keys(odds.games || {}).length } : null,
    bracket: bracket ? { year: bracket.year, selectionDate: bracket.selectionDate } : null
  });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  March Madness Predictor running at: http://localhost:${PORT}`);
  console.log(`\n  Quick start:`);
  console.log(`    npm run scrape        — fetch latest Torvik + NCAA + Odds data`);
  console.log(`    npm start             — start this server`);
  console.log(`    data/bracket.json     — drop in Selection Sunday bracket`);
  console.log();
});
