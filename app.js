'use strict';
/* Bibel – offlinefähige Lese-App. Daten: ./data, Zustand: localStorage 'bibel.v1' */

const APP_VERSION = '1.0.0';
const KEY = 'bibel.v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };

const HL_NAMES = ['Gelb', 'Grün', 'Blau', 'Rosa', 'Violett'];
const HL_SOLID = ['#D9B92A', '#4E9E5A', '#4D7FD0', '#D45B67', '#8B66CF'];
const TAG_COLORS = ['#2D4A8C', '#A7701A', '#2D7468', '#B4432F', '#7B4FB0', '#3E7FB8', '#6B7F2A', '#B04F87'];

const I = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  aa: '<svg viewBox="0 0 24 24"><path d="M3 18l5-12 5 12M4.8 14h6.4"/><path d="M15 18v-1.2m0-4.8a3 3 0 1 1 6 0V18m0-3h-4.5a1.5 1.5 0 0 0 0 3H21"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8.5 9h7M8.5 12.5h5"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>',
  cmp: '<svg viewBox="0 0 24 24"><path d="M4 6h7M4 10h7M4 14h7M4 18h7M14 6h6M14 10h6M14 14h6M14 18h6"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
};

/* ---------------- Zustand ---------------- */
const DEFAULT = () => ({ v: 1, read: {}, marks: {}, notes: {}, stars: {}, tags: {},
  set: { tr: 'lut', size: 19, lh: 1.72, theme: 'auto', seg: 'AT', oneper: false }, last: null });
let S;
try { S = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); S.set = Object.assign(DEFAULT().set, S.set); }
catch (e) { S = DEFAULT(); }
let saveTimer;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); } }, 120); }
function applySettings() {
  const r = document.documentElement;
  if (S.set.theme === 'auto') delete r.dataset.theme; else r.dataset.theme = S.set.theme;
  r.style.setProperty('--size', S.set.size + 'px');
  r.style.setProperty('--lh', S.set.lh);
}

/* ---------------- Katalog & Daten ---------------- */
let CAT, ORDER = {}, BOOK = {};
const fileCache = new Map();
async function loadJSON(url) {
  if (fileCache.has(url)) return fileCache.get(url);
  const p = fetch(url).then(r => {
    if (!r.ok) throw new Error(r.status);
    // Solange der Service Worker die Seite noch nicht steuert (erster Besuch), selbst in den Offline-Speicher legen
    if (/^(lut|elb|sch|men|ext)\.json$/.test(url) && 'caches' in window && !(navigator.serviceWorker && navigator.serviceWorker.controller))
      { const copy = r.clone(); caches.open('bibel-data-v1').then(c => c.put(new URL(url, location.href).href, copy)).catch(() => {}); }
    return r.json();
  });
  fileCache.set(url, p);
  try { return await p; } catch (e) { fileCache.delete(url); throw e; }
}
function indexCatalog() {
  CAT.canon.forEach((b, i) => { b.kind = 'c'; b.key = b.id; ORDER[b.key] = i; BOOK[b.key] = b; });
  CAT.apo.forEach((b, i) => { b.kind = 'a'; b.key = b.id; b.group = 'Spätschriften des AT'; ORDER[b.key] = 100 + i; BOOK[b.key] = b; });
  CAT.extra.forEach((b, i) => { b.kind = 'x'; b.key = 'x:' + b.id; ORDER[b.key] = 200 + i; BOOK[b.key] = b; });
}
const trName = code => (CAT.translations.find(t => t.code === code) || {}).name || code;
function srcOf(book, tr = S.set.tr) {
  if (book.kind === 'c') return { url: `${tr}.json`, tr };
  if (book.kind === 'a') return { url: 'men.json', tr: 'men' };
  return { url: 'ext.json', tr: 'ext' };
}
async function chaptersOf(book, tr) {
  const d = (await loadJSON(srcOf(book, tr).url))[book.id];
  if (!d) throw new Error('Buch fehlt');
  return d.map((c, i) => Array.isArray(c) ? { v: c, l: String(i + 1) } : c);
}
const chLabel = (book, ch) => book.kind === 'x' ? (book.labels[ch - 1] || String(ch)) : String(ch);
function refText(book, ch, v1, v2) {
  let s = book.short + ' ' + chLabel(book, ch);
  if (v1) s += ',' + v1 + (v2 && v2 !== v1 ? '–' + v2 : '');
  return s;
}
const vkey = (book, ch, v) => `${book.key}.${ch}.${v}`;
const ckey = (book, ch) => `${book.key}.${ch}`;
function parseVKey(k) { const m = k.match(/^(.+)\.(\d+)\.(\d+)$/); return m ? { bk: m[1], ch: +m[2], v: +m[3] } : null; }
const readerHref = (book, ch, v) => `#/r/${encodeURIComponent(book.key)}/${ch}${v ? '/' + v : ''}`;
const bookHref = book => `#/b/${encodeURIComponent(book.key)}`;
function readCount(book) { let n = 0; for (let c = 1; c <= book.chapters; c++) if (S.read[ckey(book, c)]) n++; return n; }

/* ---------------- UI-Helfer ---------------- */
const topEl = $("#top"), view = $('#view'), sheet = $('#sheet'), dlg = $('#dlg');
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }
function setTop(html) { topEl.innerHTML = html; }
function setTab(tab) { $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab)); }
function setBodyKind(kind) { document.body.classList.toggle('apo', kind === 'a'); document.body.classList.toggle('ext', kind === 'x'); }
window.addEventListener('scroll', () => topEl.classList.toggle('scrolled', scrollY > 4), { passive: true });
function openDlg(html, bind) {
  dlg.innerHTML = `<div class="dlg">${html}</div>`;
  if (!dlg.open) dlg.showModal();
  bind && bind(dlg);
  $$('[data-close]', dlg).forEach(b => b.onclick = () => dlg.close());
}
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

/* ---------------- Router ---------------- */
function route() {
  closeSheet();
  if (dlg.open) dlg.close();
  const h = decodeURIComponent(location.hash.slice(1) || '/');
  const p = h.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (p[0] === 'b' && BOOK[p[1]]) return viewBook(BOOK[p[1]]);
  if (p[0] === 'r' && BOOK[p[1]]) return viewReader(BOOK[p[1]], +p[2] || 1, +p[3] || 0);
  if (p[0] === 'lesen') { const l = S.last && BOOK[S.last.bk] ? S.last : { bk: 'GEN', ch: 1 }; location.replace(readerHref(BOOK[l.bk], l.ch)); return; }
  if (p[0] === 'markierungen') return viewMarks();
  if (p[0] === 'suche') return viewSearch();
  if (p[0] === 'mehr') return viewMore();
  if (p[0] === 'quellen') return viewSources();
  return viewHome();
}
window.addEventListener('hashchange', route);

