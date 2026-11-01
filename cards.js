'use strict';
/* Verskarten – auf wörtliches Auswendiglernen ausgelegt.
   Zustand S.cards: [{ id, b: Buchschlüssel, c: Kapitel, v1, v2, tr: Übersetzung, t: [Verstexte], d: angelegt (ISO),
     start: erster Lerntag | null (noch nicht begonnen), st: Lernstufe 0–5, lv: Abstandsstufe (Index in CARD_INT),
     due: fällig am, last: zuletzt geübt, n: Übungen, acc: letzte Trefferquote 0–1, hard: { Wortindex: Gewicht },
     hist: [[Datum, Stufe, Prozent, Note]], parts: [ids] (nur Ketten), pause: true (in einer Kette aufgegangen), u: geändert }]
   S.set.newPerDay: neue Verse pro Tag (Standard 1). Alles lokal, offline, Teil der Sicherung. */

const CARD_INT = [1, 3, 7, 14, 30, 60, 120, 240, 365];   // Tage bis zur nächsten Wiederholung je Abstandsstufe
const STAGES = ['Verstehen', 'Lücken: einzelne Wörter', 'Lücken: die Hälfte', 'Anfangsbuchstaben', 'Aus dem Gedächtnis', 'Stelle und Text'];
const STAGE_SHORT = ['Verstehen', 'Lücken', 'Halbe Lücken', 'Anfangsbuchstaben', 'Gedächtnis', 'Beide Richtungen'];
const GRADES = [['again', 'Nochmal'], ['hard', 'Schwer'], ['good', 'Gut'], ['easy', 'Leicht']];
const GRADE_NAME = Object.fromEntries(GRADES);

const cardOf = id => S.cards.find(c => c.id === id);
const isoIn = n => isoOf(addDays(new Date(), n));
const cardTrName = c => c.tr === 'ext' ? 'Englisch' : trName(c.tr);
const cardRef = c => { const b = BOOK[c.b]; return b ? refText(b, c.c, c.v1, c.v2) : c.b; };
const cardRefLong = c => { const b = BOOK[c.b]; return b ? `${b.name} ${chLabel(b, c.c)}${c.v1 ? ',' + c.v1 + (c.v2 > c.v1 ? '–' + c.v2 : '') : ''}` : c.b; };
const cleanVerse = s => String(s || '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
const activeCards = () => S.cards.filter(c => !c.pause);

/* ---------- Text in Wörter zerlegen und vergleichen ---------- */
const wnorm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]/gu, '');
const wordCache = new Map();
function cardWords(card) {
  const key = card.id + '|' + card.t.join('|');
  if (wordCache.has(key)) return wordCache.get(key);
  const out = [];
  card.t.forEach((txt, vi) => {
    txt.split(/\s+/).filter(Boolean).forEach(tok => {
      const m = tok.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
      if (!m[2]) {                     // reines Satzzeichen (z. B. Gedankenstrich): ans vorige Wort hängen
        if (out.length && out[out.length - 1].vi === vi) out[out.length - 1].post += ' ' + tok; else out.push({ pre: tok + ' ', w: '', post: '', k: '', vi, punct: true });
        return;
      }
      const last = out[out.length - 1];
      if (last && last.punct && last.vi === vi) { out.pop(); m[1] = last.pre + m[1]; }
      out.push({ pre: m[1], w: m[2], post: m[3], k: wnorm(m[2]), vi });
    });
  });
  const res = out.filter(w => w.k);
  wordCache.set(key, res);
  return res;
}
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// Toleranz: Groß/Klein, Satzzeichen, Umlaute (ä = ae = a) und kleine Tippfehler zählen nicht
const tolOf = n => n <= 3 ? 0 : n <= 6 ? 1 : 2;
const foldAe = s => s.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
function wordMatch(target, typed) {
  if (target === typed) return 'ok';
  if (foldAe(target) === foldAe(typed)) return 'ok';
  const t = Math.max(tolOf(target.length), 0);
  return t && lev(foldAe(target), foldAe(typed), t) <= t ? 'typo' : null;
}
// Wortfolgen ausrichten (Needleman-Wunsch): Ergebnis je Zielwort ok | typo | wrong | miss, dazu überzählige Wörter
function alignWords(T, U) {
  const n = T.length, m = U.length;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const M = Array.from({ length: n + 1 }, () => new Array(m + 1));
  for (let i = 1; i <= n; i++) D[i][0] = i;
  for (let j = 1; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const mt = wordMatch(T[i - 1], U[j - 1]); M[i][j] = mt;
    D[i][j] = Math.min(D[i - 1][j - 1] + (mt === 'ok' ? 0 : mt === 'typo' ? 0.25 : 1.2), D[i - 1][j] + 1, D[i][j - 1] + 1);
  }
  const res = new Array(n); const extra = []; let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const mt = M[i][j], c = mt === 'ok' ? 0 : mt === 'typo' ? 0.25 : 1.2;
      if (Math.abs(D[i][j] - (D[i - 1][j - 1] + c)) < 1e-9) { res[i - 1] = { s: mt || 'wrong', typed: U[j - 1], j: j - 1 }; i--; j--; continue; }
    }
    if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9) { res[i - 1] = { s: 'miss' }; i--; continue; }
    extra.push({ typed: U[j - 1], before: i }); j--;
  }
  const ok = res.filter(r => r.s === 'ok' || r.s === 'typo').length;
  const acc = n ? Math.max(0, (ok - 0.5 * extra.length) / n) : 0;
  return { res, extra: extra.reverse(), acc };
}
// Für Node-Tests
if (typeof module !== 'undefined' && module.exports) module.exports = { wnorm, wordMatch, alignWords, lev };

