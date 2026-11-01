'use strict';
/* Sprung per Eingabe: "Phil 2", "Röm 8,28-30", "1 Kor 13", "1. Mose 1", "Psalm 23", "Henoch 37" …
   Reine Logik ohne DOM (in Node testbar: build/test_refs.js). Nutzung: Refs.init(bücher); Refs.resolve('Röm 8,28'). */
const Refs = (() => {
  // Schreibweisen je Buch-ID: Luther-/Loccumer-/Einheitsübersetzungs-Kürzel, ausgeschriebene Namen, wenige englische.
  // Ziffern am Anfang = Buchzählung ("1mo" = 1. Mose). Namen und Kürzel aus dem Katalog kommen automatisch dazu.
  const ALIASES = {
    GEN: 'gen genesis 1mo 1mos 1m gn', EXO: 'ex exod exodus 2mo 2mos 2m', LEV: 'lev levitikus 3mo 3mos 3m lv',
    NUM: 'num numeri 4mo 4mos 4m nu nm numbers', DEU: 'dtn dt deut deuteronomium 5mo 5mos 5m',
    JOS: 'jos josh josua', JDG: 'ri richter jdg judg', RUT: 'rut ruth',
    '1SA': '1sam 1samuel 1sa', '2SA': '2sam 2samuel 2sa',
    '1KI': '1kon 1koenige 1kg 1kgs 1ki', '2KI': '2kon 2koenige 2kg 2kgs 2ki',
    '1CH': '1chr 1chron 1chronik 1ch', '2CH': '2chr 2chron 2chronik 2ch',
    EZR: 'esr esra ezr', NEH: 'neh nehemia', EST: 'est ester esth', JOB: 'hiob ijob job hi',
    PSA: 'ps psalm psalmen psa', PRO: 'spr spruche sprueche sprichworter prov pr',
    ECC: 'pred prediger koh kohelet eccl qoh', SNG: 'hld hohelied hoheslied hohes lied hohes-lied song sg',
    ISA: 'jes jesaja isa', JER: 'jer jeremia', LAM: 'klgl klagelieder kl lam klag',
    EZK: 'hes hesekiel ez ezechiel ezek', DAN: 'dan daniel dn', HOS: 'hos hosea', JOL: 'joel jl', AMO: 'am amos',
    OBA: 'ob obd obadja obad', JON: 'jona jon', MIC: 'mi mich micha', NAM: 'nah nahum', HAB: 'hab habakuk',
    ZEP: 'zef zefanja zeph zep', HAG: 'hag haggai', ZEC: 'sach sacharja zech', MAL: 'mal maleachi',
    MAT: 'mt matth matthaus matt', MRK: 'mk mar mark markus mr', LUK: 'lk lukas luke', JHN: 'joh johannes john jn',
    ACT: 'apg apostelgeschichte act acts', ROM: 'rom roemer romer',
    '1CO': '1kor 1korinther 1cor', '2CO': '2kor 2korinther 2cor', GAL: 'gal galater', EPH: 'eph epheser',
    PHP: 'phil philipper php', COL: 'kol kolosser col',
    '1TH': '1thess 1thes 1th 1thessalonicher', '2TH': '2thess 2thes 2th 2thessalonicher',
    '1TI': '1tim 1timotheus', '2TI': '2tim 2timotheus', TIT: 'tit titus', PHM: 'phlm phm philemon',
    HEB: 'hebr heb hebraer', JAS: 'jak jakobus jas', '1PE': '1petr 1pet 1petrus', '2PE': '2petr 2pet 2petrus',
    '1JN': '1joh 1johannes 1jn', '2JN': '2joh 2johannes 2jn', '3JN': '3joh 3johannes 3jn',
    JUD: 'jud judas jude', REV: 'offb offenbarung apk apokalypse off rev',
    // Apokryphen
    JDT: 'jdt judit', WIS: 'weish weisheit wis ws', TOB: 'tob tobit tobias', SIR: 'sir sirach jesussirach syr',
    BAR: 'bar baruch', '1MA': '1makk 1mak 1ma makkabaer', '2MA': '2makk 2mak 2ma',
    ESG: 'zusest zusatzeester', DAG: 'zusdan susanna sus bel', MAN: 'gebman manasse gebetmanasses',
    // Außerkanonische Schriften (Name und Kürzel aus dem Katalog kommen zusätzlich automatisch)
    HEN: 'henoch hen 1hen', JUB: 'jub jubilaen', TPA: 'patriarchen testxii', PSS: 'pssal psalmensalomos',
    '3ES': '3esr 3esra', '4ES': '4esr 4esra', '2BA': '2bar 2baruch', '3BA': '3bar 3baruch', '4BA': '4bar 4baruch',
    ASJ: 'ascjes', TMO: 'testmos', TAB: 'testabr', JOA: 'josas',
    DID: 'did didache', '1CL': '1clem 1klem 1klemens', '2CL': '2clem 2klem 2klemens', BRN: 'barn barnabas',
    HER: 'herm hermas hirt', DIO: 'diogn diognet', POL: 'polyc polykarp', MPO: 'martpol', PAP: 'pap papias',
    EVP: 'evpetr', APP: 'apkpetr', PRJ: 'protevjak', KTH: 'kthom', NIK: 'evnik nikodemus',
    THO: 'evthom thomas', MAR: 'evmar', JUD2: 'evjud',
  };
  // Wörter, die ohne Kapitelangabe fast immer ein normales Wort meinen: dann kein Sprungvorschlag
  const NOISE = new Set(['am', 'is', 'ob', 'hi', 'mi', 'ex', 'mal', 'hab', 'job', 'dan', 'est', 'rom', 'bar', 'hirt']);

  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u').replace(/[\s.\-–—_]+/g, '');
  const split = a => { const m = a.match(/^([1-5])(.+)$/); return m ? { num: +m[1], base: m[2] } : { num: 0, base: a }; };

  let ENTRIES = [], BOOKS = [], ORDER = new Map();
  function init(books) {
    BOOKS = books; ENTRIES = []; ORDER = new Map(books.map((b, i) => [b.key, i]));
    const seen = new Set();
    const add = (b, raw) => {
      const a = norm(raw); if (!a || /^\d+$/.test(a)) return;
      const { num, base } = split(a); const k = b.key + '|' + num + '|' + base;
      if (!seen.has(k)) { seen.add(k); ENTRIES.push({ key: b.key, num, base }); }
    };
    books.forEach(b => {
      add(b, b.name); add(b, b.short);
      if (b.sub && /^[A-Za-zÄÖÜäöüß]+$/.test(b.sub)) add(b, b.sub);
      (ALIASES[b.id] || '').split(/\s+/).filter(Boolean).forEach(a => add(b, a));
    });
  }

  const bookOf = key => BOOKS.find(b => b.key === key);
  const chLab = (b, ch) => b.kind === 'x' ? ((b.labels || [])[ch - 1] || String(ch)) : String(ch);

  // Buch aus Zahlpräfix und Namensteil bestimmen -> Liste möglicher Bücher (leer = unbekannt)
  function findBooks(num, nn) {
    let pool = ENTRIES.filter(e => e.base === nn);
    if (!pool.length && nn.length >= 2) pool = ENTRIES.filter(e => e.base.startsWith(nn));
    if (num) pool = pool.filter(e => e.num === num);
    else { const p0 = pool.filter(e => e.num === 0); if (p0.length) pool = p0; }
    const keys = [...new Set(pool.map(e => e.key))].sort((a, b) => ORDER.get(a) - ORDER.get(b));
    return keys.map(bookOf);
  }

  const RX = /^\s*(?:([1-5])\s*\.?\s*)?([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\- ]*?)\s*\.?\s*(?:(\d+)(?:\s*[-–—]\s*(\d+)(?!\s*\d)|(?:\s*[,:.]\s*|\s+)(\d+)(?:\s*[-–—]\s*(\d+))?)?\s*(ff?)?\.?)?\s*$/;

  function parse(q) {
    const m = RX.exec(String(q || ''));
    if (!m) return null;
    const num = m[1] ? +m[1] : 0, name = norm(m[2]);
    const chapter = m[3] ? +m[3] : 0;
    let v1 = m[5] ? +m[5] : 0, v2 = m[6] ? +m[6] : 0;
    if (v1 && !v2 && m[7] === 'f') v2 = v1 + 1;
    if (!name) return null;
    return { num, name, ch: chapter, ch2: m[4] ? +m[4] : 0, v1, v2: v2 > v1 ? v2 : 0 };
  }

  const hrefOf = (b, ch, v1, v2) => `#/r/${encodeURIComponent(b.key)}/${ch}${v1 ? '/' + v1 + (v2 && v2 > v1 ? '-' + v2 : '') : ''}`;

  // Ergebnis: Liste von Treffern { book, ch, v1, v2, kind: 'ref'|'book', href, label, note, ambiguous }
  function resolve(q) {
    const p = parse(q); if (!p) return [];
    if (!p.ch && NOISE.has(p.name)) return [];
    const books = findBooks(p.num, p.name);
    if (!books.length) return [];
    const ambiguous = books.length > 1;
    return books.slice(0, 6).map(b => {
      const res = { book: b, ambiguous };
      if (!p.ch || !b.chapters) {
        const lab = b.chapters ? '' : 'nur Einführung';
        return Object.assign(res, { kind: 'book', href: `#/b/${encodeURIComponent(b.key)}`, label: b.name, note: lab || `${b.chapters} Kapitel`, ch: 0 });
      }
      let ch = p.ch, note = '', pv1 = p.v1, pv2 = p.v2, ch2 = p.ch2;
      // Bücher mit nur einem Kapitel (Obd, Phlm, 2/3 Joh, Jud …): "Jud 3" und "Jud 3-5" meinen Verse
      if (b.chapters === 1 && ch > 1 && !pv1) { pv1 = ch; pv2 = ch2 > ch ? ch2 : 0; ch = 1; ch2 = 0; }
      if (ch > b.chapters) { note = `${b.name} hat nur ${b.chapters} Kapitel`; ch = b.chapters; }
      const v1 = note ? 0 : pv1, v2 = note ? 0 : pv2;
      let label = `${b.name} ${chLab(b, ch)}`;
      if (v1) label += ',' + v1 + (v2 ? '–' + v2 : '');
      else if (ch2 && ch2 > ch && ch2 <= b.chapters) label += '–' + ch2;
      return Object.assign(res, { kind: 'ref', ch, v1, v2, href: hrefOf(b, ch, v1, v2), label, note });
    });
  }

  const api = { init, resolve, parse, norm, hrefOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
