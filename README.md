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
