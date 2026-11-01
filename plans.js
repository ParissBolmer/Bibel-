'use strict';
/* Lesepläne: Planmotor und Ansichten. Pläne: data/plaene.json (erzeugt von build/plans.py).
   Zustand in S.plans: [{ id, start, since, done: {Tag: Datum}, skip: {Tag: 1}, created }]
   - Ein Tag ist erledigt, wenn alle seine Kapitel gelesen sind (Lesedatum >= since) oder er von Hand abgehakt wurde.
   - Der Plan hängt nicht am Kalender: "heute dran" ist der erste offene Tag. Verpasstes bleibt ohne Druck offen. */

let PLANS = null;
async function loadPlans() {
  if (PLANS) return PLANS;
  const j = await loadJSON('plaene.json');
  PLANS = { list: j.plans, by: Object.fromEntries(j.plans.map(p => [p.id, p])) };
  return PLANS;
}
const dayCache = new Map();
function dayChs(plan, d) {                       // Tag (1-basiert) -> [{bk, ch}]
  const key = plan.id + '#' + d;
  if (dayCache.has(key)) return dayCache.get(key);
  const out = [];
  plan.d[d - 1].split(';').forEach(s => {
    const [bk, r] = s.split(' '); const [a, b] = r.split('-').map(Number);
    for (let c = a; c <= (b || a); c++) out.push({ bk, ch: c });
  });
  dayCache.set(key, out); return out;
}
// "1. Mose 1–3 · Psalm 90"; short = Kürzel statt Name
function dayLabel(plan, d, short) {
  return plan.d[d - 1].split(';').map(s => {
    const [bk, r] = s.split(' '); const b = BOOK[bk]; const nm = b ? (short ? b.short : b.name) : bk;
    return `${nm} ${r.replace('-', '–')}`;
  }).join(' · ');
}
const instOf = id => S.plans.find(p => p.id === id);
const isDone = (inst, d) => !!inst.done[d];
const isSkipped = (inst, d) => !inst.done[d] && !!inst.skip[d];
function nextDay(inst, plan) { for (let d = 1; d <= plan.n; d++) if (!inst.done[d] && !inst.skip[d]) return d; return plan.n + 1; }
function counts(inst, plan) {
  let done = 0, skip = 0;
  for (let d = 1; d <= plan.n; d++) { if (inst.done[d]) done++; else if (inst.skip[d]) skip++; }
  return { done, skip, open: plan.n - done - skip };
}
const expectedDay = (inst, plan) => Math.min(plan.n, Math.max(1, daysBetween(inst.start, today()) + 1));
const minText = (plan, d) => `ca. ${plan.m[d - 1]} Min.`;
function dayChapterKeys(plan, d) { return dayChs(plan, d).map(c => `${c.bk}.${c.ch}`); }

// Nach jeder Änderung der Gelesen-Markierungen aufrufen. Gibt die neu abgeschlossenen Tage zurück.
function planSync() {
  const fresh = [];
  if (!PLANS || !S.plans.length) return fresh;
  S.plans.forEach(inst => {
    const p = PLANS.by[inst.id]; if (!p) return;
    for (let d = 1; d <= p.n; d++) {
      if (inst.done[d]) continue;
      let max = '';
      const all = dayChapterKeys(p, d).every(k => { const v = S.read[k]; if (typeof v !== 'string' || v < inst.since) return false; if (v > max) max = v; return true; });
      if (all) { inst.done[d] = max; delete inst.skip[d]; fresh.push({ plan: p, day: d }); }
    }
  });
  if (fresh.length) save();
  return fresh;
}
// Nach Änderungen an Gelesen-Markierungen: Pläne nachziehen, Hinweis bei fertigem Tag
async function afterReadChange(quiet) {
  if (!S.plans.length) return [];
  try { await loadPlans(); } catch (e) { return []; }
  const fresh = planSync();
  if (!quiet) {
    if (fresh.length === 1) toast(`Plan „${fresh[0].plan.name}“: Tag ${fresh[0].day} fertig`);
    else if (fresh.length > 1) toast(`${fresh.length} Plantage fertig`);
  }
  return fresh;
}

