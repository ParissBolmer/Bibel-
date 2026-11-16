'use strict';
/* Eigene Übersetzung importieren (gedacht für die Einheitsübersetzung 2016 als gekauftes EPUB ohne Kopierschutz).
   - Der Text bleibt nur auf diesem Gerät: eigener Cache „bibel-eigen“, nicht in Sicherungen, nicht auf GitHub.
   - Beim Import wird der Text auf die Zählung der App umgerechnet (Kanon: Luther 1912, Apokryphen: Menge 1939),
     damit Lesestand, Markierungen, Notizen, Lesepläne usw. unverändert passen.
   - Zusätze zu Ester (Verse mit Buchstaben, z. B. 1,1a) und Daniel (3,24–90, Kap. 13–14) wandern in die
     Bücher „Zusätze zu Ester“/„Zusätze zu Daniel“ der App.
   Gespeichert wird eu.json im Format der anderen Texte, je Kapitel { l, v: [Texte], e: [EÜ-Verszahl je Vers], hs: {Versindex: Überschrift}, p: [Absatzanfänge] }. */

const EU = (() => {
  const CACHE = 'bibel-eigen', URL_ = 'eu.json', META = 'bibel.eu';

  /* ---------- ZIP lesen (EPUB ist ein ZIP) ---------- */
  async function inflateRaw(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([u8]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Keine ZIP/EPUB-Datei');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const files = new Map(), dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      files.set(name, { method, csize, lo });
      p += 46 + nl + xl + cl;
    }
    return {
      names: [...files.keys()],
      async text(name) {
        const f = files.get(name); if (!f) return null;
        const start = f.lo + 30 + dv.getUint16(f.lo + 26, true) + dv.getUint16(f.lo + 28, true);
        const raw = u8.subarray(start, start + f.csize);
        return dec.decode(f.method === 0 ? raw : await inflateRaw(raw));
      }
    };
  }
  const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
  const joinPath = (base, rel) => { const out = []; (base + rel).split('/').forEach(s => { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }); return out.join('/'); };
  const parseXml = s => { let d = new DOMParser().parseFromString(s, 'application/xhtml+xml'); if (d.getElementsByTagName('parsererror').length) d = new DOMParser().parseFromString(s, 'text/html'); return d; };

  /* ---------- Buchnamen der EÜ -> Kennung der App ---------- */
  // Titel wird erst vereinfacht: „Der erste Brief an die Korinther“ -> „1 korinther“, „Das Buch der Richter“ -> „richter“
  const NAMES = [
    [/^offenbarung|^apokalypse/, 'REV'], [/^apostelgesch/, 'ACT'],
    [/^1 ?makk/, '1MA'], [/^2 ?makk/, '2MA'], [/^1 ?sam/, '1SA'], [/^2 ?sam/, '2SA'], [/^1 ?kön/, '1KI'], [/^2 ?kön/, '2KI'],
    [/^1 ?chr/, '1CH'], [/^2 ?chr/, '2CH'], [/^1 ?kor/, '1CO'], [/^2 ?kor/, '2CO'], [/^1 ?thess/, '1TH'], [/^2 ?thess/, '2TH'],
    [/^1 ?tim/, '1TI'], [/^2 ?tim/, '2TI'], [/^1 ?petr/, '1PE'], [/^2 ?petr/, '2PE'],
    [/^1 ?joh/, '1JN'], [/^2 ?joh/, '2JN'], [/^3 ?joh/, '3JN'],
    [/^genesis/, 'GEN'], [/^exodus/, 'EXO'], [/^levitikus/, 'LEV'], [/^numeri/, 'NUM'], [/^deuteronomium/, 'DEU'], [/^josua/, 'JOS'], [/^richter/, 'JDG'],
    [/^rut\b/, 'RUT'], [/^esra/, 'EZR'], [/^nehemia/, 'NEH'], [/^tobit|^tobias/, 'TOB'], [/^judit/, 'JDT'], [/^ester/, 'EST'],
    [/^ijob|^hiob/, 'JOB'], [/^psalm/, 'PSA'], [/^sprichw|^sprüche/, 'PRO'], [/^kohelet|^prediger/, 'ECC'], [/^hohe(s|n)?\s*lied/, 'SNG'],
    [/^weisheit/, 'WIS'], [/^(jesus )?sirach/, 'SIR'], [/^jesaja/, 'ISA'], [/^jeremia/, 'JER'], [/^klagelied/, 'LAM'], [/^baruch/, 'BAR'], [/^ezechiel|^hesekiel/, 'EZK'],
    [/^daniel/, 'DAN'], [/^hosea/, 'HOS'], [/^jo[eë]l/, 'JOL'], [/^amos/, 'AMO'], [/^obadja/, 'OBA'], [/^jona\b/, 'JON'], [/^micha\b/, 'MIC'], [/^nahum/, 'NAM'],
    [/^habakuk/, 'HAB'], [/^zefanja|^zephanja/, 'ZEP'], [/^haggai/, 'HAG'], [/^sacharja/, 'ZEC'], [/^maleachi/, 'MAL'],
    [/^matth/, 'MAT'], [/^markus/, 'MRK'], [/^lukas/, 'LUK'], [/^johannes/, 'JHN'], [/^römer/, 'ROM'], [/^galater/, 'GAL'],
    [/^epheser/, 'EPH'], [/^philipper/, 'PHP'], [/^kolosser/, 'COL'], [/^titus/, 'TIT'], [/^philemon/, 'PHM'], [/^hebräer/, 'HEB'],
    [/^jakobus/, 'JAS'], [/^judas/, 'JUD'],
  ];
  const ORD = { erste: '1', ersten: '1', erster: '1', erstes: '1', zweite: '2', zweiten: '2', zweiter: '2', zweites: '2', dritte: '3', dritten: '3', dritter: '3', drittes: '3', i: '1', ii: '2', iii: '3' };
  function bookIdOf(title) {
    let t = String(title || '').toLowerCase().replace(/[­​]/g, '').replace(/[–—:].*$/, '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 60) return null;
    t = t.replace(/\b(\d)\./g, '$1 ').replace(/\b(erste[nrs]?|zweite[nrs]?|dritte[nrs]?|iii|ii|i)\b/g, m => ORD[m] || m);
    t = t.replace(/\b(das|der|die|des|buch|brief|evangelium|nach|an|heilige|heiligen)\b/g, ' ').replace(/\s+/g, ' ').trim();
    for (const [rx, id] of NAMES) if (rx.test(t)) return id;
    return null;
  }

  /* ---------- EPUB -> Verse in EÜ-Zählung ---------- */
  // Ergebnis: { books: { ID: [{c, v: '1' | '1a', t, h?, p?}] }, diag }
  const isNum = s => /^\d{1,3}[a-z]?$/.test(s);
  const SKIP_CLASS = /(^|\s|-|_)(fn|fu(ss|ß)note|footnote|anm|anmerkung|note|noteref|marg|rand|parallel|querverweis|xref|ref)(\s|$|-|_|\d)/i;
  const VERSE_CLASS = /(^|\s|-|_)(v|vs|vn|vers|verse|versnr|versnum|versenumber|verseno|vno)(\s|$|-|_|\d)/i;
  const CHAP_CLASS = /(^|\s|-|_)(k|kap|kapitel|chap|chapter|chapnum|chapternum|cn|kapnr|initial|dropcap)(\s|$|-|_|\d)/i;

  const MARK = /^(\d{1,3}[a-z]?)(?:[-–]\d{1,3}[a-z]?)?$/;   // „12“, „12a“, „12–13“ -> erste Zahl
  const LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;

  // Klassen, die laut CSS der EPUB unsichtbar sind (display:none), plus übliche Namen
  function hiddenClasses(cssTexts) {
    const out = new Set(['hide', 'hidden']);
    cssTexts.forEach(css => {
      String(css || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{}]+)\{([^}]*)\}/g, (m, sel, body) => {
        if (!/display\s*:\s*none|visibility\s*:\s*hidden/i.test(body)) return m;
        sel.split(',').forEach(x => { const k = x.trim().match(/^[a-z0-9]*\.([\w-]+)$/i); if (k) out.add(k[1]); });
        return m;
      });
    });
    return out;
  }

  async function readEpub(buf, progress) {
    const z = await unzip(buf);
    const cont = parseXml(await z.text('META-INF/container.xml') || '');
    const rf = cont.getElementsByTagName('rootfile')[0];
    const opfPath = rf ? rf.getAttribute('full-path') : z.names.find(n => n.endsWith('.opf'));
    if (!opfPath) throw new Error('Kein EPUB (content.opf fehlt)');
    const opf = parseXml(await z.text(opfPath)), base = dirOf(opfPath);
    const items = {}; [...opf.getElementsByTagName('item')].forEach(i => items[i.getAttribute('id')] = { href: joinPath(base, decodeURIComponent(i.getAttribute('href'))), props: i.getAttribute('properties') || '', type: i.getAttribute('media-type') });
    const spine = [...opf.getElementsByTagName('itemref')].map(r => items[r.getAttribute('idref')]).filter(Boolean).map(i => i.href);
    // Inhaltsverzeichnis: Datei#Anker -> Buch
    const tocStarts = [];
    const navItem = Object.values(items).find(i => /\bnav\b/.test(i.props));
    if (navItem) {
      const nav = parseXml(await z.text(navItem.href)), nb = dirOf(navItem.href);
      [...nav.getElementsByTagName('a')].forEach(a => { const id = bookIdOf(a.textContent); if (id) { const [f, h] = (a.getAttribute('href') || '').split('#'); tocStarts.push({ id, file: joinPath(nb, decodeURIComponent(f)), anchor: h || '' }); } });
    }
    const ncxItem = Object.values(items).find(i => i.type === 'application/x-dtbncx+xml');
    if (!tocStarts.length && ncxItem) {
      const ncx = parseXml(await z.text(ncxItem.href)), nb = dirOf(ncxItem.href);
      [...ncx.getElementsByTagName('navPoint')].forEach(np => { const lab = np.getElementsByTagName('text')[0], src = np.getElementsByTagName('content')[0]; const id = lab && bookIdOf(lab.textContent); if (id && src) { const [f, h] = src.getAttribute('src').split('#'); tocStarts.push({ id, file: joinPath(nb, decodeURIComponent(f)), anchor: h || '' }); } });
    }
    const firstStart = {}; tocStarts.forEach(s => { if (!firstStart[s.id]) firstStart[s.id] = s; });
    const startsByFile = {}; Object.values(firstStart).forEach(s => (startsByFile[s.file] = startsByFile[s.file] || []).push(s));

    const css = []; for (const i of Object.values(items)) if (i.type === 'text/css') css.push(await z.text(i.href));
    const HIDE = hiddenClasses(css);
    const isHidden = n => { const c = n.getAttribute('class'); if (c && c.split(/\s+/).some(x => HIDE.has(x))) return true; return /display\s*:\s*none/i.test(n.getAttribute('style') || ''); };
    const isSkip = (n, tag, cls) => { const etype = n.getAttribute('epub:type') || n.getAttributeNS && n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || ''; return tag === 'head' || tag === 'script' || tag === 'style' || tag === 'aside' || /footnote|endnote|noteref|rearnote/.test(etype) || SKIP_CLASS.test(cls); };
    // sichtbarer Text eines Elements (ohne unsichtbare Teile), Leerraum entfernt
    const visText = n => { let s = ''; for (const c of n.childNodes) { if (c.nodeType === 3) s += c.nodeValue; else if (c.nodeType === 1 && !isHidden(c)) s += visText(c); } return s; };
    const markOf = n => { const m = visText(n).replace(/[\s   ]+/g, '').replace(/[.:,]$/, '').match(MARK); return m ? m[1] : null; };
    const keyOf = (tag, cls) => tag + (cls ? '.' + cls : '');

    // Vorlauf: Welche Klasse trägt Verszahlen, welche Kapitelzahlen? (Zahl als einziger sichtbarer Inhalt, fortlaufend)
    const docs = [], stat = {};
    for (let fi = 0; fi < spine.length; fi++) {
      if (progress) progress(`Untersuche Datei ${fi + 1} von ${spine.length} …`);
      const src = await z.text(spine[fi]); const doc = src ? parseXml(src) : null; docs.push(doc); if (!doc) continue;
      const scan = el => {
        for (const n of el.children) {
          const tag = n.localName.toLowerCase(), cls = n.getAttribute('class') || '';
          if (isHidden(n) || isSkip(n, tag, cls)) continue;
          if (cls || /^(sup|span|a|b|strong|em|i|small|big)$/.test(tag)) {
            const k = keyOf(tag, cls), st = stat[k] = stat[k] || { all: 0, num: 0, inc: 0, last: 0 };
            st.all++;
            const m = markOf(n);
            if (m) { const v = parseInt(m, 10); st.num++; if (v === st.last + 1 || v === st.last) st.inc++; st.last = v; continue; }
          }
          scan(n);
        }
      };
      scan(doc.body || doc.documentElement);
    }
    const cand = Object.entries(stat).filter(([k, s]) => s.num >= 20 && s.num >= s.all * 0.6 && s.inc >= s.num * 0.5 && !/^h[1-6]/.test(k)).sort((a, b) => b[1].num - a[1].num);
    const verseKey = cand.length && cand[0][1].num >= 500 ? cand[0][0] : null;
    const chapC = verseKey && cand.find(([k, s]) => k !== verseKey && s.num <= cand[0][1].num / 5);
    const chapKey = chapC ? chapC[0] : null;

    const books = {}, diag = { files: spine.length, tocBooks: Object.keys(firstStart).length, hiddenClasses: [...HIDE], detected: { verse: verseKey, chapter: chapKey }, classes: {}, numeric: {}, verseMarks: 0, chapMarks: 0, notes: 0, hidden: 0, samples: [] };
    Object.entries(stat).filter(([, s]) => s.num >= 20).sort((a, b) => b[1].num - a[1].num).slice(0, 15).forEach(([k, s]) => diag.numeric[k] = [s.num, s.all, s.inc]);
    // pend: Kapitelzahl gesehen, Vers 1 beginnt mit dem nächsten Text. Text vor der ersten Kapitel-/Verszahl
    // eines Buchs (z. B. die Einleitung der EÜ) wird nicht übernommen – außer dem Absatz direkt vor einer ersten „2“
    // (Bücher mit nur einem Kapitel: Vers 1 hat dort oft keine Zahl).
    let book = null, cur = null, ch = 0, pendingH = '', newPara = false, pend = false, pre = '';
    const startVerse = (c, v) => {
      pend = false;
      if (cur && !cur.t.trim() && cur.c === c && cur.v === v) return;   // Kapitelzahl und Verszahl 1 nacheinander
      cur = { c, v, t: '' }; if (pendingH) { cur.h = pendingH; pendingH = ''; } if (newPara) { cur.p = 1; newPara = false; } books[book].push(cur);
    };
    const addText = s => { if (!book || !s) return; if (!cur) { if (!pend || !/\S/.test(s)) { pre += s; return; } startVerse(ch, '1'); } cur.t += s; };
    const setBook = id => { book = id; books[book] = books[book] || []; cur = null; ch = 0; pendingH = ''; pend = false; pre = ''; };
    const verseMark = (v, isChapCls) => {
      if (!ch) ch = 1;
      if (!cur && v === '2' && !books[book].length && pre.trim()) { startVerse(ch, '1'); cur.t = pre; }
      if (v === '1' && cur && cur.c === ch && cur.v !== '1' && !isChapCls) ch++;   // Kapitelwechsel ohne eigene Kapitelzahl
      startVerse(ch, v); diag.verseMarks++;
    };
    const masked = n => {   // Aufbau eines Absatzes ohne lesbaren Text (Buchstaben -> x), für die Diagnose
      let s = ''; for (const c of n.childNodes) {
        if (c.nodeType === 3) s += c.nodeValue.replace(LETTER, 'x');
        else if (c.nodeType === 1) { const t = c.localName, cl = c.getAttribute('class'); s += `<${t}${cl ? ` class="${cl}"` : ''}>${masked(c)}</${t}>`; }
      }
      return s.replace(/x{2,}/g, 'xx');
    };

    for (let fi = 0; fi < spine.length; fi++) {
      if (progress) progress(`Lese Datei ${fi + 1} von ${spine.length} …`);
      const file = spine[fi], doc = docs[fi]; docs[fi] = null; if (!doc) continue;
      const anchors = new Map((startsByFile[file] || []).map(s => [s.anchor, s.id]));
      if (anchors.has('')) setBook(anchors.get(''));
      const walk = el => {
        for (const n of el.childNodes) {
          if (n.nodeType === 3) { addText(n.nodeValue); continue; }
          if (n.nodeType !== 1) continue;
          const tag = n.localName.toLowerCase(), cls = n.getAttribute('class') || '', id = n.getAttribute('id') || '';
          if (cls) diag.classes[tag + '.' + cls] = (diag.classes[tag + '.' + cls] || 0) + 1;
          if (id && anchors.has(id)) setBook(anchors.get(id));
          if (isHidden(n)) { diag.hidden++; continue; }
          if (isSkip(n, tag, cls)) { diag.notes++; continue; }
          if (tag === 'p' && book && diag.samples.length < 3 && fi >= spine.length / 3 && (n.textContent || '').length > 150 && (!verseKey || n.getElementsByTagName('*').length)) diag.samples.push(masked(n).slice(0, 700));
          const txt = (n.textContent || '').replace(/\s+/g, '').replace(/[.:]$/, '');
          if (/^h[1-6]$/.test(tag)) {
            const bid = !anchors.size && bookIdOf(n.textContent);
            if (bid && (!book || bid !== book) && tag <= 'h2') { setBook(bid); continue; }
            if (/^\d{1,3}$/.test(txt) || /^(kapitel|psalm)\s*\d{1,3}$/i.test((n.textContent || '').trim())) { ch = +txt.replace(/\D/g, ''); cur = null; pend = true; diag.chapMarks++; continue; }
            if (book && (books[book].length || pend)) { const h = (n.textContent || '').replace(/\s+/g, ' ').trim(); if (h) pendingH = pendingH ? pendingH + ' · ' + h : h; }
            pre = '';
            continue;
          }
          const key = keyOf(tag, cls);
          if (book && (key === verseKey || key === chapKey)) {
            const m = markOf(n);
            if (m) {
              if (key === chapKey) { ch = parseInt(m, 10); startVerse(ch, '1'); diag.chapMarks++; }
              else verseMark(m, false);
              continue;
            }
          }
          if (isNum(txt) && n.children.length === 0 && book) {
            if (CHAP_CLASS.test(cls) && !VERSE_CLASS.test(cls)) { ch = parseInt(txt, 10); startVerse(ch, '1'); diag.chapMarks++; continue; }
            if (tag === 'sup' || VERSE_CLASS.test(cls)) {
              if (n.closest && n.closest('a') && /^[a-z*†]$/.test(txt)) { diag.notes++; continue; }
              verseMark(txt, CHAP_CLASS.test(cls)); continue;
            }
          }
          if (tag === 'sup' && /^[a-z*†]$/.test(txt)) { diag.notes++; continue; }   // Fußnotenzeichen
          if (tag === 'p' || tag === 'div' && n.querySelector && !n.querySelector('p')) { if (cur && cur.t.trim()) newPara = true; if (!cur) pre = ''; }
          walk(n);
          if (tag === 'p' || tag === 'br' || tag === 'div' || tag === 'li') addText(' ');
        }
      };
      walk(doc.body || doc.documentElement);
    }
    Object.values(books).forEach(arr => arr.forEach(v => { v.t = v.t.replace(/\s+/g, ' ').trim(); }));
    Object.keys(books).forEach(b => { books[b] = books[b].filter(v => v.t || v.h); if (!books[b].length) delete books[b]; });
    diag.classes = Object.entries(diag.classes).sort((a, b) => b[1] - a[1]).slice(0, 40);
    return { books, diag };
  }

  /* ---------- Umrechnung auf die Zählung der App ---------- */
  const STOP = new Set('aber alle allem allen aller alles also auch auf aus bei bin bis bist da dadurch daher damit dann darum das dass dein deine deinem deinen deiner dem den denen denn der des dessen dich die dies diese diesem diesen dieser dir doch dort durch ein eine einem einen einer eines einmal er es euch euer eure für gegen hat hatte hatten haben habt ich ihm ihn ihnen ihr ihre ihrem ihren ihrer im in ins ist ja jede jedem jeden jeder jetzt kann kein keine man mein meine meinem meinen meiner mich mir mit nach nicht nichts noch nun nur ob oder ohne sein seine seinem seinen seiner sich sie sind so sollt soll sollen über um und uns unser unter vom von vor war waren ward was weil wenn wer werde werden wie wieder will wir wird wo zu zum zur sprach sagte spricht siehe herr herrn gott gottes'.split(' '));
  function toks(s) {
    const out = new Set();
    String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-zäöü]+/g, ' ').split(' ').forEach(w => { if (w.length >= 4 && !STOP.has(w)) out.add(w.slice(0, 5)); });
    return out;
  }
  function sim(a, b) { if (!a.size || !b.size) return 0; let k = 0; const [x, y] = a.size < b.size ? [a, b] : [b, a]; x.forEach(w => { if (y.has(w)) k++; }); return k / Math.sqrt(a.size * b.size); }
  const uni = (a, b) => { const s = new Set(a); b.forEach(w => s.add(w)); return s; };

  // Ausrichtung eines Buchs: tgt = [{c, v, k}] (App-Zählung), src = [{c, v, t, k}] (EÜ). Ergebnis: ops-Liste.
  function align(tgt, src) {
    const n = tgt.length, m = src.length, W = 90, P1 = 0.35, P2 = 0.12, LAB = 0.3;
    const pos = new Map(); src.forEach((s, j) => pos.set(s.c + ',' + s.v, j));
    const cen = new Int32Array(n + 1); let last = 0;
    for (let i = 0; i < n; i++) { const p = pos.get(tgt[i].c + ',' + tgt[i].v); cen[i] = p !== undefined ? p : (i ? cen[i - 1] + 1 : 0); }
    cen[n] = m;
    const lo = i => Math.max(0, cen[i] - W), hi = i => Math.min(m, cen[i] + W);
    const sc = [], bp = [];
    for (let i = 0; i <= n; i++) { const L = lo(i), H = hi(i); sc.push(new Float64Array(H - L + 1).fill(-Infinity)); bp.push(new Int8Array(H - L + 1)); }
    const get = (i, j) => { if (i > n) return -Infinity; const L = lo(i); if (j < L || j > hi(i)) return -Infinity; return sc[i][j - L]; };
    const put = (i, j, val, op) => { if (i > n) return; const L = lo(i); if (j < L || j > hi(i)) return; if (val > sc[i][j - L]) { sc[i][j - L] = val; bp[i][j - L] = op; } };
    const lab = (i, j) => (tgt[i].c + ',' + tgt[i].v) === (src[j].c + ',' + src[j].v) ? LAB : 0;
    put(0, 0, 0, 0);
    // Ist das erste Ziel nicht bei 0 zentriert (seltener Fall), dürfen Quellverse vorab übersprungen werden
    for (let i = 0; i <= n; i++) {
      for (let j = lo(i); j <= hi(i); j++) {
        const s = get(i, j); if (s === -Infinity) continue;
        if (j < m) put(i, j + 1, s - P1, 5);                                                      // Quellvers ohne Ziel
        if (i < n) {
          put(i + 1, j, s - P1, 4);                                                                // Zielvers leer
          if (j < m) put(i + 1, j + 1, s + sim(tgt[i].k, src[j].k) + lab(i, j), 1);              // 1:1
          if (j + 1 < m) put(i + 1, j + 2, s + sim(tgt[i].k, uni(src[j].k, src[j + 1].k)) + lab(i, j) - P2, 2); // 1 Ziel <- 2 Quellen
          if (i + 1 < n && j < m) put(i + 2, j + 1, s + sim(uni(tgt[i].k, tgt[i + 1].k), src[j].k) + lab(i, j) - P2, 3); // 2 Ziele <- 1 Quelle
        }
      }
    }
    if (get(n, m) === -Infinity) return null;
    const ops = []; let i = n, j = m;
    while (i > 0 || j > 0) {
      const op = bp[i][j - lo(i)];
      if (op === 1) { ops.push({ op, i: i - 1, j: j - 1 }); i--; j--; }
      else if (op === 2) { ops.push({ op, i: i - 1, j: j - 2 }); i--; j -= 2; }
      else if (op === 3) { ops.push({ op, i: i - 2, j: j - 1 }); i -= 2; j--; }
      else if (op === 4) { ops.push({ op, i: i - 1 }); i--; }
      else if (op === 5) { ops.push({ op, j: j - 1 }); j--; }
      else break;
    }
    return ops.reverse();
  }

  const flatT = (chs) => { const out = []; chs.forEach((c, ci) => (Array.isArray(c) ? c : c.v).forEach((t, vi) => out.push({ c: ci + 1, v: String(vi + 1), k: toks(t) }))); return out; };
  const lbl = s => s.c + ',' + s.v;
  function compress(labels) { // ['3,1','3,2'] -> '3,1–2'
    if (!labels.length) return '';
    const a = labels[0], b = labels[labels.length - 1];
    if (a === b) return a;
    const [ac] = a.split(','), [bc, bv] = b.split(',');
    return ac === bc ? a + '–' + bv : a + '–' + b;
  }

  // Ein Buch abbilden. Rückgabe { chapters, orphans: [Quellverse ohne Platz], rep: {...} }
  function mapBook(tgtChs, srcVerses) {
    const tgt = flatT(tgtChs), src = srcVerses.map(s => Object.assign({ k: toks(s.t) }, s));
    const ops = align(tgt, src);
    if (!ops) return null;
    const slot = tgt.map(() => ({ t: [], e: [], h: '', p: 0 }));
    const orph = []; let prevI = -1, run = [];
    const flush = () => {
      if (!run.length) return;
      if (run.length >= 4 || prevI < 0) orph.push(run);
      else run.forEach(j => { const s = slot[prevI]; s.t.push(src[j].t); s.e.push(lbl(src[j])); });
      run = [];
    };
    const give = (i, j) => { const s = slot[i]; s.t.push(src[j].t); s.e.push(lbl(src[j])); if (src[j].h) s.h = s.h ? s.h + ' · ' + src[j].h : src[j].h; if (src[j].p) s.p = 1; };
    let merged = 0, split = 0, empty = 0, moved = 0;
    for (const o of ops) {
      if (o.op === 5) { run.push(o.j); continue; }
      flush();
      if (o.op === 1) { give(o.i, o.j); prevI = o.i; if (lbl(tgt[o.i]) !== lbl(src[o.j])) moved++; }
      else if (o.op === 2) { give(o.i, o.j); give(o.i, o.j + 1); prevI = o.i; merged++; }
      else if (o.op === 3) { give(o.i, o.j); slot[o.i + 1].e.push('↑'); prevI = o.i + 1; split++; }
      else if (o.op === 4) { empty++; prevI = o.i; }
    }
    flush();
    if (orph.length && !orph[0].length) orph.shift();
    // Überhänge am Anfang: dem ersten Vers vorne anfügen
    const chapters = tgtChs.map(() => ({ v: [], e: [], hs: {}, p: [] }));
    tgt.forEach((t, x) => {
      const C = chapters[t.c - 1], s = slot[x], vi = C.v.length;
      C.v.push(s.t.join(' ')); C.e.push(s.e[0] === '↑' ? '↑' : compress(s.e));
      if (s.h) C.hs[vi] = s.h; if (s.p) C.p.push(vi);
    });
    chapters.forEach((C, ci) => { C.l = String(ci + 1); if (!Object.keys(C.hs).length) delete C.hs; if (!C.p.length) delete C.p; });
    return { chapters, orphans: orph.map(r => r.map(j => src[j])), rep: { merged, split, empty, moved, orphanVerses: orph.reduce((a, r) => a + r.length, 0) } };
  }

  // Überhänge (z. B. Dan 3,24–90, Dan 13–14, Ester-Zusätze) in ein Zusatzbuch der App legen, blockweise bestes Kapitel suchen
  function mapAdditions(tgtChs, blocks) {
    const chapters = tgtChs.map((c, ci) => ({ l: String(ci + 1), v: (Array.isArray(c) ? c : c.v).map(() => ''), e: (Array.isArray(c) ? c : c.v).map(() => '') }));
    let placed = 0, lost = [];
    blocks.forEach(block => {
      const srcK = block.map(s => Object.assign({ k: toks(s.t) }, s));
      let best = null;
      tgtChs.forEach((c, ci) => {
        const arr = (Array.isArray(c) ? c : c.v).map((t, vi) => ({ c: ci + 1, v: String(vi + 1), k: toks(t) }));
        // semiglobal: Block gegen Kapitel, Rand-Überspringen im Kapitel kostenlos
        const n = arr.length, m = srcK.length, S = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(-Infinity)), B = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
        for (let i = 0; i <= n; i++) S[i][0] = 0;
        for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
          const s = S[i][j]; if (s === -Infinity) continue;
          const up = (a, b, v, o) => { if (a <= n && b <= m && v > S[a][b]) { S[a][b] = v; B[a][b] = o; } };
          if (i < n && j < m) up(i + 1, j + 1, s + sim(arr[i].k, srcK[j].k), 1);
          if (j + 1 < m && i < n) up(i + 1, j + 2, s + sim(arr[i].k, uni(srcK[j].k, srcK[j + 1].k)) - 0.12, 2);
          if (i < n) up(i + 1, j, j === 0 || j === m ? s : s - 0.35, 4);
          if (j < m) up(i, j + 1, s - 0.35, 5);
        }
        let bi = 0; for (let i = 0; i <= n; i++) if (S[i][m] > S[bi][m]) bi = i;
        const score = S[bi][m] / Math.max(1, m);
        if (!best || score > best.score) {
          const ops = []; let i = bi, j = m;
          while (j > 0) { const o = B[i][j]; if (o === 1) { ops.push([i - 1, [j - 1]]); i--; j--; } else if (o === 2) { ops.push([i - 1, [j - 2, j - 1]]); i--; j -= 2; } else if (o === 4) { i--; } else if (o === 5) { ops.push([i - 1, [j - 1]]); j--; } else break; }
          best = { score, ci, ops };
        }
      });
      if (!best || best.score < 0.08) { lost.push(block); return; }
      const C = chapters[best.ci];
      best.ops.reverse().forEach(([i, js]) => { const ii = Math.max(0, i); js.forEach(j => { C.v[ii] = (C.v[ii] ? C.v[ii] + ' ' : '') + block[j].t; C.e[ii] = C.e[ii] ? compress([C.e[ii].split('–')[0], lbl(block[j])]) : lbl(block[j]); placed++; }); });
    });
    const filled = chapters.reduce((a, C) => a + C.v.filter(Boolean).length, 0), total = chapters.reduce((a, C) => a + C.v.length, 0);
    return { chapters, placed, lost, filled, total };
  }

  // Gesamter Import: raw = Ergebnis von readEpub, lut/men = Texte der App
  async function build(raw, lut, men, cat, progress) {
    const out = {}, rep = { books: [], missing: [], extra: [], warn: [] };
    const addPool = { EST: [], DAN: [] };
    const canonIds = cat.canon.map(b => b.id), apoIds = cat.apo.map(b => b.id);
    for (const id of [...canonIds, ...apoIds]) {
      if (id === 'ESG' || id === 'DAG' || id === 'MAN') continue;
      if (progress) { progress(`Ordne ${id} zu …`); await new Promise(r => setTimeout(r, 0)); }
      let src = raw.books[id];
      const tgt = canonIds.includes(id) ? lut[id] : men[id];
      if (!src || !tgt) { if (!src) rep.missing.push(id); continue; }
      if (id === 'EST') { addPool.EST.push(...chunk(src.filter(v => /[a-z]$/.test(v.v)))); src = src.filter(v => !/[a-z]$/.test(v.v)); }
      if (id === 'DAN') {
        const over = src.filter(v => v.c > tgt.length); if (over.length) addPool.DAN.push(...chunk(over)); src = src.filter(v => v.c <= tgt.length);
        // Gebet Asarjas und Gesang der drei Männer: in der EÜ Dan 3,24–90 (Kapitel 3 dort um diese Verse länger)
        const n3 = src.filter(v => v.c === 3).length, extra = n3 - (tgt[2] || []).length;
        if (extra >= 30) { const ins = src.filter(v => v.c === 3 && +v.v >= 24 && +v.v < 24 + extra); addPool.DAN.push(ins); src = src.filter(v => !ins.includes(v)); }
      }
      const r = mapBook(tgt, src);
      if (!r) { rep.warn.push(`${id}: Zuordnung nicht möglich, Buch ausgelassen`); continue; }
      out[id] = r.chapters;
      if (r.orphans.length) { if (addPool[id]) addPool[id].push(...r.orphans); else r.orphans.forEach(o => { rep.warn.push(`${id}: ${o.length} Verse ohne Gegenstück (${lbl(o[0])}–${lbl(o[o.length - 1])}) an Vers davor angehängt`); }); }
      if (r.orphans.length && !addPool[id]) appendOrphans(out[id], r.orphans, tgt);
      rep.books.push(Object.assign({ id, src: src.length }, r.rep));
    }
    for (const [base, add] of [['EST', 'ESG'], ['DAN', 'DAG']]) {
      if (!addPool[base].length || !men[add]) continue;
      const r = mapAdditions(men[add], addPool[base]);
      if (r.filled >= r.total * 0.5) { out[add] = r.chapters; rep.books.push({ id: add, src: r.placed, filled: r.filled, total: r.total }); }
      else rep.warn.push(`${add}: Zusätze nur teilweise erkannt (${r.filled}/${r.total} Verse) – bleibt bei Menge`);
      r.lost.forEach(b => rep.warn.push(`${add}: Abschnitt ${lbl(b[0])}–${lbl(b[b.length - 1])} nicht zugeordnet`));
    }
    Object.keys(raw.books).forEach(id => { if (![...canonIds, ...apoIds].includes(id)) rep.extra.push(id); });
    return { data: out, rep };
  }
  function chunk(vs) { const out = []; let cur = []; vs.forEach((v, x) => { const p = vs[x - 1]; if (p && !(p.c === v.c)) { out.push(cur); cur = []; } cur.push(v); }); if (cur.length) out.push(cur); return out; }
  function appendOrphans(chs, orphans, tgt) { /* bereits in mapBook (kurze Läufe) erledigt; lange Läufe hier an den vorangehenden Vers */
    orphans.forEach(run => { const f = run[0]; const C = chs[Math.min(f.c, chs.length) - 1]; const vi = Math.max(0, Math.min(C.v.length, parseInt(f.v, 10) - 1) - 1); C.v[vi] = (C.v[vi] + ' ' + run.map(s => s.t).join(' ')).trim(); });
  }

  /* ---------- Speicher ---------- */
  async function save(data, meta) {
    const c = await caches.open(CACHE);
    await c.put(new URL(URL_, location.href).href, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
    try { localStorage.setItem(META, JSON.stringify(meta)); } catch (e) {}
  }
  async function load() {
    if (!('caches' in self)) throw new Error('404');
    const c = await caches.open(CACHE), r = await c.match(new URL(URL_, location.href).href);
    if (!r) throw new Error('404');
    return r.json();
  }
  async function remove() { try { const c = await caches.open(CACHE); await c.delete(new URL(URL_, location.href).href); } catch (e) {} try { localStorage.removeItem(META); } catch (e) {} }
  function meta() { try { return JSON.parse(localStorage.getItem(META) || 'null'); } catch (e) { return null; } }

  return { CACHE, URL: URL_, readEpub, build, mapBook, mapAdditions, align, toks, sim, bookIdOf, unzip, save, load, remove, meta };
})();
if (typeof module !== 'undefined') module.exports = EU;
