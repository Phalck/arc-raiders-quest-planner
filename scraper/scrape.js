const fs = require('fs');
const path = require('path');

const API_URL = 'https://arcraiders.wiki/w/api.php';

const TRADER_NAMES = {
  Shani: 'shani', Celeste: 'celeste', 'Tian Wen': 'tian_wen',
  Lance: 'lance', Apollo: 'apollo',
};

function slugify(name) {
  return name.toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

async function fetchRawPages(titles) {
  const all = {};
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: 'query', prop: 'revisions',
      titles: chunk.join('|'), rvprop: 'content',
      rvslots: 'main', format: 'json', origin: '*',
    });
    const res = await fetch(API_URL + '?' + params.toString(), {
      headers: { 'User-Agent': 'ArcRaidersQuestPlanner/1.0' },
    });
    const data = await res.json();
    for (const [id, page] of Object.entries(data.query.pages)) {
      all[page.title] = page.revisions?.[0]?.slots?.main?.['*'] || null;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return all;
}

function parseInfobox(wikitext) {
  const m = wikitext.match(/\{\{Infobox[ _]quest\s*([\s\S]*?)\n\}\}/);
  if (!m) return null;
  const info = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\|\s*(\w+)\s*=\s*(.*)/);
    if (kv) info[kv[1].toLowerCase()] = kv[2].trim();
  }
  return info;
}

function parsePreviousNext(raw) {
  if (!raw) return [];
  return raw.split(';').map(s => s.trim()).filter(Boolean);
}

function parseLocation(raw) {
  if (!raw || raw === '—') return 'Any';
  const m = raw.match(/\[\[([^\]|]+)/);
  return m ? m[1].replace(/_/g, ' ') : raw;
}

function parseQuestItemSections(wikitext) {
  const required = [];
  const rewards = [];

  const reqSection = wikitext.match(/==\s*Required\s*(?:Items?|items?)?\s*==\s*([\s\S]*?)(?===|$)/);
  if (reqSection) {
    const lines = reqSection[1];
    const itemMatches = lines.matchAll(/\{\{Quest\s*item\s*\|require\s*\|([^}]+)\}\}/gi);
    for (const m of itemMatches) {
      const parts = m[1].split('|').map(s => s.trim());
      const name = parts[0].replace(/_/g, ' ');
      required.push({ name, count: 1 });
    }
  }

  const rewardSection = wikitext.match(/==\s*Rewards?\s*==\s*([\s\S]*?)(?==\s*(?:Dialog|Guide|History)|\s*$)/i);
  if (rewardSection) {
    const lines = rewardSection[1];
    const itemMatches = lines.matchAll(/\{\{Quest\s*item\s*\|reward\s*\|([^}]+)\}\}/gi);
    for (const m of itemMatches) {
      const parts = m[1].split('|').map(s => s.trim());
      const typeIdx = parts.findIndex(p => p.startsWith('type='));
      const qtyIdx = parts.findIndex(p => p.startsWith('qty='));

      let type = 'item';
      if (typeIdx >= 0) type = parts[typeIdx].split('=')[1].trim();
      if (qtyIdx >= 0) {
        const qty = parseInt(parts[qtyIdx].split('=')[1]) || 1;
        const nameParts = parts.filter((_, i) => i !== qtyIdx && i !== typeIdx);
        const name = nameParts.length > 0 ?
          (nameParts.length === 1 ? nameParts[0].replace(/_/g, ' ') :
           nameParts[nameParts.length - 1].replace(/_/g, ' ')) : 'Coins';
        rewards.push({ name, count: qty, type });
      } else {
        const nameParts = parts.filter((_, i) => i !== typeIdx);
        const name = nameParts.length > 0 ? nameParts[nameParts.length - 1].replace(/_/g, ' ') : 'Unknown';
        rewards.push({ name, count: 1, type });
      }
    }
  }

  return { required, rewards };
}

