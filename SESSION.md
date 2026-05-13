# Session Memory — Arc Raiders Quest Planner

Created: 13 May 2026
Updated: 13 May 2026 (session 3)

## What Was Built This Session

### 3. Equal-Sized Nodes with Reward Info
- All quest nodes now have a fixed width of 200px (`widthConstraint: 200`) for uniform sizing
- Completed quests display their rewards inline in the node label:
  - Coin rewards → `💰 2,000 Coins`
  - Blueprint rewards → `📘 Burletta`
- Multi-line labels use `\n` for stacking, wrapping naturally within the fixed width

## What Was Built Previously

### 1. 3-State Quest Toggle
Quest nodes now cycle through three states on click:
- **Not Completed** — default, trader-colored node
- **Tracked** — amber border/bg, prefixed with ◉ in the node label
- **Completed** — green border/bg, prefixed with ✓ in the node label

Legacy `true/false` progress data is auto-migrated on first load.

### 2. User Accounts & Cloud Sync (Supabase)
- **Supabase backend** — project created at `https://nhhmkdjwtfnganubffpm.supabase.co`
- **Auth UI** — "Sign In" button in the top bar opens a modal for login/signup
- **Cloud save** — quest progress auto-syncs to a `user_progress` table (debounced 500ms)
- **Cloud load** — when a user signs in, their cloud progress overwrites local
- **Optional** — accounts are NOT required; the app works fully offline without signing in
- **RLS enabled** — users can only read/write their own progress row

### Supabase DB Schema (`user_progress`)
```sql
CREATE TABLE user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
  progress jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

## Next Action (start here next session)

Pick any item from the feature roadmap below. Suggested priority:
1. **"Next 5" print ticket** — scan forward from last completed quest, print next 5 uncompleted
2. **Filter by map/location** — location dropdown alongside Trader filter
3. **Progress statistics counter** — "12/100 completed" in the header
4. **Settings/admin page** — clear progress, delete account
5. **Auto wiki scraper** — GitHub Actions cron for data refresh

## Tech Stack (updated)

- **Backend**: Supabase (Postgres + Auth + REST API)
- **Frontend**: Plain HTML/CSS/JS, vis-network CDN, Supabase JS client v2 (UMD CDN)

## Project Structure (updated)

```
arc-raiders-quest-planner/
├── index.html          # Main page — auth modal, vis-network, Supabase CDN
├── styles.css          # All styling — auth modal, state swatches, print
├── app.js              # Core logic — 3-state toggle, paths, sync, print
├── supabase.js         # Supabase client init, auth, cloud save/load
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── vercel.json         # Vercel static deployment config
├── data/
│   └── quests.json     # 100 quests
├── scraper/
│   └── scrape.js
└── SESSION.md
```

## Key URLs

- **Live site**: https://arc-raiders-quest-planner.vercel.app
- **GitHub**: https://github.com/Phalck/arc-raiders-quest-planner
- **Supabase**: https://supabase.com/dashboard/project/nhhmkdjwtfnganubffpm

## Account Situation

| Service | Account | Note |
|---------|---------|------|
| **GitHub** | Phalck | Repo created and pushed |
| **Vercel** | mattiasfalck | Site deployed manually |
| **Supabase** | (same account) | Project: arc-raiders-quest-planner |

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

### 3. Verify
Visit https://arc-raiders-quest-planner.vercel.app to confirm the update is live.

**Shortcut**:
```bash
git add -A && git commit -m "msg" && git push && vercel --prod
```

## Feature Roadmap

### Remaining
- **"Next 5" print ticket** — On path modes, scan forward from last completed, print next 5 uncompleted with required items
- **Filter by map/location** — Location dropdown alongside Trader filter (extract from quests.json location field)
- **Progress statistics counter** — e.g. "12/100 completed" in header
- **Settings/admin page** — clear local progress, delete account
- **Auto wiki scraper** — GitHub Actions cron + PR on data change
- **"Join Expedition" reset** — one-click reset with confirmation
- **Better mobile touch handling** — vis-network touch improvements
- **Manual node positioning** — match wiki quest tree layout
- **Connect GitHub ↔ Vercel** — auto-deploy on push