function startPlan(id, start, countRead) {
  const old = S.plans.findIndex(p => p.id === id);
  const inst = { id, start, since: countRead ? '0000-00-00' : start, done: {}, skip: {}, created: Date.now() };
  if (old >= 0) S.plans[old] = inst; else S.plans.push(inst);
  planSync(); save();
}
function markDay(inst, plan, d) {
  dayChs(plan, d).forEach(c => { const k = `${c.bk}.${c.ch}`; if (typeof S.read[k] !== 'string') S.read[k] = today(); });
  inst.done[d] = today(); delete inst.skip[d]; save();
}
function unmarkDay(inst, plan, d) {
  // Nimmt auch die Gelesen-Markierungen der Kapitel dieses Tages zurück, sonst würde der Tag sofort wieder als fertig erkannt
  dayChs(plan, d).forEach(c => { const k = `${c.bk}.${c.ch}`; if (typeof S.read[k] === 'string' && S.read[k] >= inst.since) delete S.read[k]; });
  delete inst.done[d]; save();
}

// Kontext des Lesers: "planId~Tag" aus der Adresse -> Plan, Tag und Position des Kapitels
function planCtx(ctx, book, ch) {
  if (!ctx || !PLANS) return null;
  const [pid, ds] = ctx.split('~'); const plan = PLANS.by[pid], inst = instOf(pid), d = +ds;
  if (!plan || !inst || !(d >= 1 && d <= plan.n)) return null;
  const chs = dayChs(plan, d); const i = chs.findIndex(c => c.bk === book.key && c.ch === ch);
  return i < 0 ? null : { plan, inst, d, chs, i };
}
const ctxStr = (plan, d) => `${plan.id}~${d}`;
// Erstes noch nicht gelesenes Kapitel eines Tages (sonst das erste)
function firstUnread(plan, d) { const chs = dayChs(plan, d); return chs.find(c => !S.read[`${c.bk}.${c.ch}`]) || chs[0]; }
const readLinkFor = (plan, d, c) => readerHref(BOOK[c.bk], c.ch, 0, 0, ctxStr(plan, d));

/* ---------------- Startseite: "Heute" ---------------- */
function plansHomeHtml() {
  if (!PLANS || !S.plans.length) return '';
  const cards = S.plans.map(inst => {
    const p = PLANS.by[inst.id]; if (!p) return '';
    const nd = nextDay(inst, p), c = counts(inst, p);
    if (nd > p.n) return `<a class="plancard fin" href="#/plan/${esc(p.id)}"><div><b>${esc(p.name)}</b><span>Plan abgeschlossen · ${c.done} von ${p.n} Tagen gelesen</span></div>${I.check}</a>`;
    const f = firstUnread(p, nd);
    return `<a class="plancard" href="#/plan/${esc(p.id)}"><div><b>${esc(p.name)}</b><span>Tag ${nd} von ${p.n} · ${esc(dayLabel(p, nd, true))} · ${minText(p, nd)}</span>
      <i class="pbar"><i style="width:${(100 * c.done / p.n).toFixed(1)}%"></i></i></div>
      <span class="go" data-go="${esc(readLinkFor(p, nd, f))}" role="button" aria-label="Jetzt lesen">${I.next}</span></a>`;
  }).join('');
  return `<div class="plans-today">${cards}</div>`;
}
function bindPlansHome(root) {
  $$('[data-go]', root).forEach(el => el.onclick = e => { e.preventDefault(); e.stopPropagation(); location.hash = el.dataset.go; });
}