/* ---------------- Übersicht ---------------- */
const SEGS = [['AT', 'Altes Testament'], ['NT', 'Neues Testament'], ['APO', 'Apokryphen'], ['EXT', 'Außerkanonisch']];
function segBooks(seg) {
  if (seg === 'AT') return CAT.canon.filter(b => b.t === 'AT');
  if (seg === 'NT') return CAT.canon.filter(b => b.t === 'NT');
  if (seg === 'APO') return CAT.apo;
  return CAT.extra;
}
function mosaic(book) {
  let s = '';
  for (let c = 1; c <= book.chapters; c++) s += S.read[ckey(book, c)] ? '<i class="r"></i>' : '<i></i>';
  return `<span class="mosaic" aria-hidden="true">${s}</span>`;
}
function bookRow(b) {
  const n = readCount(b);
  const badge = b.kind === 'x' ? (b.chapters ? '<span class="tag-en">EN</span>' : '<span class="tag-miss">nur Einführung</span>') : '';
  const ct = b.chapters ? `${n}/${b.chapters}` : '';
  return `<a class="book ${b.chapters && n === b.chapters ? 'done' : ''}" href="${bookHref(b)}">
    <span class="nm">${esc(b.name)}${b.sub && b.kind !== 'x' ? `<em>${esc(b.sub)}</em>` : ''}${badge}</span>
    <span class="ct">${ct}</span>${b.chapters ? mosaic(b) : ''}</a>`;
}
function viewHome() {
  setTab('home'); setBodyKind(S.set.seg === 'APO' ? 'a' : S.set.seg === 'EXT' ? 'x' : 'c');
  setTop(`<h1>Bibel</h1>`);
  const seg = S.set.seg;
  const books = segBooks(seg);
  const tot = books.reduce((a, b) => a + b.chapters, 0), rd = books.reduce((a, b) => a + readCount(b), 0);
  let html = '';
  if (S.last && BOOK[S.last.bk]) {
    const b = BOOK[S.last.bk];
    html += `<a class="resume" href="${readerHref(b, S.last.ch)}"><div><b>${esc(b.name)} ${esc(chLabel(b, S.last.ch))}</b><span>Weiterlesen</span></div>${I.next}</a>`;
  }
  html += `<div class="seg" role="tablist">${SEGS.map(([k, n]) => `<button class="chip ${k === seg ? 'on' : ''}" data-seg="${k}" role="tab" aria-selected="${k === seg}">${n}</button>`).join('')}</div>`;
  html += `<div class="tally"><strong>${rd}</strong> von ${tot} Kapiteln gelesen</div><div class="bar"><i style="width:${tot ? (100 * rd / tot).toFixed(1) : 0}%"></i></div>`;
  if (seg === 'APO') {
    html += `<p class="grpdesc">${esc(CAT.apoIntro)}</p>` + books.map(bookRow).join('');
  } else if (seg === 'EXT') {
    html += `<p class="grpdesc">Schriften aus dem Umfeld der Bibel, die aus unterschiedlichen Gründen nicht in den Kanon aufgenommen wurden. Jede Schrift hat eine kurze Einführung: worum es geht, wann sie entstand und warum sie draußen blieb. Die Texte liegen in gemeinfreien <b>englischen</b> Übersetzungen vor – gemeinfreie deutsche waren nicht greifbar.</p>`;
    CAT.extraGroups.forEach((g, gi) => {
      const bs = books.filter(b => b.group === gi);
      html += `<div class="grp"><h2>${esc(g.name)}</h2></div><p class="grpdesc">${esc(g.desc)}</p>` + bs.map(bookRow).join('');
    });
  } else {
    let cur = null;
    books.forEach(b => {
      if (b.group !== cur) {
        cur = b.group;
        const gb = books.filter(x => x.group === cur);
        html += `<div class="grp"><h2>${esc(cur)}</h2><span>${gb.reduce((a, x) => a + readCount(x), 0)}/${gb.reduce((a, x) => a + x.chapters, 0)}</span></div>`;
      }
      html += bookRow(b);
    });
  }
  view.innerHTML = html;
  $$('[data-seg]', view).forEach(b => b.onclick = () => { S.set.seg = b.dataset.seg; save(); viewHome(); });
}

/* ---------------- Buchseite ---------------- */
let editMode = false;
function viewBook(book) {
  setTab('home'); setBodyKind(book.kind);
  setTop(`<button class="iconbtn" onclick="history.length>1?history.back():location.hash='#/'" aria-label="Zurück">${I.back}</button><h1>${esc(book.name)}</h1>`);
  let html = '';
  const sub = book.kind === 'c' ? [book.sub, book.t === 'AT' ? 'Altes Testament' : 'Neues Testament', book.group].filter(Boolean).join(', ')
    : book.kind === 'a' ? [book.sub, 'Apokryphen (Text: Menge 1939)'].filter(Boolean).join(', ') : book.sub;
  if (sub) html += `<p class="booksub">${esc(sub)}</p>`;
  if (book.kind === 'x') {
    html += `<div class="introcard"><h3>Worum es geht</h3><p>${esc(book.intro)}</p><h3>Warum nicht in der Bibel?</h3><p>${esc(book.canon)}</p>
      ${book.note ? `<p class="src"><b>${esc(book.note)}</b></p>` : `<p class="src">Textgrundlage: ${esc(book.tr)}</p>`}</div>`;
  }
  if (book.chapters) {
    const n = readCount(book);
    html += `<div class="toggle-row"><button class="btn ${editMode ? 'pri' : ''}" id="edit">${I.check}${editMode ? 'Fertig' : 'Abhaken'}</button>
      ${editMode ? `<button class="btn" id="all">Alle gelesen</button><button class="btn warn" id="none">Zurücksetzen</button>` : `<span class="muted">${n} von ${book.chapters} gelesen</span>`}</div>`;
    if (editMode) html += `<p class="edit-hint">Tippe Kapitel an, um sie als gelesen oder ungelesen zu markieren.</p>`;
    html += `<div class="chgrid">`;
    for (let c = 1; c <= book.chapters; c++) {
      const r = S.read[ckey(book, c)] ? 'r' : '', cur = S.last && S.last.bk === book.key && S.last.ch === c ? 'cur' : '';
      const lab = chLabel(book, c), long = lab.length > 4;
      html += editMode ? `<button class="${r}" data-ch="${c}"><span class="${long ? 'lab' : ''}">${esc(lab)}</span></button>`
        : `<a class="${r} ${cur}" href="${readerHref(book, c)}" aria-label="Kapitel ${esc(lab)}${r ? ', gelesen' : ''}"><span class="${long ? 'lab' : ''}">${esc(lab)}</span></a>`;
    }
    html += `</div>`;
  }
  view.innerHTML = html;
  const e = $('#edit'); if (e) e.onclick = () => { editMode = !editMode; viewBook(book); };
  const all = $('#all'); if (all) all.onclick = () => { for (let c = 1; c <= book.chapters; c++) S.read[ckey(book, c)] ||= today(); save(); viewBook(book); };
  const none = $('#none'); if (none) none.onclick = () => { if (!confirm(`Alle Gelesen-Markierungen in ${book.name} entfernen?`)) return; for (let c = 1; c <= book.chapters; c++) delete S.read[ckey(book, c)]; save(); viewBook(book); };
  $$('[data-ch]', view).forEach(b => b.onclick = () => {
    const k = ckey(book, +b.dataset.ch);
    if (S.read[k]) delete S.read[k]; else S.read[k] = today();
    b.classList.toggle('r', !!S.read[k]); save();
  });
}

