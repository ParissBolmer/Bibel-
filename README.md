# Bibel – Lese-App (PWA)

Offlinefähige Bibel-App fürs Handy: Kapitel abhaken, Verse farbig markieren, Themen zuordnen, Notizen, Suche, Übersetzungsvergleich. Dazu die Apokryphen und eine Auswahl außerkanonischer Schriften mit Einführungen.

## Auf GitHub Pages veröffentlichen

1. Auf GitHub ein neues Repository anlegen (z. B. `bibel`), öffentlich.
2. **Add file → Upload files** und den **Inhalt** dieses Ordners hineinziehen (also `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest` und die Ordner `data`, `fonts`, `icons`) → **Commit changes**.
3. **Settings → Pages → Branch: `main`, Ordner `/ (root)` → Save.**
4. Nach ca. 1 Minute ist die App unter `https://<dein-name>.github.io/bibel/` erreichbar.
5. Auf dem Handy in Chrome öffnen → Menü ⋮ → **Zum Startbildschirm hinzufügen** bzw. **App installieren**.

## Update einspielen

Geänderte Dateien hochladen und in `sw.js` die Zeile `const SHELL = 'bibel-v1'` hochzählen (`bibel-v2` …). Sonst zeigt das Handy weiter die alte Version. Die App danach einmal ganz schließen und neu öffnen.

## Deine Daten

Lesefortschritt, Markierungen, Themen und Notizen liegen nur im Browser-Speicher des Handys (nicht auf GitHub). Unter **Mehr → Sichern** regelmäßig exportieren.

## Textquellen

- Luther 1912 – github.com/seven1m/open-bibles (gemeinfrei)
- Elberfelder 1905, Schlachter 1951, Menge 1939 – github.com/scrollmapper/bible_databases
- Außerkanonische Schriften (englisch) – github.com/scrollmapper/bible_databases_deuterocanonical
- Schriften: Literata, Figtree (SIL Open Font License)

`data/` wurde mit einem Build-Skript aus diesen Quellen erzeugt.
