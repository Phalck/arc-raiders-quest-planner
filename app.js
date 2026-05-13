(function () {
  'use strict';

  const UNIFORM = { bg: '#2a2d3e', border: '#3b4261', text: '#c0caf5' };
  const UNIFORM_DIM = { bg: '#1a1a2a', border: '#2a2a3a', text: '#5a5a7a' };
  const MODE_HIGHLIGHT = {
    hullcracker: '#7aa2f7',
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

  let questData, allQuests, questMap;
  let network, nodes, edges;
  let currentMode = 'full';
  let currentTrader = 'all';
  let currentSearch = '';
  let completedQuests = {};
  let childrenOf = {};
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
    if (typeof applyMode === 'function') {
      applyMode(currentMode);
      applyFilters();
    }
  };

  function makeNodes(allQuests) {
    const arr = [];
    for (const q of allQuests) {
      const state = completedQuests[q.id] || null;
      const base = UNIFORM;
      const stateClr = getStateStyle(state, false);
      const prefix = stateClr ? stateClr.prefix : '';
      arr.push({
        id: q.id,
        label: buildNodeLabel(q, state, prefix),
        shape: 'box',
        color: {
          background: stateClr ? stateClr.bg : base.bg,
          border: stateClr ? stateClr.border : base.border,
          highlight: { background: base.bg, border: '#7aa2f7' },
        },
        font: {
          color: stateClr ? stateClr.text : base.text,
          size: 12,
          face: 'system-ui, sans-serif',
        },
        borderWidth: stateClr ? 2 : 1,
        borderWidthSelected: 2,
        margin: { top: 8, bottom: 8, left: 10, right: 10 },
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
      questMap = {};
      childrenOf = {};
      for (const q of allQuests) {
        questMap[q.id] = q;
        for (const pid of q.previous) {
          if (!childrenOf[pid]) childrenOf[pid] = [];
          childrenOf[pid].push(q.id);
        }
      }

      loadingEl.textContent = 'Building quest tree...';
      buildNetwork();
      loadingEl.style.display = 'none';
      wireUI();
      if (window.__arSupabase) window.__arSupabase.init();
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
        widthConstraint: 200,
        shadow: {
          enabled: false,
        },
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

    network.on('stabilized', function () {
      network.fit({ animation: { duration: 300 } });
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
    applyMode(currentMode);
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
      for (const q of allQuests) {
        if (q.rewards.some(r => r.type === 'coins')) set.add(q.id);
      }
    } else if (currentMode === 'blueprints') {
      for (const q of allQuests) {
        if (q.rewards.some(r => r.type === 'blueprint')) set.add(q.id);
      }
    }
    return set;
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
        nodes.update({
          id: node.id,
          label: buildNodeLabel(q, state, prefix),
          color: {
            background: stateClr ? stateClr.bg : base.bg,
            border: stateClr ? stateClr.border : base.border,
            highlight: { background: base.bg, border: '#7aa2f7' },
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
      return;
    }

    const pathIds = getPathIds();

    const highlightColor = MODE_HIGHLIGHT[currentMode] || '#7aa2f7';

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