/* ---------------- Leser ---------------- */
let R = null; // aktueller Lesezustand
function verseHtml(book, ch, i, text) {
  const v = i + 1, k = vkey(book, ch, v), m = S.marks[k] || {};
  let t = esc(text).replace(/\{([^}]*)\}/g, '<span class="fn">($1)</span>');
  let extra = '';
  let tags = (m.t || []).filter(id => S.tags[id]);
  // Themen-Etikett nur am Ende einer zusammenhängenden Gruppe anzeigen
  const nx = (S.marks[vkey(book, ch, v + 1)] || {}).t || [];
  if (tags.length && tags.every(id => nx.includes(id))) tags = [];
  if (tags.length || S.notes[k] || S.stars[k]) {
    extra = `<span class="vm">${S.stars[k] ? `<span class="star" title="Gemerkt">${I.star}</span>` : ''}${S.notes[k] ? `<span title="Notiz">${I.note}</span>` : ''}${tags.map(id => `<b style="background:${TAG_COLORS[S.tags[id].c] || TAG_COLORS[0]}">${esc(S.tags[id].n)}</b>`).join('')}</span>`;
  }
  return `<span class="v ${m.c ? 'c' + m.c : ''}" data-v="${v}" id="v${v}"><sup>${v}</sup>${t}</span>${extra} `;
}
async function viewReader(book, ch, focusV) {
  setTab('read'); setBodyKind(book.kind); editMode = false;
  if (!book.chapters) { location.replace(bookHref(book)); return; }
  const src = srcOf(book);
  const trBtn = book.kind === 'c' ? `<button class="chip" id="trbtn" aria-label="Übersetzung wechseln">${esc(trName(src.tr))}</button>` : '';
  setTop(`<a class="iconbtn" href="${bookHref(book)}" aria-label="Kapitelübersicht">${I.grid}</a>
    <h1><button id="chpick" aria-label="Kapitel wählen">${esc(book.name)}${/^\d+$/.test(chLabel(book, ch)) ? ' ' + ch : ''}</button></h1>${trBtn}
    <button class="iconbtn" id="aa" aria-label="Darstellung">${I.aa}</button>`);
  view.innerHTML = `<div class="reader"><p class="muted">${fileCache.has(src.url) ? 'Lädt …' : 'Lädt ' + esc(book.kind === 'x' ? 'die außerkanonischen Schriften' : trName(src.tr)) + ' (beim ersten Mal einige MB, danach offline) …'}</p></div>`;
  let chapters;
  try { chapters = await chaptersOf(book); }
  catch (e) { view.innerHTML = `<div class="missing">Der Text konnte nicht geladen werden. Bist du offline? Lade die Übersetzung unter „Mehr → Offline speichern“, solange du online bist.</div>`; return; }
  const nCh = chapters.length;
  if (ch > nCh) ch = nCh;
  const C = chapters[ch - 1];
  R = { book, ch, nCh, chapters, sel: new Set() };
  S.last = { bk: book.key, ch }; save();
  const isRead = !!S.read[ckey(book, ch)];
  const lab = chLabel(book, ch);
  let html = `<div class="reader ${S.set.oneper || book.kind === 'x' ? 'oneper' : ''} ${book.kind === 'x' ? 'pre' : ''}">`;
  html += `<div class="chhead">${esc(/^\d+$/.test(lab) ? lab : lab.replace(/^(\D+)\s(\d+)$/, '$2'))}</div>`;
  if (/^\D+\s\d+$/.test(lab)) html += `<div class="sect">${esc(lab.replace(/\s\d+$/, ''))}</div>`;
  if (C.h) html += `<div class="sect">${esc(C.h)}</div>`;
  if (book.kind === 'x') html += `<p class="trnote">Englischer Text · ${esc(book.tr)}</p>`;
  if (book.kind === 'a') html += `<p class="trnote">Text: Menge 1939</p>`;
  html += C.v.map((t, i) => t == null ? '' : verseHtml(book, ch, i, t)).join('');
  html += `<div class="chend">
    <button class="btn ${isRead ? 'done' : 'pri'}" id="markread">${I.check}${isRead ? 'Gelesen – rückgängig machen' : 'Kapitel als gelesen markieren'}</button>
    <div class="toggle-row" style="justify-content:space-between">
      ${ch > 1 ? `<a class="btn" href="${readerHref(book, ch - 1)}">${I.back}${esc(chLabel(book, ch - 1))}</a>` : '<span></span>'}
      ${ch < nCh ? `<a class="btn" href="${readerHref(book, ch + 1)}">${esc(chLabel(book, ch + 1))}${I.next}</a>` : nextBookLink(book)}
    </div></div></div>`;
  view.innerHTML = html;
  $('#markread').onclick = () => {
    const k = ckey(book, ch);
    if (S.read[k]) { delete S.read[k]; save(); viewReader(book, ch); return; }
    S.read[k] = today(); save();
    if (ch < nCh) { toast(`${book.short} ${lab} gelesen`); location.hash = readerHref(book, ch + 1); }
    else { toast(`${book.name} ${lab} gelesen`); viewReader(book, ch); }
  };
  $('#chpick').onclick = () => chapterPicker(book);
  $('#aa').onclick = displayDialog;
  const tb = $('#trbtn'); if (tb) tb.onclick = () => trDialog(() => viewReader(book, ch));
  $$('.v', view).forEach(el => el.onclick = () => toggleSel(+el.dataset.v));
  if (focusV) { const el = $('#v' + focusV); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } }
}
function nextBookLink(book) {
  const list = book.kind === 'c' ? CAT.canon : book.kind === 'a' ? CAT.apo : CAT.extra.filter(b => b.chapters);
  const i = list.indexOf(book), nb = list[i + 1];
  return nb ? `<a class="btn" href="${readerHref(nb, 1)}">${esc(nb.name)}${I.next}</a>` : '<span></span>';
}
// Wischen zum Blättern
let tx = 0, ty = 0;
view.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
view.addEventListener('touchend', e => {
  if (!R || !location.hash.startsWith('#/r/') || sheet.classList.contains('open')) return;
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 80 && Math.abs(dy) < 50) {
    if (dx < 0 && R.ch < R.nCh) location.hash = readerHref(R.book, R.ch + 1);
    if (dx > 0 && R.ch > 1) location.hash = readerHref(R.book, R.ch - 1);
  }
}, { passive: true });

