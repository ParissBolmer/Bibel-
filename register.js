'use strict';
/* Personen- und Ortsregister (#/register, #/reg/ID) und antippbare Namen im Luthertext.
   Inhalte: data/register.json (gebaut mit build/register.py). Stellenangaben in Luther-1912-Zählung.
   Eintrag: i Kennung, n Name, m Suchmuster (| getrennt), d Kurzbeschreibung, c Zahl der Stellen, v Stellen {Buch: "Kap:Vers,Vers;Kap:Vers"},
   e Epoche (Personen), t Art (Orte), k Hauptstellen [[Buch,Kap,V1,V2]], f häufig in [[Buch,Kap,Anzahl]], a weitere Namensform, l=0: nicht im Text verlinken, s=1: Stellen aus eigener Textsuche. */

let REG = null, regPromise = null;
const EPN = { urgeschichte: 'Urgeschichte', vaeter: 'Erzeltern', exodus: 'Auszug und Landnahme', richter: 'Richterzeit', koenigtum: 'Vereintes Königtum', reiche: 'Geteilte Reiche', exil: 'Exil', perser: 'Perserzeit', hellenismus: 'Hellenistische Zeit', jesus: 'Zeit Jesu', urkirche: 'Urchristentum' };
const REG_LET = 'A-Za-zÄÖÜäöüßéèêëíïóúâîôû';
const regNorm = s => String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');

function loadReg() {
  if (REG) return Promise.resolve(REG);
  if (regPromise) return regPromise;
  regPromise = loadJSON('register.json').then(d => {
    const list = d.p.map(e => Object.assign({ k0: 'p' }, e)).concat(d.o.map(e => Object.assign({ k0: 'o' }, e)));
    const by = {}, vidx = new Map(), cidx = new Map();
    list.forEach(e => {
      e.nn = regNorm(e.n); e.qq = regNorm([e.a || '', e.m.replace(/\|/g, ' ')].join(' ')); e.dd = regNorm(e.d);
      by[e.i] = e;
      Object.keys(e.v).forEach(bk => e.v[bk].split(';').forEach(seg => {
        const p = seg.split(':'), ck = bk + '.' + p[0];
        let s = cidx.get(ck); if (!s) cidx.set(ck, s = new Set()); s.add(e.i);
        if (e.l !== 0) p[1].split(',').forEach(v => { const k = ck + '.' + v; let a = vidx.get(k); if (!a) vidx.set(k, a = []); a.push(e.i); });
      }));
    });
    REG = { list, by, vidx, cidx, source: d.source };
    return REG;
  }).catch(err => { regPromise = null; throw err; });
  return regPromise;
}
const regSub = e => e.k0 === 'p' ? 'Person' + (EPN[e.e] ? ' · ' + EPN[e.e] : '') : (e.t || 'Ort');

/* ---------- Namen im Text ---------- */
function regRx(e) {
  if (e.rx) return e.rx;
  const alt = e.m.split('|').sort((a, b) => b.length - a.length).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // ohne Lookbehind (ältere Safari-Versionen): das Zeichen davor wird mit erfasst
  return e.rx = new RegExp('(^|[^' + REG_LET + '])(' + alt + ")((?:s|es|ens|'s|’s)?)(?![" + REG_LET + '])', 'g');
}
// Teilt einen Textabschnitt in [{t}] und [{t, id}] (id = Registereintrag)
function entSplit(seg, ids) {
  const hits = [];
  ids.forEach(id => {
    const e = REG.by[id], rx = regRx(e); rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(seg))) {
      const s = m.index + m[1].length;
      hits.push({ s, e: s + m[2].length + m[3].length, id });
      if (!m[0].length) rx.lastIndex++;
    }
  });
  if (!hits.length) return null;
  hits.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
  const out = []; let pos = 0;
  hits.forEach(h => { if (h.s < pos) return; if (h.s > pos) out.push({ t: seg.slice(pos, h.s) }); out.push({ t: seg.slice(h.s, h.e), id: h.id }); pos = h.e; });
  if (pos < seg.length) out.push({ t: seg.slice(pos) });
  return out;
}
// Registereinträge, die in diesem Vers stehen (nur Luther 1912, nur kanonische Bücher)
const entIds = (book, ch, v) => REG && book.kind === 'c' && S.set.tr === 'lut' && S.set.ents ? REG.vidx.get(book.key + '.' + ch + '.' + v) : null;

