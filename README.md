# March Madness Predictor v2

A local Node.js app for NCAA tournament prediction using real scraped data and Monte Carlo simulation.

## Quick Start

```bash
npm install
npm run scrape        # fetch Torvik + NCAA NET + Odds data
npm start             # http://localhost:3000
```

## Selection Sunday Workflow

1. On Selection Sunday (March 15, 2026), fill in `data/bracket.json` with the real seeds
2. Run `npm run scrape` to get the latest ratings
3. Open the app → Analytics tab → Run Monte Carlo

## Data Sources

| Source | What it provides | How to update |
|--------|-----------------|---------------|
| [Bart Torvik](https://barttorvik.com) | AdjO, AdjD, Barthag, four factors | `npm run scrape:torvik` |
| [NCAA stats.ncaa.org](https://stats.ncaa.org) | NET rank, WAB, SOS, quad records | `npm run scrape:ncaa` |
| [The Odds API](https://the-odds-api.com) | Spreads, moneylines | `npm run scrape:odds` |

## Odds API Key

Get a free key (500 req/month) at https://the-odds-api.com/#get-access

Then either:
- Set `ODDS_API_KEY=your_key` environment variable, OR
- Add `"oddsApiKey": "your_key"` to `data/config.json`

## Bracket Drop-In Format

`data/bracket.json` uses this format — fill in on Selection Sunday:

```json
{
  "year": 2026,
  "regions": {
    "East": {
      "seeds": {
        "1": { "name": "Duke", "conf": "ACC", "lat": 36.001, "lng": -78.939, "coachExp": 5 },
        "16": { "name": "SomeMidMajor", ... }
      }
    },
    "West": { ... },
    "South": { ... },
    "Midwest": { ... }
  }
}
```

The app picks up changes automatically on page reload.

## Predictive Model

Win probability uses a multi-pillar logistic model:

| Factor | Weight | Source |
|--------|--------|--------|
| Betting spread / moneyline | 35% | The Odds API |
| Barthag (efficiency pythag) | 30% | Bart Torvik |
| Seed historical prior | 8% | Built-in |
| NET rank | 8% | NCAA stats |
| Wins Above Bubble | 5% | NCAA stats |
| Four factors (eFG%, TO%, ORB%, FTr) | 10% | Bart Torvik |
| Travel distance | 4% | bracket.json |
| Coaching experience | 3% | bracket.json |
| Q1 win rate | 4% | NCAA stats |
| Roster experience | 3% | bracket.json |

Weights are adjustable in the Settings tab.

## API Endpoints

```
GET  /api/data          — All enriched team data
GET  /api/bracket       — Current bracket
POST /api/bracket       — Save bracket (JSON body)
POST /api/simulate      — Run Monte Carlo
POST /api/scrape/all    — Fetch all data sources
GET  /api/status        — Data freshness
```
