// CroquetClaude knowledge graph viewer
// Loads graph.json, renders with Sigma.js (WebGL), handles search/filter/select.

import { Graph, forceAtlas2, Sigma } from '/graph/vendor/libs.js';

(function () {
  'use strict';

  const errorOverlay = document.getElementById('error-overlay');
  const loadingOverlay = document.getElementById('loading-overlay');
  const sigmaContainer = document.getElementById('sigma-container');
  const statsEl = document.getElementById('stats');
  const filtersEl = document.getElementById('filters');
  const detailsEl = document.getElementById('details');
  const searchEl = document.getElementById('search');
  const hoverEl = document.getElementById('hover-label');
  const legendEl = document.getElementById('legend');

  function showError(msg) {
    loadingOverlay.style.display = 'none';
    errorOverlay.textContent = msg;
    errorOverlay.style.display = 'flex';
  }

  // WebGL check up front
  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (_) { return false; }
  }
  if (!hasWebGL()) {
    showError('Your browser does not support WebGL. Try a recent Chrome, Firefox, Edge, or Safari.');
    return;
  }
  if (!Graph || !Sigma || !forceAtlas2) {
    showError('Failed to load required libraries (graphology / sigma). Check the network tab.');
    return;
  }

  // Type → colour map (must match CSS palette)
  const COLOURS = {
    thought:        '#a4a094',
    meeting:        '#c8553d',
    decision:       '#d4a017',
    insight:        '#7a5fa3',
    club_signal:    '#4a7c59',
    interaction:    '#4a8a8e',
    research:       '#6b8caf',
    email_exchange: '#c1bdb2',
    general:        '#b8b4a8',
    compliance:     '#8a5a44',
    vendor:         '#8a8674',
    funding_programme: '#b8923c',
    programme:      '#9d7ab3',
    study:          '#5a7a9b',
    event:          '#c97a5c',
    legal_reference: '#6b5a44',
    web_capture:    '#95918a',
    // entities
    club:           '#2d7a4a',
    person:         '#c14a6b',
    topic:          '#d99838',
    aim:            '#4a3a7a',
    'decision-ent': '#b88a1a',
    doc:            '#7a7368',
  };

  const ENTITY_LABELS = {
    thought: 'Thoughts',
    club:    'Clubs',
    person:  'People',
    topic:   'Topics',
    aim:     'Aims',
    decision:'Decisions',
    doc:     'Source docs',
  };

  // Pull graph.json
  fetch('/graph/graph.json', { cache: 'no-cache' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(initialise)
    .catch(err => showError('Could not load graph.json (' + err.message + '). If you opened the file directly, you need to serve it: `python -m http.server` in this folder.'));

  function initialise(data) {
    // Stats header
    const s = data.stats;
    statsEl.innerHTML = [
      `<span><b>${data.nodes.length.toLocaleString()}</b> nodes</span>`,
      `<span><b>${data.edges.length.toLocaleString()}</b> connections</span>`,
      `<span><b>${s.thoughts.toLocaleString()}</b> distilled thoughts from <b>${s.brain_total_thoughts.toLocaleString()}</b> captured</span>`,
      `<span><b>${s.vault_total_docs.toLocaleString()}</b> documents read</span>`,
      `<span><b>${s.clubs}</b> clubs · <b>${s.people}</b> people · <b>${s.topics}</b> topics</span>`,
    ].join('');

    // Build graphology graph
    const graph = new Graph({ multi: false, type: 'undirected' });

    // Count types for filters
    const typeCounts = {};
    function bucket(node) {
      if (node.type === 'thought') return 'thought';
      return node.type;
    }
    function entityColour(node) {
      if (node.type === 'thought') return COLOURS[node.subtype] || COLOURS.thought;
      if (node.type === 'decision') return COLOURS['decision-ent'];
      return COLOURS[node.type] || '#999';
    }
    function nodeSize(node) {
      if (node.type === 'aim') return 14;
      if (node.type === 'thought') {
        const imp = node.importance || 5;
        return 2 + imp * 0.5;
      }
      // entities scaled by count
      const c = node.count || 1;
      return Math.min(13, 3 + Math.sqrt(c) * 1.3);
    }

    // Nodes ship with pre-computed x/y (build-side layout). Fall back to a
    // spiral only if coordinates are missing, then we run a client layout.
    let needsLayout = false;
    data.nodes.forEach((n, i) => {
      const b = bucket(n);
      typeCounts[b] = (typeCounts[b] || 0) + 1;
      const hasCoords = typeof n.x === 'number' && typeof n.y === 'number';
      if (!hasCoords) needsLayout = true;
      try {
        graph.addNode(n.id, {
          label: n.label,
          x: hasCoords ? n.x : Math.cos(i * 137.5 * Math.PI / 180) * Math.sqrt(i) * 0.3,
          y: hasCoords ? n.y : Math.sin(i * 137.5 * Math.PI / 180) * Math.sqrt(i) * 0.3,
          size: nodeSize(n),
          color: entityColour(n),
          originalColor: entityColour(n),
          nodeType: n.type,
          subtype: n.subtype,
          importance: n.importance,
          date: n.date,
          count: n.count,
          path: n.path,
        });
      } catch (e) { /* duplicate id, skip */ }
    });

    let edgeId = 0;
    data.edges.forEach(e => {
      if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) return;
      if (graph.hasEdge(e.source, e.target)) return;
      try {
        graph.addEdge(e.source, e.target, {
          size: 0.4,
          color: '#d8d2c2',
          edgeType: e.type,
        });
      } catch (_) {}
      edgeId++;
    });

    // Layout ships pre-computed from build_graph.py — render immediately.
    // Only fall back to a client-side ForceAtlas2 if coordinates are missing.
    if (!needsLayout) {
      renderSigma(graph, data);
    } else {
      loadingOverlay.textContent = 'Computing layout…';
      requestAnimationFrame(() => {
        try {
          forceAtlas2.assign(graph, {
            iterations: 400,
            settings: {
              gravity: 0.5,
              scalingRatio: 12,
              slowDown: 6,
              barnesHutOptimize: true,
              barnesHutTheta: 0.6,
              adjustSizes: true,
              linLogMode: true,
            },
          });
          renderSigma(graph, data);
        } catch (e) {
          showError('Layout failed: ' + e.message);
        }
      });
    }

    // Filter chips
    const types = ['thought', 'club', 'person', 'topic', 'aim', 'decision', 'doc'];
    const filterState = {};
    types.forEach(t => {
      if (!typeCounts[t]) return;
      filterState[t] = true;
      const row = document.createElement('label');
      row.className = 'filter-row';
      const colour = t === 'thought' ? COLOURS.meeting : COLOURS[t === 'decision' ? 'decision-ent' : t];
      row.innerHTML = `
        <input type="checkbox" checked data-type="${t}">
        <span class="sw" style="background:${colour}"></span>
        <span>${ENTITY_LABELS[t]}</span>
        <span class="count">${typeCounts[t].toLocaleString()}</span>`;
      filtersEl.appendChild(row);
    });

    // Legend
    legendEl.innerHTML = `
      <strong>Entity types</strong>
      <span style="color:${COLOURS.club}">●</span> Club &nbsp;
      <span style="color:${COLOURS.person}">●</span> Person &nbsp;
      <span style="color:${COLOURS.topic}">●</span> Topic <br>
      <span style="color:${COLOURS.aim}">●</span> Aim &nbsp;
      <span style="color:${COLOURS['decision-ent']}">●</span> Decision &nbsp;
      <span style="color:${COLOURS.doc}">●</span> Document
      <br><br><strong>Thought subtypes</strong>
      <span style="color:${COLOURS.meeting}">●</span> Meeting &nbsp;
      <span style="color:${COLOURS.decision}">●</span> Decision &nbsp;
      <span style="color:${COLOURS.insight}">●</span> Insight <br>
      <span style="color:${COLOURS.club_signal}">●</span> Club signal &nbsp;
      <span style="color:${COLOURS.interaction}">●</span> Interaction <br>
      <span style="color:${COLOURS.research}">●</span> Research &nbsp;
      <span style="color:${COLOURS.email_exchange}">●</span> Email
    `;

    // Filter handler
    filtersEl.addEventListener('change', (ev) => {
      const cb = ev.target.closest('input[type=checkbox]');
      if (!cb) return;
      filterState[cb.dataset.type] = cb.checked;
      applyFilters(graph);
    });

    // Search
    let searchTimer;
    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => applySearch(graph, searchEl.value), 120);
    });

    function applyFilters(g) {
      g.forEachNode((id, attrs) => {
        const bucketKey = attrs.nodeType === 'thought' ? 'thought' : attrs.nodeType;
        const visible = filterState[bucketKey] !== false;
        g.setNodeAttribute(id, 'hidden', !visible);
      });
      g.forEachEdge((id, _, s, t) => {
        const hidden = g.getNodeAttribute(s, 'hidden') || g.getNodeAttribute(t, 'hidden');
        g.setEdgeAttribute(id, 'hidden', hidden);
      });
      if (window.renderer) window.renderer.refresh();
    }

    function applySearch(g, q) {
      q = q.trim().toLowerCase();
      g.forEachNode((id, attrs) => {
        if (!q) {
          g.setNodeAttribute(id, 'color', attrs.originalColor);
          g.setNodeAttribute(id, 'highlighted', false);
        } else {
          const match = attrs.label && attrs.label.toLowerCase().includes(q);
          g.setNodeAttribute(id, 'highlighted', match);
          g.setNodeAttribute(id, 'color', match ? attrs.originalColor : '#e7e2d6');
        }
      });
      if (window.renderer) window.renderer.refresh();
    }
  }

  function renderSigma(graph, data) {
    loadingOverlay.style.display = 'none';

    const renderer = new Sigma(graph, sigmaContainer, {
      renderLabels: true,
      labelDensity: 0.07,
      labelGridCellSize: 100,
      labelRenderedSizeThreshold: 7,
      defaultEdgeColor: '#d8d2c2',
      defaultNodeColor: '#999',
      labelColor: { color: '#1d1d1b' },
      labelFont: 'Inter, sans-serif',
      labelSize: 12,
      labelWeight: '500',
      zIndex: true,
      minCameraRatio: 0.05,
      maxCameraRatio: 8,
    });
    window.renderer = renderer;
    window.graph = graph;

    let selected = null;
    let hovered = null;

    renderer.on('enterNode', ({ node }) => {
      hovered = node;
      const attrs = graph.getNodeAttributes(node);
      const pos = renderer.getNodeDisplayData(node);
      hoverEl.textContent = attrs.label;
      hoverEl.style.left = pos.x + 'px';
      hoverEl.style.top = pos.y + 'px';
      hoverEl.style.display = 'block';
      sigmaContainer.style.cursor = 'pointer';
    });
    renderer.on('leaveNode', () => {
      hovered = null;
      hoverEl.style.display = 'none';
      sigmaContainer.style.cursor = 'default';
    });
    renderer.on('clickNode', ({ node }) => selectNode(node));
    renderer.on('clickStage', () => selectNode(null));

    function selectNode(node) {
      selected = node;
      if (!node) {
        // restore
        graph.forEachNode((id, attrs) => {
          graph.setNodeAttribute(id, 'color', attrs.originalColor);
          graph.setNodeAttribute(id, 'zIndex', 0);
        });
        graph.forEachEdge((id) => {
          graph.setEdgeAttribute(id, 'color', '#d8d2c2');
          graph.setEdgeAttribute(id, 'size', 0.4);
        });
        showHint();
        renderer.refresh();
        return;
      }

      const neighbours = new Set([node]);
      graph.forEachNeighbor(node, (nb) => neighbours.add(nb));

      graph.forEachNode((id, attrs) => {
        if (neighbours.has(id)) {
          graph.setNodeAttribute(id, 'color', attrs.originalColor);
          graph.setNodeAttribute(id, 'zIndex', id === node ? 3 : 2);
        } else {
          graph.setNodeAttribute(id, 'color', '#ebe4d3');
          graph.setNodeAttribute(id, 'zIndex', 0);
        }
      });
      graph.forEachEdge((id, _, s, t) => {
        const incident = s === node || t === node;
        graph.setEdgeAttribute(id, 'color', incident ? '#b8a877' : '#f0ead9');
        graph.setEdgeAttribute(id, 'size', incident ? 1 : 0.3);
      });

      showDetails(node);
      renderer.refresh();
    }

    function showHint() {
      detailsEl.innerHTML = '<p class="hint">Click any node in the graph to see what it links to.</p>';
    }

    function showDetails(node) {
      const a = graph.getNodeAttributes(node);
      const typeLabel = a.nodeType === 'thought'
        ? (a.subtype || 'thought').replace(/_/g, ' ')
        : a.nodeType;

      let dateLine = '';
      if (a.date) dateLine = ' · ' + a.date;

      let countLine = '';
      if (a.count && a.nodeType !== 'thought') {
        countLine = ` · mentioned in ${a.count} thought${a.count === 1 ? '' : 's'}`;
      }

      // Group neighbours by type
      const groups = {};
      graph.forEachNeighbor(node, (nb) => {
        const nbAttrs = graph.getNodeAttributes(nb);
        const key = nbAttrs.nodeType === 'thought' ? (nbAttrs.subtype || 'thought') : nbAttrs.nodeType;
        if (!groups[key]) groups[key] = [];
        groups[key].push({ id: nb, ...nbAttrs });
      });

      const orderedKeys = [
        'meeting', 'decision', 'insight', 'club_signal', 'interaction',
        'compliance', 'programme', 'study', 'funding_programme',
        'research', 'email_exchange', 'general', 'event', 'vendor',
        'web_capture', 'legal_reference',
        'club', 'person', 'topic', 'aim', 'doc',
      ];

      const parts = [
        `<h2>${escape(a.label)}</h2>`,
        `<div class="meta">${escape(typeLabel)}${dateLine}${countLine}</div>`,
      ];

      orderedKeys.forEach(k => {
        if (!groups[k] || !groups[k].length) return;
        const sorted = groups[k].sort((x, y) => {
          if (x.date && y.date) return y.date.localeCompare(x.date);
          return (y.importance || y.count || 0) - (x.importance || x.count || 0);
        });
        const heading = k === 'thought'
          ? 'Thoughts'
          : (ENTITY_LABELS[k] || k.replace(/_/g, ' ') + 's');
        parts.push(`<h3>${escape(heading)}</h3><ul>`);
        sorted.slice(0, 40).forEach(item => {
          const dPart = item.date ? `<span class="date">${item.date}</span>` : '';
          parts.push(`<li data-id="${escape(item.id)}">${dPart}${escape(item.label)}</li>`);
        });
        if (sorted.length > 40) parts.push(`<li style="cursor:default;font-style:italic;color:var(--muted)">…and ${sorted.length - 40} more</li>`);
        parts.push('</ul>');
      });

      detailsEl.innerHTML = parts.join('');

      // Wire up click navigation
      detailsEl.querySelectorAll('li[data-id]').forEach(li => {
        li.addEventListener('click', () => {
          const id = li.dataset.id;
          selectNode(id);
          // Center the camera on the clicked node
          const pos = renderer.getNodeDisplayData(id);
          if (pos) {
            renderer.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.4 }, { duration: 400 });
          }
        });
      });
    }
  }

  function escape(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