/* ---------- Auswahl der Lücken ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hashStr = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const hardIdx = card => Object.keys(card.hard || {}).map(Number).filter(i => card.hard[i] >= 0.5).sort((a, b) => card.hard[b] - card.hard[a]);
function pickHidden(card, ratio) {
  const W = cardWords(card), n = W.length;
  if (ratio >= 1) return new Set(W.map((_, i) => i));
  const cnt = Math.max(1, Math.round(n * ratio));
  const set = new Set(hardIdx(card).filter(i => i < n).slice(0, cnt));   // schwierige Stellen zuerst abdecken
  const r = rng(hashStr(card.id + ':' + (card.n || 0) + ':' + ratio + ':' + Date.now()));
  W.map((w, i) => [i, r() * (0.35 + Math.min(w.k.length, 9) / 9)]).filter(([i]) => !set.has(i))
    .sort((a, b) => b[1] - a[1]).slice(0, cnt - set.size).forEach(([i]) => set.add(i));
  return set;
}
function bumpHard(card, i, err) {
  card.hard = card.hard || {};
  if (err) card.hard[i] = (card.hard[i] || 0) + 1;
  else if (card.hard[i]) { card.hard[i] *= 0.5; if (card.hard[i] < 0.3) delete card.hard[i]; }
}
// Sinnabschnitte: an Satzzeichen trennen, lange Stücke halbieren
function chunks(card) {
  const W = cardWords(card), out = []; let cur = [];
  W.forEach((w, i) => {
    cur.push(i);
    const brk = /[,;:.!?)]/.test(w.post) || (W[i + 1] && W[i + 1].vi !== w.vi);
    if (brk || cur.length >= 9) { out.push(cur); cur = []; }
  });
  if (cur.length) out.push(cur);
  return out;
}

/* ---------- Anlegen ---------- */
function cardTr(book) { return book.kind === 'c' ? S.set.tr : book.kind === 'a' ? 'men' : 'ext'; }
function addCard(book, ch, v1, v2, texts, tr) {
  v2 = v2 && v2 > v1 ? v2 : 0;
  const ex = S.cards.find(c => c.b === book.key && c.c === ch && c.v1 === v1 && (c.v2 || 0) === v2 && c.tr === tr && !c.pause);
  if (ex) { toast('Schon in deinen Verskarten'); return ex; }
  const t = texts.map(cleanVerse).filter(Boolean);
  if (!t.length) { toast('Kein Text für diese Stelle'); return null; }
  const card = { id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), b: book.key, c: ch, v1, v2, tr, t, d: today(), start: null, st: 0, lv: 0, due: null, n: 0, hard: {}, hist: [], u: Date.now() };
  S.cards.push(card); save();
  const q = cardQueue();
  toast(q.newIds.includes(card.id) ? `Verskarte angelegt – heute zum Lernen dran` : `Verskarte angelegt – startet, sobald dein Tageslimit (${S.set.newPerDay || 1} neue/Tag) Platz hat`);
  return card;
}
// aus dem Leser (Auswahl) – lückenhafte Auswahl wird zum zusammenhängenden Bereich
function addCardFromSel() {
  const { vs } = selRange(); const a = vs[0], z = vs[vs.length - 1];
  if (z - a > 19) { toast('Bitte höchstens 20 Verse auf einmal – längere Abschnitte später als Kette verbinden'); return; }
  const C = R.chapters[R.ch - 1], texts = [];
  for (let v = a; v <= z; v++) texts.push(C.v[v - 1] || '');
  addCard(R.book, R.ch, a, z, texts, cardTr(R.book));
  afterEdit();
}
// aus der Liste der Markierungen
async function addCardFromRef(bk, ch, v1, v2) {
  const book = BOOK[bk]; if (!book) return;
  try {
    const C = (await chaptersOf(book))[ch - 1]; const texts = [];
    for (let v = v1; v <= (v2 || v1); v++) texts.push(C.v[v - 1] || '');
    addCard(book, ch, v1, v2 || 0, texts, cardTr(book));
  } catch (e) { toast('Text konnte nicht geladen werden (offline?)'); }
}

