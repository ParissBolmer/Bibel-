'use strict';
/* Zeitleiste (#/zeit, #/zeit/EPOCHE). Inhalte: data/zeit.json (gebaut mit build/zeit.py).
   Jahre sind negativ für v. Chr. Jedes Ereignis hat eine Sicherheitsstufe c: g = außerbiblisch gestützt, w = Forschungsstand, u = unsicher. */

let ZEIT = null;
async function loadZeit() {
  if (ZEIT) return ZEIT;
  const d = await loadJSON('zeit.json');
  ZEIT = { list: d.epochs, by: Object.fromEntries(d.epochs.map(e => [e.i, e])), source: d.source };
  return ZEIT;
}
const ZCONF = {
  g: ['gestützt', 'Durch außerbiblische Quellen wie Inschriften, Chroniken, Josephus oder Tacitus gestützt.'],
  w: ['Forschungsstand', 'In der Forschung weitgehend Konsens, aber ohne enge außerbiblische Festlegung.'],
  u: ['unsicher', 'Umstritten oder nicht datierbar.'],
};
// Jahresangabe als Text: negative Zahlen sind v. Chr.; y überschreibt, wenn die Datierung zwischen Alternativen schwankt
function yearsText(a, b, ca, y) {
  if (y) return y;
  if (a == null) return 'nicht genauer datierbar';
  const pre = ca ? 'ca. ' : '';
  if (b == null || b === a) return pre + Math.abs(a) + (a < 0 ? ' v. Chr.' : ' n. Chr.');
  if (a < 0 && b < 0) return pre + Math.abs(a) + '–' + Math.abs(b) + ' v. Chr.';
  if (a > 0 && b > 0) return pre + a + '–' + b + ' n. Chr.';
  return pre + Math.abs(a) + ' v. Chr. – ' + b + ' n. Chr.';
}
const epochYears = e => e.a == null ? 'nicht datierbar' : yearsText(e.a, e.b, e.ca);
const confBadge = c => `<span class="zc cf-${c}" title="${esc(ZCONF[c][1])}">${esc(ZCONF[c][0])}</span>`;
function zRefLink(r) {
  const b = BOOK[r[0]]; if (!b) return '';
  const c2 = r[4];
  const label = c2 && b.kind !== 'x' ? `${b.short} ${r[1]}–${c2}` : refText(b, r[1], r[2], r[3]);
  return `<a class="rl" href="${readerHref(b, r[1], r[2], r[3])}">${esc(label)}</a>`;
}
const zBookChips = list => list.filter(k => BOOK[k]).map(k => `<a class="chip" href="${bookHref(BOOK[k])}">${esc(BOOK[k].name)}</a>`).join('');

async function viewZeit() {
  setTab('home'); setBodyKind('c');
  setTop(`<button class="iconbtn" onclick="history.length>1?history.back():location.hash='#/'" aria-label="Zurück">${I.back}</button><h1>Zeitleiste</h1>`);
  try { await loadZeit(); } catch (e) { view.innerHTML = `<div class="missing">Die Zeitleiste konnte nicht geladen werden. Bist du offline?</div>`; return; }
  const n = ZEIT.list.reduce((a, e) => a + e.ev.length, 0);
  view.innerHTML = `<p class="grpdesc">Elf Epochen von der Urgeschichte bis zum Ende des ersten Jahrhunderts, mit ${n} Ereignissen. Jedes Ereignis führt zu den Kapiteln, in denen davon erzählt wird. Die Jahreszahlen folgen dem Forschungsstand der Geschichtswissenschaft, nicht den Jahreszahlen älterer Bibelchronologien.</p>
    <div class="zleg" aria-label="Bedeutung der Sicherheitsstufen">${['g', 'w', 'u'].map(c => `<div>${confBadge(c)}<span>${esc(ZCONF[c][1])}</span></div>`).join('')}</div>
    <div class="zlist">${ZEIT.list.map(e => `<a class="zrow" href="#/zeit/${e.i}"><span class="zr-y">${esc(epochYears(e))}</span><span class="zr-t"><b>${esc(e.n)}</b><span>${esc(e.s)}</span></span><span class="zr-n">${e.ev.length}</span></a>`).join('')}</div>
    <p class="src">${esc(ZEIT.source)}</p>`;
}