function entDialog(id) {
  const e = REG && REG.by[id]; if (!e) return;
  openDlg(`<h3>${esc(e.n)}</h3><p class="muted" style="margin:-4px 0 8px">${esc(regSub(e))}${e.a ? ' · auch: ' + esc(e.a) : ''}</p><p>${esc(e.d)}</p>
    <div class="row"><a class="btn pri" href="#/reg/${esc(e.i)}">Eintrag öffnen</a><button class="btn" data-close>Schließen</button></div>`);
}
function chRegCount(book, ch) { return REG && book.kind === 'c' && S.set.tr === 'lut' ? (REG.cidx.get(book.key + '.' + ch) || new Set()).size : 0; }
function chRegDialog(book, ch) {
  const ids = [...(REG.cidx.get(book.key + '.' + ch) || [])].map(i => REG.by[i]).sort((a, b) => a.nn.localeCompare(b.nn));
  const row = e => `<a class="planrow" href="#/reg/${esc(e.i)}"><span class="pr-t"><b>${esc(e.n)}</b><span>${esc(e.d)}</span></span></a>`;
  const ps = ids.filter(e => e.k0 === 'p'), os = ids.filter(e => e.k0 === 'o');
  openDlg(`<h3>Personen und Orte in ${esc(book.name)} ${ch}</h3><div class="regdlg">${ps.length ? `<div class="grp"><h2>Personen</h2></div>${ps.map(row).join('')}` : ''}${os.length ? `<div class="grp"><h2>Orte</h2></div>${os.map(row).join('')}` : ''}</div>
    <p class="muted" style="font-size:12.5px">Nur Stellen, an denen der Name im Luthertext steht.</p><div class="row"><button class="btn" data-close>Schließen</button></div>`);
}

/* ---------- Suche ---------- */
function regSearch(q, kind, f) {
  const n = regNorm(q.trim());
  let l = REG.list;
  if (kind === 'p') l = l.filter(e => e.k0 === 'p' && (!f || e.e === f));
  else if (kind === 'o') l = l.filter(e => e.k0 === 'o' && (!f || e.t === f));
  if (!n) return l;
  const a = [], b = [];
  l.forEach(e => { if (e.nn.includes(n) || e.qq.includes(n)) a.push(e); else if (n.length >= 3 && e.dd.includes(n)) b.push(e); });
  a.sort((x, y) => (y.nn.startsWith(n) - x.nn.startsWith(n)) || x.nn.localeCompare(y.nn, 'de'));
  return a.concat(b);
}
// Treffer aus dem Register oberhalb der Volltextsuche
async function showRegHits(q) {
  const el = $('#reghits'); if (!el) return;
  if (regNorm(q.trim()).length < 2) { el.innerHTML = ''; return; }
  try { await loadReg(); } catch (e) { return; }
  const el2 = $('#reghits'); if (!el2) return;
  const hits = regSearch(q).filter(e => e.nn.includes(regNorm(q.trim())) || e.qq.includes(regNorm(q.trim()))).slice(0, 5);
  el2.innerHTML = hits.length ? `<div class="refhits"><div class="rh-h">Personen und Orte</div>${hits.map(e => `<a class="refhit" href="#/reg/${esc(e.i)}"><span><b>${esc(e.n)}</b><em>${esc(regSub(e))} · ${esc(e.d)}</em></span>${I.next}</a>`).join('')}</div>` : '';
}

/* ---------- Ansichten ---------- */
const regState = { q: '', kind: 'all', f: '' };
async function viewRegister() {
  setTab('home'); setBodyKind('c');
  setTop(`<button class="iconbtn" onclick="history.length>1?history.back():location.hash='#/'" aria-label="Zurück">${I.back}</button><h1>Personen und Orte</h1>`);
  try { await loadReg(); } catch (e) { view.innerHTML = `<div class="missing">Das Register konnte nicht geladen werden. Bist du offline?</div>`; return; }
  const np = REG.list.filter(e => e.k0 === 'p').length, no = REG.list.length - np;
  view.innerHTML = `<p class="grpdesc">${np} Personen und ${no} Orte mit Kurzbeschreibung und allen Stellen im Luthertext. In den Leseeinstellungen („Aa“) kannst du Namen im Text antippbar machen.</p>
    <form class="searchbox" id="rf" role="search"><input type="search" id="rq" placeholder="Name oder Stichwort, z. B. Ruth, Berg, Prophet" value="${esc(regState.q)}" autocomplete="off" aria-label="Register durchsuchen"></form>
    <div class="filters" id="rk">${[['all', `Alle · ${np + no}`], ['p', `Personen · ${np}`], ['o', `Orte · ${no}`]].map(([k, n]) => `<button class="chip ${regState.kind === k ? 'on' : ''}" data-k="${k}" aria-pressed="${regState.kind === k}">${n}</button>`).join('')}</div>
    <div class="filters" id="rfl"></div><div id="rl" aria-live="polite"></div>
    <p class="src">${esc(REG.source)}</p>`;
  const draw = () => {
    const fl = $('#rfl');
    if (regState.kind === 'p') fl.innerHTML = [['', 'Alle Zeiten']].concat(Object.entries(EPN)).filter(([k]) => !k || REG.list.some(e => e.e === k)).map(([k, n]) => `<button class="chip ${regState.f === k ? 'on' : ''}" data-f="${k}" aria-pressed="${regState.f === k}">${esc(n)}</button>`).join('');
    else if (regState.kind === 'o') fl.innerHTML = [''].concat([...new Set(REG.list.filter(e => e.k0 === 'o').map(e => e.t))].sort()).map(k => `<button class="chip ${regState.f === k ? 'on' : ''}" data-f="${esc(k)}" aria-pressed="${regState.f === k}">${esc(k || 'Alle Arten')}</button>`).join('');
    else fl.innerHTML = '';
    $$('[data-f]', fl).forEach(b => b.onclick = () => { regState.f = b.dataset.f; draw(); });
    const res = regSearch(regState.q, regState.kind, regState.f);
    let html = '', cur = '';
    const sorted = regState.q.trim() ? res : res;
    sorted.forEach(e => {
      if (!regState.q.trim()) { const L = (e.nn[0] || '').toUpperCase(); if (L !== cur) { cur = L; html += `<div class="grp"><h2>${esc(L)}</h2></div>`; } }
      html += `<a class="planrow" href="#/reg/${esc(e.i)}"><span class="pr-t"><b>${esc(e.n)}</b><span>${esc(regSub(e))} · ${esc(e.d)}</span></span><span class="pr-n">${e.c}</span></a>`;
    });
    $('#rl').innerHTML = res.length ? html : '<p class="muted" style="padding:14px 0">Nichts gefunden. Das Register umfasst die wichtigsten Personen und Orte, nicht alle Namen der Bibel.</p>';
  };
  $$('[data-k]', view).forEach(b => b.onclick = () => { regState.kind = b.dataset.k; regState.f = ''; $$('[data-k]', view).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); draw(); });
  $('#rq').addEventListener('input', e => { regState.q = e.target.value; draw(); });
  $('#rf').onsubmit = e => { e.preventDefault(); $('#rq').blur(); };
  draw();
}

