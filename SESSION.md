# Session Memory — Arc Raiders Quest Planner

Created: 13 May 2026

## What Was Built

An interactive **Progressive Web App (PWA)** for navigating the Arc Raiders quest dependency tree. 100 quests scraped from the wiki, rendered as an interactive DAG with path highlighting for blueprints and coins.

## Tech Stack

- **Frontend**: Plain HTML/CSS/JS (no framework), vis-network CDN for interactive tree
- **Data**: `data/quests.json` — scraped from the wiki via the MediaWiki API
- **Scraper**: `scraper/scrape.js` — Node.js script that fetches all 100 quest pages and extracts infobox data
- **PWA**: `manifest.json` + `sw.js` for offline support and mobile installability
- **Deployment**: Static site on Vercel

## Project Structure

```
arc-raiders-quest-planner/
├── index.html          # Main page — loads vis-network CDN
├── styles.css          # All styling (dark theme + @media print)
├── app.js              # All logic — tree, paths, checklists, filters, print
├── manifest.json       # PWA manifest for "Add to Home Screen"
├── sw.js               # Service worker for offline caching
├── vercel.json         # Vercel static deployment config
├── data/
│   └── quests.json     # 100 quests with dependencies, rewards, paths
├── scraper/
│   └── scrape.js       # Wiki scraper — run `node scraper/scrape.js` to refresh data
└── SESSION.md          # This file
```

## Key URLs

- **Live site**: https://arc-raiders-quest-planner.vercel.app
- **GitHub**: https://github.com/Phalck/arc-raiders-quest-planner

## Account Situation

| Service | Account | Note |
|---------|---------|------|
| **GitHub** | Phalck | Repo created and pushed |
| **Vercel** | mattiasfalck | Site deployed manually |

**IMPORTANT**: The Vercel account (mattiasfalck) and GitHub account (Phalck) are NOT linked. This means `git push` does NOT auto-deploy. To deploy after changes, follow the manual deploy steps below.

## How to Deploy After Code Changes

### 1. Push to GitHub
```bash
git add -A
git commit -m "description of changes"
git push
```

### 2. Deploy to Vercel (Manual)
```bash
cd /home/phalck/Projects/arc-raiders-quest-planner
vercel --prod
```

You may need to authenticate Vercel again if the session expired. The CLI will show a device code URL.

## What the App Does

### Navigation Modes (top bar buttons)
| Mode | What it shows |
|------|---------------|
| **Full Tree** | All 100 quests in a hierarchical DAG. Color = trader. |
| **Hullcracker** | Highlights the 16-quest path → The Major's Footlocker (Hullcracker Blueprint) |
| **Coins** | Highlights paths to The Root Of The Matter (1000 coins) and A Dead End (2000 coins) |
| **Blueprints** | Highlights all 7 blueprint quests (Lure Grenade, Burletta, Hullcracker, Yellow Light Stick, Vita Spray, Trigger 'Nade, Fireworks Box) |

### Interaction
- **Click** a quest node → toggle completed (green border)
- **Double-click** → opens detail panel (required items, rewards, prerequisites)
- **Trader filter** dropdown → show only one trader's quests
- **Search** → filter by quest name
- **🖨 Print** → generates formatted checklist with [✓] boxes for pen-and-paper tracking

### Path Data (pre-computed in quests.json)
- Hullcracker path: 16 quests starting from Picking Up The Pieces
- Coin path to A Dead End: 19 quests (2000 coins)
- Coin path to The Root Of The Matter: 15 quests (1000 coins)
- All blueprint paths trace back to root quests

## If You Need to Re-scrape (wiki data changed)

```bash
node scraper/scrape.js
```

This regenerates `data/quests.json`. Then commit and redeploy.

## Next Steps / Potential Improvements

### Server-side Features
- **User accounts & cloud progress** — Add a backend (Supabase/Firebase/custom API) so users can register, log in, and sync quest completion across devices. Requires auth, a progress table, and save/load endpoints.

### Filtering & Display
- **Filter by map/location** — Location dropdown alongside the Trader filter. Extracts unique values from the `location` field in quests.json.

### Wiki Integration
- **Auto wiki scraper** — Schedule `node scraper/scrape.js` via GitHub Actions cron to detect quest changes on the wiki. Add diff check against committed `quests.json` and auto-create a PR when data changes.

### Print Improvements
- **"Next 5" ticket** — On any path mode, scan forward from the last completed quest and print the next 5 uncompleted missions as a tick-box checklist with required items. Useful for session planning.
- Add collapsible required items/rewards in the full print view

### UX Polish
- "Reset all progress" button
- Progress statistics counter (e.g., "12/100 completed")
- Better mobile touch handling for the vis-network tree
- Manual node positioning to match the wiki's quest tree image
- Connect GitHub ↔ Vercel for auto-deploy on push
