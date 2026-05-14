(function () {
  'use strict';

  const UNIFORM = { bg: '#2a2d3e', border: '#3b4261', text: '#c0caf5' };
  const UNIFORM_DIM = { bg: '#1a1a2a', border: '#2a2a3a', text: '#5a5a7a' };
  const PATH_HIGHLIGHT = {
    coins: '#e0af68',
    blueprints: '#bb9af7',
  };

  const STATE_COLORS = {
    completed: { bg: '#1a2b1a', border: '#4a8a4a', text: '#6aaa6a', prefix: '\u2713 ' },
    tracked:   { bg: '#2a2a1a', border: '#d7a83e', text: '#d7b84a', prefix: '\u25c9 ' },
  };
  const DIM_STATES = {
    completed: { bg: '#1a2b1a', border: '#3a6a3a', text: '#5a8a5a', prefix: '\u2713 ' },
    tracked:   { bg: '#1a1a0e', border: '#7a6a1e', text: '#8a8a3a', prefix: '\u25c9 ' },
  };
  const ROOT_QUEST = 'picking_up_the_pieces';

  const MAP_ORDER = ['Any', 'Riven Tides', 'Stella Montis', 'Spaceport', 'Buried City', 'Dam Battlegrounds', 'The Blue Gate'];
  const MAP_COLORS = {
    'Any': '#565f89',
    'Riven Tides': '#7dcfff',
    'Stella Montis': '#9ece6a',
    'Spaceport': '#ff9e64',
    'Buried City': '#e0af68',
    'Dam Battlegrounds': '#f7768e',
    'The Blue Gate': '#bb9af7',
  };
  const COLUMN_BG = {
    'Any': 'rgba(86,95,137,0.10)',
    'Riven Tides': 'rgba(125,207,255,0.10)',
    'Stella Montis': 'rgba(158,206,106,0.10)',
    'Spaceport': 'rgba(255,158,100,0.10)',
    'Buried City': 'rgba(224,175,104,0.10)',
    'Dam Battlegrounds': 'rgba(247,118,142,0.10)',
    'The Blue Gate': 'rgba(187,154,247,0.10)',
  };
  const COLUMN_WIDTH = 280;
  const COLUMN_GAP = 100;
  const LEVEL_HEIGHT = 100;
  const SIBLING_OFFSET = 30;

  let questData, allQuests, questMap;
  let network, nodes, edges;
  let currentMode = 'full';
  let currentTrader = 'all';
  let currentLocation = 'all';
  let currentSearch = '';
  let currentPathQuest = null;
  let currentPathType = null;
  let completedQuests = {};
  let childrenOf = {};
  let questDepths = {};
  let longPressTimer = null;

  const networkEl = document.getElementById('mynetwork');
  const loadingEl = document.getElementById('loading');
  const detailEl = document.getElementById('questDetail');
  const locationFilter = document.getElementById('locationFilter');
  const traderFilter = document.getElementById('traderFilter');
  const searchInput = document.getElementById('searchInput');
  const printBtn = document.getElementById('printBtn');

  function lget() {
    try { return JSON.parse(localStorage.getItem('ar_completed_quests')) || {}; }
    catch { return {}; }
  }
  function lset() {
    localStorage.setItem('ar_completed_quests', JSON.stringify(completedQuests));
  }

  function getStateStyle(state, dim) {
    if (state === 'completed' || state === true) return dim ? DIM_STATES.completed : STATE_COLORS.completed;
    if (state === 'tracked') return dim ? DIM_STATES.tracked : STATE_COLORS.tracked;
    return null;
  }

  function getPrintSymbol(id) {
    const s = completedQuests[id];
    if (s === 'completed' || s === true) return '\u2713';
    if (s === 'tracked') return '\u25c9';
    return '';
  }

  function getPrimaryMap(location) {
    return location.split(';')[0].trim();
  }

  function buildNodeLabel(q, state, prefix) {
    let label = prefix + q.name;
    for (const r of q.rewards) {
      if (r.type === 'coins') label += '\n💰 ' + Number(r.count).toLocaleString() + ' Coins';
      else if (r.type === 'blueprint') label += '\n📘 ' + r.name;
    }
    return label;
  }

  function cloudSave() {
    if (window.__arSupabase) {
      window.__arSupabase.saveProgress(completedQuests);
    }
  }

  window.__arLoadProgress = function (cloudProgress) {
    completedQuests = cloudProgress || {};
    lset();
    currentPathQuest = null;
    currentPathType = null;
    document.getElementById('coinSelect').value = '';
    document.getElementById('blueprintSelect').value = '';
    if (typeof applyMode === 'function') {
      applyMode('full');
      applyFilters();
    }
    if (typeof renderTrackedPath === 'function') renderTrackedPath();
  };

  function computeNodeLayout() {
    const depths = {};
    const queue = [{ id: ROOT_QUEST, depth: 0 }];
    const visited = new Set();
    while (queue.length) {
      const { id, depth } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      depths[id] = depth;
      const kids = childrenOf[id];
      if (kids) {
        for (const kidId of kids) queue.push({ id: kidId, depth: depth + 1 });
      }
    }
    const maxDepth = Object.values(depths).length ? Math.max(...Object.values(depths)) : 0;
    for (const q of allQuests) {
      if (!visited.has(q.id)) depths[q.id] = maxDepth + 1;
    }

    questDepths = depths;

    const byMap = {};
    for (const q of allQuests) {
      const map = getPrimaryMap(q.location);
      const depth = depths[q.id];
      if (!byMap[map]) byMap[map] = {};
      if (!byMap[map][depth]) byMap[map][depth] = [];
      byMap[map][depth].push(q.id);
    }

    const positions = {};
    for (const q of allQuests) {
      const map = getPrimaryMap(q.location);
      let colIdx = MAP_ORDER.indexOf(map);
      if (colIdx === -1) colIdx = MAP_ORDER.indexOf('Any');
      const depth = depths[q.id];
      const siblings = (byMap[map] && byMap[map][depth]) || [q.id];
      const sibIdx = siblings.indexOf(q.id);
      const totalSibs = siblings.length;
      const colStart = colIdx * (COLUMN_WIDTH + COLUMN_GAP);
      const padding = 10;
      const usable = COLUMN_WIDTH - 2 * padding;
      const x = totalSibs > 1
        ? colStart + padding + sibIdx * (usable / (totalSibs - 1))
        : colStart + COLUMN_WIDTH / 2;
      const y = depth * LEVEL_HEIGHT + 50;
      positions[q.id] = { x, y };
    }
    return positions;
  }

  function makeNodes(allQuests, positions) {
    const arr = [];
    for (const q of allQuests) {
      const pos = positions[q.id];
      const state = completedQuests[q.id] || null;
      const base = UNIFORM;
      const stateClr = getStateStyle(state, false);
      const prefix = stateClr ? stateClr.prefix : '';
      const map = getPrimaryMap(q.location);
      const mapColor = MAP_COLORS[map] || MAP_COLORS['Any'];
      arr.push({
        id: q.id,
        label: buildNodeLabel(q, state, prefix),
        shape: 'box',
        x: pos.x,
        y: pos.y,
        fixed: { x: true, y: true },
        color: {
          background: stateClr ? stateClr.bg : base.bg,
          border: stateClr ? stateClr.border : mapColor,
          highlight: { background: base.bg, border: mapColor },
        },
        font: {
          color: stateClr ? stateClr.text : base.text,
          size: 12,
          face: 'system-ui, sans-serif',
        },
        widthConstraint: 100,
        heightConstraint: { minimum: 85 },
        borderWidth: stateClr ? 2 : 1,
        borderWidthSelected: 2,
        margin: { top: 4, bottom: 4, left: 6, right: 6 },
        quest: q,
        state: state,
        completed: state === 'completed',
      });
    }
    return new vis.DataSet(arr);
  }

  function makeEdges(allQuests) {
    const added = new Set();
    const arr = [];
    for (const q of allQuests) {
      for (const prev of q.previous) {
        const id = prev + '->' + q.id;
        if (!added.has(id)) {
          added.add(id);
          arr.push({
            id, from: prev, to: q.id,
            arrows: { to: { enabled: true, scaleFactor: 0.6 } },
            color: { color: '#3b4261', highlight: '#7aa2f7' },
            width: 1.2,
            smooth: { type: 'curvedCW', roundness: 0.1 },
          });
        }
      }
    }
    return new vis.DataSet(arr);
  }

  async function init() {
    try {
      completedQuests = lget();
      let needsMigrate = false;
      for (const [id, val] of Object.entries(completedQuests)) {
        if (val === true) { completedQuests[id] = 'completed'; needsMigrate = true; }
      }
      if (needsMigrate) lset();
      const res = await fetch('data/quests.json');
      questData = await res.json();
      allQuests = questData.quests;
      for (const q of allQuests) {
        if (q.location.includes('Blue Gate') && !q.location.includes('The Blue Gate')) {
          q.location = q.location.replace(/\bBlue Gate\b/g, 'The Blue Gate');
        }
      }
      questMap = {};
      childrenOf = {};
      for (const q of allQuests) {
        questMap[q.id] = q;
        for (const pid of q.previous) {
          if (!childrenOf[pid]) childrenOf[pid] = [];
          childrenOf[pid].push(q.id);
        }
      }

      populatePathDropdowns();
      loadingEl.textContent = 'Building quest tree...';
      buildNetwork();
      loadingEl.style.display = 'none';
      wireUI();
      renderTrackedPath();
      if (window.__arSupabase) window.__arSupabase.init();
    } catch (err) {
      loadingEl.textContent = 'Failed to load quest data: ' + err.message;
    }
  }

  function buildNetwork() {
    const positions = computeNodeLayout();
    nodes = makeNodes(allQuests, positions);
    edges = makeEdges(allQuests);

    const options = {
      layout: { hierarchical: false },
      interaction: {
        hover: true,
        tooltipStyle: 'background:#24283b;color:#c0caf5;border-radius:6px;padding:8px 10px;font-size:12px;',
        navigationButtons: true,
        keyboard: true,
        zoomView: true,
        dragView: true,
      },
      physics: { enabled: false },
      edges: {
        smooth: { type: 'curvedCW', roundness: 0.1 },
      },
      nodes: {
        shape: 'box', borderWidth: 1,
        widthConstraint: 100,
        heightConstraint: { minimum: 85 },
        shadow: { enabled: false },
      },
      groups: {},
    };

    network = new vis.Network(networkEl, { nodes, edges }, options);

    network.on('click', function (params) {
      if (params.nodes.length > 0) {
        toggleQuest(params.nodes[0]);
      }
    });

    network.on('doubleClick', function (params) {
      if (params.nodes.length > 0) {
        showDetail(params.nodes[0]);
      }
    });

    network.on('beforeDrawing', function (ctx) {
      const height = 10000;
      for (let i = 0; i < MAP_ORDER.length; i++) {
        const map = MAP_ORDER[i];
        const cx = i * (COLUMN_WIDTH + COLUMN_GAP) + COLUMN_WIDTH / 2;
        ctx.save();
        ctx.fillStyle = COLUMN_BG[map];
        ctx.fillRect(cx - COLUMN_WIDTH / 2, -500, COLUMN_WIDTH, height);
        ctx.restore();
        ctx.save();
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = MAP_COLORS[map];
        ctx.fillText(map, cx, -64);
        ctx.restore();
      }
    });

    const allN = nodes.get();
    let minX = Infinity, maxX = -Infinity;
    for (const n of allN) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
    }
    const span = maxX - minX || 1;
    const containerWidth = networkEl.clientWidth;
    const containerHeight = networkEl.clientHeight;
    const scale = Math.max(0.5, (0.85 * containerWidth) / span);
    const centerX = (minX + maxX) / 2;
    const titleY = -72;
    const viewY = titleY + (containerHeight / 2 - 50) / scale;
    network.moveTo({
      position: { x: centerX, y: viewY },
      scale,
      animation: { duration: 300 },
    });
  }

  function toggleQuest(id) {
    const node = nodes.get(id);
    if (!node) return;
    const q = node.quest;

    const current = completedQuests[id];
    let newState;

    if (!current) {
      newState = 'tracked';
    } else if (current === 'tracked') {
      if (canComplete(q)) {
        newState = 'completed';
      } else {
        newState = null;
      }
    } else {
      newState = null;
      cascadeUncomplete(id);
    }

    if (newState) {
      completedQuests[id] = newState;
    } else {
      delete completedQuests[id];
    }

    lset();
    cloudSave();
    if (currentPathQuest) {
      applyOptimalPath();
    } else {
      applyMode(currentMode);
    }
    renderTrackedPath();
  }

  function canComplete(q) {
    if (q.id === ROOT_QUEST) return true;
    if (!q.previous || q.previous.length === 0) return true;
    return q.previous.every(pid => completedQuests[pid] === 'completed');
  }

  function cascadeUncomplete(id) {
    const stack = [id];
    while (stack.length) {
      const qid = stack.pop();
      const kids = childrenOf[qid];
      if (!kids) continue;
      for (const kidId of kids) {
        if (completedQuests[kidId] === 'completed') {
          delete completedQuests[kidId];
          stack.push(kidId);
        }
      }
    }
  }

  function computeEdgeStyles() {
    const boldEdges = new Set();
    const dashedEdges = new Set();

    const tracked = allQuests.filter(q => completedQuests[q.id] === 'tracked');
    if (tracked.length === 0) return { boldEdges, dashedEdges };

    const visited = new Set();

    function walkUp(questId) {
      if (visited.has(questId)) return;
      visited.add(questId);

      const q = questMap[questId];
      if (!q) return;

      for (const pid of q.previous) {
        const edgeId = pid + '->' + questId;
        const childState = completedQuests[questId];

        if (childState === 'completed') {
          boldEdges.add(edgeId);
        } else {
          dashedEdges.add(edgeId);
        }

        walkUp(pid);
      }
    }

    for (const q of tracked) {
      walkUp(q.id);
    }

    return { boldEdges, dashedEdges };
  }

  function applyMode(mode) {
    currentMode = mode;

    if (mode === 'full') {
      for (const node of nodes.get()) {
        const q = node.quest;
        const base = UNIFORM;
        const state = completedQuests[node.id] || null;
        const stateClr = getStateStyle(state, false);
        const prefix = stateClr ? stateClr.prefix : '';
        const map = getPrimaryMap(q.location);
        const mapColor = MAP_COLORS[map] || MAP_COLORS['Any'];
        nodes.update({
          id: node.id,
          label: buildNodeLabel(q, state, prefix),
          color: {
            background: stateClr ? stateClr.bg : base.bg,
            border: stateClr ? stateClr.border : mapColor,
            highlight: { background: base.bg, border: mapColor },
          },
          font: { color: stateClr ? stateClr.text : base.text, size: 12 },
          borderWidth: stateClr ? 2 : 1,
          shape: 'box',
        });
      }
      const { boldEdges, dashedEdges } = computeEdgeStyles();
      for (const edge of edges.get()) {
        let width = 1.2;
        let dashes = false;
        let color = '#3b4261';

        if (boldEdges.has(edge.id)) {
          width = 2.5;
          color = '#7aa2f7';
        } else if (dashedEdges.has(edge.id)) {
          width = 2;
          dashes = true;
          color = '#7aa2f7';
        }

        edges.update({
          id: edge.id,
          color: { color, highlight: '#7aa2f7' },
          width,
          dashes,
        });
      }
    }
  }

  function populatePathDropdowns() {
    const coinSelect = document.getElementById('coinSelect');
    for (const entry of questData.paths.coins) {
      const q = questMap[entry.quest];
      const opt = document.createElement('option');
      opt.value = entry.quest;
      opt.textContent = Number(entry.coins).toLocaleString() + ' Coins';
      coinSelect.appendChild(opt);
    }
    const bpSelect = document.getElementById('blueprintSelect');
    for (const entry of questData.paths.blueprints) {
      const opt = document.createElement('option');
      opt.value = entry.quest;
      opt.textContent = entry.blueprints.join(', ');
      bpSelect.appendChild(opt);
    }
  }

  function applyOptimalPath() {
    if (!currentPathQuest || !currentPathType) {
      applyMode('full');
      return;
    }

    let path = null;
    const highlightColor = PATH_HIGHLIGHT[currentPathType] || '#7aa2f7';

    if (currentPathType === 'coins') {
      const entry = questData.paths.coins.find(c => c.quest === currentPathQuest);
      if (entry) path = entry.path;
    } else if (currentPathType === 'blueprints') {
      const entry = questData.paths.blueprints.find(b => b.quest === currentPathQuest);
      if (entry) path = entry.path;
    }

    if (!path) { applyMode('full'); return; }

    const pathIds = new Set(path);

    for (const node of nodes.get()) {
      const onPath = pathIds.has(node.id);
      const q = node.quest;
      const state = completedQuests[node.id] || null;
      const stateClr = getStateStyle(state, !onPath);
      const base = onPath ? UNIFORM : UNIFORM_DIM;
      const prefix = stateClr ? stateClr.prefix : '';
      nodes.update({
        id: node.id,
        label: buildNodeLabel(q, state, prefix),
        color: {
          background: stateClr ? stateClr.bg : base.bg,
          border: onPath ? highlightColor : (stateClr ? stateClr.border : base.border),
          highlight: { background: base.bg, border: highlightColor },
        },
        font: { color: stateClr ? stateClr.text : base.text, size: onPath ? 12 : 10 },
        borderWidth: onPath ? 2 : (stateClr ? 2 : 1),
        shadow: onPath ? { enabled: true, color: 'rgba(122,162,247,0.3)', size: 10 } : { enabled: false },
      });
    }

    for (const edge of edges.get()) {
      const onPath = pathIds.has(edge.to) && pathIds.has(edge.from);
      edges.update({
        id: edge.id,
        color: { color: onPath ? highlightColor : '#2a2d3a', highlight: highlightColor },
        width: onPath ? 2.5 : 0.4,
        dashes: !onPath,
      });
    }
  }

  function renderTrackedPath() {
    const content = document.getElementById('psbContent');
    const title = document.getElementById('psbQuestName');

    const tracked = allQuests.filter(q => completedQuests[q.id] === 'tracked');
    const hasTracked = tracked.length > 0;

    if (!hasTracked) {
      content.innerHTML = '<div class="psb-empty">Track a quest to see its path</div>';
      title.textContent = '';
      return;
    }

    const pathIds = new Set();
    const visited = new Set();

    function walkUp(questId) {
      if (visited.has(questId)) return;
      visited.add(questId);
      pathIds.add(questId);
      const q = questMap[questId];
      if (!q) return;
      for (const pid of q.previous) {
        walkUp(pid);
      }
    }

    for (const q of tracked) {
      walkUp(q.id);
    }

    const sorted = [...pathIds].sort((a, b) => {
      return (questDepths[a] ?? 0) - (questDepths[b] ?? 0);
    });

    const names = tracked.map(q => q.name);
    title.textContent = names.length === 1 ? names[0] : names.join(', ');

    let html = '';
    for (const id of sorted) {
      const q = questMap[id];
      if (!q) continue;
      const state = completedQuests[id];
      const isDone = state === 'completed' || state === true;
      const isTracked = state === 'tracked';
      const checked = isDone ? '✓' : '';
      const cbClass = isDone ? 'psb-cb checked' : isTracked ? 'psb-cb tracked' : 'psb-cb';
      const map = getPrimaryMap(q.location);
      html += '<div class="psb-item" data-id="' + id + '">'
        + '<span class="' + cbClass + '">' + checked + '</span>'
        + '<div class="psb-item-text">'
        + '<div class="psb-name">' + q.name + '</div>'
        + '<div class="psb-map">' + map + '</div>'
        + '</div></div>';
    }
    content.innerHTML = html;

    for (const el of content.querySelectorAll('.psb-item')) {
      el.addEventListener('click', function () {
        toggleQuest(this.dataset.id);
      });
    }
  }

  function showDetail(id) {
    const q = questMap[id];
    if (!q) return;
    const base = UNIFORM;
    const done = completedQuests[id];
    let html = '<button class="close-btn" onclick="document.getElementById(\'questDetail\').classList.add(\'hidden\')">✕</button>';
    html += `<h2 style="color:${base.bg}">${q.name}</h2>`;
    html += `<div class="dr"><strong>Trader:</strong> ${q.trader}</div>`;
    html += `<div class="dr"><strong>Location:</strong> ${q.location}</div>`;
    if (q.requiredItems.length) {
      html += `<div class="dr"><strong>Required:</strong> ${q.requiredItems.map(i => i.count + '× ' + i.name).join(', ')}</div>`;
    }
    if (q.rewards.length) {
      html += '<div class="dr"><strong>Rewards:</strong></div><ul class="rl">';
      for (const r of q.rewards) {
        const icon = r.type === 'blueprint' ? '📘' : r.type === 'coins' ? '💰' : r.type === 'cosmetic' ? '🎨' : '';
        html += `<li>${icon} ${r.count > 1 ? r.count + '× ' : ''}${r.name}</li>`;
      }
      html += '</ul>';
    }
    if (q.previous.length) {
      html += `<div class="dr"><strong>Requires:</strong> ${q.previous.map(p => questMap[p]?.name || p).join(', ')}</div>`;
    }
    const state = completedQuests[id];
    const isLegacyDone = state === true;
    const statusText = isLegacyDone || state === 'completed' ? '✓ Completed' : state === 'tracked' ? '◉ Tracked' : 'Not completed';
    const statusColor = isLegacyDone || state === 'completed' ? 'var(--green)' : state === 'tracked' ? 'var(--yellow)' : 'var(--fg2)';
    html += `<div class="dr" style="margin-top:6px;color:${statusColor}"><strong>Status:</strong> ${statusText}</div>`;
    html += `<button class="dt-btn" onclick="document.querySelector('#questDetail .close-btn').click()">Close</button>`;

    detailEl.innerHTML = html;
    detailEl.classList.remove('hidden');
  }

  function generatePrint() {
    document.getElementById('printDate').textContent = new Date().toLocaleDateString();
    const content = document.getElementById('printContent');
    let html = '';

    // Hullcracker
    const hc = questData.paths.hullcracker;
    if (hc) {
      html += '<div class="ps"><h2>🔧 Hullcracker Blueprint</h2>';
      for (const id of hc.path) {
        const q = questMap[id];
        if (!q) continue;
        const c = getPrintSymbol(id);
        html += `<div class="pq"><span class="cb">${c}</span><div><span class="qn">${q.name}</span> <span class="qm">— ${q.trader}</span></div></div>`;
      }
      html += '</div>';
    }

    // Coins
    html += '<div class="ps"><h2>💰 Coin Rewards</h2>';
    for (const cp of questData.paths.coins) {
      const t = questMap[cp.quest];
      html += `<div class="pgl">${t?.name} — ${cp.coins} Coins</div>`;
      for (const id of cp.path) {
        const q = questMap[id];
        if (!q) continue;
        const c = getPrintSymbol(id);
        html += `<div class="pq"><span class="cb">${c}</span><div><span class="qn">${q.name}</span> <span class="qm">— ${q.trader}</span></div></div>`;
      }
    }
    html += '</div>';

    // Blueprints
    html += '<div class="ps"><h2>📘 All Blueprint Quests</h2>';
    for (const bp of questData.paths.blueprints) {
      const t = questMap[bp.quest];
      html += `<div class="pgl">${t?.name} — ${bp.blueprints.join(', ')}</div>`;
      for (const id of bp.path) {
        const q = questMap[id];
        if (!q) continue;
        const c = getPrintSymbol(id);
        html += `<div class="pq"><span class="cb">${c}</span><div><span class="qn">${q.name}</span> <span class="qm">— ${q.trader}</span></div></div>`;
      }
    }
    html += '</div>';

    // All by trader
    html += '<div class="ps"><h2>📋 All Quests</h2>';
    for (const trader of ['shani', 'celeste', 'tian_wen', 'lance', 'apollo']) {
      const list = allQuests.filter(q => q.trader === trader);
      if (!list.length) continue;
      html += `<div class="pgl">${trader.charAt(0).toUpperCase() + trader.slice(1).replace('_', ' ')}</div>`;
      for (const q of list) {
        const c = getPrintSymbol(q.id);
        html += `<div class="pq"><span class="cb">${c}</span><div><span class="qn">${q.name}</span></div></div>`;
      }
    }
    html += '</div>';

    content.innerHTML = html;
    window.print();
  }

  function applyFilters() {
    const trader = currentTrader;
    const location = currentLocation;
    const search = currentSearch;
    for (const node of nodes.get()) {
      const q = node.quest;
      let visible = true;
      if (trader !== 'all' && q?.trader !== trader) visible = false;
      if (location !== 'all') {
        const parts = q.location.split(';').map(s => s.trim());
        if (!parts.includes(location)) visible = false;
      }
      if (search && q && !q.name.toLowerCase().includes(search)) visible = false;
      nodes.update({ id: node.id, hidden: !visible });
    }
    for (const edge of edges.get()) {
      const f = nodes.get(edge.from);
      const t = nodes.get(edge.to);
      const hidden = !f || !t || f.hidden || t.hidden;
      edges.update({ id: edge.id, hidden });
    }
    if (trader !== 'all' || location !== 'all' || search) network.fit({ animation: true, padding: 20 });
  }

  function resetAllProgress() {
    completedQuests = {};
    lset();
    cloudSave();
    currentPathQuest = null;
    currentPathType = null;
    document.getElementById('coinSelect').value = '';
    document.getElementById('blueprintSelect').value = '';
    renderTrackedPath();
    applyMode('full');
  }

  function openSettings() {
    const modal = document.getElementById('settingsModal');
    const deleteSection = document.getElementById('deleteAccountSection');
    const errorEl = document.getElementById('settingsError');
    errorEl.classList.add('hidden');
    if (window.__arSupabase && window.__arSupabase.user) {
      deleteSection.classList.remove('hidden');
    } else {
      deleteSection.classList.add('hidden');
    }
    modal.classList.remove('hidden');
  }

  function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
    document.getElementById('resetProgressBtn').disabled = false;
    document.getElementById('resetProgressBtn').textContent = 'Reset All Progress';
    document.getElementById('deleteAccountBtn').disabled = false;
    document.getElementById('deleteAccountBtn').textContent = 'Delete Account & Data';
    document.getElementById('settingsError').classList.add('hidden');
  }

  function wireUI() {
    document.getElementById('resetTrackerBtn').addEventListener('click', function () {
      let changed = false;
      for (const id of Object.keys(completedQuests)) {
        if (completedQuests[id] === 'tracked') {
          delete completedQuests[id];
          changed = true;
        }
      }
      if (changed) {
        lset();
        cloudSave();
      }
      document.getElementById('coinSelect').value = '';
      document.getElementById('blueprintSelect').value = '';
      currentPathQuest = null;
      currentPathType = null;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      applyMode('full');
      renderTrackedPath();
    });

    locationFilter.addEventListener('change', function () {
      currentLocation = this.value;
      applyFilters();
    });

    traderFilter.addEventListener('change', function () {
      currentTrader = this.value;
      applyFilters();
    });

    searchInput.addEventListener('input', function () {
      currentSearch = this.value.toLowerCase().trim();
      applyFilters();
    });

    printBtn.addEventListener('click', generatePrint);

    document.getElementById('coinSelect').addEventListener('change', function () {
      document.getElementById('resetTrackerBtn').classList.remove('active');
      currentPathQuest = this.value || null;
      currentPathType = this.value ? 'coins' : null;
      if (!currentPathQuest) document.getElementById('resetTrackerBtn').classList.add('active');
      document.getElementById('blueprintSelect').value = '';
      applyOptimalPath();
    });

    document.getElementById('blueprintSelect').addEventListener('change', function () {
      document.getElementById('resetTrackerBtn').classList.remove('active');
      currentPathQuest = this.value || null;
      currentPathType = this.value ? 'blueprints' : null;
      if (!currentPathQuest) document.getElementById('resetTrackerBtn').classList.add('active');
      document.getElementById('coinSelect').value = '';
      applyOptimalPath();
    });

    document.querySelectorAll('.legend-item[data-map]').forEach(item => {
      item.addEventListener('click', function () {
        const m = this.dataset.map;
        locationFilter.value = m === locationFilter.value ? 'all' : m;
        locationFilter.dispatchEvent(new Event('change'));
      });
    });

    // Settings
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('settingsModalClose').addEventListener('click', closeSettings);
    document.getElementById('settingsModal').addEventListener('click', function (e) {
      if (e.target === this) closeSettings();
    });

    document.getElementById('resetProgressBtn').addEventListener('click', function () {
      if (this.textContent !== 'Confirm? Reset All') {
        this.textContent = 'Confirm? Reset All';
        this.disabled = false;
        setTimeout(() => { if (this.textContent === 'Confirm? Reset All') { this.textContent = 'Reset All Progress'; } }, 4000);
        return;
      }
      resetAllProgress();
      closeSettings();
    });

    document.getElementById('signOutBtn').addEventListener('click', async function () {
      if (window.__arSupabase) await window.__arSupabase.signOut();
      closeSettings();
    });

    document.getElementById('deleteAccountBtn').addEventListener('click', async function () {
      if (this.textContent !== 'Confirm? Delete Forever') {
        this.textContent = 'Confirm? Delete Forever';
        this.disabled = false;
        setTimeout(() => { if (this.textContent === 'Confirm? Delete Forever') { this.textContent = 'Delete Account & Data'; } }, 4000);
        return;
      }
      this.disabled = true;
      this.textContent = 'Deleting...';
      const errorEl = document.getElementById('settingsError');
      try {
        if (window.__arSupabase) await window.__arSupabase.deleteAccount();
        resetAllProgress();
        closeSettings();
      } catch (err) {
        errorEl.textContent = 'Failed to delete account: ' + err.message;
        errorEl.classList.remove('hidden');
        this.disabled = false;
        this.textContent = 'Delete Account & Data';
      }
    });

    document.addEventListener('click', function (e) {
      if (!detailEl.classList.contains('hidden') &&
          !detailEl.contains(e.target) &&
          !e.target.closest('#mynetwork')) {
        detailEl.classList.add('hidden');
      }
    });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
