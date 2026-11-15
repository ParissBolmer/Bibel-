#!/usr/bin/env python3
"""Lesefassung eines Bibeltexts: Typografie und heutige ss/ß-Schreibung.

Aufruf:  python3 -I modernisiere.py lut      ->  lutn.json + modernisiere-lut.txt (Bericht)

Was geändert wird (nur das, sonst kein Wort):
  Stufe 1 – Typografie
    "…"  -> „…“   (Paare über Versgrenzen hinweg, je Kapitel)
    '…'  -> ‚…‘   (innere Anführung)
    '    -> ’     (Auslassung: ist's -> ist’s, Juda's -> Juda’s)
    " - " -> " – " (Gedankenstrich), doppelte Leerzeichen
    {…} bleibt im Text; die App zeigt es als dezente Erklärung.
  Stufe 2 – Rechtschreibung von 1996
    ß nach kurzem Vokal am Wortende oder vor Konsonant -> ss (daß -> dass, muß -> muss).
    ß vor einem Vokal bleibt immer (Füße, Straße): das alte System schrieb dort schon ss,
    wenn der Vokal kurz war (müssen, Wasser).
    Entscheidung je Wort über ein Häufigkeitswörterbuch heutigen Deutschs (pyspellchecker, de);
    mehrdeutige Fälle (Schoß/schoss, Floß/floss …) regelt die Liste FEST unten.
Wörter, die nicht entschieden werden können, bleiben unverändert und stehen im Bericht.

Benötigt: pip install pyspellchecker  (nur zum Erzeugen, nicht für die App)
"""
import gzip, json, os, re, sys, collections

VOW = 'aeiouäöüyAEIOUÄÖÜY'

# Fest entschieden (Schreibung im Text -> Ersatz). Großschreibung zählt:
# Nomen mit langem Vokal bleiben, Verbformen mit kurzem Vokal werden ss.
FEST = {
    'Schoß': 'Schoß', 'Schoßes': 'Schoßes',            # Schoß (Mutterschoß), langes o
    'schoß': 'schoss',                                   # Verb schießen
    'Floß': 'Floß', 'floß': 'floss',                     # Floß (Boot) / Verb fließen
    'Ruß': 'Ruß',
    'aß': 'aß', 'Aß': 'aß', 'maß': 'maß', 'Maß': 'Maß', 'saß': 'saß', 'vergaß': 'vergaß', 'fraß': 'fraß',
    'Spieß': 'Spieß', 'Fuß': 'Fuß', 'Gruß': 'Gruß', 'groß': 'groß', 'bloß': 'bloß', 'süß': 'süß',
    'Mutterschoß': 'Mutterschoß',
    'Roß': 'Ross', 'Roßtor': 'Rosstor', 'Roßtors': 'Rosstors', 'Floßfedern': 'Flossfedern',
    'Meßschnur': 'Messschnur', 'Meßschnüre': 'Messschnüre', 'Meßrute': 'Messrute',
    'Strauß': 'Strauß', 'weiß': 'weiß', 'heiß': 'heiß', 'Fleiß': 'Fleiß', 'Schweiß': 'Schweiß',
}

def load_dict():
    import spellchecker
    p = os.path.join(os.path.dirname(spellchecker.__file__), 'resources', 'de.json.gz')
    return json.load(gzip.open(p))

LANG = ('ei', 'ai', 'au', 'äu', 'eu', 'ie')

def ss_positions(w):
    """Positionen von ß, auf die kein Vokal folgt und vor denen kein Doppellaut/ie steht
    (nur dort kann ss stehen: nach ei, au, ie … bleibt ß immer, z. B. gleißt, Strauß, gießt)."""
    return [i for i, c in enumerate(w) if c == 'ß' and (i + 1 == len(w) or w[i + 1] not in VOW)
            and w[max(0, i - 2):i].lower() not in LANG]

def to_ss(w, pos):
    return ''.join('ss' if i in pos else c for i, c in enumerate(w))

def decide(w, F):
    """-> (neues Wort, Grund). Grund 'offen' = nicht entschieden, bleibt unverändert."""
    pos = ss_positions(w)
    if not pos:
        return w, 'vokal'
    if w in FEST:
        return FEST[w], 'fest'
    lw = w.lower()
    new = to_ss(w, set(pos))
    fo, fn = F.get(lw, 0), F.get(new.lower(), 0)
    if fn and not fo: return new, 'wb'
    if fo and not fn: return w, 'wb'
    if fo and fn:
        if fn > 20 * fo: return new, 'wb-häufig'
        if fo > 20 * fn: return w, 'wb-häufig'
        return w, 'offen'
    # Zusammensetzung: kürzestes Teilstück mit dem ß suchen, das das Wörterbuch kennt
    # (Flußufer -> fluss, Fußschemel -> fuß). Teilstücke ab 3 Buchstaben, Ende = Wortende oder ß+1 …
    p = pos[0] if len(pos) == 1 else None
    if p is not None:
        best = None
        for i in range(p, -1, -1):
            for j in range(p + 1, len(w) + 1):
                seg = lw[i:j]
                if len(seg) < 3: continue
                so, sn = F.get(seg, 0), F.get(seg[:p - i] + 'ss' + seg[p - i + 1:], 0)
                if so >= 50 or sn >= 50:
                    if so and sn and max(so, sn) < 20 * min(so, sn): continue
                    cand = (len(seg), sn > so)
                    if best is None or cand[0] > best[0]: best = cand
        if best:
            return (new, 'teil') if best[1] else (w, 'teil')
    return w, 'offen'

