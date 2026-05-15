/* ════════════════════════════════════════════════════════════════
   THE TABLE — room view client.
   Identity (localStorage name per room), post, render, realtime.
   ════════════════════════════════════════════════════════════════ */

const PB_URL = 'https://util.croquetwade.com';
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

// Section is forced to 'update' on every post (Wade simplified 2026-05-14:
// "too much division, just a quick notes thing"). The PB schema still
// requires section, so we just always set it. Future folder metaphor lives
// at the card-action level (archive), not the input-time decision level.
const DEFAULT_SECTION = 'update';

let VTT = null;   // VoiceToText control object — set in init() if widget loads

// ---------- on-device aim classifier (Chrome/Edge window.ai) ----------
// Six aims — must match .claude/rules/aims.md slugs exactly.
const VALID_AIMS = [
  '1-strengthen-admin',
  '2-promote-externally',
  '3-grow-members',
  '4-support-clubs',
  '5-develop-play',
  '6-innovate',
];

const AIM_SYSTEM_PROMPT = `You classify short notes from a small Australian sporting-association board (croquet) against six strategic aims. A note may serve multiple aims.

Aims:
1-strengthen-admin     — internal operations, governance, board comms, handover, IT, emails, meetings between officials, treasurer/secretary work
2-promote-externally   — public messaging, media, community awareness, member-newsletters going OUT, getting the sport in front of non-members
3-grow-members         — recruitment, retention, Come & Try, club rolls, lapsed-member outreach
4-support-clubs        — club-facing help, club resources, club committees, regional structure, grants
5-develop-play         — coaching, refereeing, tournaments, skill development, handicapping
6-innovate             — new tools, AI, automation, digital initiatives

Reply with ONLY a JSON object: {"aims": [...]} where the array contains at most 3 aim slugs from the six above. Use [] if the note is generic, ambiguous, or trivial. No prose, no explanation, just the JSON.`;

// Returns the LanguageModel constructor if any of the known shapes exist.
function getLanguageModelAPI() {
  if (typeof LanguageModel !== 'undefined') return LanguageModel;
  if (typeof window !== 'undefined') {
    if (window.LanguageModel) return window.LanguageModel;
    if (window.ai && window.ai.languageModel) return window.ai.languageModel;
  }
  return null;
}

let _modelSession = null;
let _modelReady = null; // promise

async function getModelSession() {
  if (_modelSession) return _modelSession;
  if (_modelReady) return _modelReady;
  const LM = getLanguageModelAPI();
  if (!LM) return null;
  _modelReady = (async () => {
    try {
      let availability = 'available';
      if (LM.availability) {
        availability = await LM.availability();
      } else if (LM.capabilities) {
        const cap = await LM.capabilities();
        availability = cap?.available || 'no';
      }
      if (availability === 'no' || availability === 'unavailable') {
        return null;
      }
      const sess = await LM.create({
        initialPrompts: [{ role: 'system', content: AIM_SYSTEM_PROMPT }],
        temperature: 0.2,
        topK: 3,
      });
      _modelSession = sess;
      return sess;
    } catch (err) {
      console.warn('on-device model init failed', err);
      return null;
    }
  })();
  return _modelReady;
}

