'use strict';
/* Themen-Lesewege (#/wege, #/weg/ID, #/weg/ID/Station). Inhalte: data/themen.json (build/themen.py).
   Fortschritt in S.paths[ID] = { done: { Stationsindex: Datum }, note: { Stationsindex: Text }, u: zuletzt geöffnet (ms) }.
   Stationsindex beginnt bei 0. Der Text wird in der eingestellten Übersetzung angezeigt. */

let PATHS = null;
async function loadPaths() {
  if (PATHS) return PATHS;
  const d = await loadJSON('themen.json');
  PATHS = { list: d.themes, by: Object.fromEntries(d.themes.map(t => [t.id, t])), source: d.source };
  return PATHS;
}
const pathState = id => S.paths[id] || (S.paths[id] = { done: {}, note: {} });
const pathDone = t => { const p = S.paths[t.id]; return p ? t.st.filter((_, i) => p.done && p.done[i]).length : 0; };
const nextStation = t => { const p = S.paths[t.id] || {}; const i = t.st.findIndex((_, k) => !(p.done || {})[k]); return i < 0 ? t.st.length : i; };
const stRef = s => BOOK[s.b] ? refText(BOOK[s.b], s.c, s.v1, s.v2 > s.v1 ? s.v2 : 0) : s.b;

// Startseite: zuletzt geöffneter, noch nicht beendeter Leseweg
function pathsHomeHtml() {
  if (!PATHS) return '';
  const open = PATHS.list.filter(t => S.paths[t.id] && S.paths[t.id].u && pathDone(t) < t.st.length)
    .sort((a, b) => S.paths[b.id].u - S.paths[a.id].u);
  if (!open.length) return '';
  const t = open[0], n = nextStation(t), d = pathDone(t);
  return `<a class="plancard" href="#/weg/${t.id}/${n + 1}"><div><b>Leseweg: ${esc(t.name)}</b><span>Station ${n + 1} von ${t.st.length} · ${esc(t.st[n].t)}</span>
    <i class="pbar"><i style="width:${(100 * d / t.st.length).toFixed(1)}%"></i></i></div><span class="go">${I.next}</span></a>`;
}

async function viewPaths() {
  setTab('home'); setBodyKind('c');
  setTop(`<button class="iconbtn" onclick="history.length>1?history.back():location.hash='#/'" aria-label="Zurück">${I.back}</button><h1>Lesewege</h1>`);
  try { await loadPaths(); } catch (e) { view.innerHTML = `<div class="missing">Die Lesewege konnten nicht geladen werden. Bist du offline?</div>`; return; }
  const row = t => {
    const d = pathDone(t), n = t.st.length;
    return `<a class="planrow" href="#/weg/${t.id}"><span class="pr-t"><b>${esc(t.name)}</b><span>${esc(t.sub)}</span></span>
      <span class="pr-n">${d ? `${d}/${n}` : `${n} Stellen`}</span>${d ? `<i class="pbar" style="grid-column:1/-1"><i style="width:${(100 * d / n).toFixed(1)}%"></i></i>` : ''}</a>`;
  };
  const prio = PATHS.list.filter(t => t.prio), rest = PATHS.list.filter(t => !t.prio);
  view.innerHTML = `<p class="grpdesc">Ausgewählte Bibelstellen zu einem Thema, in sinnvoller Reihenfolge. Zu jeder Stelle gibt es eine kurze Hinführung und eine Frage zum Nachdenken. Du kannst jederzeit aufhören und später weitermachen.</p>
    <div class="grp"><h2>Deine Themen</h2></div>${prio.map(row).join('')}
    <div class="grp"><h2>Weitere Themen</h2></div>${rest.map(row).join('')}
    <p class="src">${esc(PATHS.source)}</p>`;
}

async function viewPath(id) {
  setTab('home'); setBodyKind('c');
  try { await loadPaths(); } catch (e) { view.innerHTML = `<div class="missing">Die Lesewege konnten nicht geladen werden.</div>`; return; }
  const t = PATHS.by[id]; if (!t) { location.replace('#/wege'); return; }
  setTop(`<a class="iconbtn" href="#/wege" aria-label="Alle Lesewege">${I.back}</a><h1>${esc(t.name)}</h1>`);
  const p = S.paths[t.id] || { done: {}, note: {} }, d = pathDone(t), n = nextStation(t);
  let html = `<p class="booksub">${esc(t.sub)}</p><div class="introcard"><p>${esc(t.intro)}</p></div>`;
  if (n < t.st.length) html += `<div class="toggle-row" style="margin:4px 0 14px"><a class="btn pri" href="#/weg/${t.id}/${n + 1}">${I.next}${d ? `Weiter mit Station ${n + 1}` : 'Leseweg beginnen'}</a></div>`;
  else html += `<div class="pnote"><p>Du hast alle ${t.st.length} Stationen gelesen. Deine Notizen bleiben gespeichert.</p></div>`;
  html += `<div class="tally"><strong>${d}</strong> von ${t.st.length} Stationen<span class="pct">${Math.round(100 * d / t.st.length)} %</span></div><div class="bar"><i style="width:${(100 * d / t.st.length).toFixed(1)}%"></i></div>`;
  html += `<div class="stlist">${t.st.map((s, i) => `<a class="strow ${p.done && p.done[i] ? 'done' : ''} ${i === n ? 'cur' : ''}" href="#/weg/${t.id}/${i + 1}">
      <span class="sn">${p.done && p.done[i] ? I.check : i + 1}</span><span class="stt"><b>${esc(s.t)}</b><span>${esc(stRef(s))}${p.note && p.note[i] ? ' · Notiz' : ''}</span></span></a>`).join('')}</div>`;
  if (d) html += `<div class="opts" style="margin-top:18px"><button class="btn warn" id="preset">Fortschritt zurücksetzen</button></div>`;
  view.innerHTML = html;
  const r = $('#preset');
  if (r) r.onclick = () => { if (!confirm(`Fortschritt im Leseweg „${t.name}“ zurücksetzen? Deine Notizen bleiben erhalten.`)) return; pathState(t.id).done = {}; save(); viewPath(id); };
}

