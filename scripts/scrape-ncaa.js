/**
 * Scrape NCAA official NET rankings, WAB, SOS, and quadrant records.
 *
 * Source: https://stats.ncaa.org/selection_rankings/nitty_gritties
 * The page lists "Thru Games" snapshot links; we grab the latest one.
 *
 * Columns extracted:
 *   NET Rank, Prev NET Rank, Team, Conf,
 *   NET SOS, NET NC SOS, WAB, WAB Rank,
 *   Q1 W, Q1 L, Q2 W, Q2 L, Q3 W, Q3 L, Q4 W, Q4 L,
 *   Road W, Road L
 *
 * Usage: node scripts/scrape-ncaa.js
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(DATA_DIR, 'ncaa-net.json');
const BASE_URL = 'https://stats.ncaa.org';
const LANDING = `${BASE_URL}/selection_rankings/nitty_gritties`;

// Rate-limit helper
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const HEADERS = {
  'User-Agent': 'march-madness-predictor/2.0 (educational; official public data)',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9'
};

async function getLatestSnapshotUrl() {
  console.log(`Fetching NCAA NET landing page: ${LANDING}`);
  const resp = await axios.get(LANDING, { headers: HEADERS, timeout: 30000 });
  const $ = cheerio.load(resp.data);

  // Find the Men's Basketball D-I NET link (most recent snapshot)
  let snapshotUrl = null;
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().toLowerCase();
    if (href.includes('nitty_gritties') && (text.includes("men") || text.includes("mbb") || href.includes('nitty_gritties/'))) {
      // prefer the first link that looks like a snapshot ID
      if (!snapshotUrl && href.match(/nitty_gritties\/\d+/)) {
        snapshotUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      }
    }
  });

  // Fallback: find any link to a numbered snapshot
  if (!snapshotUrl) {
    $('a[href*="nitty_gritties/"]').each((_, el) => {
      if (!snapshotUrl) {
        const href = $(el).attr('href');
        snapshotUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      }
    });
  }

  if (!snapshotUrl) {
    throw new Error('Could not find NET snapshot link on landing page. NCAA may have changed their HTML structure.');
  }

  console.log(`Latest NET snapshot: ${snapshotUrl}`);
  return snapshotUrl;
}

function parseRecord(str) {
  if (!str || !str.trim()) return { w: 0, l: 0 };
  const m = str.trim().match(/^(\d+)-(\d+)/);
  return m ? { w: parseInt(m[1]), l: parseInt(m[2]) } : { w: 0, l: 0 };
}

function num(str) {
  const v = parseFloat((str || '').replace(/,/g, '').trim());
  return isNaN(v) ? null : v;
}

async function scrapeSnapshot(url) {
  console.log(`Fetching NET snapshot: ${url}`);
  await sleep(1000); // be polite
  const resp = await axios.get(url, { headers: HEADERS, timeout: 45000 });
  const $ = cheerio.load(resp.data);

  // Find the main data table
  const teams = {};
  let headers = [];

  // Try to find the table by looking for NET Rank header
  let table = null;
  $('table').each((_, tbl) => {
    const headerText = $(tbl).find('th').text().toLowerCase();
    if (headerText.includes('net') && headerText.includes('wab')) {
      table = tbl;
    }
  });

  if (!table) {
    // Try any table with enough columns
    $('table').each((_, tbl) => {
      if (!table && $(tbl).find('tr').length > 10) {
        table = tbl;
      }
    });
  }

  if (!table) {
    throw new Error('Could not find NET rankings table on page. NCAA may have changed their HTML structure.');
  }

  // Extract headers
  $(table).find('thead tr th, thead tr td').each((_, th) => {
    headers.push($(th).text().trim());
  });
  if (!headers.length) {
    $(table).find('tr').first().find('th, td').each((_, th) => {
      headers.push($(th).text().trim());
    });
  }

  console.log(`Table headers: ${headers.slice(0, 10).join(' | ')}...`);

  // Map header names to field keys
  function findCol(patterns) {
    for (const pattern of patterns) {
      const idx = headers.findIndex(h => h.toLowerCase().includes(pattern.toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  const colMap = {
    net_rank:    findCol(['net rank', 'net rk', 'rank']),
    prev_net:    findCol(['prev', 'previous']),
    team:        findCol(['team', 'school']),
    conf:        findCol(['conf']),
    net_sos:     findCol(['net sos', 'sos']),
    net_nc_sos:  findCol(['nc sos', 'nonconf', 'non-conf']),
    wab:         findCol(['wab']),
    wab_rank:    findCol(['wab rk', 'wab rank']),
    q1_wl:       findCol(['q1']),
    q2_wl:       findCol(['q2']),
    q3_wl:       findCol(['q3']),
    q4_wl:       findCol(['q4']),
    road_wl:     findCol(['road'])
  };

  // If we have separate Q1 W and Q1 L columns, find them
  let q1w = -1, q1l = -1;
  headers.forEach((h, i) => {
    const hl = h.toLowerCase();
    if (hl === 'q1 w' || hl === 'q1w') q1w = i;
    if (hl === 'q1 l' || hl === 'q1l') q1l = i;
  });

  // Parse data rows
  $(table).find('tbody tr, tr').each((rowIdx, row) => {
    const cells = [];
    $(row).find('td, th').each((_, td) => {
      cells.push($(td).text().trim());
    });

    if (cells.length < 5) return;

    // Extract team name (may include a link)
    let teamName = '';
    $(row).find('td').each((ci, td) => {
      if (ci === (colMap.team >= 0 ? colMap.team : 2)) {
        teamName = $(td).find('a').text().trim() || $(td).text().trim();
      }
    });
    if (!teamName) {
      teamName = cells[colMap.team >= 0 ? colMap.team : 2] || '';
    }
    teamName = teamName.trim();
    if (!teamName || teamName.toLowerCase() === 'team') return;

    const get = (col) => col >= 0 && col < cells.length ? cells[col] : '';

    // Parse Q1-Q4 records (may be "W-L" or separate columns)
    const parseQ = (col, wCol, lCol) => {
      if (wCol >= 0 && lCol >= 0) {
        return { w: parseInt(cells[wCol]) || 0, l: parseInt(cells[lCol]) || 0 };
      }
      return parseRecord(get(col));
    };

    const q1 = parseQ(colMap.q1_wl, q1w, q1l);

    teams[teamName] = {
      net_rank:   num(get(colMap.net_rank)),
      prev_net:   num(get(colMap.prev_net)),
      conf:       get(colMap.conf),
      net_sos:    num(get(colMap.net_sos)),
      net_nc_sos: num(get(colMap.net_nc_sos)),
      wab:        num(get(colMap.wab)),
      wab_rank:   num(get(colMap.wab_rank)),
      q1:         q1,
      q2:         parseQ(colMap.q2_wl, -1, -1),
      q3:         parseQ(colMap.q3_wl, -1, -1),
      q4:         parseQ(colMap.q4_wl, -1, -1),
      road:       parseRecord(get(colMap.road_wl))
    };

    // Q1 win rate
    const totalQ1 = (q1.w + q1.l);
    teams[teamName].q1_win_rate = totalQ1 > 0 ? q1.w / totalQ1 : 0;
  });

  return teams;
}

async function scrapeNCAA() {
  let teams = {};
  try {
    const snapshotUrl = await getLatestSnapshotUrl();
    teams = await scrapeSnapshot(snapshotUrl);
  } catch (err) {
    console.warn(`Warning: NCAA scraper hit an issue: ${err.message}`);
    console.warn('NCAA stats.ncaa.org may be blocking automated requests or has changed structure.');
    console.warn('Saving empty dataset — NCAA data will be unavailable until manual update.');
  }

  const out = {
    source: 'stats.ncaa.org',
    fetchedAt: new Date().toISOString(),
    teams
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`Saved ${Object.keys(teams).length} teams to ${OUT_FILE}`);
  return out;
}

if (require.main === module) {
  scrapeNCAA().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { scrapeNCAA };
