# Fragenhagel v88
Basis: v87. Geo-Bild-Upload verwendet dieselbe Editor-/Host-Autorisierung wie das normale Editor-Speichern und Face-Morph-Bild-Upload. Dadurch funktionieren Geo-Bild-Uploads auch nach einer neuen Lobby zuverlässig.


## v98
Manuelle +100/-100 Punkte im Host laufen direkt über die bestehende Host-Socket-Verbindung (`addPoints`), damit die Buttons zuverlässig die Punktzahl ändern und an alle Clients synchronisieren. Face-Morph-Falsch bleibt aus v97 erhalten.