function regAllRefs(e) {
  return Object.keys(e.v).filter(bk => BOOK[bk]).map(bk => {
    const b = BOOK[bk];
    return `<div class="rg-b"><b>${esc(b.name)}</b>${e.v[bk].split(';').map(seg => {
      const p = seg.split(':');
      return `<div class="rg-c"><span class="rg-n">${esc(p[0])}</span>${p[1].split(',').map(v => `<a href="${readerHref(b, +p[0], +v)}" aria-label="${esc(refText(b, +p[0], +v))}">${v}</a>`).join('')}</div>`;
    }).join('')}</div>`;
  }).join('');
}

async function viewRegEntry(id) {
  setTab('home'); setBodyKind('c');
  setTop(`<a class="iconbtn" href="#/register" aria-label="Zum Register">${I.back}</a><h1>Personen und Orte</h1>`);
  try { await loadReg(); } catch (e) { view.innerHTML = `<div class="missing">Das Register konnte nicht geladen werden. Bist du offline?</div>`; return; }
  const e = REG.by[id]; if (!e) { location.replace('#/register'); return; }
  const refLabel = r => { const b = BOOK[r[0]]; return b ? refText(b, r[1], r[2], r[3] > r[2] ? r[3] : 0) : ''; };
  let html = `<article class="regent"><p class="in-sub">${esc(regSub(e))}</p><h2 class="re-n">${esc(e.n)}${e.a ? ` <small>${esc(e.a)}</small>` : ''}</h2>
    <p class="re-d">${esc(e.d)}</p>`;
  if (e.k0 === 'p' && EPN[e.e]) html += `<p class="re-z"><a class="chip" href="#/zeit/${esc(e.e)}">Zeit: ${esc(EPN[e.e])}</a></p>`;
  if (e.k && e.k.length) html += `<h3>Wichtige Stellen</h3><div class="zrefs">${e.k.filter(r => BOOK[r[0]]).map(r => `<a class="rl" href="${readerHref(BOOK[r[0]], r[1], r[2], r[3] > r[2] ? r[3] : 0)}">${esc(refLabel(r))}</a>`).join('')}</div>`;
  if (e.f && e.f.length) html += `<h3>Besonders häufig in</h3><div class="zrefs">${e.f.filter(r => BOOK[r[0]]).map(r => `<a class="rl" href="${readerHref(BOOK[r[0]], r[1])}">${esc(BOOK[r[0]].short + ' ' + r[1])} <span>${r[2]}×</span></a>`).join('')}</div>`;
  html += `<details class="re-all" id="rall"><summary>Alle ${e.c} Stellen</summary><div id="rallb"></div></details>
    <p class="src">Verszählung nach Luther 1912; in anderen Übersetzungen kann ein Vers leicht abweichen. ${e.s ? 'Die Stellen stammen aus einer eigenen Textsuche im Luthertext, es sind die Verse, in denen der Name steht.' : 'Die Stellenliste stammt aus STEPBible TIPNR (CC BY 4.0), umgerechnet auf Luther 1912; aufgenommen sind nur Verse, in denen der Name im Text steht.'} Die Kurzbeschreibung ist ein eigener, KI-erstellter Text.</p></article>`;
  view.innerHTML = html;
  const det = $('#rall');
  det.addEventListener('toggle', () => { const b = $('#rallb'); if (det.open && !b.firstChild) b.innerHTML = regAllRefs(e); });
}
