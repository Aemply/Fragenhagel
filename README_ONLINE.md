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

## v11 – Buzzer-Anzeige auf der Hostseite

Die Buzzer-Logik wurde für die Hostanzeige neu aufgebaut:

- Der Server speichert zusätzlich `firstBuzzedBy`.
- Beim ersten gültigen Buzzer einer Frage/Runde wird dieser Name dauerhaft für diese Frage/Runde gespeichert.
- `Falsch` öffnet den Buzzer wieder, ohne den ersten Buzzer zu verlieren.
- `Richtig` beendet die Buzzer-Phase, ohne den ersten Buzzer zu verlieren.
- Beim Start einer neuen Frage bzw. Sonderrunde wird der erste Buzzer zurückgesetzt.
- Die Hostseite zeigt dadurch auch nach `Richtig` oder `Falsch` weiterhin an, wer zuerst gebuzzert hat.
- Die bisherige `buzzedBy`-Logik für die Spieler bleibt erhalten.

### Deployment

Diese ZIP auf GitHub hochladen bzw. die Dateien im bestehenden Repository ersetzen und anschließend bei Render deployen.

Nach dem Deploy am besten einen **neuen Spielcode** erzeugen und Host-/Show-/Player-Seite jeweils neu laden.


### Buzzer-Ablauf v12

- Sobald ein Spieler buzzert, wird sein Name auf der Hostseite eingeblendet.
- **Richtig:** Die Buzzeranzeige verschwindet und der Buzzer wird geschlossen.
- **Falsch:** Die Buzzeranzeige verschwindet sofort. Der Buzzer wird anschließend wieder für alle anderen Spieler geöffnet.
- Der Spieler mit dem **ersten Buzzer** bleibt für diese Frage gesperrt.
- Sobald ein anderer Spieler buzzert, wird dessen Name wieder auf der Hostseite eingeblendet.


### Buzzer-Anzeige v13

Die Buzzeranzeige auf der Hostseite ist jetzt unabhängig von der Spielerliste.
Dadurch kann die Spielerliste neu gerendert werden, ohne die Anzeige zu entfernen.

Ablauf:
- Host gibt Buzzer frei → zunächst wird kein Spielername angezeigt.
- Spieler buzzert → sein Name wird sofort auf der Hostseite angezeigt.
- Richtig → Anzeige verschwindet, Buzzer ist geschlossen.
- Falsch → Anzeige verschwindet, Buzzer öffnet sich für alle außer dem bereits gesperrten Spieler.
- Nächster Spieler buzzert → dessen Name wird wieder angezeigt.


### v15 – Bewertungsbuttons vollständig repariert

Die Hostseite verwendet für **Richtig/Falsch** jetzt keine Inline-`onclick`-Attribute mehr. Die Buttons werden per JavaScript erzeugt und bekommen echte Click-Event-Listener. Zusätzlich sind die Soundeffekte gegen Fehler abgesichert, sodass ein Soundproblem das Senden des Bewertungsbefehls nicht mehr verhindern kann.


### v16 – Bewertung nur einmal pro Frage

Sobald der Host bei einer Frage einmal **Richtig** oder **Falsch** auswählt, werden sämtliche Bewertungsbuttons sofort gesperrt. Ein Doppelklick oder mehrfaches Klicken kann dadurch keine weitere Punkteänderung auslösen. Beim Start einer neuen Frage wird die Sperre zurückgesetzt.


### v17 – Fix für Bewertungsbuttons

v16 hatte einen Logikfehler: Der Click-Listener setzte die Sperre vor dem Aufruf von `correct()`/`wrong()`, worauf diese Funktionen wegen der Sperre sofort zurückkehrten. In v17 wird die Sperre ausschließlich in den Bewertungsfunktionen gesetzt. Dadurch wird der Serverbefehl wieder gesendet und die Buttons bleiben danach gesperrt.


### v18 – Bewertung pro Spieler

Die Bewertungsbuttons werden jetzt **pro Spieler** gesperrt. Wenn Spieler A falsch liegt, werden nur die Richtig-/Falsch-Buttons von Spieler A gesperrt. Die Buttons der anderen Spieler bleiben aktiv, sodass der Host nach einem falschen Buzzer den nächsten Spieler bewerten kann. Beim ersten Klick auf einen Spieler wird dessen Button-Paar sofort gesperrt. Beim Start einer neuen Frage werden alle Sperren zurückgesetzt.


### v19 – Bewertungsbuttons nur für den aktuellen Buzzer

Auf der Hostseite werden **Richtig** und **Falsch** jetzt ausschließlich für den Spieler angezeigt, der aktuell gebuzzert hat. Solange niemand gebuzzert hat, werden keine Bewertungsbuttons angezeigt. Nach einem falschen Buzzer verschwinden die Buttons zusammen mit der Buzzeranzeige; sobald der nächste Spieler buzzert, erscheinen nur für diesen Spieler wieder Richtig/Falsch.


### v20 – Bewertungsbuttons korrekt an den aktuellen Buzzer koppeln

Die Hostseite aktualisiert die Bewertungsbuttons jetzt bei jedem Server-State-Update. Dadurch erscheinen die Buttons unmittelbar beim aktuell gebuzzerten Spieler und verschwinden wieder, sobald dessen Buzzer bewertet wurde. Es werden ausschließlich **Richtig** und **Falsch** für den aktuell gebuzzerten Spieler angezeigt.


### v21 – Richtig/Falsch nur für den aktuellen Buzzer

Die Bewertungsbuttons sind jetzt direkt an `state.buzzedBy` gekoppelt:
1. Frage ausgewählt → keine Buttons.
2. Buzzer freigegeben → keine Buttons.
3. Spieler A buzzert → nur A bekommt **Richtig/Falsch**.
4. Falsch → A's Buttons verschwinden und der Buzzer öffnet für die anderen.
5. Spieler B buzzert → nur B bekommt **Richtig/Falsch**.


### v22 – Bewertungsbuttons wirklich erst nach dem Buzzer

Die Hostseite erzwingt jetzt an jeder Stelle die Regel: **ohne `state.buzzedBy` ist der Bewertungsbereich leer**. Das Öffnen des Buzzers erzeugt ausdrücklich keine Bewertungsbuttons. Erst ein akzeptierter Buzzer setzt `buzzedBy`; dann werden ausschließlich die beiden Buttons des aktuellen Spielers erzeugt.


### v23 – Buttons erscheinen sofort beim Buzzer

Die Bewertungsbuttons werden jetzt sowohl beim `buzzAccepted`-Ereignis als auch beim nachfolgenden Server-State-Update gerendert. Dadurch erscheinen **Richtig/Falsch unmittelbar nachdem ein Spieler buzzert**, ohne dass erst „Lösung anzeigen“ geklickt werden muss.


### v24 – Lösung automatisch anzeigen

Wenn der Host bei einem gebuzzerten Spieler **Richtig** auswählt, wird nach dem Absenden der Punkte automatisch die vorhandene Funktion „Lösung anzeigen“ ausgelöst. Dadurch wird die Lösung eingeblendet, ohne dass der Host den Button zusätzlich drücken muss.
