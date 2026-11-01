'use strict';
/* Übersetzungsvergleich: Seite #/vgl/BUCH/Kapitel/v1-v2. Karten je Vers oder Spalten, 2–4 Fassungen,
   Unterschiede wortweise gegenüber einer Bezugsfassung markiert; der Bezug lässt sich pro Vers umschalten.
   Einstellungen in S.set.cmp = { on: [Codes], base: Code, mode: 'karten'|'spalten' } */

const cmpSet = () => {
  const c = S.set.cmp = Object.assign({ on: CAT.translations.map(t => t.code), base: S.set.tr, mode: 'karten' }, S.set.cmp || {});
  c.on = c.on.filter(code => CAT.translations.some(t => t.code === code));
  if (c.on.length < 2) c.on = CAT.translations.slice(0, 2).map(t => t.code);
  if (!c.on.includes(c.base)) c.base = c.on[0];
  return c;
};
// Alte Rechtschreibung leicht angleichen, damit "Thür"/"Tür" oder "thun"/"tun" nicht als Unterschied gelten
const cmpKey = w => wnorm(w).replace(/th/g, 't').replace(/ey/g, 'ei');
function cmpTokens(t) { return cleanVerse(String(t || '').replace(/\{([^}]*)\}/g, '')).split(' ').filter(Boolean).map(w => ({ w, k: cmpKey(w) })); }
// Längste gemeinsame Teilfolge: Menge der Indizes in b, die auch in a (in gleicher Reihenfolge) vorkommen
function lcsKeep(a, b) {
  const n = a.length, m = b.length, D = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) D[i][j] = a[i].k && a[i].k === b[j].k ? D[i + 1][j + 1] + 1 : Math.max(D[i + 1][j], D[i][j + 1]);
  const keep = new Set(); let i = 0, j = 0;
  while (i < n && j < m) { if (a[i].k && a[i].k === b[j].k) { keep.add(j); i++; j++; } else if (D[i + 1][j] >= D[i][j + 1]) i++; else j++; }
  return keep;
}
function diffHtml(baseToks, toks, isBase) {
  if (isBase || !baseToks) return esc(toks.map(t => t.w).join(' '));
  const keep = lcsKeep(baseToks, toks);
  let out = '', run = [];
  const flush = () => { if (run.length) { out += `<mark class="df">${esc(run.join(' '))}</mark> `; run = []; } };
  toks.forEach((t, j) => { if (keep.has(j) || !t.k) { flush(); out += esc(t.w) + ' '; } else run.push(t.w); });
  flush();
  return out.trim();
}
let CMP = null;   // { book, ch, v1, v2, texts: {code: [verse strings] | null}, vbase: {v: code} }
async function viewCompare(bk, ch, rng) {
  const book = BOOK[bk]; if (!book || book.kind !== 'c') { location.replace('#/'); return; }
  setTab('read'); setBodyKind('c');
  const [a, z] = (rng || '').split('-').map(Number);
  const set = cmpSet();
  const title = `${book.short} ${ch}${a ? ',' + a + (z > a ? '–' + z : '') : ''}`;
  setTop(`<button class="iconbtn" onclick="history.length>1?history.back():location.hash='${readerHref(book, ch, a, z)}'" aria-label="Zurück">${I.back}</button><h1>Vergleich <small>${esc(title)}</small></h1>`);
  if (!CMP || CMP.book !== book || CMP.ch !== ch || CMP.v1 !== (a || 0) || CMP.v2 !== (z || 0)) {
    CMP = { book, ch, v1: a || 0, v2: z || 0, texts: {}, vbase: {} };
    view.innerHTML = '<p class="muted">Lädt die Übersetzungen …</p>';
    for (const t of CAT.translations) { try { CMP.texts[t.code] = ((await chaptersOf(book, t.code))[ch - 1] || { v: [] }).v; } catch (e) { CMP.texts[t.code] = null; } }
    if (!location.hash.startsWith('#/vgl/')) return;
  }
  const lens = Object.values(CMP.texts).filter(Boolean).map(v => v.length);
  const maxV = lens.length ? Math.max(...lens) : 0;
  const v1 = CMP.v1 || 1, v2 = CMP.v1 ? Math.min(CMP.v2 || CMP.v1, maxV) : maxV;
  const on = CAT.translations.filter(t => set.on.includes(t.code));
  let html = `<div class="cmpbar"><div class="filters" style="margin:0">${CAT.translations.map(t => `<button class="chip ${set.on.includes(t.code) ? 'on' : ''}" data-tg="${t.code}">${esc(t.name.replace(/ \d{4}$/, ''))}</button>`).join('')}</div>
    <div class="filters" style="margin:8px 0 0"><button class="chip ${set.mode === 'karten' ? 'on' : ''}" data-mode="karten">Karten</button><button class="chip ${set.mode === 'spalten' ? 'on' : ''}" data-mode="spalten">Spalten</button>
    ${CMP.v1 ? `<a class="chip" href="#/vgl/${encodeURIComponent(book.key)}/${ch}">Ganzes Kapitel</a>` : ''}</div></div>
    <p class="muted cmplegend"><mark class="df">Markiert</mark> = weicht vom Bezugstext ab (<b>${esc(trName(set.base))}</b>). ${set.mode === 'karten' ? 'Tippe auf den Namen einer Fassung, um sie für diesen Vers zum Bezug zu machen.' : 'Tippe auf einen Spaltenkopf, um den Bezug zu wechseln.'}</p>`;
  const cell = (code, v) => { const arr = CMP.texts[code]; if (!arr) return null; const t = arr[v - 1]; return t ? cmpTokens(t) : []; };
  if (set.mode === 'spalten') {
    html += `<div class="cmpcols" style="--n:${on.length}"><div class="cc-row cc-h"><span></span>${on.map(t => `<button data-cb="${t.code}" class="${t.code === set.base ? 'on' : ''}">${esc(t.name)}</button>`).join('')}</div>`;
    for (let v = v1; v <= v2; v++) {
      const bt = cell(set.base, v);
      html += `<div class="cc-row"><span class="cc-v">${v}</span>${on.map(t => { const tk = cell(t.code, v); return `<div class="${t.code === set.base ? 'isb' : ''}">${tk === null ? '<span class="muted">offline nicht geladen</span>' : tk.length ? diffHtml(bt && bt.length ? bt : null, tk, t.code === set.base) : '<span class="muted">– anders gezählt</span>'}</div>`; }).join('')}</div>`;
    }
    html += `</div>`;
  } else {
    for (let v = v1; v <= v2; v++) {
      const base = CMP.vbase[v] && set.on.includes(CMP.vbase[v]) ? CMP.vbase[v] : set.base, bt = cell(base, v);
      html += `<div class="cmpcard"><div class="cmp-v"><a href="${readerHref(book, ch, v)}">${esc(book.short)} ${ch},${v}</a></div>${on.map(t => {
        const tk = cell(t.code, v), isB = t.code === base;
        return `<div class="cmp-row ${isB ? 'isb' : ''}"><button class="cmp-tr" data-vb="${v}|${t.code}" aria-label="${esc(t.name)} als Bezug">${esc(t.name)}${isB ? '<em>Bezug</em>' : ''}</button>
          <div class="cmp-t">${tk === null ? '<span class="muted">offline nicht geladen – unter Mehr → Offline speichern laden</span>' : tk.length ? diffHtml(bt && bt.length ? bt : null, tk, isB) : '<span class="muted">– Vers in dieser Übersetzung anders gezählt</span>'}</div></div>`;
      }).join('')}</div>`;
    }
  }
  if (book.key === 'MAL' || book.key === 'JOL') html += `<p class="muted">Hinweis: Die Elberfelder zählt in ${esc(book.name)} Kapitel und Verse anders.</p>`;
  view.innerHTML = html;
  const again = () => { save(); const y = scrollY; viewCompare(bk, ch, rng).then(() => scrollTo(0, y)); };
  $$('[data-tg]', view).forEach(b => b.onclick = () => {
    const c = b.dataset.tg, i = set.on.indexOf(c);
    if (i >= 0) { if (set.on.length <= 2) { toast('Mindestens zwei Fassungen'); return; } set.on.splice(i, 1); } else set.on.push(c);
    set.on.sort((x, y) => CAT.translations.findIndex(t => t.code === x) - CAT.translations.findIndex(t => t.code === y)); again();
  });
  $$('[data-mode]', view).forEach(b => b.onclick = () => { set.mode = b.dataset.mode; again(); });
  $$('[data-cb]', view).forEach(b => b.onclick = () => { set.base = b.dataset.cb; CMP.vbase = {}; again(); });
  $$('[data-vb]', view).forEach(b => b.onclick = () => { const [v, c] = b.dataset.vb.split('|'); CMP.vbase[v] = c; again(); });
}