/* ---------- Fälligkeit ---------- */
function cardQueue() {
  const t = today(), act = activeCards();
  const due = act.filter(c => c.start && c.due && c.due <= t).sort((a, b) => a.due.localeCompare(b.due) || a.d.localeCompare(b.d));
  const startedToday = S.cards.filter(c => c.start === t).length;
  const allow = Math.max(0, (S.set.newPerDay || 1) - startedToday);
  const waiting = act.filter(c => !c.start).sort((a, b) => a.d.localeCompare(b.d) || a.u - b.u);
  return { due: due.map(c => c.id), newIds: waiting.slice(0, allow).map(c => c.id), waiting: waiting.map(c => c.id), startedToday };
}
function nextDue() { const d = activeCards().filter(c => c.start && c.due).map(c => c.due).sort(); return d[0] || null; }
function security(c) {
  if (!c.start) return 0;
  const lvPart = Math.min(c.lv || 0, 6) / 6, acc = c.acc ?? 0;
  return Math.round(100 * (0.55 * lvPart + 0.45 * acc) * (c.st >= 4 ? 1 : 0.65));
}
function dueText(c) {
  if (!c.start) return 'noch nicht begonnen';
  const d = daysBetween(today(), c.due);
  return d <= 0 ? 'heute fällig' : d === 1 ? 'morgen' : d < 7 ? `in ${d} Tagen` : 'am ' + fmtDate(c.due).replace(/ \d{4}$/, '');
}
function cardsHomeHtml() {
  if (!S.cards.length) return '';
  const q = cardQueue(), n = q.due.length + q.newIds.length;
  const nd = nextDue();
  const sub = n ? [q.due.length ? `${q.due.length} fällig` : '', q.newIds.length ? `${q.newIds.length} neu` : ''].filter(Boolean).join(' · ')
    : `Heute alles geübt${nd ? ' · nächste ' + (daysBetween(today(), nd) === 1 ? 'morgen' : 'am ' + fmtDate(nd).replace(/ \d{4}$/, '')) : ''}`;
  return `<a class="plancard cardsum ${n ? '' : 'fin'}" href="${n ? '#/lernen' : '#/karten'}"><div><b>Verse lernen</b><span>${esc(sub)}</span></div>${n ? `<span class="go">${I.next}</span>` : I.check}</a>`;
}