async function classifyOnDevice(body) {
  if (!body || !body.trim()) return null;
  const sess = await getModelSession();
  if (!sess) return null;
  try {
    const out = await sess.prompt(body.trim());
    // Extract first JSON object in the output (defensive against model preamble)
    const m = out.match(/\{[\s\S]*?\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    const aims = Array.isArray(parsed.aims) ? parsed.aims : [];
    return aims.filter(a => VALID_AIMS.includes(a)).slice(0, 3);
  } catch (err) {
    console.warn('on-device classify failed', err);
    return null;
  }
}

// Sweep unclassified cards in this room and try to classify any with empty aims.
// Quiet failures — if browser AI not available, just skip.
async function sweepUnclassified() {
  const LM = getLanguageModelAPI();
  if (!LM) return;   // Safari/Firefox/old Chrome — silent no-op
  const todo = Array.from(cards.values()).filter(c => {
    if (c.closed) return false;
    const a = c.aims;
    if (!a) return true;
    if (Array.isArray(a) && a.length === 0) return true;
    return false;
  });
  for (const c of todo) {
    const aims = await classifyOnDevice(c.body);
    if (aims === null) continue;             // model unavailable
    if (aims.length === 0) continue;          // model abstained — leave for next browser
    try {
      await pb.collection('table_cards').update(c.id, { aims });
    } catch (err) {
      console.warn('sweep PATCH failed for', c.id, err);
    }
  }
}

// ---------- room ----------
function getRoomCode() {
  const code = (location.hash || '').replace(/^#/, '').trim().toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) {
    location.href = './index.html';
    throw new Error('bad room code');
  }
  return code;
}
const ROOM_CODE = getRoomCode();
let ROOM = null;        // {id, code, title, cc_mute}
let NAME = null;        // user-chosen name for this room
const cards = new Map();   // id -> record (open only)
let PILE_COUNT = 0;
const pileClosed = new Map();  // id -> record, loaded on demand
let PILE_OPEN = false;

// ---------- identity ----------
function nameKey() { return `thetable-name-${ROOM_CODE}`; }
function loadName() { return localStorage.getItem(nameKey()) || null; }
function saveName(n) { localStorage.setItem(nameKey(), n); }

function askName() {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'tt-modal-backdrop';
    backdrop.innerHTML = `
      <div class="tt-modal">
        <h2>What should we call you?</h2>
        <p>Pick the name your team will see on your notes. Stays on this device.</p>
        <input class="tt-input" id="name-input" placeholder="Your first name" maxlength="40" autofocus>
        <div class="actions">
          <button class="tt-btn" id="name-go">Take a seat</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector('#name-input');
    const submit = () => {
      const n = input.value.trim();
      if (!n) return;
      saveName(n);
      backdrop.remove();
      resolve(n);
    };
    backdrop.querySelector('#name-go').addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    input.focus();
  });
}

// ---------- toast ----------
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- render ----------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Stable per-card rotation: hash id -> -2.0° to +2.0°
function hashStr(s, salt) {
  let h = salt | 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
function rotateFor(id) {
  const v = ((hashStr(id, 1) % 1000) / 1000) * 2 - 1;   // -1 .. 1
  return (v * 2.0).toFixed(2);                          // -2.0° .. +2.0°
}

// Initial position for a brand-new card. Drops in a "fresh notes" zone in the
// top-left of the canvas with a small jitter so consecutive posts don't stack.
function freshPosition() {
  const baseX = 24 + Math.random() * 40;
  const baseY = 24 + Math.random() * 40;
  return { x: Math.round(baseX), y: Math.round(baseY) };
}

const CARD_REFS = new Map();  // id -> HTMLElement

function bodyHash(rec) {
  return `${rec.author}|${rec.body}|${(rec.aims || []).join(',')}|${rec.created}`;
}

function authorKey(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, '');
}

// Split a card body into a heading + body. Three rules, in priority order:
//   1. Explicit newline — user-authored structure wins ("title\ndetail").
//   2. First sentence boundary — `.!?` followed by whitespace + a next word,
//      with the heading clamped to 12-140 chars. Catches voice-to-text
//      output, which arrives as a single flowing paragraph with no newlines.
//   3. Word-boundary cut at ~100 chars — for run-on text without
//      sentence terminators. If the whole text is short (≤100), it's all
//      heading and there's no body.
const HEADING_MAX = 140;
const HEADING_MIN = 12;
const HEADING_LENGTH_CAP = 100;  // when no terminator, cap heading near this
function splitHeadingBody(body) {
  const text = (body || '').trim();
  if (!text) return { heading: '', body: '' };

  // Rule 1: explicit newline
  const nl = text.indexOf('\n');
  if (nl !== -1) {
    return { heading: text.slice(0, nl).trim(), body: text.slice(nl + 1).trim() };
  }

  // Rule 2: first sentence boundary within heading length band.
  // Regex literal (not template-built) avoids backslash-escaping pitfalls.
  // The band 12..140 matches the constants above; update both together.
  const sentRe = /^(.{12,140}?[.!?])\s+(\S)/;
  const m = text.match(sentRe);
  if (m) {
    const cut = m[1].length;
    return { heading: text.slice(0, cut).trim(), body: text.slice(cut).trim() };
  }

  // Rule 3: short text fits as heading-only
  if (text.length <= HEADING_LENGTH_CAP) return { heading: text, body: '' };

  // Rule 4: long text without punctuation — cut at last word boundary
  // before the cap, keeping the heading reasonable.
  const window = text.slice(0, HEADING_LENGTH_CAP);
  const lastSpace = window.lastIndexOf(' ');
  if (lastSpace > 30) {
    return {
      heading: text.slice(0, lastSpace).trim(),
      body: text.slice(lastSpace).trim(),
    };
  }
  // No word boundary in the first 100 chars — hard cut.
  return { heading: window.trim(), body: text.slice(HEADING_LENGTH_CAP).trim() };
}

function setCardBody(el, rec) {
  const aims = Array.isArray(rec.aims) ? rec.aims : [];
  const { heading, body } = splitHeadingBody(rec.body);
  // Heading is always shown (it carries the title-line). Body is rendered
  // smaller + secondary only when there IS a body line. For single-line cards,
  // the heading is the whole card.
  const hasBody = body.length > 0;
  el.innerHTML = `
    <div class="tt-card-heading">${escapeHtml(heading)}</div>
    ${hasBody ? `<div class="tt-card-body">${escapeHtml(body)}</div>` : ''}
    <div class="tt-card-foot">
      <div class="tt-card-foot-left">
        <span class="tt-card-author" data-author="${escapeHtml(authorKey(rec.author))}">${escapeHtml(rec.author)}</span>
        <span class="tt-card-time">${timeAgo(rec.created)}</span>
      </div>
      <div class="tt-card-foot-right">
        <div class="tt-aims">
          ${aims.map(a => `<span class="tt-aim-dot" data-aim="${escapeHtml(a)}" title="${escapeHtml(a)}"></span>`).join('')}
        </div>
        <span class="tt-replies"></span>
      </div>
    </div>`;
  el.dataset.bodyHash = bodyHash(rec);
}

function cardEl(rec) {
  let el = CARD_REFS.get(rec.id);
  const x = (typeof rec.x === 'number') ? rec.x : 24;
  const y = (typeof rec.y === 'number') ? rec.y : 24;
  const color = authorKey(rec.author) === 'croquetclaude' ? 'terracotta' : '';
  if (!el) {
    el = document.createElement('article');
    el.className = 'tt-card';
    el.dataset.id = rec.id;
    el.dataset.color = color;
    el.style.setProperty('--rot', `${rotateFor(rec.id)}deg`);
    setCardBody(el, rec);
    attachDrag(el);
    CARD_REFS.set(rec.id, el);
  } else if (el.dataset.bodyHash !== bodyHash(rec)) {
    setCardBody(el, rec);
  }
  el.dataset.color = color;
  // Don't overwrite position if this card is currently being dragged
  const isDragging = DRAG && DRAG.id === rec.id;
  if (!isDragging) {
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    if (typeof rec.z === 'number') el.style.zIndex = Math.max(1, Math.floor(rec.z));
  }
  return el;
}

function render() {
  const canvas = document.getElementById('canvas');
  const emptyEl = document.getElementById('canvas-empty');
  const list = Array.from(cards.values()).filter(c => !c.closed);
  if (emptyEl) emptyEl.style.display = list.length === 0 ? '' : 'none';

  // Remove cards no longer in the list
  const liveIds = new Set(list.map(c => c.id));
  for (const [id, el] of CARD_REFS) {
    if (!liveIds.has(id)) {
      el.remove();
      CARD_REFS.delete(id);
    }
  }
  // Render / update each
  for (const rec of list) {
    const el = cardEl(rec);
    if (!el.isConnected) canvas.appendChild(el);
  }
}

// ---------- drag + click ----------
// Pointer-down on a card starts a tentative "press". If the pointer moves
// more than CLICK_MOVE_THRESHOLD px, it becomes a drag. Otherwise pointer-up
// treats it as a click and opens the detail drawer.
let DRAG = null;
let TOP_Z = 1;
const CLICK_MOVE_THRESHOLD = 5;   // px

function attachDrag(el) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    const id = el.dataset.id;
    const rec = cards.get(id);
    if (!rec) return;
    el.setPointerCapture(e.pointerId);
    const canvasRect = document.getElementById('canvas').getBoundingClientRect();
    const startX = (typeof rec.x === 'number') ? rec.x : el.offsetLeft;
    const startY = (typeof rec.y === 'number') ? rec.y : el.offsetTop;
    DRAG = {
      id,
      el,
      pointerId: e.pointerId,
      pressClientX: e.clientX,
      pressClientY: e.clientY,
      dx: e.clientX - canvasRect.left - startX,
      dy: e.clientY - canvasRect.top - startY,
      lastX: startX,
      lastY: startY,
      canvasRect,
      moved: false,
    };
    e.preventDefault();
  });

  el.addEventListener('pointermove', e => {
    if (!DRAG || DRAG.pointerId !== e.pointerId) return;
    const distSq = (e.clientX - DRAG.pressClientX) ** 2 + (e.clientY - DRAG.pressClientY) ** 2;
    if (!DRAG.moved && distSq < CLICK_MOVE_THRESHOLD * CLICK_MOVE_THRESHOLD) return;
    if (!DRAG.moved) {
      // First time crossing the threshold — promote to drag
      DRAG.moved = true;
      const rec = cards.get(DRAG.id);
      TOP_Z = Math.max(TOP_Z + 1, (rec?.z || 1) + 1);
      DRAG.el.style.zIndex = TOP_Z;
      DRAG.el.classList.add('dragging');
    }
    const cr = DRAG.canvasRect;
    let x = e.clientX - cr.left - DRAG.dx;
    let y = e.clientY - cr.top - DRAG.dy;
    x = Math.max(-20, Math.min(cr.width - 60, x));
    y = Math.max(-10, Math.min(cr.height - 30, y));
    DRAG.lastX = x;
    DRAG.lastY = y;
    DRAG.el.style.left = `${x}px`;
    DRAG.el.style.top  = `${y}px`;

    // Pile drop-zone hit test. The pile button stays in the DOM with
    // visibility:hidden when count=0 so its bounding rect is still computable
    // here — allowing the first card to be drag-piled.
    const pileBtn = document.getElementById('pile-btn');
    if (pileBtn) {
      const pr = pileBtn.getBoundingClientRect();
      const overPile = e.clientX >= pr.left && e.clientX <= pr.right
                    && e.clientY >= pr.top  && e.clientY <= pr.bottom
                    && pr.width > 0 && pr.height > 0;
      if (overPile !== !!DRAG.overPile) {
        DRAG.overPile = overPile;
        pileBtn.classList.toggle('tt-pile-btn--armed', overPile);
      }
    }
  });

  const endDrag = async e => {
    if (!DRAG || DRAG.pointerId !== e.pointerId) return;
    const { id, el, lastX, lastY, moved, overPile } = DRAG;
    el.releasePointerCapture(e.pointerId);
    DRAG = null;
    // Always clear the pile-armed cue, whether we used it or not
    const pileBtn = document.getElementById('pile-btn');
    if (pileBtn) pileBtn.classList.remove('tt-pile-btn--armed');
    if (!moved) {
      openDetail(id);
      return;
    }
    el.classList.remove('dragging');
    // Dropped on the pile -> mark done instead of persisting position
    if (overPile) {
      markDone(id);
      return;
    }
    const rec = cards.get(id);
    if (!rec) return;
    rec.x = Math.round(lastX);
    rec.y = Math.round(lastY);
    rec.z = TOP_Z;
    try {
      await pb.collection('table_cards').update(id, { x: rec.x, y: rec.y, z: rec.z });
    } catch (err) {
      console.warn('persist move failed', err);
    }
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
}

// ---------- detail drawer + replies ----------
const replies = new Map();          // card_id -> Map<reply_id, record>
let OPEN_CARD_ID = null;
let REPLIES_UNSUB = null;
// Generation counter — bumped on every openDetail and closeDetail so stale
// async completions (replies fetch, subscribe) can detect they no longer
// own the drawer. Without this, opening A then B mid-await wires A's
// subscription/Done-button to B's drawer.
let DETAIL_GEN = 0;

async function openDetail(cardId) {
  const rec = cards.get(cardId);
  if (!rec) return;
  const myGen = ++DETAIL_GEN;
  OPEN_CARD_ID = cardId;
  const drawer = document.getElementById('drawer');
  drawer.hidden = false;
  document.getElementById('drawer-author').textContent = rec.author;
  document.getElementById('drawer-author').dataset.author = authorKey(rec.author);
  document.getElementById('drawer-time').textContent = timeAgo(rec.created);
  // Drawer mirrors the canvas heading/body split for visual consistency.
  // Heading sits above; body below at readable size.
  const drawerHeading = document.getElementById('drawer-heading');
  const drawerBody = document.getElementById('drawer-body');
  const split = splitHeadingBody(rec.body);
  if (drawerHeading) drawerHeading.textContent = split.heading;
  if (drawerBody) drawerBody.textContent = split.body;
  const aimsEl = document.getElementById('drawer-aims');
  const aims = Array.isArray(rec.aims) ? rec.aims : [];
  aimsEl.innerHTML = aims
    .map(a => `<span class="tt-aim-dot" data-aim="${escapeHtml(a)}" title="${escapeHtml(a)}"></span>`)
    .join('');

  // Wire done button up-front (synchronous, before any await) so a fast
  // user-click can't race the network. cardId is captured in closure.
  const doneBtn = document.getElementById('done-btn');
  if (doneBtn) {
    const newBtn = doneBtn.cloneNode(true);
    doneBtn.parentNode.replaceChild(newBtn, doneBtn);
    newBtn.addEventListener('click', () => markDone(cardId));
  }

  // Load replies for this card
  if (!replies.has(cardId)) replies.set(cardId, new Map());
  const map = replies.get(cardId);
  map.clear();
  try {
    const list = await pb.collection('table_replies').getFullList({
      filter: `card = "${cardId}"`,
      sort: 'created',
    });
    if (myGen !== DETAIL_GEN) return;  // user opened another card mid-fetch
    for (const r of list) map.set(r.id, r);
  } catch (err) {
    if (myGen !== DETAIL_GEN) return;
    console.warn('load replies failed', err);
  }
  renderReplies();

  // Realtime — only one card-thread open at a time
  if (REPLIES_UNSUB) { try { REPLIES_UNSUB(); } catch {} REPLIES_UNSUB = null; }
  const unsub = await pb.collection('table_replies').subscribe('*', e => {
    if (e.record.card !== cardId) return;
    const m = replies.get(cardId);
    if (e.action === 'create' || e.action === 'update') m.set(e.record.id, e.record);
    else if (e.action === 'delete') m.delete(e.record.id);
    renderReplies();
  });
  if (myGen !== DETAIL_GEN) {
    // Another card was opened (or drawer closed) while we awaited subscribe.
    // Tear down this subscription immediately — never expose it to others.
    try { unsub(); } catch {}
    return;
  }
  REPLIES_UNSUB = unsub;

  document.getElementById('reply-body').focus();
}

function closeDetail() {
  // Bumping the generation invalidates any in-flight openDetail awaits — they
  // will see myGen !== DETAIL_GEN and bail out before touching shared state.
  DETAIL_GEN++;
  const drawer = document.getElementById('drawer');
  drawer.hidden = true;
  OPEN_CARD_ID = null;
  if (REPLIES_UNSUB) { try { REPLIES_UNSUB(); } catch {} REPLIES_UNSUB = null; }
}

// ---------- done / pile ----------
// Cards in the done pile auto-expire from view 2 days after they're closed.
// The PB record sticks around (data not lost) — just the UI stops showing it.
// Filter computed at query time so cards "drop off" naturally as time passes.
const PILE_TTL_MS = 2 * 24 * 60 * 60 * 1000;  // 2 days

function pileCutoffIso() {
  return new Date(Date.now() - PILE_TTL_MS).toISOString();
}

// Build a PB filter expression that scopes a query to closed cards within the
// 2-day window for this room. Note: we OR closed_at>cutoff with closed_at=''
// so freshly-closed cards (race between client closed_at set + reload) still
// show until their explicit closed_at lands.
function closedRecentFilter() {
  return `room = "${ROOM.id}" && closed = true && closed_at >= "${pileCutoffIso()}"`;
}

function updatePileUI() {
  const countEl = document.getElementById('pile-count');
  const btn = document.getElementById('pile-btn');
  if (countEl) countEl.textContent = PILE_COUNT > 0 ? PILE_COUNT : '';
  if (btn) {
    // Always visible — serves as both indicator AND drop target for
    // drag-to-pile. The count text is hidden when 0 (cleaner glance) but
    // the button remains so the first card can be dragged onto it.
    btn.style.display = '';
    btn.classList.toggle('tt-pile-btn--empty', PILE_COUNT === 0);
    btn.style.pointerEvents = PILE_COUNT > 0 ? '' : 'none';
  }
}

async function fetchPileCount() {
  try {
    const res = await pb.collection('table_cards').getList(1, 1, {
      filter: closedRecentFilter(),
      fields: 'id',
    });
    PILE_COUNT = res.totalItems;
    updatePileUI();
  } catch (err) {
    console.warn('pile count failed', err);
  }
}

async function markDone(cardId) {
  try {
    await pb.collection('table_cards').update(cardId, {
      closed: true,
      closed_at: new Date().toISOString(),
    });
    cards.delete(cardId);
    const ref = CARD_REFS.get(cardId);
    if (ref) { ref.remove(); CARD_REFS.delete(cardId); }
    PILE_COUNT++;
    updatePileUI();
    closeDetail();
    render();
    toast('Moved to done pile');
  } catch (err) {
    console.warn('markDone failed', err);
    toast('Could not mark done — try again');
  }
}

function renderPile() {
  const listEl = document.getElementById('pile-list');
  if (!listEl) return;
  const list = Array.from(pileClosed.values()).sort((a, b) => {
    const aT = a.closed_at || a.created;
    const bT = b.closed_at || b.created;
    return bT.localeCompare(aT);
  });
  if (list.length === 0) {
    listEl.innerHTML = '<div class="tt-empty">Nothing done in the last 2 days.</div>';
    return;
  }
  listEl.innerHTML = list.map(r => {
    const { heading, body } = splitHeadingBody(r.body);
    const preview = heading || body;
    return `
    <div class="tt-pile-item">
      <div class="tt-pile-meta">
        <span class="tt-card-author" data-author="${escapeHtml(authorKey(r.author))}">${escapeHtml(r.author)}</span>
        <span>done ${timeAgo(r.closed_at || r.created)}</span>
        <span class="spacer"></span>
        <button class="tt-restore-btn" data-id="${escapeHtml(r.id)}">Restore</button>
      </div>
      <div class="tt-pile-body">${escapeHtml(preview.length > 140 ? preview.slice(0, 140) + '…' : preview)}</div>
    </div>`;
  }).join('');
  for (const btn of listEl.querySelectorAll('.tt-restore-btn')) {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const rec = pileClosed.get(id);
      if (!rec) return;
      const pos = freshPosition();
      try {
        await pb.collection('table_cards').update(id, {
          closed: false,
          closed_at: null,
          x: pos.x,
          y: pos.y,
        });
        rec.closed = false; rec.closed_at = null; rec.x = pos.x; rec.y = pos.y;
        pileClosed.delete(id);
        cards.set(id, rec);
        PILE_COUNT = Math.max(0, PILE_COUNT - 1);
        updatePileUI();
        render();
        renderPile();
        toast('Card restored');
      } catch (err) {
        toast('Could not restore');
      }
    });
  }
}

async function openPile() {
  PILE_OPEN = true;
  const drawer = document.getElementById('pile-drawer');
  drawer.hidden = false;
  const listEl = document.getElementById('pile-list');
  listEl.innerHTML = '<div class="tt-empty">Loading…</div>';
  try {
    const list = await pb.collection('table_cards').getFullList({
      filter: closedRecentFilter(),
      sort: '-closed_at',
    });
    pileClosed.clear();
    for (const r of list) pileClosed.set(r.id, r);
    renderPile();
  } catch (err) {
    listEl.innerHTML = '<div class="tt-empty">Could not load.</div>';
  }
}

function closePile() {
  PILE_OPEN = false;
  const drawer = document.getElementById('pile-drawer');
  drawer.hidden = true;
}

function renderReplies() {
  const cid = OPEN_CARD_ID;
  if (!cid) return;
  const map = replies.get(cid) || new Map();
  const list = Array.from(map.values()).sort((a, b) => a.created.localeCompare(b.created));
  const listEl = document.getElementById('replies-list');
  // Update reply count on the card
  const cardElForCount = CARD_REFS.get(cid);
  if (cardElForCount) {
    const repliesSpan = cardElForCount.querySelector('.tt-replies');
    if (repliesSpan) repliesSpan.textContent = list.length ? `${list.length} reply${list.length === 1 ? '' : 'es'}` : '';
  }
  if (list.length === 0) {
    listEl.innerHTML = '<div class="tt-empty">No replies yet.</div>';
    return;
  }
  listEl.innerHTML = list.map(r => `
    <div class="tt-reply">
      <div class="tt-reply-meta">
        <span class="tt-card-author" data-author="${escapeHtml(authorKey(r.author))}">${escapeHtml(r.author)}</span>
        <span>${timeAgo(r.created)}</span>
      </div>
      <div class="tt-reply-body">${escapeHtml(r.body)}</div>
    </div>`).join('');
}

async function postReply() {
  if (!OPEN_CARD_ID) return;
  const ta = document.getElementById('reply-body');
  const body = ta.value.trim();
  if (!body) return;
  const btn = document.getElementById('reply-btn');
  btn.disabled = true;
  try {
    await pb.collection('table_replies').create({
      card: OPEN_CARD_ID,
      author: NAME,
      body,
    });
    ta.value = '';
    ta.focus();
  } catch (err) {
    console.error(err);
    toast('Could not reply — try again');
  } finally {
    btn.disabled = false;
  }
}

// ---------- post ----------
// Wait for the voice widget to finish recording + cleanup-transcription
// before we read the textarea. VTT.stop() returns a promise that resolves
// when finaliseToTextarea fires (i.e. all /clean POSTs have landed and the
// textarea is the canonical source of truth). Falls back to a 10s ceiling
// in case the widget's promise never resolves.
async function flushVoiceIfRecording() {
  if (!VTT || !VTT.isRecording || !VTT.isRecording()) return;
  const ceiling = new Promise(r => setTimeout(r, 10000));
  let stopPromise;
  try { stopPromise = VTT.stop(); } catch { return; }
  await Promise.race([stopPromise, ceiling]);
}

async function post() {
  const ta = document.getElementById('post-body');
  const btn = document.getElementById('post-btn');
  const originalLabel = btn.textContent;

  if (VTT && VTT.isRecording && VTT.isRecording()) {
    btn.disabled = true;
    btn.textContent = 'Stopping…';
    await flushVoiceIfRecording();
    btn.textContent = originalLabel;
  }

  const body = ta.value.trim();
  if (!body) {
    btn.disabled = false;
    return;
  }
  btn.disabled = true;
  try {
    const pos = freshPosition();
    TOP_Z = Math.max(TOP_Z + 1, 2);
    // Try to classify on-device before saving so the chip lands with the card.
    // null = model unavailable; [] = model abstained; both fall through to empty
    // which gives the next visiting Chrome browser (or CroquetClaude) a chance.
    let initialAims = [];
    try {
      const onDevice = await classifyOnDevice(body);
      if (Array.isArray(onDevice)) initialAims = onDevice;
    } catch {}
    await pb.collection('table_cards').create({
      room: ROOM.id,
      author: NAME,
      body,
      section: DEFAULT_SECTION,
      aims: initialAims,
      closed: false,
      x: pos.x,
      y: pos.y,
      z: TOP_Z,
    });
    ta.value = '';
    closeComposer();
  } catch (err) {
    console.error(err);
    toast('Could not post — try again');
  } finally {
    btn.disabled = false;
  }
}

// ---------- composer collapse/expand ----------
function openComposer(opts = {}) {
  const sec = document.getElementById('tt-post');
  if (!sec) return;
  sec.classList.add('is-open');
  const ta = document.getElementById('post-body');
  setTimeout(() => ta?.focus(), 0);
  if (opts.startRecording) {
    setTimeout(() => document.getElementById('voice-btn')?.click(), 30);
  }
}
function closeComposer() {
  const sec = document.getElementById('tt-post');
  if (!sec) return;
  sec.classList.remove('is-open');
}

// ---------- seen ----------
async function touchSeen() {
  try {
    const existing = await pb.collection('table_seen')
      .getFirstListItem(`room = "${ROOM.id}" && author = "${NAME.replace(/"/g, '\\"')}"`)
      .catch(() => null);
    const payload = { room: ROOM.id, author: NAME, last_seen_at: new Date().toISOString() };
    if (existing) await pb.collection('table_seen').update(existing.id, payload);
    else await pb.collection('table_seen').create(payload);
  } catch (err) {
    console.warn('touchSeen failed', err);
  }
}