async function viewEpoch(id) {
  setTab('home'); setBodyKind('c');
  try { await loadZeit(); } catch (e) { setTop(`<a class="iconbtn" href="#/zeit" aria-label="Zeitleiste">${I.back}</a><h1>Zeitleiste</h1>`); view.innerHTML = `<div class="missing">Die Zeitleiste konnte nicht geladen werden.</div>`; return; }
  const ep = ZEIT.by[id]; if (!ep) { location.replace('#/zeit'); return; }
  setTop(`<a class="iconbtn" href="#/zeit" aria-label="Alle Epochen">${I.back}</a><h1>${esc(ep.n)}</h1>`);
  const i = ZEIT.list.indexOf(ep), prev = ZEIT.list[i - 1], next = ZEIT.list[i + 1];
  let html = `<p class="booksub">${esc(epochYears(ep))} · ${esc(ep.s)}</p><div class="introcard"><p>${esc(ep.d)}</p></div>`;
  if (ep.bk.length) html += `<h2 class="zh">Bücher, die von dieser Zeit erzählen</h2><div class="zchips">${zBookChips(ep.bk)}</div>`;
  if (ep.wr.length) html += `<h2 class="zh">Entstanden in dieser Zeit</h2><div class="zchips">${zBookChips(ep.wr)}</div><p class="zhn">Nach den Datierungen in den Buch-Einführungen; viele Bücher wuchsen über Jahrhunderte und stehen bei der Zeit ihrer Endgestalt.</p>`;
  if (ep.tr && ep.tr.length) html += `<h2 class="zh">Traditionell zugeordnet</h2><div class="zchips">${zBookChips(ep.tr)}</div><p class="zhn">Die Überlieferung nennt David oder Salomo als Verfasser; die Forschung datiert die Bücher später.</p>`;
  html += `<h2 class="zh">Ereignisse</h2><ol class="ztl">${ep.ev.map(e => `<li class="zev cf-${e.c}">
      <div class="zd"><span class="zy">${esc(yearsText(e.a, e.b, e.ca, e.y))}</span>${confBadge(e.c)}</div>
      <b>${esc(e.t)}</b><p>${esc(e.d)}</p>${e.r && e.r.length ? `<div class="zrefs">${e.r.map(zRefLink).join('')}</div>` : ''}</li>`).join('')}</ol>`;
  html += `<div id="zpeople"></div>
    <div class="toggle-row" style="justify-content:space-between;margin-top:18px">${prev ? `<a class="btn" href="#/zeit/${prev.i}">${I.back}${esc(prev.n)}</a>` : '<span></span>'}${next ? `<a class="btn" href="#/zeit/${next.i}">${esc(next.n)}${I.next}</a>` : '<span></span>'}</div>
    <p class="src">Sicherheitsstufen: ${['g', 'w', 'u'].map(c => '„' + ZCONF[c][0] + '“ = ' + ZCONF[c][1].replace(/\.$/, '')).join('; ')}.</p>`;
  view.innerHTML = html;
  // Personen dieser Epoche aus dem Register (falls verfügbar)
  try {
    await loadReg();
    const ps = REG.list.filter(p => p.k0 === 'p' && p.e === id);
    const el = $('#zpeople');
    if (el && ps.length) el.innerHTML = `<h2 class="zh">Personen dieser Zeit</h2><div class="zchips">${ps.map(p => `<a class="chip" href="#/reg/${p.i}">${esc(p.n)}</a>`).join('')}</div>`;
  } catch (e) { /* ohne Register nur die Zeitleiste */ }
}