/* ---------- Übersicht ---------- */
function chainSuggestions() {
  const act = activeCards().filter(c => c.start && c.v1);
  const out = [];
  act.forEach(a => {
    const end = a.v2 || a.v1;
    const b = act.find(x => x !== a && x.b === a.b && x.c === a.c && x.tr === a.tr && x.v1 === end + 1);
    if (b) out.push([a, b]);
  });
  return out;
}
function viewCards() {
  setTab('home'); setBodyKind('c');
  setTop(`<button class="iconbtn" onclick="history.length>1?history.back():location.hash='#/'" aria-label="Zurück">${I.back}</button><h1>Verskarten</h1>`);
  const q = cardQueue(), n = q.due.length + q.newIds.length, act = activeCards();
  let html = '';
  if (!act.length) {
    html += `<p class="empty">Hier lernst du Verse wörtlich auswendig. Tippe beim Lesen auf einen Vers (oder mehrere) und dann auf <b>Lernen</b>. Auch unter „Markiert“ kannst du markierte Verse mit einem Tipp übernehmen.<br><br>Jede Karte durchläuft sechs Stufen: Verstehen → Lücken → die Hälfte als Lücken → nur Anfangsbuchstaben → aus dem Gedächtnis tippen → Stelle und Text in beide Richtungen. Wiederholt wird nach 1, 3, 7, 14, 30 … Tagen.</p>`;
  } else {
    const nd = nextDue();
    html += `<div class="todaycard ${n ? '' : 'fin'}"><div class="tc-k">Heute</div><div class="tc-t">${n ? `${q.due.length ? q.due.length + ' zum Wiederholen' : ''}${q.due.length && q.newIds.length ? ', ' : ''}${q.newIds.length ? q.newIds.length + ' neu' : ''}` : 'Alles geübt'}</div>
      <div class="tc-meta">${n ? `ca. ${Math.max(1, Math.round(q.due.length * 1.5 + q.newIds.length * 4))} Min.` : nd ? `Nächste Wiederholung ${daysBetween(today(), nd) === 1 ? 'morgen' : 'am ' + fmtDate(nd)}` : ''}${q.waiting.length > q.newIds.length ? ` · ${q.waiting.length - q.newIds.length} warten auf ihren Start` : ''}</div>
      <div class="toggle-row">${n ? `<a class="btn pri" href="#/lernen">${I.next}Jetzt üben</a>` : ''}${!n && q.waiting.length ? `<button class="btn" id="extra">Einen neuen Vers vorziehen</button>` : ''}</div></div>`;
    const sug = chainSuggestions();
    if (sug.length) html += `<div class="pnote"><p><b>Zu einer Kette verbinden?</b> Benachbarte Verse lernst du am besten zusammen weiter.</p><div class="toggle-row">${sug.slice(0, 3).map(([a, b], i) => `<button class="btn" data-chain="${i}">${esc(cardRef(a))} + ${esc(b.v2 ? b.v1 + '–' + b.v2 : String(b.v1))}</button>`).join('')}</div></div>`;
    const sorted = act.slice().sort((a, b) => (!!b.start - !!a.start) || (a.due || '9').localeCompare(b.due || '9') || (ORDER[a.b] - ORDER[b.b]) || a.c - b.c || a.v1 - b.v1);
    html += `<div class="pgroup">Deine Verse · ${act.length}</div>` + sorted.map(c => {
      const sec = security(c);
      return `<a class="planrow cardrow" href="#/karte/${c.id}"><span class="pr-t"><b>${esc(cardRef(c))}${c.parts ? ' <em class="kchain">Kette</em>' : ''}</b><span>${esc(c.start ? STAGE_SHORT[c.st] : 'Neu')} · ${esc(dueText(c))}</span></span><span class="pr-n">${c.start ? sec + ' %' : ''}</span><span class="pbar"><i style="width:${sec}%"></i></span></a>`;
    }).join('');
    html += cardStatsHtml();
  }
  html += `<div class="set"><h3>Neue Verse pro Tag</h3><div class="opts">${[1, 2, 3, 5].map(v => `<button class="chip ${(S.set.newPerDay || 1) === v ? 'on' : ''}" data-npd="${v}">${v}</button>`).join('')}</div>
    <p>Wenige neue Verse, dafür jeden Tag wiederholen – so bleibt der Wortlaut hängen. Keine Erinnerung per Push: Was fällig ist, steht auf der Startseite.</p></div>`;
  view.innerHTML = html;
  $$('[data-npd]', view).forEach(b => b.onclick = () => { S.set.newPerDay = +b.dataset.npd; save(); viewCards(); });
  const ex = $('#extra'); if (ex) ex.onclick = () => startSession([q.waiting[0]]);
  const sug = chainSuggestions();
  $$('[data-chain]', view).forEach(b => b.onclick = () => { const [a, c] = sug[+b.dataset.chain]; const k = chainCards(a, c); if (k) location.hash = '#/karte/' + k.id; });
}
function cardStatsHtml() {
  const act = activeCards().filter(c => c.start);
  if (!act.length) return '';
  const solid = act.filter(c => (c.lv || 0) >= 3).length, avg = Math.round(act.reduce((a, c) => a + security(c), 0) / act.length);
  const reviews = S.cards.reduce((a, c) => a + (c.n || 0), 0);
  const prob = [];
  act.forEach(c => { const W = cardWords(c); Object.entries(c.hard || {}).forEach(([i, h]) => { if (h >= 1 && W[i]) prob.push({ w: W[i].w, h, c }); }); });
  prob.sort((a, b) => b.h - a.h);
  return `<div class="set"><h3>Statistik</h3><div class="statgrid" style="grid-template-columns:repeat(2,1fr)"><div><strong>${avg} %</strong><span>Sicherheit im Schnitt</span></div><div><strong>${solid}</strong><span>gefestigt (ab 2 Wochen Abstand)</span></div><div><strong>${act.length}</strong><span>in Arbeit</span></div><div><strong>${reviews}</strong><span>Übungen gesamt</span></div></div>
    ${prob.length ? `<p style="margin-top:12px"><b>Problemwörter</b> – werden beim nächsten Üben gezielt abgedeckt:</p><div class="probw">${prob.slice(0, 12).map(p => `<a href="#/karte/${p.c.id}"><b>${esc(p.w)}</b><span>${esc(cardRef(p.c))}</span></a>`).join('')}</div>` : ''}
    <p class="src">Sicherheit: aus dem erreichten Wiederholungsabstand und der Trefferquote der letzten Übung.</p></div>`;
}
function verseLines(card, cls) {
  const W = cardWords(card), multi = card.t.length > 1; let s = '', vi = -1;
  W.forEach((w, i) => {
    if (multi && w.vi !== vi) { vi = w.vi; s += `<sup>${card.v1 + vi}</sup>`; }
    s += `<span class="${cls ? cls(i) : ''}">${esc(w.pre + w.w + w.post)}</span> `;
  });
  return s;
}
function viewCard(id) {
  const c = cardOf(id); if (!c) { location.replace('#/karten'); return; }
  setTab('home'); setBodyKind('c');
  setTop(`<button class="iconbtn" onclick="history.length>1?history.back():location.hash='#/karten'" aria-label="Zurück">${I.back}</button><h1>${esc(cardRef(c))}</h1>`);
  const b = BOOK[c.b], hs = new Set(hardIdx(c));
  let html = `<p class="booksub">${esc(cardRefLong(c))} · ${esc(cardTrName(c))}${c.parts ? ' · Kette aus ' + c.parts.length + ' Karten' : ''}${c.pause ? ' · ruht (Teil einer Kette)' : ''}</p>
    <div class="lc-card"><div class="lc-text">${verseLines(c, i => hs.has(i) ? 'hw' : '')}</div></div>`;
  if (hs.size) html += `<p class="muted">Unterstrichen: Wörter, bei denen du dich oft vertust.</p>`;
  html += `<div class="statgrid" style="grid-template-columns:repeat(2,1fr)"><div><strong>${c.start ? security(c) + ' %' : '–'}</strong><span>Sicherheit</span></div><div><strong>${c.start ? c.st + 1 : 0}/6</strong><span>${esc(c.start ? STAGE_SHORT[c.st] : 'noch nicht begonnen')}</span></div>
    <div><strong>${c.n || 0}</strong><span>Übungen</span></div><div><strong>${c.start ? esc(dueText(c)) : '–'}</strong><span>nächste Wiederholung</span></div></div>`;
  if ((c.hist || []).length) html += `<div class="pgroup">Verlauf</div><div class="khist">${c.hist.slice(-14).map(h => `<i style="--h:${Math.max(6, h[2])}%" class="g-${h[3] || 'learn'}" title="${esc(fmtDate(h[0]) + ': ' + STAGE_SHORT[h[1]] + ', ' + h[2] + ' %' + (h[3] ? ', ' + GRADE_NAME[h[3]] : ''))}"></i>`).join('')}</div>`;
  html += `<div class="toggle-row" style="margin-top:16px">${c.pause ? '' : `<button class="btn pri" id="kgo">${I.next}${c.start ? 'Jetzt üben' : 'Jetzt anfangen'}</button>`}${b ? `<a class="btn" href="${readerHref(b, c.c, c.v1, c.v2)}">Im Zusammenhang</a>` : ''}</div>
    <div class="toggle-row" style="margin-top:8px">${c.parts ? '<button class="btn" id="kun">Kette lösen</button>' : ''}${c.start && !c.pause ? '<button class="btn" id="kreset">Neu lernen</button>' : ''}<button class="btn warn" id="kdel">Löschen</button></div>`;
  view.innerHTML = html;
  const go = $('#kgo'); if (go) go.onclick = () => startSession([c.id]);
  const un = $('#kun'); if (un) un.onclick = () => { unchain(c); location.hash = '#/karten'; };
  const rs = $('#kreset'); if (rs) rs.onclick = () => { if (!confirm('Diese Karte von vorn lernen (Stufe 1)? Der Verlauf bleibt erhalten.')) return; Object.assign(c, { start: null, st: 0, lv: 0, due: null, u: Date.now() }); save(); viewCard(c.id); };
  $('#kdel').onclick = () => { if (!confirm(`Verskarte ${cardRef(c)} löschen?`)) return; if (c.parts) unchain(c); S.cards = S.cards.filter(x => x.id !== c.id); save(); location.hash = '#/karten'; };
}

