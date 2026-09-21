# Fragenhagel Online v86 – Editor-Berechtigung stabilisiert

Basis: v85.

Fix: Der Host-Editor erneuert die stateless Editor-Session vor jedem Speichervorgang und vor Bild-Uploads. Requests verwenden explizit same-origin credentials. Dadurch funktioniert der Editor auch direkt nach dem Erstellen einer neuen Lobby zuverlässig.

GitHub-Persistenz aus v84/v85 bleibt erhalten.
