/**
 * Run all data scrapers in sequence.
 * Usage: node scripts/update-all.js [year]
 */

const { fetchTorvik } = require('./scrape-torvik');
const { scrapeNCAA } = require('./scrape-ncaa');
const { scrapeOdds } = require('./scrape-odds');
const path = require('path');
const fs = require('fs');

const YEAR = process.argv[2] || new Date().getFullYear();
const DATA_DIR = path.join(__dirname, '..', 'data');

async function run() {
  console.log('='.repeat(60));
  console.log(`March Madness Data Updater — ${YEAR}`);
  console.log('='.repeat(60));

  const results = { year: YEAR, updatedAt: new Date().toISOString() };

  // 1. Bart Torvik (most reliable — bulk endpoint)
  console.log('\n[1/3] Fetching Bart Torvik efficiency ratings...');
  try {
    const torvik = await fetchTorvik(YEAR);
    results.torvik = { ok: true, teams: Object.keys(torvik.teams).length };
  } catch (err) {
    console.error(`Torvik failed: ${err.message}`);
    results.torvik = { ok: false, error: err.message };
  }

  // 2. NCAA NET rankings
  console.log('\n[2/3] Fetching NCAA NET rankings...');
  try {
    const ncaa = await scrapeNCAA();
    results.ncaa = { ok: true, teams: Object.keys(ncaa.teams).length };
  } catch (err) {
    console.error(`NCAA NET failed: ${err.message}`);
    results.ncaa = { ok: false, error: err.message };
  }

  // 3. Betting odds
  console.log('\n[3/3] Fetching betting odds...');
  try {
    const odds = await scrapeOdds();
    results.odds = { ok: true, games: Object.keys(odds.games).length, error: odds.error };
  } catch (err) {
    console.error(`Odds failed: ${err.message}`);
    results.odds = { ok: false, error: err.message };
  }

  // Save summary
  fs.writeFileSync(
    path.join(DATA_DIR, 'last-update.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('\n' + '='.repeat(60));
  console.log('Update Summary:');
  console.log(`  Torvik: ${results.torvik.ok ? `✓ ${results.torvik.teams} teams` : `✗ ${results.torvik.error}`}`);
  console.log(`  NCAA:   ${results.ncaa.ok ? `✓ ${results.ncaa.teams} teams` : `✗ ${results.ncaa.error}`}`);
  const oddsNote = results.odds.error ? ` (${results.odds.error})` : '';
  console.log(`  Odds:   ${results.odds.ok ? `✓ ${results.odds.games} games${oddsNote}` : `✗ ${results.odds.error}`}`);
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('  1. Run: npm start  (starts local server at http://localhost:3000)');
  console.log('  2. On Selection Sunday, drop in data/bracket.json with real seeds/matchups');
  console.log('  3. Reload the app — it will pick up the new bracket automatically');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
