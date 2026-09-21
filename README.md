# FRAGENHAGEL – Online-Version

Die Show läuft jetzt mit Spielräumen und 6-stelligen Spielcodes. Host, Show und Spieler können sich über das Internet verbinden.

## Lokal testen
1. Node.js installieren.
2. `npm install`
3. `npm start`
4. Host öffnen: `http://localhost:3000/host.html`
5. Der Host bekommt automatisch einen Spielcode.
6. Show und Spieler über die dort angezeigten Links öffnen.

## Online mit Render + GitHub
1. Dieses Projekt in ein eigenes GitHub-Repository hochladen.
2. Auf Render einen neuen Web Service aus dem Repository anlegen.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Nach dem Deploy die Render-URL öffnen und `/host.html` anhängen.

Beispiel: `https://DEIN-SERVICE.onrender.com/host.html`

Wichtig: Die Räume und Spielstände liegen aktuell im Arbeitsspeicher des Servers. Ein laufendes Spiel funktioniert online, aber nach einem Server-Neustart werden aktive Räume gelöscht. Die Fragen bleiben in `fragen.json` erhalten.

## Dauerhafte Quizdaten über GitHub (kostenlos)

v84 kann die bearbeiteten Quizdaten und Bilder dauerhaft in einem GitHub-Repository speichern. Dafür braucht der Render-Webservice drei Environment Variables:

- `GITHUB_OWNER` = GitHub-Benutzername oder Organisation
- `GITHUB_REPO` = Repository-Name
- `GITHUB_TOKEN` = GitHub Personal Access Token mit Zugriff auf das Repository
- optional `GITHUB_BRANCH` = Branch, Standard `main`
- optional `GITHUB_DATA_PATH` = Standard `data/fragen.json`
- optional `GITHUB_MEDIA_DIR` = Standard `data/media`

Der Token wird ausschließlich auf dem Server verwendet und niemals an den Browser ausgeliefert.

Beim Start lädt die App `data/fragen.json` und Bilder aus GitHub. Beim Speichern im Editor werden Fragen/Antworten/Kategorien und Sonderrunden wieder nach GitHub geschrieben. Hochgeladene Face-Morph-/Geo-Bilder werden ebenfalls nach `data/media/` im Repository geschrieben.

Wenn die GitHub-Variablen nicht gesetzt sind, funktioniert die App weiterhin mit der bisherigen lokalen Speicherung. Für dauerhafte Daten auf Render müssen die Variablen gesetzt werden.

### GitHub Token

Empfohlen ist ein Fine-grained Personal Access Token für genau das Fragenhagel-Repository mit `Contents: Read and write`. Der Token gehört nicht in den Quellcode und nicht in `.env` im Repository.