/* ---------- Ketten ---------- */
function chainCards(a, b) {
  if (a.b !== b.b || a.c !== b.c || a.tr !== b.tr || (a.v2 || a.v1) + 1 !== b.v1) return null;
  const parts = [...(a.parts || [a.id]), ...(b.parts || [b.id])];
  const k = { id: 'k' + Date.now().toString(36) + 'c', b: a.b, c: a.c, v1: a.v1, v2: b.v2 || b.v1, tr: a.tr, t: [...a.t, ...b.t], d: today(), start: today(),
    st: Math.min(3, a.st, b.st), lv: 0, due: today(), n: 0, hard: {}, hist: [], parts, u: Date.now() };
  // schwierige Wörter mitnehmen (Indizes der zweiten Karte verschieben)
  const off = cardWords(a).length;
  Object.entries(a.hard || {}).forEach(([i, h]) => k.hard[i] = h);
  Object.entries(b.hard || {}).forEach(([i, h]) => k.hard[+i + off] = h);
  [a, b].forEach(x => { if (x.parts) S.cards = S.cards.filter(y => y.id !== x.id); else { x.pause = true; x.u = Date.now(); } });
  S.cards.push(k); save(); toast(`Kette ${cardRef(k)} angelegt – heute fällig`);
  return k;
}
function unchain(k) {
  (k.parts || []).forEach(id => { const p = cardOf(id); if (p) { delete p.pause; p.due = p.due && p.due > today() ? p.due : today(); p.u = Date.now(); } });
  S.cards = S.cards.filter(x => x.id !== k.id); save(); toast('Kette gelöst – die einzelnen Verse sind wieder aktiv');
}