async function main() {
  const titles = [
    'Picking Up The Pieces','Trash Into Treasure','Clearer Skies','Off The Radar',
    'Hatch Repairs','Down To Earth','The Trifecta','Dormant Barons',
    'A Lay Of The Land','Eyes in the Sky','Our Presence up There','Lost In Transmission',
    'Communication Hideout','Into The Fray','Deciphering The Data','Dust On The Wires',
    'A Dead End','Fragmented Logs','Furtive Meetings','With A Trace',
    'Cold Storage','Last Entry','Combat Recon','A Toxic Trail',
    'With A View','Clamoring for Attention','Mixed Signals','Waking the Grid',
    'A Prime Specimen','Out of the Shadows','Reduced to Rubble','Bombing Run',
    'The Stench Of Corruption',
    'A Bad Feeling','Greasing Her Palms','Straight Record','Keeping The Memory',
    'Echoes Of Victory Ridge','A Balanced Harvest','Untended Garden','A Symbol of Unification',
    'After Rain Comes','The Root Of The Matter',"Celeste's Journals",'Water Troubles',
    'Source Of The Contamination','Switching The Supply','Power Out','Flickering Threat',
    'Bees!','Tribute To Toledo','Digging Up Dirt','Worth Your Salt',
    'Line in the Sand','A Rising Tide','Turnabout','Keeping an Eye Out',
    'A Wrench in the Works',
    'The Right Tool','A Better Use','What We Left Behind','Broken Monument',
    'Marked For Death','Market Correction','Eyes On The Prize','Industrial Espionage',
    'Unexpected Initiative',"The Major's Footlocker",'Back on Top','Snap And Salvage',
    'Outstanding Balance','Safe Harbor','Collision Course','Settled in Full',
    'Stable Housing','Armored Transports',
    "Doctor's Orders",'Medical Merchandise','A Reveal In Ruins','Prescriptions Of The Past',
    'Life Of A Pharmacist','In My Image','On Deaf Ears','A New Type Of Plant','On The Map',
    'A Warm Place To Rest','Paving The Way','Espresso','Safe Passage','What Goes Around',
    'Groundbreaking','The Clean Dream','Sparks Fly','Building A Library','A First Foothold',
    'The League','Battening Down','Shoring Up Defenses','Test Case','Movie Night',
  ];

  console.log(`Fetching ${titles.length} quest pages...`);
  const rawPages = await fetchRawPages(titles);
  const quests = [];

  for (const title of titles) {
    const raw = rawPages[title];
    if (!raw) { console.log(`SKIP: ${title} — no content`); continue; }

    const info = parseInfobox(raw);
    if (!info) { console.log(`SKIP: ${title} — no infobox`); continue; }

    const { required, rewards } = parseQuestItemSections(raw);
    const coins = rewards.filter(r => r.type === 'coins').reduce((s, r) => s + r.count, 0);
    const blueprints = rewards.filter(r => r.type === 'blueprint' || r.name.toLowerCase().includes('blueprint'))
      .map(r => r.name.replace(/ Blueprint$/i, '').trim());

    const trader = TRADER_NAMES[info.trader] || info.trader?.toLowerCase() || null;
    const prev = parsePreviousNext(info.previous);
    const nxt = parsePreviousNext(info.next);

    const quest = {
      id: slugify(title),
      name: info.name || title,
      trader,
      location: parseLocation(info.location) || 'Any',
      requiredItems: required,
      rewards,
      previous: prev,
      next: nxt,
      coins,
      blueprints,
    };

    quests.push(quest);
    console.log(`OK: ${quest.name} — ${trader || '?'} [p:${prev.length} n:${nxt.length}]`);
  }

  console.log(`\nTotal: ${quests.length}`);
  const questMap = {};
  for (const q of quests) questMap[q.id] = q;

  // Normalize previous/next to IDs
  for (const q of quests) {
    q.previous = q.previous.map(p => {
      const f = quests.find(x => x.name.toLowerCase() === p.toLowerCase());
      return f ? f.id : slugify(p);
    }).filter(Boolean);
    q.next = q.next.map(n => {
      const f = quests.find(x => x.name.toLowerCase() === n.toLowerCase());
      return f ? f.id : slugify(n);
    }).filter(Boolean);
  }

  function tracePath(targetId) {
    const visited = new Set();
    const queue = [[targetId, [targetId]]];
    while (queue.length > 0) {
      const [cur, path] = queue.shift();
      const q = questMap[cur];
      if (!q || !q.previous?.length) return path;
      for (const p of q.previous) {
        if (!visited.has(p)) { visited.add(p); queue.push([p, [p, ...path]]); }
      }
    }
    return [targetId];
  }

  const hc = quests.find(q => q.blueprints.some(b => /hullcracker/i.test(b)));

  const output = {
    meta: { total: quests.length, generated: new Date().toISOString(), source: 'https://arcraiders.wiki' },
    quests,
    paths: {
      hullcracker: hc ? { quest: hc.id, path: tracePath(hc.id) } : null,
      coins: quests.filter(q => q.coins > 0).map(q => ({ quest: q.id, coins: q.coins, path: tracePath(q.id) })),
      blueprints: quests.filter(q => q.blueprints.length > 0).map(q => ({ quest: q.id, blueprints: q.blueprints, path: tracePath(q.id) })),
    },
  };

  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'quests.json'), JSON.stringify(output, null, 2));
  console.log('\nData written to data/quests.json');
}

main().catch(console.error);
