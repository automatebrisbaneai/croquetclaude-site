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
const cards = new Map();   // id -> record

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

function setCardBody(el, rec) {
  const aims = Array.isArray(rec.aims) ? rec.aims : [];
  el.innerHTML = `
    <div class="tt-card-meta">
      <span class="tt-card-author" data-author="${escapeHtml(authorKey(rec.author))}">${escapeHtml(rec.author)}</span>
      <span>${timeAgo(rec.created)}</span>
    </div>
    <div class="tt-card-body">${escapeHtml(rec.body)}</div>
    <div class="tt-card-foot">
      <div class="tt-aims">
        ${aims.map(a => `<span class="tt-aim-dot" data-aim="${escapeHtml(a)}" title="${escapeHtml(a)}"></span>`).join('')}
      </div>
      <span class="tt-replies"></span>
    </div>`;
  el.dataset.bodyHash = bodyHash(rec);
}

function cardEl(rec) {
  let el = CARD_REFS.get(rec.id);
  const x = (typeof rec.x === 'number') ? rec.x : 24;
  const y = (typeof rec.y === 'number') ? rec.y : 24;
  if (!el) {
    el = document.createElement('article');
    el.className = 'tt-card';
    el.dataset.id = rec.id;
    el.style.setProperty('--rot', `${rotateFor(rec.id)}deg`);
    setCardBody(el, rec);
    attachDrag(el);
    CARD_REFS.set(rec.id, el);
  } else if (el.dataset.bodyHash !== bodyHash(rec)) {
    setCardBody(el, rec);
  }
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
  });

  const endDrag = async e => {
    if (!DRAG || DRAG.pointerId !== e.pointerId) return;
    const { id, el, lastX, lastY, moved } = DRAG;
    el.releasePointerCapture(e.pointerId);
    DRAG = null;
    if (!moved) {
      openDetail(id);
      return;
    }
    el.classList.remove('dragging');
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

async function openDetail(cardId) {
  const rec = cards.get(cardId);
  if (!rec) return;
  OPEN_CARD_ID = cardId;
  const drawer = document.getElementById('drawer');
  drawer.hidden = false;
  document.getElementById('drawer-author').textContent = rec.author;
  document.getElementById('drawer-author').dataset.author = authorKey(rec.author);
  document.getElementById('drawer-time').textContent = timeAgo(rec.created);
  document.getElementById('drawer-body').textContent = rec.body;
  const aimsEl = document.getElementById('drawer-aims');
  const aims = Array.isArray(rec.aims) ? rec.aims : [];
  aimsEl.innerHTML = aims
    .map(a => `<span class="tt-aim-dot" data-aim="${escapeHtml(a)}" title="${escapeHtml(a)}"></span>`)
    .join('');

  // Load replies for this card
  if (!replies.has(cardId)) replies.set(cardId, new Map());
  const map = replies.get(cardId);
  map.clear();
  try {
    const list = await pb.collection('table_replies').getFullList({
      filter: `card = "${cardId}"`,
      sort: 'created',
    });
    for (const r of list) map.set(r.id, r);
  } catch (err) {
    console.warn('load replies failed', err);
  }
  renderReplies();

  // Realtime — only one card-thread open at a time
  if (REPLIES_UNSUB) { try { REPLIES_UNSUB(); } catch {} REPLIES_UNSUB = null; }
  REPLIES_UNSUB = await pb.collection('table_replies').subscribe('*', e => {
    if (e.record.card !== cardId) return;
    const m = replies.get(cardId);
    if (e.action === 'create' || e.action === 'update') m.set(e.record.id, e.record);
    else if (e.action === 'delete') m.delete(e.record.id);
    renderReplies();
  });

  document.getElementById('reply-body').focus();
}

function closeDetail() {
  const drawer = document.getElementById('drawer');
  drawer.hidden = true;
  OPEN_CARD_ID = null;
  if (REPLIES_UNSUB) { try { REPLIES_UNSUB(); } catch {} REPLIES_UNSUB = null; }
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
// Wait for the voice widget to finish recording and cleanup-transcription
// before we read the textarea. Polls isRecording() + textarea-value stability.
async function flushVoiceIfRecording(ta) {
  if (!VTT || !VTT.isRecording || !VTT.isRecording()) return;
  try { VTT.stop(); } catch {}
  let lastValue = ta.value;
  let stableTicks = 0;
  // Up to 8 seconds, considered done after 400ms of stability + recording=false
  for (let i = 0; i < 80 && stableTicks < 4; i++) {
    await new Promise(r => setTimeout(r, 100));
    const stillRec = VTT.isRecording && VTT.isRecording();
    if (stillRec) { stableTicks = 0; lastValue = ta.value; continue; }
    if (ta.value === lastValue) stableTicks++;
    else { stableTicks = 0; lastValue = ta.value; }
  }
}

async function post() {
  const ta = document.getElementById('post-body');
  const btn = document.getElementById('post-btn');
  const originalLabel = btn.textContent;

  if (VTT && VTT.isRecording && VTT.isRecording()) {
    btn.disabled = true;
    btn.textContent = 'Stopping…';
    await flushVoiceIfRecording(ta);
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
    await pb.collection('table_cards').create({
      room: ROOM.id,
      author: NAME,
      body,
      section: DEFAULT_SECTION,
      aims: [],
      closed: false,
      x: pos.x,
      y: pos.y,
      z: TOP_Z,
    });
    ta.value = '';
    ta.focus();
  } catch (err) {
    console.error(err);
    toast('Could not post — try again');
  } finally {
    btn.disabled = false;
  }
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

  // Load cards
  const list = await pb.collection('table_cards').getFullList({
    filter: `room = "${ROOM.id}"`,
    sort: '-created',
  });
  for (const rec of list) cards.set(rec.id, rec);
  render();

  // Realtime subscribe
  pb.collection('table_cards').subscribe('*', e => {
    if (e.record.room !== ROOM.id) return;
    if (e.action === 'create' || e.action === 'update') cards.set(e.record.id, e.record);
    else if (e.action === 'delete') cards.delete(e.record.id);
    render();
  });

  // Post
  document.getElementById('post-btn').addEventListener('click', post);
  document.getElementById('post-body').addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      post();
    }
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
    if (e.key === 'Escape' && OPEN_CARD_ID) closeDetail();
  });

  // Click outside the drawer (and not on a card) closes it
  document.addEventListener('click', e => {
    if (!OPEN_CARD_ID) return;
    const drawer = document.getElementById('drawer');
    if (drawer.contains(e.target)) return;        // inside drawer
    if (e.target.closest('.tt-card')) return;     // on a card -> switches detail
    closeDetail();
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