function chapterPicker(book) {
  let s = '';
  for (let c = 1; c <= (R ? R.nCh : book.chapters); c++) { const l = chLabel(book, c); s += `<button class="${S.read[ckey(book, c)] ? 'r' : ''} ${l.length > 4 ? 'lab' : ''}" data-c="${c}">${esc(l)}</button>`; }
  openDlg(`<h3>${esc(book.name)}</h3><div class="picker">${s}</div><div class="row"><a class="btn" href="${bookHref(book)}">Buchübersicht</a><button class="btn" data-close>Schließen</button></div>`, d => {
    $$('[data-c]', d).forEach(b => b.onclick = () => { dlg.close(); location.hash = readerHref(book, +b.dataset.c); });
  });
}
function trDialog(after) {
  openDlg(`<h3>Übersetzung</h3><div class="taglist">${CAT.translations.map(t => `<label><input type="radio" name="tr" value="${t.code}" ${t.code === S.set.tr ? 'checked' : ''}><span>${esc(t.name)}<br><small class="muted">${esc(t.long)}</small></span></label>`).join('')}</div><p class="muted">Markierungen und Notizen hängen am Vers, nicht an der Übersetzung. Die Elberfelder zählt einige Verse anders (z. B. Maleachi 4).</p><div class="row"><button class="btn" data-close>Fertig</button></div>`, d => {
    $$('input[name=tr]', d).forEach(i => i.onchange = () => { S.set.tr = i.value; save(); dlg.close(); after && after(); });
  });
}
function displayDialog() {
  openDlg(`<h3>Darstellung</h3>
    <div class="set" style="border:0;padding:0"><h3>Schriftgröße</h3><div class="opts">${[16, 17, 19, 21, 23, 26].map(s => `<button class="chip ${S.set.size === s ? 'on' : ''}" data-size="${s}">${s}</button>`).join('')}</div></div>
    <div class="set"><h3>Zeilenabstand</h3><div class="opts">${[[1.5, 'Eng'], [1.72, 'Normal'], [1.95, 'Weit']].map(([v, n]) => `<button class="chip ${S.set.lh === v ? 'on' : ''}" data-lh="${v}">${n}</button>`).join('')}</div></div>
    <div class="set"><h3>Verse</h3><div class="opts"><button class="chip ${!S.set.oneper ? 'on' : ''}" data-op="0">Fließtext</button><button class="chip ${S.set.oneper ? 'on' : ''}" data-op="1">Jeder Vers neue Zeile</button></div></div>
    <div class="set"><h3>Design</h3><div class="opts">${[['auto', 'Automatisch'], ['light', 'Hell'], ['sepia', 'Sepia'], ['dark', 'Dunkel']].map(([v, n]) => `<button class="chip ${S.set.theme === v ? 'on' : ''}" data-th="${v}">${n}</button>`).join('')}</div></div>
    <div class="row"><button class="btn" data-close>Fertig</button></div>`, d => {
    const re = () => { save(); applySettings(); displayDialog(); if (R && location.hash.startsWith('#/r/')) rerenderReader(); };
    $$('[data-size]', d).forEach(b => b.onclick = () => { S.set.size = +b.dataset.size; re(); });
    $$('[data-lh]', d).forEach(b => b.onclick = () => { S.set.lh = +b.dataset.lh; re(); });
    $$('[data-op]', d).forEach(b => b.onclick = () => { S.set.oneper = b.dataset.op === '1'; re(); });
    $$('[data-th]', d).forEach(b => b.onclick = () => { S.set.theme = b.dataset.th; re(); });
  });
}
function rerenderReader() { if (R) { const y = scrollY; viewReader(R.book, R.ch).then(() => scrollTo(0, y)); } }

