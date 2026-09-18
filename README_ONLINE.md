# FRAGENHAGEL – Online-Version

Diese Version ist für Spiele mit Freunden über das Internet vorbereitet. Sie verwendet weiterhin Node.js, Express und Socket.IO, bekommt aber eine Lobby mit Spielcode und dynamischen Spielern.

## Ablauf

1. Host öffnet `/host.html`.
2. Der Server erzeugt automatisch einen 5-stelligen Spielcode.
3. Freunde öffnen `/player.html`, geben Spielcode + Namen ein und treten bei.
4. Der Host öffnet `/show.html?code=XXXXX` auf Fernseher/Beamer.
5. Buzzer, Punkte, Fragen und Sonderrunden laufen über Socket.IO synchron.

## Lokal starten

```bash
npm install
npm start
```

Danach: http://localhost:3000/host.html

## Online mit GitHub + Render

- Repository auf GitHub anlegen und die Projektdateien hochladen.
- In Render einen **Web Service** aus dem GitHub-Repository erstellen.
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/healthz`
- Danach erhältst du eine öffentliche `onrender.com`-Adresse.

### Wichtig zu kostenlosen Render-Instanzen

Die kostenlose Instanz kann nach Inaktivität herunterfahren. Beim nächsten Zugriff kann der Start ungefähr eine Minute dauern. Außerdem ist das lokale Dateisystem nicht dauerhaft. Deshalb sind Änderungen, die der Host im eingebauten Editor speichert, nicht als dauerhafte Cloud-Datenbank gedacht. Für einen Spieleabend ist das unproblematisch; für dauerhaft gespeicherte Fragen/Bilder sollte später ein persistenter Speicher (z. B. Render Disk/Postgres oder ein externer Storage) ergänzt werden.

## Sicherheit

Der Host erhält pro Spiel einen geheimen Host-Token. Nur der Host darf Fragen/Medien speichern oder Punkte steuern. Spieler benötigen nur den Spielcode.


## Neue Lobby
Auf der Host-Seite gibt es jetzt den Button **„🆕 Neue Lobby“**. Damit kann jederzeit
eine neue Lobby mit einem neuen 5-stelligen Spielcode erstellt werden. Die bisherige
Lobby wird vom Host verlassen; bereits verbundene Spieler bleiben technisch in der
alten Lobby, bis sie eine neue Lobby betreten.


## Host-Link mit Lobbycode
Die Hostseite aktualisiert ihre URL automatisch auf `/host.html?code=XXXXXX`.
Beim Erstellen einer neuen Lobby wird der neue Code direkt in die URL geschrieben.
Wird eine passende Host-URL erneut geöffnet, versucht die Seite die zugehörige
Host-Sitzung über den lokal gespeicherten Host-Token wiederherzustellen.

## Buzzer-Anzeige auf der Hostseite
Die Hostseite zeigt nun den Namen des Spielers an, der den Buzzer ausgelöst hat,
inklusive Hinweis, dass dieser Spieler zuerst gebuzzert hat. Die Anzeige wird
mit dem gemeinsamen Socket.IO-Spielzustand synchronisiert.

## Buzzer-Anzeige v5
Die Hostseite verwendet jetzt den vom Server tatsächlich übertragenen Spielernamen
in `state.buzzedBy`. Die Anzeige bleibt für die aktuelle Frage bzw. Sonderrunde sichtbar
und wird beim nächsten Öffnen/Wechsel des Buzzers automatisch zurückgesetzt.

## v10 – stabile Host-Buzzer-Logik
Diese Version basiert wieder auf der funktionierenden v5-Basis. Der Host speichert
den ersten vom Server akzeptierten Buzzer separat pro Frage/Sonderrunde. Deshalb
bleibt der Name auch nach einer Richtig/Falsch-Entscheidung sichtbar, ohne die
bestehenden `openBuzzer`, `correct`, `wrong` oder Punkte-Funktionen zu verändern.
Beim Wechsel auf eine neue Frage, Sonderrunde oder die Tafel wird der gespeicherte
Buzzer gelöscht.
