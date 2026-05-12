(function () {
  'use strict';

  const COLORS = {
    shani:     { bg: '#7dcfff', border: '#3b8db5', text: '#1a1b26' },
    celeste:   { bg: '#9ece6a', border: '#689d3a', text: '#1a1b26' },
    tian_wen:  { bg: '#e0af68', border: '#b8883e', text: '#1a1b26' },
    lance:     { bg: '#bb9af7', border: '#8b5cf6', text: '#1a1b26' },
    apollo:    { bg: '#ff9e64', border: '#d97a3e', text: '#1a1b26' },
  };

  const DIM = {
    shani:     { bg: '#1e3d47', border: '#2a5a6b', text: '#5a8a9a' },
    celeste:   { bg: '#2a3d1e', border: '#3d5a2a', text: '#6b9a4a' },
    tian_wen:  { bg: '#3d351e', border: '#5a4e2a', text: '#8a7a4a' },
    lance:     { bg: '#2e1e3d', border: '#452a5a', text: '#6b4a8a' },
    apollo:    { bg: '#3d2a1e', border: '#5a3e2a', text: '#8a6a4a' },
  };

  const COMPLETED = { bg: '#1a2b1a', border: '#4a8a4a', text: '#6aaa6a' };
  const ROOT_QUEST = 'picking_up_the_pieces';

  let questData, allQuests, questMap;
  let network, nodes, edges;
  let currentMode = 'full';
  let currentTrader = 'all';
  let currentSearch = '';
  let completedQuests = {};
  let longPressTimer = null;

  const networkEl = document.getElementById('mynetwork');
  const loadingEl = document.getElementById('loading');
  const detailEl = document.getElementById('questDetail');
  const traderFilter = document.getElementById('traderFilter');
  const searchInput = document.getElementById('searchInput');
  const printBtn = document.getElementById('printBtn');
  const menuToggle = document.getElementById('menuToggle');
  const mainNav = document.getElementById('mainNav');

  function lget() {
    try { return JSON.parse(localStorage.getItem('ar_completed_quests')) || {}; }
    catch { return {}; }
  }
  function lset() {
    localStorage.setItem('ar_completed_quests', JSON.stringify(completedQuests));
  }

  function getColors(trader, dim) {
    const key = dim ? DIM : COLORS;
    return key[trader] || { bg: '#444', border: '#555', text: '#aaa' };
  }

  function makeNodes(allQuests) {
    const arr = [];
    for (const q of allQuests) {
      const isDone = completedQuests[q.id];
      const colors = getColors(q.trader, false);
      arr.push({
        id: q.id,
        label: q.name,
        shape: 'box',
        color: {
          background: isDone ? COMPLETED.bg : colors.bg,
          border: isDone ? COMPLETED.border : colors.border,
          highlight: { background: colors.bg, border: '#7aa2f7' },
        },
        font: {
          color: isDone ? COMPLETED.text : colors.text,
          size: 12,
          face: 'system-ui, sans-serif',
        },
        borderWidth: isDone ? 2 : 1,
        borderWidthSelected: 2,
        margin: { top: 6, bottom: 6, left: 10, right: 10 },
        group: q.trader || 'unknown',
        quest: q,
        completed: isDone,
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
      const res = await fetch('data/quests.json');
      questData = await res.json();
      allQuests = questData.quests;
      questMap = {};
      for (const q of allQuests) questMap[q.id] = q;

      loadingEl.textContent = 'Building quest tree...';
      buildNetwork();
      loadingEl.style.display = 'none';
      wireUI();
    } catch (err) {
      loadingEl.textContent = 'Failed to load quest data: ' + err.message;
    }
  }

  function buildNetwork() {
    nodes = makeNodes(allQuests);
    edges = makeEdges(allQuests);

    const options = {
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'UD',
          sortMethod: 'directed',
          levelSeparation: 100,
          nodeSpacing: 130,
          treeSpacing: 180,
          blockShifting: true,
          edgeMinimization: true,
          parentCentralization: true,
        },
      },
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
        shadow: {
          enabled: false,
        },
      },
      groups: {},
    };

    for (const [t, c] of Object.entries(COLORS)) {
      options.groups[t] = { color: { background: c.bg, border: c.border } };
    }

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

    network.on('stabilized', function () {
      network.fit({ animation: { duration: 300 } });
    });
  }

  function toggleQuest(id) {
    const node = nodes.get(id);
    if (!node) return;
    completedQuests[id] = !completedQuests[id];
    node.completed = completedQuests[id];
    lset();

    const isDim = currentMode !== 'full' && node.quest && !isOnActivePath(node.quest);
    const base = getColors(node.quest?.trader, isDim);
    const done = node.completed;
    nodes.update({
      id,
      color: {
        background: done ? (isDim ? '#1a2b1a' : COMPLETED.bg) : base.bg,
        border: done ? (isDim ? '#3a6a3a' : COMPLETED.border) : base.border,
        highlight: { background: base.bg, border: '#7aa2f7' },
      },
      font: { color: done ? (isDim ? '#5a8a5a' : COMPLETED.text) : base.text, size: isDim ? 10 : 12 },
      borderWidth: done ? 2 : 1,
    });
  }

  function isOnActivePath(q) {
    if (currentMode === 'full') return true;
    const pathIds = getPathIds();
    return pathIds.has(q.id);
  }

  function getPathIds() {
    const set = new Set();
    if (currentMode === 'hullcracker') {
      const hp = questData.paths.hullcracker;
      if (hp) for (const id of hp.path) set.add(id);
    } else if (currentMode === 'coins') {
      for (const cp of questData.paths.coins)
        for (const id of cp.path) set.add(id);
    } else if (currentMode === 'blueprints') {
      for (const bp of questData.paths.blueprints)
        for (const id of bp.path) set.add(id);
    }
    return set;
  }

  function applyMode(mode) {
    currentMode = mode;

    if (mode === 'full') {
      for (const node of nodes.get()) {
        const q = node.quest;
        const base = getColors(q?.trader, false);
        const done = completedQuests[node.id];
        nodes.update({
          id: node.id,
          color: {
            background: done ? COMPLETED.bg : base.bg,
            border: done ? COMPLETED.border : base.border,
            highlight: { background: base.bg, border: '#7aa2f7' },
          },
          font: { color: done ? COMPLETED.text : base.text, size: 12 },
          borderWidth: done ? 2 : 1,
          shape: 'box',
        });
      }
      for (const edge of edges.get()) {
        edges.update({
          id: edge.id,
          color: { color: '#3b4261', highlight: '#7aa2f7' },
          width: 1.2,
          dashes: false,
        });
      }
      return;
    }

    const pathIds = getPathIds();

    for (const node of nodes.get()) {
      const onPath = pathIds.has(node.id);
      const q = node.quest;
      const base = getColors(q?.trader, !onPath);
      const done = completedQuests[node.id];
      nodes.update({
        id: node.id,
        color: {
          background: done ? (onPath ? COMPLETED.bg : '#1a2b1a') : base.bg,
          border: onPath ? '#7aa2f7' : (done ? COMPLETED.border : base.border),
          highlight: { background: base.bg, border: '#7aa2f7' },
        },
        font: { color: done ? (onPath ? COMPLETED.text : '#5a8a5a') : base.text, size: onPath ? 12 : 10 },
        borderWidth: onPath ? 2 : (done ? 2 : 1),
        shadow: onPath ? { enabled: true, color: 'rgba(122,162,247,0.3)', size: 10 } : { enabled: false },
      });
    }

    for (const edge of edges.get()) {
      const onPath = pathIds.has(edge.to) && pathIds.has(edge.from);
      edges.update({
        id: edge.id,
        color: { color: onPath ? '#7aa2f7' : '#2a2d3a', highlight: '#7aa2f7' },
        width: onPath ? 2.5 : 0.4,
        dashes: !onPath,
      });
    }
  }

  function showDetail(id) {
    const q = questMap[id];
    if (!q) return;
    const base = getColors(q.trader, false);
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
    html += `<div class="dr" style="margin-top:6px;color:${done ? 'var(--green)' : 'var(--fg2)'}"><strong>Status:</strong> ${done ? '✓ Completed' : 'Not completed'}</div>`;
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
        const c = completedQuests[id] ? '✓' : '';
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
        const c = completedQuests[id] ? '✓' : '';
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
        const c = completedQuests[id] ? '✓' : '';
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
        const c = completedQuests[q.id] ? '✓' : '';
        html += `<div class="pq"><span class="cb">${c}</span><div><span class="qn">${q.name}</span></div></div>`;
      }
    }
    html += '</div>';

    content.innerHTML = html;
    window.print();
  }

  function applyFilters() {
    const trader = currentTrader;
    const search = currentSearch;
    for (const node of nodes.get()) {
      const q = node.quest;
      let visible = true;
      if (trader !== 'all' && q?.trader !== trader) visible = false;
      if (search && q && !q.name.toLowerCase().includes(search)) visible = false;
      nodes.update({ id: node.id, hidden: !visible });
    }
    for (const edge of edges.get()) {
      const f = nodes.get(edge.from);
      const t = nodes.get(edge.to);
      const hidden = !f || !t || f.hidden || t.hidden;
      edges.update({ id: edge.id, hidden });
    }
    if (trader !== 'all' || search) network.fit({ animation: true, padding: 20 });
  }

  function wireUI() {
    document.querySelectorAll('.nav-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.nav-btn[data-mode]').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        applyMode(this.dataset.mode);
      });
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

    menuToggle.addEventListener('click', function () {
      mainNav.classList.toggle('collapsed');
    });

    document.querySelectorAll('.legend-item').forEach(item => {
      item.addEventListener('click', function () {
        const t = this.dataset.trader;
        traderFilter.value = t === traderFilter.value ? 'all' : t;
        traderFilter.dispatchEvent(new Event('change'));
      });
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