/* ---------------- Versauswahl & Aktionen ---------------- */
function toggleSel(v) {
  if (R.sel.has(v)) R.sel.delete(v); else R.sel.add(v);
  $$('.v', view).forEach(el => el.classList.toggle('sel', R.sel.has(+el.dataset.v)));
  R.sel.size ? openSheet() : closeSheet();
}
function selRange() { const a = [...R.sel].sort((x, y) => x - y); return { vs: a, ref: refText(R.book, R.ch, a[0], a[a.length - 1] === a[0] ? 0 : a[a.length - 1]) + (a.length > 1 && a[a.length - 1] - a[0] + 1 !== a.length ? ' (Auswahl)' : '') }; }
function selText() { const C = R.chapters[R.ch - 1]; return selRange().vs.map(v => (C.v[v - 1] || '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim()).join(' '); }
function openSheet() {
  const { vs, ref } = selRange();
  const marks = vs.map(v => S.marks[vkey(R.book, R.ch, v)] || {});
  const c0 = marks.every(m => m.c === marks[0].c) ? marks[0].c : null;
  const starred = vs.every(v => S.stars[vkey(R.book, R.ch, v)]);
  sheet.innerHTML = `<div class="ref"><span>${esc(ref)}</span><button id="selx">Auswahl aufheben</button></div>
    <div class="swatches">${HL_SOLID.map((c, i) => `<button style="background:var(--hl${i + 1})" class="${c0 === i + 1 ? 'on' : ''}" data-c="${i + 1}" aria-label="${HL_NAMES[i]} markieren"></button>`).join('')}
      <button class="none" data-c="0" aria-label="Farbe entfernen">${I.x}</button></div>
    <div class="acts">
      <button id="a-tag">${I.tag}Thema</button>
      <button id="a-note">${I.note}Notiz</button>
      <button id="a-star">${I.star}${starred ? 'Gemerkt' : 'Merken'}</button>
      <button id="a-copy">${I.copy}Kopieren</button>
      ${R.book.kind === 'c' ? `<button id="a-cmp">${I.cmp}Vergleich</button>` : `<button id="a-share">${I.copy}Teilen</button>`}
    </div>`;
  sheet.classList.add('open');
  $('#selx').onclick = clearSel;
  $$('[data-c]', sheet).forEach(b => b.onclick = () => {
    const c = +b.dataset.c;
    vs.forEach(v => { const k = vkey(R.book, R.ch, v); const m = S.marks[k] || {}; m.c = c || undefined; touchMark(k, m, v); });
    save(); afterEdit(c ? 'Markiert' : 'Farbe entfernt');
  });
  $('#a-tag').onclick = tagDialog;
  $('#a-note').onclick = noteDialog;
  $('#a-star').onclick = () => { vs.forEach(v => { const k = vkey(R.book, R.ch, v); if (starred) delete S.stars[k]; else S.stars[k] = Date.now(); }); save(); afterEdit(starred ? 'Nicht mehr gemerkt' : 'Gemerkt'); };
  $('#a-copy').onclick = () => copyOut(false);
  const cm = $('#a-cmp'); if (cm) cm.onclick = compareDialog;
  const sh = $('#a-share'); if (sh) sh.onclick = () => copyOut(true);
}
function touchMark(k, m, v) {
  const C = R.chapters[R.ch - 1];
  m.x = (C.v[v - 1] || '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
  m.d = m.d || Date.now();
  if (!m.c && !(m.t && m.t.length)) delete S.marks[k]; else S.marks[k] = m;
}
function afterEdit(msg) { if (msg) toast(msg); const keep = new Set(R.sel); const y = scrollY; viewReader(R.book, R.ch).then(() => { scrollTo(0, y); R.sel = keep; $$('.v', view).forEach(el => el.classList.toggle('sel', keep.has(+el.dataset.v))); keep.size && openSheet(); }); }
function clearSel() { if (R) R.sel.clear(); $$('.v.sel', view).forEach(el => el.classList.remove('sel')); closeSheet(); }
function closeSheet() { sheet.classList.remove('open'); }
async function copyOut(share) {
  const { ref } = selRange();
  const t = `„${selText()}“ – ${ref} (${R.book.kind === 'c' ? trName(S.set.tr) : R.book.kind === 'a' ? 'Menge 1939' : R.book.tr})`;
  if (share && navigator.share) { try { await navigator.share({ text: t }); } catch (e) {} return; }
  try { await navigator.clipboard.writeText(t); toast('Kopiert'); } catch (e) { openDlg(`<h3>Text</h3><textarea readonly>${esc(t)}</textarea><div class="row"><button class="btn" data-close>Schließen</button></div>`); }
}
function tagDialog() {
  const { vs, ref } = selRange();
  const has = id => vs.every(v => ((S.marks[vkey(R.book, R.ch, v)] || {}).t || []).includes(id));
  const ids = Object.keys(S.tags).sort((a, b) => S.tags[a].n.localeCompare(S.tags[b].n, 'de'));
  openDlg(`<h3>Thema für ${esc(ref)}</h3>
    <div class="taglist">${ids.length ? ids.map(id => `<label><input type="checkbox" data-id="${id}" ${has(id) ? 'checked' : ''}><span class="dot" style="background:${TAG_COLORS[S.tags[id].c]}"></span>${esc(S.tags[id].n)}</label>`).join('') : '<p class="muted">Noch keine Themen. Lege unten eins an, z. B. „Verheißungen“, „Gebet“ oder „Fragen“.</p>'}</div>
    <input type="text" id="newtag" placeholder="Neues Thema" maxlength="40">
    <div class="row"><button class="btn" id="addtag">Thema anlegen</button><button class="btn pri" id="savetags">Fertig</button></div>`, d => {
    $('#addtag', d).onclick = () => {
      const n = $('#newtag', d).value.trim(); if (!n) return;
      const id = 't' + Date.now().toString(36);
      S.tags[id] = { n, c: Object.keys(S.tags).length % TAG_COLORS.length };
      vs.forEach(v => { const k = vkey(R.book, R.ch, v); const m = S.marks[k] || {}; m.t = [...new Set([...(m.t || []), id])]; touchMark(k, m, v); });
      save(); tagDialog();
    };
    $('#newtag', d).onkeydown = e => { if (e.key === 'Enter') $('#addtag', d).click(); };
    $('#savetags', d).onclick = () => {
      $$('input[data-id]', d).forEach(cb => {
        vs.forEach(v => {
          const k = vkey(R.book, R.ch, v); const m = S.marks[k] || {}; const set = new Set(m.t || []);
          cb.checked ? set.add(cb.dataset.id) : set.delete(cb.dataset.id);
          m.t = [...set]; if (!m.t.length) delete m.t; touchMark(k, m, v);
        });
      });
      save(); dlg.close(); afterEdit();
    };
  });
}
function noteDialog() {
  const { vs, ref } = selRange();
  const k = vkey(R.book, R.ch, vs[0]);
  const n = S.notes[k] || {};
  openDlg(`<h3>Notiz zu ${esc(ref)}</h3><textarea id="nt" placeholder="Gedanken, Fragen, Querverweise …">${esc(n.t || '')}</textarea>
    <div class="row">${n.t ? '<button class="btn warn" id="ndel">Löschen</button>' : ''}<button class="btn" data-close>Abbrechen</button><button class="btn pri" id="nsave">Speichern</button></div>`, d => {
    setTimeout(() => $('#nt', d).focus(), 50);
    $('#nsave', d).onclick = () => {
      const t = $('#nt', d).value.trim();
      if (t) S.notes[k] = { t, to: vs[vs.length - 1], x: selText().slice(0, 600), d: n.d || Date.now(), u: Date.now() }; else delete S.notes[k];
      save(); dlg.close(); afterEdit(t ? 'Notiz gespeichert' : 'Notiz gelöscht');
    };
    const del = $('#ndel', d); if (del) del.onclick = () => { delete S.notes[k]; save(); dlg.close(); afterEdit('Notiz gelöscht'); };
  });
}
async function compareDialog() {
  const { vs, ref } = selRange();
  openDlg(`<h3>${esc(ref)} im Vergleich</h3><div class="cmp" id="cmpbox"><p class="muted">Lädt …</p></div><div class="row"><button class="btn" data-close>Schließen</button></div>`);
  const out = [];
  for (const t of CAT.translations) {
    try {
      const chs = await chaptersOf(R.book, t.code); const C = chs[R.ch - 1];
      const txt = C ? vs.map(v => C.v[v - 1]).filter(Boolean).join(' ').replace(/\{([^}]*)\}/g, '($1)') : '';
      out.push(`<div><b>${esc(t.name)}</b>${esc(txt || '– (Vers in dieser Übersetzung anders gezählt)')}</div>`);
    } catch (e) { out.push(`<div><b>${esc(t.name)}</b><span class="muted">offline nicht verfügbar</span></div>`); }
  }
  const box = $('#cmpbox'); if (box) box.innerHTML = out.join('');
}

/* ---------------- Markierungen ---------------- */
let markFilter = 'all';
function collectEntries() {
  const keys = new Set([...Object.keys(S.marks), ...Object.keys(S.notes), ...Object.keys(S.stars)]);
  const list = [];
  keys.forEach(k => { const p = parseVKey(k); if (!p || !BOOK[p.bk]) return; list.push({ k, ...p, m: S.marks[k] || {}, n: S.notes[k], s: S.stars[k] }); });
  list.sort((a, b) => (ORDER[a.bk] - ORDER[b.bk]) || (a.ch - b.ch) || (a.v - b.v));
  return list;
}
function passes(e, f) {
  if (f === 'all') return true;
  if (f === 'notes') return !!e.n;
  if (f === 'stars') return !!e.s;
  if (f.startsWith('c')) return e.m.c === +f.slice(1);
  if (f.startsWith('t:')) return (e.m.t || []).includes(f.slice(2));
  return true;
}
function viewMarks() {
  setTab('marks'); setBodyKind('c');
  setTop(`<h1>Markiert</h1>`);
  const all = collectEntries();
  const tagIds = Object.keys(S.tags).filter(id => all.some(e => (e.m.t || []).includes(id)));
  const usedC = [1, 2, 3, 4, 5].filter(c => all.some(e => e.m.c === c));
  const chips = [['all', 'Alle'], ['notes', 'Notizen'], ['stars', 'Gemerkt'], ...usedC.map(c => ['c' + c, HL_NAMES[c - 1]]), ...tagIds.map(id => ['t:' + id, S.tags[id].n])];
  if (!chips.some(c => c[0] === markFilter)) markFilter = 'all';
  const list = all.filter(e => passes(e, markFilter));
  // aufeinanderfolgende Verse mit gleicher Markierung zusammenfassen
  const groups = [];
  list.forEach(e => {
    const g = groups[groups.length - 1];
    const sig = (e.m.c || 0) + '|' + (e.m.t || []).join(',') + '|' + (e.s ? 1 : 0);
    if (g && g.bk === e.bk && g.ch === e.ch && g.v2 + 1 === e.v && g.sig === sig && !e.n && !g.hasNoteAfter) { g.v2 = e.v; g.txt.push(e.m.x || ''); }
    else groups.push({ bk: e.bk, ch: e.ch, v1: e.v, v2: e.v, sig, m: e.m, n: e.n, s: e.s, txt: [e.m.x || (e.n && e.n.x) || ''] });
  });
  let html = `<div class="filters">${chips.map(([k, n]) => `<button class="chip ${k === markFilter ? 'on' : ''}" data-f="${esc(k)}">${esc(n)}</button>`).join('')}</div>`;
  if (!groups.length) html += `<p class="empty">${all.length ? 'Nichts in diesem Filter.' : 'Noch nichts markiert. Tippe beim Lesen auf einen Vers, um ihn farbig zu markieren, einem Thema zuzuordnen, eine Notiz zu schreiben oder ihn dir zu merken.'}</p>`;
  html += groups.map(g => {
    const b = BOOK[g.bk];
    const tags = (g.m.t || []).filter(id => S.tags[id]).map(id => `<b style="background:${TAG_COLORS[S.tags[id].c]}">${esc(S.tags[id].n)}</b>`).join('');
    return `<a class="item" href="${readerHref(b, g.ch, g.v1)}"><div class="r">${g.s ? `<span class="dot" style="background:var(--ochre)" title="Gemerkt"></span>` : ''}${esc(refText(b, g.ch, g.v1, g.n && g.n.to > g.v2 ? g.n.to : g.v2))}<span class="tags">${tags}</span></div>
      <div class="t ${g.m.c ? 'c' + g.m.c : ''}">${esc((g.n && g.n.x) || g.txt.join(' ') || '…')}</div>${g.n ? `<div class="n">${esc(g.n.t)}</div>` : ''}</a>`;
  }).join('');
  view.innerHTML = html;
  $$('[data-f]', view).forEach(b => b.onclick = () => { markFilter = b.dataset.f; viewMarks(); });
}

/* ---------------- Suche ---------------- */
let searchState = { q: '', scope: 'BIB', results: null, token: 0 };
function viewSearch() {
  setTab('search'); setBodyKind('c');
  setTop(`<h1>Suche <small>${esc(trName(S.set.tr))}</small></h1>`);
  const scopes = [['BIB', 'Bibel'], ['AT', 'AT'], ['NT', 'NT'], ['APO', 'Apokryphen'], ['EXT', 'Außerkanonisch (EN)']];
  view.innerHTML = `<form class="searchbox" id="sf"><input type="search" id="q" placeholder="Wort oder Satzteil, z. B. Barmherzigkeit" value="${esc(searchState.q)}" enterkeyhint="search" autocomplete="off"><button class="btn pri">Suchen</button></form>
    <div class="filters">${scopes.map(([k, n]) => `<button class="chip ${k === searchState.scope ? 'on' : ''}" data-s="${k}">${n}</button>`).join('')}</div>
    <div class="progress" id="prog"></div><div id="res"></div>`;
  $$('[data-s]', view).forEach(b => b.onclick = () => { searchState.scope = b.dataset.s; viewSearch(); if (searchState.q) runSearch(); });
  $('#sf').onsubmit = e => { e.preventDefault(); searchState.q = $('#q').value.trim(); runSearch(); };
  if (searchState.results) renderResults(); else if (!searchState.q) setTimeout(() => $('#q') && $('#q').focus(), 60);
}
async function runSearch() {
  const q = searchState.q; if (q.length < 2) { $('#prog').textContent = 'Bitte mindestens 2 Zeichen eingeben.'; return; }
  const tok = ++searchState.token;
  const sc = searchState.scope;
  const books = sc === 'BIB' ? CAT.canon : sc === 'AT' || sc === 'NT' ? CAT.canon.filter(b => b.t === sc) : sc === 'APO' ? CAT.apo : CAT.extra.filter(b => b.chapters);
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const res = []; let i = 0;
  for (const b of books) {
    if (tok !== searchState.token) return;
    const p = $('#prog'); if (p) p.textContent = `Durchsuche ${b.name} … (${++i}/${books.length})`;
    let chs; try { chs = await chaptersOf(b); } catch (e) { continue; }
    chs.forEach((C, ci) => C.v.forEach((t, vi) => { if (t && rx.test(t)) res.push({ bk: b.key, ch: ci + 1, v: vi + 1, t }); }));
  }
  if (tok !== searchState.token) return;
  searchState.results = res; renderResults();
}
function renderResults() {
  const res = searchState.results || [], q = searchState.q;
  const p = $('#prog'); if (!p) return;
  p.textContent = res.length ? `${res.length} Treffer${res.length > 400 ? ' – die ersten 400 werden angezeigt' : ''}` : searchState.scope === 'EXT' ? 'Keine Treffer. Diese Texte sind englisch – suche z. B. nach „wisdom“ statt „Weisheit“.' : 'Keine Treffer.';
  const rx = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  $('#res').innerHTML = res.slice(0, 400).map(r => {
    const b = BOOK[r.bk];
    return `<a class="item" href="${readerHref(b, r.ch, r.v)}"><div class="r">${esc(refText(b, r.ch, r.v))}</div><div class="t">${esc(r.t.replace(/\{([^}]*)\}/g, '($1)')).replace(rx, '<mark>$1</mark>')}</div></a>`;
  }).join('');
}

/* ---------------- Mehr ---------------- */
function dayCounts() { const m = {}; Object.values(S.read).forEach(d => { if (typeof d === 'string') m[d] = (m[d] || 0) + 1; }); return m; }
function streak(m) { let n = 0; const d = new Date(); if (!m[today()]) d.setDate(d.getDate() - 1); for (;;) { const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; if (m[k]) { n++; d.setDate(d.getDate() - 1); } else break; } return n; }
function heatmap(m) {
  const weeks = 18, d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (weeks - 1) * 7);
  let s = '';
  for (let i = 0; i < weeks * 7; i++) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const n = m[k] || 0; const fut = d > new Date();
    s += `<i class="${fut ? '' : n >= 4 ? 'l3' : n >= 2 ? 'l2' : n ? 'l1' : ''}" title="${k}: ${n}" ${fut ? 'style="visibility:hidden"' : ''}></i>`;
    d.setDate(d.getDate() + 1);
  }
  return `<div class="heat">${s}</div>`;
}
function viewMore() {
  setTab('more'); setBodyKind('c');
  setTop(`<h1>Mehr</h1>`);
  const canonRead = CAT.canon.reduce((a, b) => a + readCount(b), 0), canonTot = CAT.canon.reduce((a, b) => a + b.chapters, 0);
  const m = dayCounts();
  const tagIds = Object.keys(S.tags).sort((a, b) => S.tags[a].n.localeCompare(S.tags[b].n, 'de'));
  view.innerHTML = `
  <div class="set" style="border-top:0"><h3>Fortschritt</h3>
    <div class="statgrid"><div><strong>${(100 * canonRead / canonTot).toFixed(1).replace('.', ',')} %</strong><span>der Bibel (${canonRead}/${canonTot} Kap.)</span></div>
    <div><strong>${Object.keys(m).length}</strong><span>Lesetage</span></div><div><strong>${streak(m)}</strong><span>Tage in Folge</span></div></div>
    <p>Gelesene Kapitel der letzten 18 Wochen</p>${heatmap(m)}</div>
  <div class="set"><h3>Übersetzung</h3><div class="opts">${CAT.translations.map(t => `<button class="chip ${t.code === S.set.tr ? 'on' : ''}" data-tr="${t.code}">${esc(t.name)}</button>`).join('')}</div>
    <p>Apokryphen gibt es nur in der Menge-Bibel; sie werden immer in Menge angezeigt.</p></div>
  <div class="set"><h3>Darstellung</h3><div class="opts"><button class="btn" id="disp">${I.aa}Schrift, Abstand, Design</button></div></div>
  <div class="set"><h3>Themen</h3>${tagIds.length ? tagIds.map(id => `<div class="tagrow"><span class="dot" style="background:${TAG_COLORS[S.tags[id].c]}"></span><span>${esc(S.tags[id].n)}</span><button class="btn" data-edit="${id}">Bearbeiten</button></div>`).join('') : '<p>Themen legst du beim Markieren eines Verses an.</p>'}</div>
  <div class="set"><h3>Sichern</h3><p>Alle Lesefortschritte, Markierungen, Themen und Notizen liegen nur auf diesem Gerät. Exportiere regelmäßig eine Sicherung – z. B. bevor du Browserdaten löschst.</p>
    <div class="opts"><button class="btn" id="exp">Sicherung exportieren</button><button class="btn" id="imp">Sicherung importieren</button><input type="file" id="impf" accept="application/json,.json" class="hidden"></div></div>
  <div class="set"><h3>Offline speichern</h3><p>Jede Übersetzung wird beim ersten Öffnen komplett geladen (ca. 1,5 MB Download) und ist danach offline verfügbar. Hier kannst du weitere vorab laden.</p>
    <div class="opts">${CAT.translations.map(t => `<button class="btn" data-dl="${t.code}">${esc(t.name)}</button>`).join('')}<button class="btn" data-dl="ext">Außerkanonische Schriften</button></div><p class="progress" id="dlp"></p></div>
  <div class="set"><h3>Über die Texte</h3><p>Herkunft, Übersetzungen und Urheberrecht.</p><div class="opts"><a class="btn" href="#/quellen">${I.info}Quellen anzeigen</a></div></div>
  <div class="set"><h3>Zurücksetzen</h3><div class="opts"><button class="btn warn" id="wipe">Alle eigenen Daten löschen</button></div><p>Version ${APP_VERSION}</p></div>`;
  $$('[data-tr]', view).forEach(b => b.onclick = () => { S.set.tr = b.dataset.tr; save(); searchState.results = null; viewMore(); });
  $('#disp').onclick = displayDialog;
  $$('[data-edit]', view).forEach(b => b.onclick = () => editTag(b.dataset.edit));
  $('#exp').onclick = exportData;
  $('#imp').onclick = () => $('#impf').click();
  $('#impf').onchange = importData;
  $$('[data-dl]', view).forEach(b => b.onclick = () => downloadAll(b.dataset.dl));
  $('#wipe').onclick = () => {
    if (!confirm('Wirklich ALLE Lesefortschritte, Markierungen, Themen und Notizen löschen?')) return;
    if (!confirm('Das kann nicht rückgängig gemacht werden. Vorher exportieren? Abbrechen = nicht löschen.')) return;
    S = DEFAULT(); save(); applySettings(); viewMore(); toast('Gelöscht');
  };
}
function editTag(id) {
  const t = S.tags[id];
  const used = Object.values(S.marks).filter(m => (m.t || []).includes(id)).length;
  openDlg(`<h3>Thema bearbeiten</h3><input type="text" id="tn" value="${esc(t.n)}" maxlength="40">
    <div class="colors">${TAG_COLORS.map((c, i) => `<button style="background:${c}" class="${i === t.c ? 'on' : ''}" data-col="${i}" aria-label="Farbe ${i + 1}"></button>`).join('')}</div>
    <p class="muted">${used} Vers${used === 1 ? '' : 'e'} zugeordnet.</p>
    <div class="row"><button class="btn warn" id="tdel">Thema löschen</button><button class="btn" data-close>Abbrechen</button><button class="btn pri" id="tsave">Speichern</button></div>`, d => {
    let col = t.c;
    $$('[data-col]', d).forEach(b => b.onclick = () => { col = +b.dataset.col; $$('[data-col]', d).forEach(x => x.classList.toggle('on', x === b)); });
    $('#tsave', d).onclick = () => { const n = $('#tn', d).value.trim(); if (n) { t.n = n; t.c = col; save(); } dlg.close(); viewMore(); };
    $('#tdel', d).onclick = () => {
      if (!confirm(`Thema „${t.n}“ löschen? Die Verse bleiben markiert, nur die Zuordnung verschwindet.`)) return;
      delete S.tags[id];
      Object.entries(S.marks).forEach(([k, m]) => { if (m.t) { m.t = m.t.filter(x => x !== id); if (!m.t.length) delete m.t; if (!m.c && !m.t) delete S.marks[k]; } });
      save(); dlg.close(); viewMore();
    };
  });
}
function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'bibel', version: APP_VERSION, exported: new Date().toISOString(), data: S }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bibel-sicherung-${today()}.json`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function importData(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result); const d = j.data || j;
      if (!d || typeof d.read !== 'object' || typeof d.marks !== 'object') throw new Error('Format');
      const mode = confirm('OK = mit vorhandenen Daten zusammenführen\nAbbrechen = vorhandene Daten ersetzen');
      if (mode) { ['read', 'marks', 'notes', 'stars', 'tags'].forEach(k => S[k] = Object.assign({}, S[k], d[k] || {})); }
      else { S = Object.assign(DEFAULT(), d); S.set = Object.assign(DEFAULT().set, d.set || {}); }
      save(); applySettings(); viewMore(); toast('Sicherung importiert');
    } catch (err) { toast('Die Datei ist keine gültige Sicherung dieser App.'); }
  };
  r.readAsText(f); e.target.value = '';
}
async function downloadAll(code) {
  const p = $('#dlp'), name = code === 'ext' ? 'Außerkanonische Schriften' : trName(code);
  if (p) p.textContent = `${name} wird geladen …`;
  try { await loadJSON(`${code}.json`); if (p) p.textContent = `${name} ist jetzt offline verfügbar.`; }
  catch (e) { if (p) p.textContent = `${name} konnte nicht geladen werden – Internetverbindung prüfen.`; }
}
function viewSources() {
  setTab('more'); setBodyKind('c');
  setTop(`<button class="iconbtn" onclick="history.back()" aria-label="Zurück">${I.back}</button><h1>Quellen</h1>`);
  view.innerHTML = `<div class="about">
  <div class="set" style="border-top:0"><h3>Bibelübersetzungen</h3>
    <p><b>Luther 1912</b> – Revision der Lutherbibel von 1912, gemeinfrei. Datei: open-bibles (github.com/seven1m/open-bibles). Wörter in Klammern sind Worterklärungen dieser Ausgabe.</p>
    <p><b>Elberfelder 1905</b>, <b>Schlachter 1951</b>, <b>Menge 1939</b> (inkl. Apokryphen) – aus scrollmapper/bible_databases (GitHub). Die Elberfelder 1905 und die Menge-Bibel 1939 sind gemeinfrei. Bei der Schlachter 1951 gehe ich nach den deutschen Schutzfristen ebenfalls von Gemeinfreiheit aus; das ist nicht juristisch geprüft.</p></div>
  <div class="set"><h3>Außerkanonische Schriften</h3>
    <p>Englische Übersetzungen aus scrollmapper/bible_databases_deuterocanonical und der Reihe „Ante-Nicene Fathers“ (1885–1896). Ausgewählt wurden nur Texte, deren Übersetzung alt genug für Gemeinfreiheit ist. Die Übersetzerangaben bei jeder Schrift beruhen auf dem Textvergleich; wo „vermutlich“ steht, ist die Zuordnung nicht gesichert. Bei Texten aus den „Ante-Nicene Fathers“ sind Absätze in Sätze zerlegt; die Nummern sind daher Satz-, keine Versnummern.</p>
    <p>Die Einführungstexte fassen den Forschungsstand knapp zusammen. Datierungen sind oft umstritten.</p></div>
  <div class="set"><h3>Schriften</h3><p>Literata und Figtree, SIL Open Font License.</p></div></div>`;
}

/* ---------------- Start ---------------- */
(async function init() {
  applySettings();
  try { CAT = await loadJSON('catalog.json'); }
  catch (e) { view.innerHTML = '<p class="empty">Die App konnte ihre Daten nicht laden. Bitte einmal mit Internetverbindung öffnen.</p>'; return; }
  indexCatalog();
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
