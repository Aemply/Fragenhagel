# Fragenhagel v85 – Editor-Berechtigung beim Lobbywechsel behoben

Basis: v84.

Fix: Die Editor-HTTP-Endpunkte `/api/questions` und `/api/special-image` können jetzt auch nach einem Lobbywechsel korrekt mit der stateless Editor-Session arbeiten. Der aktuelle Game-Code wird für die Socket.IO-Aktualisierung verwendet, auch wenn der Host-Token nicht mehr im RAM erkannt wird. Dadurch sollten Fragen speichern und Bild-Uploads in einer neu erstellten Lobby nicht mehr fälschlich mit „Host-Berechtigung fehlt“ abgewiesen werden.

GitHub-Persistenz bleibt unverändert.
