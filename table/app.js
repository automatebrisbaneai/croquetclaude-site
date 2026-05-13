/* ════════════════════════════════════════════════════════════════
   THE TABLE — room view client.
   Identity (localStorage name per room), post, render, realtime.
   ════════════════════════════════════════════════════════════════ */

const PB_URL = 'https://util.croquetwade.com';
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const SECTIONS = ['question', 'update', 'idea', 'todo'];

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

function cardEl(rec) {
  const el = document.createElement('article');
  el.className = 'tt-card';
  el.dataset.id = rec.id;
  const aims = Array.isArray(rec.aims) ? rec.aims : [];
  el.innerHTML = `
    <div class="tt-card-meta">
      <span class="tt-card-author">${escapeHtml(rec.author)}</span>
      <span>${timeAgo(rec.created)}</span>
    </div>
    <div class="tt-card-body">${escapeHtml(rec.body)}</div>
    <div class="tt-card-foot">
      <div class="tt-aims">
        ${aims.map(a => `<span class="tt-aim-dot" data-aim="${escapeHtml(a)}" title="${escapeHtml(a)}"></span>`).join('')}
      </div>
      <span class="tt-replies"></span>
    </div>`;
  return el;
}

function render() {
  for (const section of SECTIONS) {
    const container = document.querySelector(`[data-cards-for="${section}"]`);
    const list = Array.from(cards.values())
      .filter(c => c.section === section && !c.closed)
      .sort((a, b) => b.created.localeCompare(a.created));
    const countEl = document.querySelector(`[data-count-for="${section}"]`);
    if (countEl) countEl.textContent = list.length;
    container.innerHTML = '';
    if (list.length === 0) {
      const hints = {
        question: 'No questions on the table.',
        update:   'Nothing posted yet today.',
        idea:     'No ideas yet — first one wins.',
        todo:     'Nothing to do on the table.',
      };
      const hint = document.createElement('div');
      hint.className = 'tt-empty';
      hint.textContent = hints[section];
      container.appendChild(hint);
    } else {
      for (const rec of list) container.appendChild(cardEl(rec));
    }
  }
}

// ---------- post ----------
function selectedSection() {
  const chip = document.querySelector('.tt-chip[aria-pressed="true"]');
  return chip ? chip.dataset.section : 'update';
}

async function post() {
  const ta = document.getElementById('post-body');
  const body = ta.value.trim();
  if (!body) return;
  const btn = document.getElementById('post-btn');
  btn.disabled = true;
  try {
    await pb.collection('table_cards').create({
      room: ROOM.id,
      author: NAME,
      body,
      section: selectedSection(),
      aims: [],
      closed: false,
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

  // Section picker
  for (const chip of document.querySelectorAll('.tt-chip')) {
    chip.addEventListener('click', () => {
      for (const c of document.querySelectorAll('.tt-chip')) c.setAttribute('aria-pressed', 'false');
      chip.setAttribute('aria-pressed', 'true');
    });
  }

  // Post
  document.getElementById('post-btn').addEventListener('click', post);
  document.getElementById('post-body').addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      post();
    }
  });

  // Voice-to-text (drop-in widget from talk.croquetwade.com).
  // Browser SpeechRecognition writes interim into #voice-interim; finalised
  // chunks land in the textarea; the widget POSTs to talk.cw/clean for a
  // post-utterance cleanup pass. Quietly no-op if the widget didn't load.
  if (window.VoiceToText) {
    try {
      window.VoiceToText.init({
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
