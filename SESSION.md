# Session Memory — Arc Raiders Quest Planner

Created: 13 May 2026
Updated: 14 May 2026 (session 4)

## What Was Built This Session

### 1. Uniform Node Colors
- Full Tree mode: all nodes use a single dark slate color (`#2a2d3e`) — no more trader-based coloring
- Tracker colors still apply: tracked = amber, completed = green
- Legend trader-filtering still works for filtering

### 2. Mode-Specific Highlights
- **Hullcracker** button → highlights the full hullcracker path with blue border (`#7aa2f7`)
- **Coins** button → highlights only the 2 quests with coin rewards with gold border (`#e0af68`)
- **Blueprints** button → highlights only the 7 quests with blueprint rewards with purple border (`#bb9af7`)
- Non-highlighted nodes dim to `#1a1a2a` in these modes

### 3. Reward Info Always Visible
- Coin rewards (`💰 2,000 Coins`) and blueprint names (`📘 Burletta`) show on every node that has them, regardless of completion state
- Uses multi-line labels with `\n`

### 4. Equal-Sized Nodes
- All nodes have `widthConstraint: 200` for uniform card-like sizing
- Long quest names wrap naturally within the fixed width

### 5. Quest Progression Gating
- Root quest (`picking_up_the_pieces`) freely toggles between all 3 states
- Other quests cycle: Not Completed → Tracked → **Completed (only if ALL parents are Completed)** → Not Completed
- If parents aren't all done when clicking Tracked, it cycles back to Not Completed
- Un-completing a quest cascades: all completed descendants also become Not Completed

### 6. Tracked-Quest Edge Visualization (Full Tree)
- When any quest is **Tracked**, edges on the path from root toward it are highlighted:
  - **Bold line** (2.5px solid blue) if the child node is **Completed**
  - **Dashed line** (2px blue) if the child node is **Not Completed or Tracked**
- All other edges remain dim/inactive (`#3b4261`)
- If no quests are tracked, all edges stay dim

### 7. SW Cache Fix
- Bumped cache to `v2`, added `supabase.js` to SW assets

### 8. Key App Logic (`app.js`)
| Function | Purpose |
|----------|---------|
| `buildNodeLabel(q, state, prefix)` | Generates multi-line label with reward info |
| `canComplete(q)` | Checks if all parent quests are completed |
| `cascadeUncomplete(id)` | Walks down tree, un-completes all completed descendants |
| `computeEdgeStyles()` | Walks up from tracked quests to root; returns bold/dashed edge sets |
| `toggleQuest(id)` | 3-state cycle with progression gate + cascade + `applyMode` refresh |
| `applyMode(mode)` | Full mode: uniform + tracked-edge viz. Path modes: highlight highlightColor |

## What Was Built This Session

### 9. Settings / Admin Page
- **Settings gear button** (⚙) in the nav bar next to Print
- **Settings modal** with two sections:
  - **Reset All Progress** — clears all quest states locally and in the cloud, refreshes the tree. Two-step confirmation with 4s timeout.
  - **Delete Account & Data** (only visible when signed in) — two-step confirmation, then deletes the user's `user_progress` row and `auth.users` record via a Supabase RPC (`delete_user()`), signs out, and resets local progress.

### 10. Supabase Changes Needed
- A new `delete_user()` RPC function must be created in the Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_progress WHERE user_id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
```

### Files Changed
| File | Changes |
|------|---------|
| `index.html` | Added ⚙ settings button in nav; added settings modal with progress reset + account delete sections |
| `styles.css` | Added `.settings-content`, `.settings-section`, `.settings-desc`, `.danger-btn`, `.settings-error` styles |
| `app.js` | Added `resetAllProgress()`, `openSettings()`, `closeSettings()` functions; wired settings UI events (confirmation pattern, error display) |
| `supabase.js` | Added `deleteAccount()` function calling `client.rpc('delete_user')` then sign out; exposed it on `window.__arSupabase` |

## Next Action (start here next session)

Continue from anywhere on the roadmap below:

1. **"Next 5" print ticket** — Scan forward from last completed quest, print next 5 uncompleted missions as a tick-box checklist with required items
2. **Progress statistics counter** — e.g. "12/100 completed" in header
3. **Filter by map/location** — Location dropdown alongside Trader filter
4. **Auto wiki scraper** — GitHub Actions cron + PR on data change

## Tech Stack

- **Backend**: Supabase (Postgres + Auth + REST API) — project: `nhhmkdjwtfnganubffpm`
- **Frontend**: Plain HTML/CSS/JS, vis-network CDN, Supabase JS client v2 (UMD CDN)

## Project Structure

```
arc-raiders-quest-planner/
├── index.html          # Main page — auth modal, vis-network, Supabase CDN
├── styles.css          # All styling — auth modal, state swatches, print, legend
├── app.js              # Core logic — 3-state toggle, progression gate, edge viz, paths, sync, print
├── supabase.js         # Supabase client init, auth, cloud save/load
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (v2 cache)
├── vercel.json         # Vercel static deployment config
├── data/
│   └── quests.json     # 100 quests with rewards, dependencies, paths
├── scraper/
│   └── scrape.js       # Wiki scraper — run `node scraper/scrape.js` to refresh
├── CLAUDE.md           # Project guide for AI tools
└── SESSION.md          # This file
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
| **Supabase** | (same user) | Project: arc-raiders-quest-planner |

**IMPORTANT**: Vercel (mattiasfalck) and GitHub (Phalck) are NOT linked. `git push` does NOT auto-deploy.

## How to Deploy After Code Changes

```bash
git add -A && git commit -m "description" && git push && vercel --prod
```

Verify at https://arc-raiders-quest-planner.vercel.app

## Supabase DB Schema

```sql
CREATE TABLE user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
  progress jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- RLS policies: SELECT/INSERT/UPDATE own row only
```

## Feature Roadmap

### Server-side
- **Settings/admin page** — clear local progress, delete account
- **Auto wiki scraper** — GitHub Actions cron + PR on quest data change

### Filtering & Display
- **Filter by map/location** — Location dropdown alongside Trader filter
- **Progress statistics counter** — e.g. "12/100 completed" in header

### Print Improvements
- **"Next 5" ticket** — Scan forward from last completed quest, print next 5 uncompleted with required items
- Collapsible required items/rewards in full print view

### UX Polish
- **"Join Expedition" reset** — one-click reset with confirmation dialog
- Better mobile touch handling for vis-network
- Manual node positioning to match wiki quest tree
- Connect GitHub ↔ Vercel for auto-deploy on push
