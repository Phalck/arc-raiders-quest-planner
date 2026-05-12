# Arc Raiders Quest Planner

Interactive quest tree planner for Arc Raiders — 100 quests visualized as a
dependency graph with path highlighting for the Hullcracker blueprint, coin
rewards, and all blueprint unlocks.

## Features

- **Interactive quest tree** — Pan, zoom, click. Color-coded by trader.
- **Path modes** — Hullcracker, Coins, Blueprints. Highlights the minimum
  quest chain to reach each goal.
- **Quest tracking** — Click any node to mark it complete. Progress saved
  locally in your browser.
- **Filters** — By trader (Shani, Celeste, Tian Wen, Lance, Apollo) and
  by quest name search.
- **Printable checklist** — Generates a tick-box sheet grouped by path
  and trader. Grab a pen and track on paper.
- **PWA** — Installable on mobile via "Add to Home Screen". Works offline.

## Live Demo

https://arc-raiders-quest-planner.vercel.app

## Self-Hosting

### Option 1: Static file server (simplest)

The entire app is static files. No build step needed.

```bash
git clone https://github.com/Phalck/arc-raiders-quest-planner.git
cd arc-raiders-quest-planner
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option 2: Vercel (recommended)

1. Fork/clone the repo
2. Import into [Vercel](https://vercel.com/import)
3. Vercel auto-detects static files — zero config
4. Deployed instantly with a `.vercel.app` URL

### Option 3: Any web server

Drop the files into any web server's document root
(Apache, Nginx, Caddy, S3 static hosting, etc.).

## Deploying Changes

After pushing to GitHub, deploy to Vercel manually:

```bash
cd arc-raiders-quest-planner
vercel --prod
```

> The GitHub and Vercel accounts for this project are not linked,
> so auto-deploy on push is not configured. Run `vercel --prod`
> each time you push changes to update the live site.

## Data

`data/quests.json` contains all 100 quests with dependencies, traders,
locations, required items, rewards, and pre-computed paths.

To re-scrape from the wiki (if quests change):

```bash
node scraper/scrape.js
```

This regenerates `data/quests.json`. Commit and redeploy.

## Tech Stack

- **Frontend**: HTML + CSS + JavaScript (zero dependencies)
- **Tree rendering**: [vis-network](https://visjs.org) (loaded from CDN)
- **Persistence**: localStorage
- **PWA**: Service worker + manifest.json
- **Hosting**: Static files (Vercel)