/* ---------- Lernsitzung ---------- */
let L = null;   // { q: [ids], i, steps, si, card, isNew, passed, accs, log }
const todayQueue = () => { const x = cardQueue(); return [...x.due, ...x.newIds]; };
function startSession(ids) {
  const q = ids || todayQueue();
  if (!q.length) { location.hash = '#/karten'; return; }
  L = { q, i: -1, log: [] };
  if (location.hash !== '#/lernen') location.hash = '#/lernen'; else nextCard();
}
function viewLearn() {
  setTab('home'); setBodyKind('c');
  if (!L) { const q = todayQueue(); if (!q.length) { location.replace('#/karten'); return; } L = { q, i: -1, log: [] }; }
  if (L.i < 0) nextCard(); else renderStep();
}
function nextCard() {
  L.i++;
  if (L.i >= L.q.length) return sessionEnd();
  const c = cardOf(L.q[L.i]);
  if (!c || c.pause) return nextCard();
  L.card = c; L.isNew = !c.start; L.passed = -1; L.accs = []; L.refOk = undefined; L.typedHtml = '';
  if (L.isNew) L.steps = ['s0', 'g1', 'g2'];
  else {
    const main = { 0: ['g1'], 1: ['g1'], 2: ['g2'], 3: ['g3'], 4: ['type'], 5: ['ref', 'type'] }[c.st] || ['type'];
    L.steps = (hardIdx(c).length && c.st >= 3 ? ['hw'] : []).concat(main);
  }
  L.si = 0; renderStep();
}
function learnTop() {
  const c = L.card;
  setTop(`<button class="iconbtn" id="lquit" aria-label="Beenden">${I.x}</button><h1>${L.isNew ? 'Neuer Vers' : 'Wiederholen'} <small>${L.i + 1} von ${L.q.length}</small></h1>`);
  $('#lquit').onclick = () => { if (L.log.length || confirm('Übung beenden? Diese Karte wird nicht gewertet.')) sessionEnd(true); };
  return c;
}
function stageOf(step) { return { s0: 0, g1: 1, g2: 2, g3: 3, hw: 3, type: 4, ref: 5 }[step]; }
function renderStep() {
  const c = learnTop(), step = L.steps[L.si];
  const st = L.isNew ? stageOf(step) : c.st;
  const head = `<div class="lc-head"><span class="lc-ref">${step === 'ref' ? 'Welche Stelle ist das?' : esc(cardRefLong(c))}</span><span class="lc-tr">${esc(cardTrName(c))}</span></div>
    <div class="lc-steps" aria-label="Stufe ${st + 1} von 6">${STAGES.map((n, i) => `<i class="${i < st ? 'p' : i === st ? 'on' : ''}"></i>`).join('')}<span>${esc(step === 'hw' ? 'Problemstellen zuerst' : L.isNew ? STAGES[stageOf(step)] : STAGES[c.st] + (c.st === 5 ? (step === 'ref' ? ' · 1/2' : ' · 2/2') : ''))}</span></div>`;
  if (step === 's0') return stepUnderstand(c, head);
  if (step === 'g1') return stepGaps(c, head, pickHidden(c, 0.25), 'Tippe zu jeder Lücke den Anfangsbuchstaben des fehlenden Wortes.');
  if (step === 'g2') return stepGaps(c, head, pickHidden(c, 0.5), 'Jetzt fehlt die Hälfte. Anfangsbuchstaben tippen.');
  if (step === 'g3') return stepGaps(c, head, pickHidden(c, 1), 'Alles abgedeckt: Sag den Vers im Kopf auf und tippe zu jedem Wort nur den Anfangsbuchstaben.');
  if (step === 'hw') { const h = new Set(hardIdx(c).slice(0, 8)); return stepGaps(c, head, h, 'Erst die Stellen, an denen du zuletzt gehakt hast: Anfangsbuchstaben tippen.'); }
  if (step === 'ref') return stepRef(c, head);
  return stepType(c, head);
}
function stepUnderstand(c, head) {
  const ch = chunks(c), W = cardWords(c);
  view.innerHTML = `${head}<div class="lc-card"><div class="lc-chunks">${ch.map(idx => `<p>${idx.map(i => esc(W[i].pre + W[i].w + W[i].post)).join(' ')}</p>`).join('')}</div></div>
    <p class="muted">Lies den Vers langsam, am besten halblaut, zwei- bis dreimal. Jede Zeile ist ein Sinnabschnitt: Achte auf die Bilder und auf die Reihenfolge der Gedanken. Was sagt der Vers in einem eigenen Satz?</p>
    <div class="toggle-row"><button class="btn pri" id="lnext">${I.next}Weiter: Lücken füllen</button></div>`;
  $('#lnext').onclick = () => { L.passed = 0; L.si++; renderStep(); };
}
// Lückentext mit Eingabe der Anfangsbuchstaben – merkt Fehler Wort für Wort
function stepGaps(c, head, hidden, hint) {
  const W = cardWords(c), order = [...hidden].sort((a, b) => a - b), state = {}; let p = 0; const multi = c.t.length > 1;
  const wordHtml = i => {
    const w = W[i];
    if (hidden.has(i) && !state[i]) return `<span class="gap ${order[p] === i ? 'cur' : ''}" data-i="${i}" style="width:${Math.max(1.6, w.w.length * 0.56)}em">${esc(w.pre)}<u></u>${esc(w.post)}</span>`;
    return `<span class="${state[i] ? 'w-' + state[i] : ''}" data-i="${i}">${esc(w.pre + w.w + w.post)}</span>`;
  };
  const paint = () => { let s = '', vi = -1; W.forEach((w, i) => { if (multi && w.vi !== vi) { vi = w.vi; s += `<sup>${c.v1 + vi}</sup>`; } s += wordHtml(i) + ' '; }); $('#gtext').innerHTML = s; const cur = $('.gap.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' }); };
  view.innerHTML = `${head}<div class="lc-card"><div class="lc-text" id="gtext"></div></div>
    <p class="muted" id="ghint">${esc(hint)}</p>
    <input class="lkey" id="lk" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" aria-label="Anfangsbuchstabe" placeholder="Anfangsbuchstabe …">
    <div class="toggle-row"><button class="btn" id="gshow">Wort zeigen</button><span class="muted" id="gcount">0 von ${order.length}</span></div>`;
  paint();
  const inp = $('#lk'); setTimeout(() => inp.focus(), 60);
  $('#gtext').onclick = () => inp.focus();
  const answer = ok => {
    const i = order[p]; state[i] = ok ? 'ok' : 'bad'; p++;
    $('#gcount').textContent = `${p} von ${order.length}`; paint();
    if (p >= order.length) {
      inp.disabled = true;
      const errs = order.filter(i => state[i] === 'bad');
      order.forEach(i => bumpHard(c, i, state[i] === 'bad'));
      setTimeout(() => stepResult(c, 1 - errs.length / order.length, errs), 450);
    }
  };
  // Android-Tastaturen setzen während der Wortbildung (Composition) den ganzen Wert neu: nur neu hinzugekommene Zeichen zählen
  let used = 0, composing = false;
  inp.addEventListener('compositionstart', () => composing = true);
  inp.addEventListener('compositionend', () => { composing = false; setTimeout(() => { inp.value = ''; used = 0; }, 0); });
  inp.addEventListener('input', () => {
    const v = inp.value;
    if (v.length < used) { used = v.length; return; }
    const add = v.slice(used); used = v.length;
    for (const ch of add) { if (p >= order.length) break; const k = wnorm(ch); if (!k) continue; answer(k[0] === W[order[p]].k[0]); }
    if (!composing) { inp.value = ''; used = 0; }
  });
  $('#gshow').onclick = () => { if (p < order.length) { answer(false); inp.focus(); } };
}
// Aus dem Gedächtnis tippen
function stepType(c, head) {
  view.innerHTML = `${head}<p class="muted">Schreib den Vers aus dem Gedächtnis. Groß- und Kleinschreibung, Satzzeichen und kleine Tippfehler zählen nicht.</p>
    <textarea class="ltype" id="lt" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" placeholder="Vers aus dem Gedächtnis …"></textarea>
    <div class="toggle-row"><button class="btn pri" id="lcheck">${I.check}Prüfen</button><button class="btn" id="lgive">Ich komme nicht weiter</button></div>`;
  const ta = $('#lt'); setTimeout(() => ta.focus(), 60);
  const check = () => {
    const W = cardWords(c), U = ta.value.split(/\s+/).map(wnorm).filter(Boolean);
    const r = alignWords(W.map(w => w.k), U);
    r.res.forEach((x, i) => bumpHard(c, i, x.s === 'wrong' || x.s === 'miss'));
    const errs = r.res.map((x, i) => x.s === 'wrong' || x.s === 'miss' ? i : -1).filter(i => i >= 0);
    // Wortweise Anzeige
    const multi = c.t.length > 1; let s = '', vi = -1;
    const extraAt = {}; r.extra.forEach(e => (extraAt[e.before] = extraAt[e.before] || []).push(e.typed));
    W.forEach((w, i) => {
      if (multi && w.vi !== vi) { vi = w.vi; s += `<sup>${c.v1 + vi}</sup>`; }
      if (extraAt[i]) s += extraAt[i].map(t => `<span class="w-extra" title="zu viel">${esc(t)}</span> `).join('');
      const x = r.res[i];
      s += x.s === 'ok' ? `<span>${esc(w.pre + w.w + w.post)}</span> `
        : x.s === 'typo' ? `<span class="w-typo" title="Tippfehler (zählt nicht): ${esc(x.typed)}">${esc(w.pre + w.w + w.post)}</span> `
        : x.s === 'wrong' ? `<span class="w-bad">${esc(w.pre + w.w + w.post)}<small>${esc(x.typed)}</small></span> `
        : `<span class="w-miss">${esc(w.pre + w.w + w.post)}</span> `;
    });
    if (extraAt[W.length]) s += extraAt[W.length].map(t => `<span class="w-extra">${esc(t)}</span> `).join('');
    L.typedHtml = s;
    stepResult(c, r.acc, errs);
  };
  $('#lcheck').onclick = check;
  $('#lgive').onclick = check;
}
// Text gegeben, Stelle gesucht
function stepRef(c, head) {
  view.innerHTML = `${head}<div class="lc-card"><div class="lc-text">${verseLines(c)}</div></div>
    <form id="rf"><input class="lkey" id="lr" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="z. B. Röm 8,28" aria-label="Stelle"></form>
    <div class="toggle-row"><button class="btn pri" id="rcheck">${I.check}Prüfen</button><button class="btn" id="rgive">Weiß ich nicht</button></div><div id="rres"></div>`;
  const inp = $('#lr'); setTimeout(() => inp.focus(), 60);
  const done = ok => {
    L.refOk = ok;
    $('#rres').innerHTML = `<div class="lc-verdict ${ok ? 'ok' : 'bad'}">${ok ? 'Richtig' : 'Gesucht war'}: <b>${esc(cardRefLong(c))}</b></div><div class="toggle-row"><button class="btn pri" id="rnext">${I.next}Weiter: Text aus dem Gedächtnis</button></div>`;
    $('#rcheck').disabled = $('#rgive').disabled = inp.disabled = true;
    $('#rnext').onclick = () => { L.si++; renderStep(); };
  };
  const check = () => {
    const hits = Refs.resolve(inp.value).filter(h => h.kind === 'ref');
    done(hits.some(h => h.book.key === c.b && h.ch === c.c && (!c.v1 || h.v1 === c.v1)));
  };
  $('#rf').onsubmit = e => { e.preventDefault(); check(); };
  $('#rcheck').onclick = check;
  $('#rgive').onclick = () => done(false);
}
function suggestGrade(acc, st) { return acc >= 0.98 && st >= 4 ? 'easy' : acc >= 0.85 ? 'good' : acc >= 0.6 ? 'hard' : 'again'; }
function stepResult(c, acc, errs) {
  const step = L.steps[L.si], last = L.si === L.steps.length - 1;
  if (step === 'type' && L.refOk !== undefined) { acc = 0.25 * (L.refOk ? 1 : 0) + 0.75 * acc; }
  L.accs.push(acc);
  const pct = Math.round(acc * 100);
  const W = cardWords(c), errSet = new Set(errs), errWords = [...new Set(errs.map(i => W[i].w))];
  const shown = step === 'type' ? L.typedHtml : verseLines(c, i => errSet.has(i) ? 'w-bad' : '');
  let html = `${$('.lc-head') ? $('.lc-head').outerHTML + $('.lc-steps').outerHTML : ''}
    <div class="lc-score"><strong>${pct} %</strong><span>${errs.length ? `${errs.length} Fehler: ${esc(errWords.slice(0, 6).join(', '))}${errWords.length > 6 ? ' …' : ''}` : 'fehlerfrei'}</span></div>
    <div class="lc-card"><div class="lc-text">${shown}</div></div>`;
  if (L.isNew) {
    const good = acc >= 0.7;
    if (good) L.passed = stageOf(step);
    html += `<p class="muted">${good ? (last ? 'Für heute ist der Vers angelegt. Morgen geht es mit den Anfangsbuchstaben weiter.' : 'Gut – weiter mit der nächsten Stufe.') : 'Noch etwas wackelig. Am besten diese Stufe gleich nochmal.'}</p>
      <div class="toggle-row">${!last && good ? `<button class="btn pri" id="lgo">${I.next}Nächste Stufe</button>` : ''}<button class="btn ${good ? '' : 'pri'}" id="lagain">Nochmal</button><button class="btn ${last && good ? 'pri' : ''}" id="lstop">${last ? 'Fertig' : 'Für heute genug'}</button></div>`;
    view.innerHTML = html;
    const go = $('#lgo'); if (go) go.onclick = () => { L.si++; renderStep(); };
    $('#lagain').onclick = () => renderStep();
    $('#lstop').onclick = () => finishNew(c);
    return;
  }
  if (!last) { L.si++; return renderStep(); }   // Aufwärmrunde (Problemstellen) zählt nicht extra
  const sug = suggestGrade(acc, c.st);
  html += `<p class="muted">Wie ging es? Vorschlag nach deinem Ergebnis ist hervorgehoben.</p>
    <div class="grades">${GRADES.map(([k, n]) => `<button class="btn ${k === sug ? 'pri' : ''}" data-g="${k}"><b>${n}</b><span>${esc(gradePreview(c, k))}</span></button>`).join('')}</div>`;
  view.innerHTML = html;
  $$('[data-g]', view).forEach(b => b.onclick = () => { applyGrade(c, b.dataset.g, acc); nextCard(); });
}
function gradePreview(c, g) {
  const lv = c.lv || 0;
  const d = g === 'again' ? 1 : g === 'hard' ? CARD_INT[Math.max(0, lv - 1)] : g === 'good' ? CARD_INT[Math.min(lv, CARD_INT.length - 1)] : CARD_INT[Math.min(lv + 1, CARD_INT.length - 1)];
  return d === 1 ? 'morgen' : `in ${d} Tagen`;
}
function applyGrade(c, g, acc) {
  const lv = c.lv || 0, max = CARD_INT.length - 1;
  if (g === 'again') { c.lv = Math.max(0, lv - 1); c.st = Math.max(1, c.st - 1); c.due = isoIn(1); }      // Rückschritt statt Neustart
  else if (g === 'hard') { c.due = isoIn(CARD_INT[Math.max(0, lv - 1)]); }
  else if (g === 'good') { c.due = isoIn(CARD_INT[Math.min(lv, max)]); c.lv = Math.min(lv + 1, max + 1); c.st = Math.min(5, c.st + 1); }
  else { c.due = isoIn(CARD_INT[Math.min(lv + 1, max)]); c.lv = Math.min(lv + 2, max + 1); c.st = Math.min(5, c.st + 1); }
  logCard(c, acc, g);
}
function finishNew(c) {
  const acc = L.accs.length ? L.accs[L.accs.length - 1] : 1;
  c.start = today(); c.st = Math.max(1, L.passed + 1); c.lv = 1; c.due = isoIn(1);   // Abstand 1 Tag ist damit vergeben, danach 3, 7, 14 …
  logCard(c, acc, null);
  nextCard();
}
function logCard(c, acc, g) {
  c.last = today(); c.n = (c.n || 0) + 1; c.acc = Math.round(acc * 100) / 100; c.u = Date.now();
  c.hist = [...(c.hist || []), [today(), c.st, Math.round(acc * 100), g]].slice(-40);
  L.log.push({ id: c.id, g, acc, due: c.due });
  save();
}
function sessionEnd(quit) {
  const log = L ? L.log : []; L = null;
  setTop(`<button class="iconbtn" onclick="location.hash='#/'" aria-label="Zur Startseite">${I.back}</button><h1>Geschafft</h1>`);
  if (!log.length) { location.hash = '#/karten'; return; }
  view.innerHTML = `<div class="todaycard fin"><div class="tc-k">${quit ? 'Für heute beendet' : 'Fertig für heute'}</div><div class="tc-t">${log.length} ${log.length === 1 ? 'Vers' : 'Verse'} geübt</div></div>
    ${log.map(x => { const c = cardOf(x.id); return c ? `<a class="planrow" href="#/karte/${c.id}"><span class="pr-t"><b>${esc(cardRef(c))}</b><span>${Math.round(x.acc * 100)} %${x.g ? ' · ' + GRADE_NAME[x.g] : ' · angelegt'} · wieder ${esc(dueText(c))}</span></span></a>` : ''; }).join('')}
    <div class="toggle-row" style="margin-top:16px"><a class="btn pri" href="#/karten">Zu den Verskarten</a><a class="btn" href="#/">Startseite</a></div>`;
}