# ---------- Stufe 1 ----------
def typo_chapter(verses):
    out, open_dq, open_sq = [], False, False
    for v in verses:
        s = re.sub(r' {2,}', ' ', v).strip()
        # Auslassungs-Apostroph: Buchstabe ' Buchstabe  bzw. Buchstabe ' s (Juda's), Namen auf s' (Enos')
        s = re.sub(r"(?<=\w)'(?=\w)", '’', s)
        r = []
        for k, c in enumerate(s):
            prev = s[k - 1] if k else ' '
            nxt = s[k + 1] if k + 1 < len(s) else ' '
            if c == '"':
                # nach Zeichen entscheiden, nicht nur abwechselnd: die Quelle hat einzelne fehlende
                # Zeichen, sonst kippen alle folgenden Paare im Kapitel
                if prev in ' (:' and nxt not in ' ,.;:!?)':
                    is_open = True
                elif prev not in ' (' and nxt in ' ,.;:!?)':
                    is_open = False
                else:
                    is_open = not open_dq
                r.append('„' if is_open else '“'); open_dq = is_open
            elif c == "'":
                if not open_sq and (prev in ' („:' or k == 0) and nxt not in ' ':
                    r.append('‚'); open_sq = True
                elif open_sq:
                    r.append('‘'); open_sq = False
                else:
                    r.append('’')   # Genitiv-Apostroph am Wortende (Enos')
            else:
                r.append(c)
        s = ''.join(r)
        s = re.sub(r' -(?= |,|$)', ' –', s)
        out.append(s)
    return out, open_dq, open_sq

# ---------- Stufe 2 ----------
WORD = re.compile(r'[A-Za-zÄÖÜäöüß]+')

def main():
    code = sys.argv[1] if len(sys.argv) > 1 else 'lut'
    here = os.path.dirname(os.path.abspath(__file__))
    src = json.load(open(os.path.join(here, f'{code}.json'), encoding='utf-8'))
    F = load_dict()
    cache, why, offen, unbal = {}, collections.Counter(), collections.Counter(), []
    changes = collections.Counter()
    def fix_word(m):
        w = m.group(0)
        if 'ß' not in w: return w
        if w not in cache:
            cache[w] = decide(w, F)
        n, g = cache[w]
        why[g] += 1
        if g == 'offen': offen[w] += 1
        if n != w: changes[(w, n)] += 1
        return n
    out = {}
    for book, chs in src.items():
        out[book] = []
        for ci, ch in enumerate(chs):
            t, odq, osq = typo_chapter(ch)
            if odq or osq: unbal.append(f'{book} {ci + 1}')
            out[book].append([WORD.sub(fix_word, v) for v in t])
    # Prüfung: Verszahlen und Buchstabenfolge (ohne ß/ss, Zeichen) unverändert
    norm = lambda s: re.sub(r'[^a-zäöü]', '', s.lower().replace('ß', 'ss'))
    for b in src:
        assert len(src[b]) == len(out[b]), b
        for a, c in zip(src[b], out[b]):
            assert len(a) == len(c), b
            for x, y in zip(a, c):
                assert norm(x) == norm(y), (b, x, y)
    with open(os.path.join(here, f'{code}n.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(here, f'modernisiere-{code}.txt'), 'w', encoding='utf-8') as f:
        f.write(f'Bericht modernisiere.py {code} -> {code}n.json\n\n')
        f.write('Entscheidungen (Vorkommen): ' + ', '.join(f'{k} {v}' for k, v in why.most_common()) + '\n')
        f.write(f'Kapitel mit unpaarigen Anführungszeichen: {len(unbal)} {" ".join(unbal)}\n\n')
        f.write(f'Geändert ({sum(changes.values())} Stellen, {len(changes)} Wortformen):\n')
        for (a, b), n in sorted(changes.items(), key=lambda x: -x[1]):
            f.write(f'  {n:5}  {a} -> {b}\n')
        f.write(f'\nOffen, unverändert gelassen ({sum(offen.values())} Stellen, {len(offen)} Wortformen):\n')
        for w, n in offen.most_common():
            f.write(f'  {n:5}  {w}\n')
        kept = collections.Counter()
        for w, (n, g) in cache.items():
            if n == w and g not in ('vokal', 'offen'): kept[w] = 1
        f.write(f'\nBewusst mit ß gelassen ({len(kept)} Wortformen):\n  ' + ', '.join(sorted(kept)) + '\n')
    print(f'{code}n.json geschrieben. Geändert: {sum(changes.values())}, offen: {sum(offen.values())} ({len(offen)} Formen), unpaarig: {len(unbal)}')

if __name__ == '__main__':
    main()
