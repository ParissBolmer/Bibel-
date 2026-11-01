'use strict';
/* Gebetsliste: Anliegen mit Datum, Status offen/erhört, Notiz und Versverknüpfung.
   Zustand in S.prayers: [{ id, t: Anliegen, n: Notiz, v: [{b: Buchschlüssel, c: Kapitel, v1, v2}], d: angelegt, s: 'o'|'e', e: erhört am, a: Notiz zur Erhörung, u: geändert }] */

let prayFilter = 'o';
const prayerOf = id => S.prayers.find(p => p.id === id);
const openPrayers = () => S.prayers.filter(p => p.s !== 'e');
const refChip = r => { const b = BOOK[r.b]; return b ? `<a class="vref" href="${readerHref(b, r.c, r.v1, r.v2)}">${esc(refText(b, r.c, r.v1, r.v2))}</a>` : ''; };
const daysText = n => n <= 0 ? 'heute' : n === 1 ? '1 Tag' : `${n} Tage`;

function viewPrayers() {
  setTab('home'); setBodyKind('c');
  setTop(`<button class="iconbtn" onclick="history.length>1?history.back():location.hash='#/'" aria-label="Zurück">${I.back}</button><h1>Gebetsliste</h1><button class="iconbtn" id="padd" aria-label="Neues Anliegen">${I.plus}</button>`);
  const all = S.prayers, open = all.filter(p => p.s !== 'e'), ans = all.filter(p => p.s === 'e');
  const list = (prayFilter === 'o' ? open : prayFilter === 'e' ? ans : all).slice()
    .sort((a, b) => prayFilter === 'e' ? (b.e || '').localeCompare(a.e || '') : (a.s === 'e') - (b.s === 'e') || (b.d || '').localeCompare(a.d || '') || b.u - a.u);
  let html = `<div class="filters">${[['o', `Offen · ${open.length}`], ['e', `Erhört · ${ans.length}`], ['a', 'Alle']].map(([k, n]) => `<button class="chip ${k === prayFilter ? 'on' : ''}" data-f="${k}">${n}</button>`).join('')}</div>`;
  if (!list.length) html += `<p class="empty">${!all.length ? 'Hier sammelst du, wofür du betest: mit Datum, einem Vers dazu und – wenn es so weit ist – wie Gott geantwortet hat. Tippe oben auf + für das erste Anliegen.' : prayFilter === 'e' ? 'Noch kein erhörtes Gebet eingetragen.' : 'Keine offenen Anliegen.'}</p>`;
  html += list.map(p => {
    const ans = p.s === 'e';
    const meta = ans ? `Erhört am ${fmtDate(p.e || p.d)} · nach ${daysText(daysBetween(p.d, p.e || p.d))}` : `Seit ${fmtDate(p.d)} · ${daysText(daysBetween(p.d, today()))} offen`;
    return `<div class="prayer ${ans ? 'e' : ''}" data-id="${p.id}">
      <button class="pbody" data-edit="${p.id}"><span class="pt">${esc(p.t)}</span><span class="pm">${esc(meta)}</span></button>
      ${(p.v || []).length ? `<div class="pv">${p.v.map(refChip).join('')}</div>` : ''}
      ${p.n ? `<div class="pn">${esc(p.n)}</div>` : ''}${ans && p.a ? `<div class="pa"><b>Antwort:</b> ${esc(p.a)}</div>` : ''}
      <div class="pact">${ans ? `<button class="btn" data-reopen="${p.id}">Wieder offen</button>` : `<button class="btn" data-answer="${p.id}">${I.check}Erhört</button>`}<button class="btn" data-edit="${p.id}">Bearbeiten</button></div></div>`;
  }).join('');
  view.innerHTML = html;
  $('#padd').onclick = () => prayerDialog(null);
  $$('[data-f]', view).forEach(b => b.onclick = () => { prayFilter = b.dataset.f; viewPrayers(); });
  $$('[data-edit]', view).forEach(b => b.onclick = () => prayerDialog(b.dataset.edit));
  $$('[data-answer]', view).forEach(b => b.onclick = () => answerDialog(b.dataset.answer));
  $$('[data-reopen]', view).forEach(b => b.onclick = () => { const p = prayerOf(b.dataset.reopen); p.s = 'o'; delete p.e; p.u = Date.now(); save(); viewPrayers(); });
}

