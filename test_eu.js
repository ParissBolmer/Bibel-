// Test der EÜ-Umrechnung ohne EÜ-Text: Aus Menge 1939 wird eine künstliche Quelle mit EÜ-typischen Abweichungen gebaut
// (Daniel-Zusätze 3,24–90 und Kap. 13–14, Ester-Buchstabenverse, fehlender Vers Mt 17,21, zusammengelegte Verse).
// Danach muss jeder Vers an seinem Platz in Luther-Zählung landen.   Aufruf: node test_eu.js
const fs = require('fs'), path = require('path');
const EU = require('./eu.js');
const rd = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const lut = rd('lut.json'), men = rd('men.json'), cat = rd('catalog.json');

const raw = { books: {} }, truth = {};   // truth[ID][ch-1][v-1] = erwartete Quell-Verszahl(en)
let mergeCount = 0;
for (const id of Object.keys(men)) {
  if (['ESG', 'DAG', 'MAN'].includes(id)) continue;
  const arr = [], tr = men[id].map(c => c.map(() => null));
  men[id].forEach((c, ci) => {
    let shift = 0;
    for (let vi = 0; vi < c.length; vi++) {
      const ch = ci + 1, v = vi + 1;
      if (id === 'MAT' && ch === 17 && v === 21) { tr[ci][vi] = ''; continue; }   // EÜ lässt Mt 17,21 aus
      // alle 97 Verse zwei Verse zusammenlegen (EÜ fasst gelegentlich zusammen)
      if ((arr.length % 97) === 50 && vi + 1 < c.length && !(id === 'MAT' && ch === 17 && v + 1 === 21)) {
        // wie in gedruckten Bibeln: ein Vers „21–22“, die Zählung danach läuft normal weiter
        arr.push({ c: ch, v: String(v + shift), t: c[vi] + ' ' + c[vi + 1] });
        tr[ci][vi] = ch + ',' + (v + shift); tr[ci][vi + 1] = '↑'; vi++; mergeCount++; continue;
      }
      arr.push({ c: ch, v: String(v + shift), t: c[vi] });
      tr[ci][vi] = ch + ',' + (v + shift);
      if (id === 'DAN' && ch === 3 && v === 23) men.DAG[2].forEach((t, k) => arr.push({ c: 3, v: String(24 + k), t }));   // Gebet Asarjas
      if (id === 'DAN' && ch === 3 && v > 23) { arr[arr.length - 1].v = String(v + men.DAG[2].length + shift); tr[ci][vi] = '3,' + arr[arr.length - 1].v; }
      if (id === 'EST') {
        const at = { '1,1': 0, '3,13': 1, '4,17': 2, '5,2': 3, '8,12': 4, '10,3': 5 }[ch + ',' + v];
        if (at !== undefined) men.ESG[at].forEach((t, k) => arr.push({ c: ch, v: v + String.fromCharCode(97 + k % 26) + (k >= 26 ? 'x' : ''), t }));
      }
    }
  });
  if (id === 'DAN') { men.DAG[0].forEach((t, k) => arr.push({ c: 13, v: String(k + 1), t })); men.DAG[1].forEach((t, k) => arr.push({ c: 14, v: String(k + 1), t })); }
  raw.books[id] = arr; truth[id] = tr;
}

const t0 = Date.now();
(async () => {
const { data, rep } = await EU.build(raw, lut, men, cat);
const ms = Date.now() - t0;
let ok = 0, bad = 0, skipped = 0; const errs = [];
for (const id of Object.keys(truth)) {
  if (!data[id]) { errs.push(id + ' fehlt'); continue; }
  const tgt = lut[id] ? lut[id] : men[id];
  truth[id].forEach((c, ci) => c.forEach((exp, vi) => {
    // Kapitel, in denen Menge und Luther verschieden zählen, sind keine saubere Wahrheit
    if (lut[id] && (lut[id][ci] || []).length !== men[id][ci].length) { skipped++; return; }
    const got = data[id][ci].e[vi];
    if (got === exp || (exp && got && got.split('–')[0] === exp) || (!exp && got === '↑')) ok++; else { bad++; if (errs.length < 25) errs.push(`${id} ${ci + 1},${vi + 1}: erwartet ${exp || '(leer)'} bekommen ${got || '(leer)'}`); }
  }));
}
const esg = data.ESG, dag = data.DAG;
console.log(`Zeit ${ms} ms, Zusammenlegungen ${mergeCount}`);
console.log(`Verse richtig ${ok}, falsch ${bad}, übersprungen ${skipped}`);
console.log('ESG gefüllt:', esg ? esg.map(c => c.v.filter(Boolean).length + '/' + c.v.length).join(' ') : 'nein');
console.log('DAG gefüllt:', dag ? dag.map(c => c.v.filter(Boolean).length + '/' + c.v.length).join(' ') : 'nein');
console.log('Warnungen:', rep.warn.slice(0, 10), 'fehlend:', rep.missing);
errs.forEach(e => console.log('  ' + e));
// Text darf nicht verloren gehen
const srcChars = Object.values(raw.books).flat().reduce((a, v) => a + v.t.replace(/\s/g, '').length, 0);
const outChars = Object.values(data).flat().reduce((a, C) => a + C.v.join('').replace(/\s/g, '').length, 0);
console.log(`Zeichen Quelle ${srcChars}, Ergebnis ${outChars}`);
const pass = bad / (ok + bad) < 0.001 && outChars === srcChars && esg && dag;
console.log(pass ? 'BESTANDEN' : 'NICHT BESTANDEN'); process.exit(pass ? 0 : 1);
})();