async function viewStation(id, num) {
  setTab('home'); setBodyKind('c');
  try { await loadPaths(); } catch (e) { view.innerHTML = `<div class="missing">Die Lesewege konnten nicht geladen werden.</div>`; return; }
  const t = PATHS.by[id]; if (!t) { location.replace('#/wege'); return; }
  const i = Math.min(Math.max(1, num || 1), t.st.length) - 1, s = t.st[i], book = BOOK[s.b];
  const ps = pathState(t.id); ps.u = Date.now(); save();
  setTop(`<a class="iconbtn" href="#/weg/${t.id}" aria-label="Übersicht des Lesewegs">${I.back}</a><h1>${esc(t.name)}</h1>`);
  const done = !!(ps.done || {})[i];
  view.innerHTML = `<div class="station">
    <div class="st-pos">Station ${i + 1} von ${t.st.length}</div>
    <h2 class="st-t">${esc(s.t)}</h2>
    <p class="st-h">${esc(s.h)}</p>
    <div class="st-text" id="sttext"><div class="st-ref">${esc(stRef(s))}</div><p class="muted">Lädt …</p></div>
    <div class="st-q"><b>Zum Nachdenken</b><p>${esc(s.q)}</p></div>
    <label class="field"><span>Deine Gedanken (optional, bleiben auf dem Gerät)</span><textarea id="stnote" maxlength="2000" placeholder="Was bleibt hängen?">${esc((ps.note || {})[i] || '')}</textarea></label>
    <div class="toggle-row"><button class="btn ${done ? 'done' : 'pri'}" id="stdone">${I.check}${done ? 'Gelesen – rückgängig' : i < t.st.length - 1 ? 'Gelesen – weiter' : 'Gelesen – Leseweg abschließen'}</button>
      ${book ? `<a class="btn" href="${readerHref(book, s.c, s.v1, s.v2)}">Im Zusammenhang lesen</a>` : ''}</div>
    <div class="toggle-row" style="justify-content:space-between;margin-top:14px">
      ${i > 0 ? `<a class="btn" href="#/weg/${t.id}/${i}">${I.back}Station ${i}</a>` : '<span></span>'}
      ${i < t.st.length - 1 ? `<a class="btn" href="#/weg/${t.id}/${i + 2}">Station ${i + 2}${I.next}</a>` : '<span></span>'}</div></div>`;
  const note = $('#stnote');
  const keepNote = () => { const v = note.value.trim(); ps.note = ps.note || {}; if (v) ps.note[i] = v; else delete ps.note[i]; save(); };
  note.oninput = () => { clearTimeout(note._t); note._t = setTimeout(keepNote, 400); };
  note.onblur = keepNote;
  $('#stdone').onclick = () => {
    keepNote(); ps.done = ps.done || {};
    if (ps.done[i]) { delete ps.done[i]; save(); viewStation(id, i + 1); return; }
    ps.done[i] = today(); save();
    if (i < t.st.length - 1) location.hash = `#/weg/${t.id}/${i + 2}`;
    else { toast(`Leseweg „${t.name}“ abgeschlossen`); location.hash = `#/weg/${t.id}`; }
  };
  // Verstext in der eingestellten Übersetzung (Apokryphen gibt es hier nicht)
  if (!book) return;
  try {
    const chs = await chaptersOf(book), C = chs[s.c - 1];
    const box = $('#sttext'); if (!box) return;
    const vs = []; for (let v = s.v1; v <= s.v2; v++) if (C.v[v - 1]) vs.push(`<span class="sv"><sup>${v}</sup>${esc(cleanVerse(C.v[v - 1])).replace(/\bHERR(N?)\b/g, (m, n) => `H<span class="sc">err${n ? 'n' : ''}</span>`)}</span>`);
    box.innerHTML = `<div class="st-ref">${esc(stRef(s))} <span>· ${esc(trName(srcOf(book).tr))}</span></div><p class="st-v">${vs.join(' ')}</p>`;
  } catch (e) { const box = $('#sttext'); if (box) box.innerHTML = `<div class="st-ref">${esc(stRef(s))}</div><p class="muted">Text nicht verfügbar (offline?). Lade die Übersetzung unter „Mehr → Offline speichern“.</p>`; }
}
