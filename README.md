# Bibel – Lese-App (PWA)

Offlinefähige Bibel-App fürs Handy: Kapitel abhaken, Verse farbig markieren, Themen zuordnen, Notizen, Suche, Übersetzungsvergleich. Dazu die Apokryphen und eine Auswahl außerkanonischer Schriften mit Einführungen.

Version 2, Stand Sitzung 3 (damit ist Version 2 abgeschlossen; Anzeige unter **Mehr**: „Version 2“):
- Sitzung 1: Sprung per Eingabe (z. B. „Röm 8,28“), Lieblingskapitel, Lesestreifen mit Wochenziel, Lesepläne (7 Pläne, mehrere parallel), Gebetsliste, neues Icon, bereinigter Menge-Text.
- Sitzung 2: Verskarten zum wörtlichen Auswendiglernen, Einführung zu jedem Buch (106), 16 Themen-Lesewege, neuer Übersetzungsvergleich.
- Sitzung 3: Zeitleiste (11 Epochen, 132 Ereignisse mit Jahresspannen und Sicherheitsstufe), Personen- und Ortsregister (213 Personen, 102 Orte, Stellenverweise, Suche, optional antippbare Namen im Text), Barrierefreiheit (Kontrast in Hell/Sepia/Dunkel gemessen, Tippflächen, Namen der Bedienelemente), Stichprobe „Didache auf Deutsch“ als KI-Übertragung aus dem Englischen. Die Recherche zu einer besseren Textfassung ergab nichts frei Lizenziertes und Vollständiges (siehe `LIZENZ-RECHERCHE.md` im Projektordner).

## Auf GitHub Pages veröffentlichen

1. Auf GitHub ein neues Repository anlegen (z. B. `bibel`), öffentlich.
2. **Add file → Upload files** und den **Inhalt** dieses Ordners hineinziehen (also `index.html`, `app.js`, `refs.js`, `plans.js`, `prayer.js`, `cards.js`, `compare.js`, `paths.js`, `intro.js`, `zeit.js`, `register.js`, `style.css`, `sw.js`, `manifest.webmanifest` und die Ordner `data`, `fonts`, `icons`) → **Commit changes**.
3. **Settings → Pages → Branch: `main`, Ordner `/ (root)` → Save.**
4. Nach ca. 1 Minute ist die App unter `https://<dein-name>.github.io/bibel/` erreichbar.
5. Auf dem Handy in Chrome öffnen → Menü ⋮ → **Zum Startbildschirm hinzufügen** bzw. **App installieren**.

## Update einspielen

Alle geänderten Dateien hochladen und in `sw.js` die Zeile `const SHELL = 'bibel-v6'` hochzählen (`bibel-v7` …). Sonst zeigt das Handy weiter die alte Version. Ändert sich ein Bibeltext, zusätzlich `const DATA = 'bibel-data-v2'` hochzählen. Die App danach einmal ganz schließen und neu öffnen.

Neu oder geändert in Sitzung 3 (gegenüber Stand Sitzung 2): `app.js`, `style.css`, `sw.js`, `index.html`, `zeit.js`, `register.js`, `data/zeit.json`, `data/register.json`, `data/ext-de.json` (und diese `README.md`). Die Bibeltexte haben sich nicht geändert. `data/ext-de.json` (Didache auf Deutsch, KI-Übertragung) ist optional: ohne diese Datei läuft die App normal, nur der Schalter „Deutsch (KI)“ im Text der Didache fehlt.

Stand jetzt: SHELL `bibel-v6`, DATA `bibel-data-v2`. Zeitleiste und Register gehören zum SHELL-Cache; `ext-de.json` liegt wie die anderen Texte im DATA-Cache und wird erst beim ersten Öffnen geladen.

**Flache Version:** Wer ohne Unterordner hochlädt, erzeugt sie mit `python3 make_flat.py` (Ausgabe im Ordner `bibel-flat` neben dem Projekt); alle Dateien liegen dort in einer Ebene.

**Icons neu erzeugen:** `python3 build/make_icons.py` (aus `icon-entwurf/schaefer-mit-schaf.svg`).

## Deine Daten