// Neues Anliegen oder Bearbeiten. pre = { b, c, v1, v2 }: Vers, der von vornherein verknüpft werden soll (aus dem Leser)
function prayerDialog(id, pre) {
  const p = id ? prayerOf(id) : null;
  const refs = (p ? p.v || [] : []).map(r => ({ ...r })); if (pre) refs.push({ b: pre.b, c: pre.c, v1: pre.v1 || 0, v2: pre.v2 || 0 });
  const others = !p && pre ? openPrayers() : [];
  const chips = () => refs.length ? refs.map((r, i) => `<span class="vchip">${esc(refText(BOOK[r.b], r.c, r.v1, r.v2))}<button data-rm="${i}" aria-label="Verknüpfung entfernen">${I.x}</button></span>`).join('') : '<span class="muted">Noch kein Vers verknüpft.</span>';
  openDlg(`<h3>${p ? 'Anliegen bearbeiten' : 'Neues Anliegen'}</h3>
    ${others.length ? `<label class="field"><span>Zu welchem Anliegen?</span><select id="pex"><option value="">Neues Anliegen anlegen</option>${others.map(o => `<option value="${o.id}">${esc(o.t.length > 48 ? o.t.slice(0, 48) + '…' : o.t)}</option>`).join('')}</select></label>` : ''}
    <div id="pnewbox"><label class="field"><span>Wofür betest du?</span><textarea id="pt" maxlength="500" placeholder="z. B. ein Gespräch am Freitag, Gesundheit, Klarheit für eine Entscheidung">${esc(p ? p.t : '')}</textarea></label>
    <label class="field"><span>Notiz (optional)</span><textarea id="pn" maxlength="1000" style="min-height:80px">${esc(p ? p.n || '' : '')}</textarea></label>
    <label class="field"><span>Angelegt am</span><input type="date" id="pd" value="${p ? p.d : today()}" max="${today()}"></label></div>
    <div class="field"><span>Verknüpfte Verse</span><div class="vchips" id="pchips">${chips()}</div>
      <div class="inrow"><input type="text" id="pref" placeholder="z. B. Phil 4,6-7" autocapitalize="off" autocomplete="off" enterkeyhint="done"><button class="btn" id="paddref">Hinzufügen</button></div></div>
    <div class="row">${p ? '<button class="btn warn" id="pdel">Löschen</button>' : ''}<button class="btn" data-close>Abbrechen</button><button class="btn pri" id="psave">Speichern</button></div>`, d => {
    const redraw = () => { $('#pchips', d).innerHTML = chips(); $$('[data-rm]', d).forEach(b => b.onclick = () => { refs.splice(+b.dataset.rm, 1); redraw(); }); };
    redraw();
    const ex = $('#pex', d);
    if (ex) ex.onchange = () => { $('#pnewbox', d).classList.toggle('hidden', !!ex.value); };
    if (!p && !pre) setTimeout(() => $('#pt', d).focus(), 60);
    const addRef = () => {
      const q = $('#pref', d).value.trim(); if (!q) return;
      const hits = Refs.resolve(q).filter(h => h.kind === 'ref');
      if (!hits.length) { toast('Stelle nicht erkannt – z. B. „Röm 8,28“'); return; }
      if (hits.length > 1) { toast('Bitte genauer: ' + hits.slice(0, 2).map(h => h.book.name).join(' oder ') + ' …'); return; }
      const h = hits[0]; if (h.note) { toast(h.note); return; }
      refs.push({ b: h.book.key, c: h.ch, v1: h.v1, v2: h.v2 }); $('#pref', d).value = ''; redraw();
    };
    $('#paddref', d).onclick = addRef;
    $('#pref', d).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addRef(); } };
    $('#psave', d).onclick = () => {
      if ($('#pref', d).value.trim()) addRef();
      const target = ex && ex.value ? prayerOf(ex.value) : null;
      if (target) { target.v = [...(target.v || []), ...refs]; target.u = Date.now(); save(); dlg.close(); toast('Vers zum Anliegen hinzugefügt'); return; }
      const t = $('#pt', d).value.trim(); if (!t) { toast('Bitte das Anliegen eintragen'); $('#pt', d).focus(); return; }
      const rec = p || { id: 'g' + Date.now().toString(36), s: 'o' };
      Object.assign(rec, { t, n: $('#pn', d).value.trim(), v: refs, d: $('#pd', d).value || today(), u: Date.now() });
      if (rec.s === 'e' && rec.e && rec.e < rec.d) rec.e = rec.d;
      if (!p) S.prayers.push(rec);
      save(); dlg.close(); toast(p ? 'Gespeichert' : 'Anliegen angelegt');
      if (location.hash.startsWith('#/gebet')) viewPrayers();
    };
    const del = $('#pdel', d);
    if (del) del.onclick = () => { if (!confirm('Dieses Anliegen wirklich löschen?')) return; S.prayers = S.prayers.filter(x => x.id !== id); save(); dlg.close(); viewPrayers(); };
  });
}

function answerDialog(id) {
  const p = prayerOf(id); if (!p) return;
  openDlg(`<h3>Gebet erhört</h3><p class="muted">${esc(p.t)}</p>
    <label class="field"><span>Wann?</span><input type="date" id="pe" value="${today()}" min="${p.d}" max="${today()}"></label>
    <label class="field"><span>Wie hat Gott geantwortet? (optional)</span><textarea id="pa" maxlength="1000" style="min-height:90px">${esc(p.a || '')}</textarea></label>
    <div class="row"><button class="btn" data-close>Abbrechen</button><button class="btn pri" id="pok">Als erhört eintragen</button></div>`, d => {
    $('#pok', d).onclick = () => {
      p.s = 'e'; p.e = $('#pe', d).value || today(); p.a = $('#pa', d).value.trim(); p.u = Date.now();
      save(); dlg.close(); prayFilter = 'e'; viewPrayers(); toast('Gott sei Dank');
    };
  });
}
