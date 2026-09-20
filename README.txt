FRAGENHAGEL – NEUBAU

Diese Version wurde technisch neu aufgebaut. Alte Host/Show-Logik wurde nicht übernommen.
Einzige übernommene Basis ist fragen.json mit den vorhandenen Kategorien/Sonderrunden-Slots.

Start:
1. Alten Fragenhagel-Server schließen.
2. FRAGENHAGEL_STARTEN.bat doppelklicken.
3. Host: http://localhost:3000/host.html
4. Show: http://localhost:3000/show.html

Wichtige Architektur:
- Der SERVER besitzt exakt einen aktuellen Modus: board / question / special.
- Host sendet Aktionen an den Server.
- Show rendert ausschließlich den aktuellen Serverzustand.
- Beim Verbinden und Wiederverbinden erhält die Show sofort den aktuellen Zustand.

Sonderrunden:
- Face Morph: Morphbild + zwei Originale, Reveal in Show.
- Geo: Bild + Lösung.
- Fragenhagel: Frage + Antwort.
