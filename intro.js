'use strict';
/* Buch-Einführungen (#/einf/BUCH). Inhalte: data/einf.json (build/einf.py).
   Je Buch: tr/fo Verfasser (Tradition/Forschung), z Zeit, an Anlass, au Aufbau [[Bereich, Titel]], ke Hauptgedanke,
   sv Schlüsselverse [[Kapitel, v1, v2]], le „Wie lese ich das?“. Bei Extra-Texten kommen intro/canon aus dem Katalog. */

let INTRO = null;
async function loadIntro() {
  if (INTRO) return INTRO;
  INTRO = await loadJSON('einf.json');
  return INTRO;
}
const introOf = book => INTRO && INTRO.books[book.id] || null;

// Kurzkarte vor dem Kapitelraster der Buchseite
function introTeaser(book) {
  const e = introOf(book); if (!e) return '';
  return `<a class="introteaser" href="#/einf/${encodeURIComponent(book.key)}"><span class="it-k">Einführung</span>
    <span class="it-t">${esc(e.ke)}</span><span class="it-m">${esc(e.z)} · Verfasser, Aufbau, Schlüsselverse ${I.next}</span></a>`;
}
// Hinweis über Kapitel 1 im Leser
function introReaderLink(book) {
  const e = introOf(book); if (!e) return '';
  return `<a class="introlink" href="#/einf/${encodeURIComponent(book.key)}">${I.info}<span>Einführung in ${esc(book.name)} lesen</span></a>`;
}

// Bereich aus dem Aufbau („1–11“, „2,6–20“, „1,1–2,10“) -> erstes Kapitel (für den Link); bei Einkapitelbüchern Verse
function auLink(book, rng) {
  if (!rng || !book.chapters) return '';
  const m = rng.match(/^(\d+)(?:,(\d+))?/); if (!m) return '';
  if (book.chapters === 1) return readerHref(book, 1, +m[1]);
  const c = +m[1]; return c >= 1 && c <= book.chapters ? readerHref(book, c, m[2] ? +m[2] : 0) : '';
}

async function viewIntro(key) {
  const book = BOOK[key]; if (!book) { location.replace('#/'); return; }
  setTab('home'); setBodyKind(book.kind);
  setTop(`<a class="iconbtn" href="${bookHref(book)}" aria-label="Kapitelübersicht">${I.back}</a><h1>${esc(book.name)}</h1>`);
  try { await loadIntro(); } catch (e) { view.innerHTML = `<div class="missing">Die Einführungen konnten nicht geladen werden. Bist du offline?</div>`; return; }
  const e = introOf(book); if (!e) { location.replace(bookHref(book)); return; }
  const x = book.kind === 'x';
  const sub = book.kind === 'c' ? [book.sub, book.t === 'AT' ? 'Altes Testament' : 'Neues Testament', book.group].filter(Boolean).join(' · ')
    : book.kind === 'a' ? 'Apokryphen' : (CAT.extraGroups[book.group] || {}).name || '';
  let html = `<article class="intro">
    <p class="in-sub">${esc(sub)}</p>
    <p class="in-ke">${esc(e.ke)}</p>
    <dl class="in-facts">
      <dt>Verfasser</dt><dd><span class="in-l">Tradition</span>${esc(e.tr)}<br><span class="in-l">Forschung</span>${esc(e.fo)}</dd>
      <dt>Zeit</dt><dd>${esc(e.z)}</dd>
      ${e.an ? `<dt>Anlass</dt><dd>${esc(e.an)}</dd>` : ''}
    </dl>`;
  if (x) html += `<h3>Worum es geht</h3><p>${esc(book.intro)}</p><h3>Warum nicht in der Bibel?</h3><p>${esc(book.canon)}</p>`;
  if (e.au && e.au.length) html += `<h3>Aufbau</h3><ol class="in-au">${e.au.map(([r, t]) => {
    const h = x ? '' : auLink(book, r);
    return `<li>${r ? (h ? `<a href="${h}">${esc(r)}</a>` : `<span>${esc(r)}</span>`) : '<span></span>'}<span>${esc(t)}</span></li>`;
  }).join('')}</ol>`;
  if (e.sv && e.sv.length) html += `<h3>Schlüsselverse</h3><div class="in-sv" id="insv">${e.sv.map(([c, v1, v2], i) =>
    `<a class="in-v" href="${readerHref(book, c, v1, v2 > v1 ? v2 : 0)}"><b>${esc(refText(book, c, v1, v2 > v1 ? v2 : 0))}</b><span data-sv="${i}"></span></a>`).join('')}</div>`;
  html += `<h3>Wie lese ich das?</h3><p>${esc(e.le)}</p>`;
  if (book.chapters) html += `<div class="toggle-row" style="margin-top:18px"><a class="btn pri" href="${readerHref(book, 1)}">${I.next}${esc(chLabel(book, 1)) === '1' ? 'Kapitel 1 lesen' : 'Lesen'}</a><a class="btn" href="${bookHref(book)}">Kapitelübersicht</a></div>`;
  html += `<p class="src">${esc(INTRO.source)}</p></article>`;
  view.innerHTML = html;
  // Schlüsselverse in der eingestellten Übersetzung nachladen (bei Extra-Texten gibt es keine)
  if (e.sv && e.sv.length) {
    try {
      const chs = await chaptersOf(book);
      e.sv.forEach(([c, v1, v2], i) => {
        const el = $(`[data-sv="${i}"]`, view); if (!el || !chs[c - 1]) return;
        const t = []; for (let v = v1; v <= v2; v++) if (chs[c - 1].v[v - 1]) t.push(cleanVerse(chs[c - 1].v[v - 1]));
        el.textContent = t.join(' ');
      });
    } catch (err) { /* offline ohne Text: Verweise bleiben antippbar */ }
  }
}