// ---------- init ----------
async function init() {
  // Load room
  try {
    ROOM = await pb.collection('table_rooms').getFirstListItem(`code = "${ROOM_CODE}"`);
  } catch (err) {
    toast('Room not found');
    setTimeout(() => location.href = './index.html', 1500);
    return;
  }
  document.getElementById('room-code').textContent = ROOM.code;
  if (ROOM.title) document.getElementById('room-title').textContent = ROOM.title;

  // Identity
  NAME = loadName();
  if (!NAME) NAME = await askName();
  document.getElementById('who-name').textContent = NAME;

  await touchSeen();

  // Load open cards only (closed cards are loaded on demand via the pile drawer)
  const list = await pb.collection('table_cards').getFullList({
    filter: `room = "${ROOM.id}" && closed = false`,
    sort: '-created',
  });
  for (const rec of list) cards.set(rec.id, rec);
  render();

  // Pile count (just the number — cards load when drawer opens)
  fetchPileCount();

  // On entry, the model classifies. Sweep any unclassified cards in the room.
  // Silent no-op if browser doesn't have window.ai (Safari, Firefox, old Chrome).
  // Backgrounded — don't block the UI.
  sweepUnclassified();

  // Realtime subscribe — when a new card arrives from another client and it
  // has no aims, attempt to classify it on this browser. Chrome users act as
  // a distributed pool of classifiers; whoever sees it first tags it.
  pb.collection('table_cards').subscribe('*', e => {
    if (e.record.room !== ROOM.id) return;
    // If the card I'm currently looking at has been moved to done or deleted
    // by another seat, close the drawer so I don't post replies into the void.
    // closeDetail() is idempotent — if we already closed it locally via
    // markDone, the second close is a no-op.
    if (OPEN_CARD_ID === e.record.id && (e.action === 'delete' || e.record.closed)) {
      closeDetail();
      toast(e.action === 'delete' ? 'Card deleted by another seat' : 'Card moved to done pile');
    }
    if (e.action === 'delete') {
      cards.delete(e.record.id);
      pileClosed.delete(e.record.id);
    } else if (e.record.closed) {
      // Card moved to done pile
      if (cards.has(e.record.id)) {
        cards.delete(e.record.id);
        const ref = CARD_REFS.get(e.record.id);
        if (ref) { ref.remove(); CARD_REFS.delete(e.record.id); }
        PILE_COUNT++;
        updatePileUI();
      }
      if (PILE_OPEN) { pileClosed.set(e.record.id, e.record); renderPile(); }
    } else {
      // Card is open — add/update on canvas
      cards.set(e.record.id, e.record);
      if (pileClosed.has(e.record.id)) {
        pileClosed.delete(e.record.id);
        PILE_COUNT = Math.max(0, PILE_COUNT - 1);
        updatePileUI();
        if (PILE_OPEN) renderPile();
      }
    }
    render();
    if (e.action === 'create' && !e.record.closed && (!e.record.aims || e.record.aims.length === 0)) {
      classifyOnDevice(e.record.body).then(aims => {
        if (!aims || aims.length === 0) return;
        pb.collection('table_cards').update(e.record.id, { aims }).catch(() => {});
      });
    }
  });

  // Post
  document.getElementById('post-btn').addEventListener('click', post);
  document.getElementById('post-body').addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      post();
    }
  });

  // Collapsed-pill -> open composer. Mic-icon click also starts recording.
  document.getElementById('post-pill').addEventListener('click', e => {
    const onMic = !!e.target.closest('.tt-pill-mic');
    openComposer({ startRecording: onMic });
  });

  // Detail drawer
  document.getElementById('drawer-close').addEventListener('click', closeDetail);
  document.getElementById('reply-btn').addEventListener('click', postReply);
  document.getElementById('reply-body').addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      postReply();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (OPEN_CARD_ID) { closeDetail(); return; }
    const sec = document.getElementById('tt-post');
    if (sec?.classList.contains('is-open')) {
      const body = document.getElementById('post-body').value.trim();
      const recording = VTT && VTT.isRecording && VTT.isRecording();
      if (!body && !recording) closeComposer();
    }
  });

  // Pile
  document.getElementById('pile-btn').addEventListener('click', openPile);
  document.getElementById('pile-close').addEventListener('click', closePile);

  // Click outside the drawer (and not on a card) closes it
  document.addEventListener('click', e => {
    // Pile drawer first
    if (PILE_OPEN) {
      const pd = document.getElementById('pile-drawer');
      const pb2 = document.getElementById('pile-btn');
      if (pd && !pd.contains(e.target) && !pb2?.contains(e.target)) closePile();
    }
    // Card drawer
    if (OPEN_CARD_ID) {
      const drawer = document.getElementById('drawer');
      if (drawer.contains(e.target)) return;        // inside drawer
      if (e.target.closest('.tt-card')) return;     // on a card -> switches detail
      closeDetail();
      return;
    }
    // Composer collapses on outside click only if empty + not recording
    const sec = document.getElementById('tt-post');
    if (sec?.classList.contains('is-open') && !sec.contains(e.target)) {
      const body = document.getElementById('post-body').value.trim();
      const recording = VTT && VTT.isRecording && VTT.isRecording();
      if (!body && !recording) closeComposer();
    }
  });

  // Voice-to-text (drop-in widget from talk.croquetwade.com).
  // Capture the control object so post() can stop+wait if user clicks Post
  // while still recording.
  if (window.VoiceToText) {
    try {
      VTT = window.VoiceToText.init({
        target:   'post-body',
        button:   'voice-btn',
        interim:  'voice-interim',
        status:   'voice-status',
        cleanUrl: 'https://talk.croquetwade.com/clean',
        lang:     'en-AU',
      });
    } catch (err) {
      console.warn('voice widget init failed', err);
    }
  }
}

init();