/* ---------------- Übersicht aller Pläne ---------------- */
async function viewPlans() {
  setTab('home'); setBodyKind('c');
  setTop(`<button class="iconbtn" onclick="history.length>1?history.back():location.hash='#/'" aria-label="Zurück">${I.back}</button><h1>Lesepläne</h1>`);
  view.innerHTML = '<p class="muted">Lädt …</p>';
  try { await loadPlans(); } catch (e) { view.innerHTML = '<p class="empty">Die Lesepläne konnten nicht geladen werden. Bitte einmal mit Internetverbindung öffnen.</p>'; return; }
  planSync();
  let html = '';
  if (S.plans.length) {
    html += `<div class="grp"><h2>Meine Pläne</h2></div>`;
    html += S.plans.map(inst => {
      const p = PLANS.by[inst.id]; if (!p) return '';
      const c = counts(inst, p), nd = nextDay(inst, p);
      return `<a class="planrow" href="#/plan/${esc(p.id)}"><div class="pr-t"><b>${esc(p.name)}</b><span>${nd > p.n ? 'Abgeschlossen' : `Heute dran: Tag ${nd} · ${esc(dayLabel(p, nd, true))}`}</span></div>
        <div class="pr-n">${c.done}/${p.n}</div><i class="pbar"><i style="width:${(100 * c.done / p.n).toFixed(1)}%"></i></i></a>`;
    }).join('');
  }
  html += `<div class="grp"><h2>Plan starten</h2></div><p class="grpdesc">Du kannst jederzeit beginnen und mehrere Pläne gleichzeitig laufen lassen. Die Pläne hängen nicht am Kalender: Was du heute nicht schaffst, bleibt einfach offen.</p>`;
  const groups = [...new Set(PLANS.list.map(p => p.group))];
  groups.forEach(g => {
    html += `<div class="pgroup">${esc(g)}</div>`;
    PLANS.list.filter(p => p.group === g).forEach(p => {
      const active = !!instOf(p.id);
      html += `<div class="plantile"><div><b>${esc(p.name)}</b><em>${esc(p.sub)}</em><p>${esc(p.desc)}</p></div>
        <button class="btn ${active ? '' : 'pri'}" data-start="${esc(p.id)}">${active ? 'Läuft · öffnen' : 'Starten'}</button></div>`;
    });
  });
  view.innerHTML = html;
  $$('[data-start]', view).forEach(b => b.onclick = () => {
    const id = b.dataset.start;
    if (instOf(id)) location.hash = `#/plan/${id}`; else startDialog(id);
  });
}
function startDialog(id) {
  const p = PLANS.by[id];
  openDlg(`<h3>${esc(p.name)}</h3><p class="muted">${esc(p.desc)}</p>
    <label class="field"><span>Start</span><input type="date" id="pstart" value="${today()}"></label>
    <label class="check"><input type="checkbox" id="pcount"><span>Schon gelesene Kapitel anrechnen<br><small class="muted">Sonst zählen nur Kapitel, die du ab dem Start liest. Einzelne Tage kannst du immer von Hand abhaken.</small></span></label>
    <div class="row"><button class="btn" data-close>Abbrechen</button><button class="btn pri" id="pgo">Plan starten</button></div>`, d => {
    $('#pgo', d).onclick = () => {
      const st = $('#pstart', d).value || today();
      startPlan(id, st, $('#pcount', d).checked); dlg.close(); location.hash = `#/plan/${id}`;
    };
  });
}