Lesefortschritt, Markierungen, Themen, Notizen, Lieblinge, Lesepläne, Gebete, Verskarten und Lesewege (mit deinen Notizen) liegen nur im Browser-Speicher des Handys (nicht auf GitHub). Unter **Mehr → Sichern** regelmäßig exportieren. Alte Sicherungen (auch aus Version 1 und aus den Sitzungen 1 und 2) lassen sich weiter einspielen; die neuen Einstellungen „Namen im Text“ und „Deutsch (KI)“ sind darin nur zwei zusätzliche Schalter (standardmäßig aus).

## Textquellen

- Luther 1912 – github.com/seven1m/open-bibles (gemeinfrei)
- Elberfelder 1905, Schlachter 1951, Menge 1939 – github.com/scrollmapper/bible_databases. Schlachter 1951 steht laut ebible.org (ebible.org/deu1951/copyright.htm) unter CC BY 4.0, Rechteinhaber Genfer Bibelgesellschaft; ob unsere Datei Zeichen für Zeichen dieser Fassung entspricht, ist nicht geprüft.
- Personen und Orte: Stellenverweise aus STEPBible TIPNR (Tyndale House, Cambridge; CC BY 4.0), auf Luther-Verszählung umgerechnet und nur übernommen, wenn der Name im Luthertext steht. Kurzbeschreibungen und Epochenzuordnung sind KI-erstellt und nicht an der Fachliteratur nachgeprüft.
- Außerkanonische Schriften (englisch) – github.com/scrollmapper/bible_databases_deuterocanonical
- Schriften: Literata, Figtree (SIL Open Font License)

`data/` wurde mit einem Build-Skript aus diesen Quellen erzeugt. Die Menge-Bereinigung läuft dort über `build/cleanup_men.py`. Die Lesepläne (`data/plaene.json`) sind eigene Zusammenstellungen und entstehen mit `build/plans.py`; die Kapitelsummen werden dabei gegen den Katalog geprüft. Die chronologische Reihenfolge ist eine Näherung, Datierungen in der Forschung sind umstritten.

Buch-Einführungen (`data/einf.json`, erzeugt mit `build/einf.py` aus `build/einf_at.py`, `einf_nt.py`, `einf_apo_extra.py`): eigene, KI-erstellte Zusammenfassungen des gängigen Kenntnisstands (Tradition und Forschung nebeneinander), nicht Satz für Satz an der Fachliteratur nachgeprüft. Die Schlüsselverse prüft das Skript gegen den Text.

Themen-Lesewege (`data/themen.json`, erzeugt mit `build/themen.py`): Stellenauswahl gestützt auf OpenBible.info Topical Bible (CC BY), Nave’s Topical Bible und Torrey’s New Topical Textbook (gemeinfrei); Kandidaten zählt `build/themen_quellen.py` (Ergebnis `build/themen_kandidaten.json`). Hinführungen und Fragen sind eigene Texte. Neue Themen: in `build/themen.py` ergänzen, Skript laufen lassen, SHELL hochzählen.

Zeitleiste (`data/zeit.json`, erzeugt mit `build/zeit.py`) und Register (`data/register.json`, erzeugt mit `build/register.py` aus `build/reg_data_*.py`, `build/reg_tipnr.py`, `build/versmap.py`): eigene, KI-erstellte Zusammenstellungen. Die Jahreszahlen folgen dem Stand der Geschichtswissenschaft (nicht Ussher); jedes Ereignis trägt eine Sicherheitsstufe. Nur wenige Daten wurden stichprobenartig an Wikipedia gegengeprüft, der Rest nicht. Didache auf Deutsch (`data/ext-de.json`, erzeugt mit `build/extde.py` aus `build/extde_did.py`): KI-Übertragung aus der englischen Fassung von 1886, nicht aus dem Griechischen und von keinem Menschen geprüft; in der App entsprechend gekennzeichnet.

## Tests

`python3 -I build/test_app.py [Ordner]` (Playwright: Handyformat, offline, Sicherungen, alle Funktionen von Sitzung 1 und 2), `python3 -I build/test_s3.py [Ordner]` (Zeitleiste, Register, Namen im Text, Didache-Deutsch, alte Sicherungen), `python3 -I build/test_a11y.py [Ordner]` (Kontrast WCAG AA, Namen der Bedienelemente), `python3 -I build/test_perf.py [Ordner]` (Messwerte bei gedrosselter CPU), `node build/test_refs.js` (Eingabe-Sprung) und `node build/test_cards.js` (Tipp-Vergleich der Verskarten). „Ordner“ ist `bibel-app` (Standard) oder `../bibel-flat`.
