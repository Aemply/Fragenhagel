# Fragenhagel v53 – Musik mit Spotify

Die Musik-Sonderrunde verwendet jetzt **Spotify-Links** im Editor. Die bisherige YouTube-Eingabe wurde durch ein Spotify-Feld ersetzt.

## Host
- Eigene Musik-Leiste mit Play/Pause und Fortschrittsregler
- Steuerung wird über Socket.IO an die Show weitergegeben
- Der Spotify-Embed läuft unsichtbar im Hintergrund

## Show
- Keine sichtbare Spotify-Karte bzw. kein Video
- Eigene Musik-Leiste mit Status und Fortschritt
- Einmalig **„Ton aktivieren“** anklicken, wenn der Browser die Wiedergabe blockiert

## Hinweis
Die Spotify iFrame API stellt für den Embed Play/Pause, Laden, Wiedergabe-Events und Seek-Funktionen bereit; eine eigene Lautstärkesteuerung gehört nicht zu den dokumentierten iFrame-API-Methoden. Die Lautstärke wird deshalb über den Spotify-Player bzw. das jeweilige Gerät geregelt.