/* ---------------- Ein Plan ---------------- */
let planOpen = {};   // geöffnete Tagesblöcke je Plan (nur für die laufende Sitzung)
async function viewPlan(id) {
  setTab('home'); setBodyKind('c');
  setTop(`<a class="iconbtn" href="#/plaene" aria-label="Alle Pläne">${I.back}</a><h1>Lesepläne</h1>`);
  view.innerHTML = '<p class="muted">Lädt …</p>';
  try { await loadPlans(); } catch (e) { view.innerHTML = '<p class="empty">Der Plan konnte nicht geladen werden.</p>'; return; }
  const p = PLANS.by[id], inst = instOf(id);
  if (!p) { location.replace('#/plaene'); return; }
  if (!inst) { location.replace('#/plaene'); return; }
  planSync();
  setTop(`<a class="iconbtn" href="#/plaene" aria-label="Alle Pläne">${I.back}</a><h1>${esc(p.name)}</h1>`);
  const c = counts(inst, p), nd = nextDay(inst, p), exp = expectedDay(inst, p);
  const pct = Math.round(100 * c.done / p.n);
  let html = '';
  if (nd > p.n) {
    html += `<div class="todaycard fin"><div class="tc-k">Geschafft</div><div class="tc-t">Plan abgeschlossen</div><p class="muted">${c.done} von ${p.n} Tagen gelesen${c.skip ? `, ${c.skip} übersprungen` : ''}. Das ist nicht selbstverständlich.</p></div>`;
  } else {
    const chs = dayChs(p, nd), f = firstUnread(p, nd);
    html += `<div class="todaycard"><div class="tc-k">Heute dran · Tag ${nd}</div><div class="tc-t">${esc(dayLabel(p, nd))}</div>
      <div class="tc-ch">${chs.map(x => `<a class="${S.read[`${x.bk}.${x.ch}`] ? 'r' : ''}" href="${readLinkFor(p, nd, x)}">${esc(BOOK[x.bk].short)} ${x.ch}</a>`).join('')}</div>
      <div class="tc-meta">${chs.length} ${chs.length === 1 ? 'Kapitel' : 'Kapitel'} · ${minText(p, nd)}</div>
      <div class="toggle-row"><a class="btn pri" href="${readLinkFor(p, nd, f)}">${I.next}Lesen</a><button class="btn" id="mkday">Tag abhaken</button></div></div>`;
  }
  html += `<div class="tally"><strong>${c.done}</strong> von ${p.n} Tagen gelesen<span class="pct">${pct} %</span></div><div class="bar"><i style="width:${(100 * c.done / p.n).toFixed(1)}%"></i></div>`;
  if (nd <= p.n) {
    const diff = exp - nd;
    if (diff > 0) html += `<div class="pnote"><p>Nach dem Kalender wäre Tag ${exp} dran, du bist bei Tag ${nd}. Das ist in Ordnung: Der Plan wartet auf dich.</p>
      <div class="toggle-row"><button class="btn" id="resched">Zeitplan auf heute setzen</button><button class="btn" id="skipto">Verpasste Tage überspringen</button></div></div>`;
    else if (diff < 0) html += `<div class="pnote"><p>Du liegst ${-diff} ${-diff === 1 ? 'Tag' : 'Tage'} vor dem Kalender (Tag ${exp}).</p></div>`;
    else html += `<div class="pnote"><p>Du liegst genau im Plan.</p></div>`;
  }
  // Tagesliste in Blöcken
  const blk = p.n > 40 ? 7 : p.n, open = planOpen[id] ?? Math.floor((Math.min(nd, p.n) - 1) / blk);
  html += `<div class="grp"><h2>Alle Tage</h2><span>${c.skip ? c.skip + ' übersprungen' : ''}</span></div>`;
  for (let b0 = 0; b0 < p.n; b0 += blk) {
    const b1 = Math.min(p.n, b0 + blk), bi = b0 / blk;
    let nDone = 0; for (let d = b0 + 1; d <= b1; d++) if (inst.done[d]) nDone++;
    const rows = [];
    for (let d = b0 + 1; d <= b1; d++) {
      const st = inst.done[d] ? 'done' : inst.skip[d] ? 'skip' : d === nd ? 'now' : '';
      rows.push(`<button class="dayrow ${st}" data-day="${d}"><span class="dn">${d}</span><span class="dl">${esc(dayLabel(p, d, true))}</span><span class="ds">${inst.done[d] ? I.check : inst.skip[d] ? 'übersprungen' : ''}</span></button>`);
    }
    const head = blk === p.n ? '' : `<summary>Tage ${b0 + 1}–${b1}<span>${nDone}/${b1 - b0}</span></summary>`;
    html += blk === p.n ? `<div class="days">${rows.join('')}</div>` : `<details class="dayblk" data-bi="${bi}" ${open === bi ? 'open' : ''}>${head}<div class="days">${rows.join('')}</div></details>`;
  }
  html += `<div class="set"><h3>Plan verwalten</h3><p>Start: ${esc(fmtDate(inst.start))}${inst.since < inst.start ? ' · schon Gelesenes zählt' : ''}</p>
    <div class="opts"><button class="btn" id="pdate">Startdatum ändern</button><button class="btn warn" id="pdel">Plan entfernen</button></div>
    ${p.note ? `<p class="src">${esc(p.note)}</p>` : ''}</div>`;
  view.innerHTML = html;

  $$('.dayblk', view).forEach(el => el.addEventListener('toggle', () => { if (el.open) planOpen[id] = +el.dataset.bi; }));
  $$('[data-day]', view).forEach(b => b.onclick = () => dayDialog(id, +b.dataset.day));
  const mk = $('#mkday'); if (mk) mk.onclick = () => { markDay(inst, p, nd); toast(`Tag ${nd} abgehakt`); viewPlan(id); };
  const rs = $('#resched'); if (rs) rs.onclick = () => { inst.start = isoOf(addDays(new Date(), -(nd - 1))); save(); toast('Zeitplan angepasst'); viewPlan(id); };
  const sk = $('#skipto'); if (sk) sk.onclick = () => {
    openDlg(`<h3>Verpasste Tage überspringen?</h3><p class="muted">Die Tage 1 bis ${exp - 1}, die noch offen sind, werden als „übersprungen“ markiert und zählen nicht als gelesen. Du kannst sie später in der Tagesliste jederzeit nachholen.</p>
      <div class="row"><button class="btn" data-close>Abbrechen</button><button class="btn pri" id="skgo">Überspringen</button></div>`, d => {
      $('#skgo', d).onclick = () => { for (let k = 1; k < exp; k++) if (!inst.done[k]) inst.skip[k] = 1; save(); dlg.close(); viewPlan(id); };
    });
  };
  $('#pdate').onclick = () => openDlg(`<h3>Startdatum</h3><p class="muted">Das Datum bestimmt nur, welcher Tag nach dem Kalender „dran“ wäre. Dein Fortschritt bleibt erhalten.</p>
    <label class="field"><span>Start</span><input type="date" id="pst" value="${inst.start}"></label>
    <div class="row"><button class="btn" data-close>Abbrechen</button><button class="btn pri" id="psave">Speichern</button></div>`, d => {
    $('#psave', d).onclick = () => { const v = $('#pst', d).value; if (v) { if (inst.since !== '0000-00-00' && v < inst.since) inst.since = v; inst.start = v; save(); } dlg.close(); viewPlan(id); };
  });
  $('#pdel').onclick = () => openDlg(`<h3>Plan entfernen?</h3><p class="muted">„${esc(p.name)}“ wird aus deinen Plänen gelöscht (${c.done} gelesene Tage). Deine Gelesen-Markierungen der Kapitel bleiben erhalten.</p>
    <div class="row"><button class="btn" data-close>Abbrechen</button><button class="btn warn" id="pdgo">Entfernen</button></div>`, d => {
    $('#pdgo', d).onclick = () => { S.plans = S.plans.filter(x => x.id !== id); save(); dlg.close(); location.hash = '#/plaene'; };
  });
}
function dayDialog(id, d) {
  const p = PLANS.by[id], inst = instOf(id); if (!p || !inst) return;
  const chs = dayChs(p, d);
  const state = inst.done[d] ? `Gelesen am ${fmtDate(inst.done[d])}` : inst.skip[d] ? 'Übersprungen' : 'Offen';
  openDlg(`<h3>Tag ${d} · ${esc(dayLabel(p, d))}</h3><p class="muted">${state} · ${chs.length} ${chs.length === 1 ? 'Kapitel' : 'Kapitel'} · ${minText(p, d)}</p>
    <div class="tc-ch">${chs.map(x => `<a class="${S.read[`${x.bk}.${x.ch}`] ? 'r' : ''}" href="${readLinkFor(p, d, x)}">${esc(BOOK[x.bk].short)} ${x.ch}</a>`).join('')}</div>
    <div class="row">${inst.done[d] ? '<button class="btn" id="dundo">Zurücknehmen</button>' : '<button class="btn pri" id="ddone">Abhaken</button>'}
      ${!inst.done[d] ? (inst.skip[d] ? '<button class="btn" id="dunskip">Wieder offen</button>' : '<button class="btn" id="dskip">Überspringen</button>') : ''}
      <a class="btn" href="${readLinkFor(p, d, firstUnread(p, d))}">${I.next}Lesen</a></div>`, el => {
    const go = () => { dlg.close(); viewPlan(id); };
    const a = $('#ddone', el); if (a) a.onclick = () => { markDay(inst, p, d); toast(`Tag ${d} abgehakt`); go(); };
    const u = $('#dundo', el); if (u) u.onclick = () => {
      if (!confirm(`Tag ${d} zurücknehmen? Die Gelesen-Markierungen der Kapitel dieses Tages werden dabei ebenfalls entfernt.`)) return;
      unmarkDay(inst, p, d); go();
    };
    const s = $('#dskip', el); if (s) s.onclick = () => { inst.skip[d] = 1; save(); go(); };
    const us = $('#dunskip', el); if (us) us.onclick = () => { delete inst.skip[d]; save(); go(); };
  });
}
