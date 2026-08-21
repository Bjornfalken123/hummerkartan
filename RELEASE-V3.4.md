# Hummerkartan v3.4 — pre-test hardening

## Rotfixar före fälttest
- GPS-sättning tidsmatchas mot själva knapptrycket. När fixar finns på båda sidor om händelsen interpoleras positionen till sättögonblicket.
- Sättpositioner får ett separat revisionsspår med noggrannhet, GPS-tid, knapptryckningstid, fart, kurs och metod.
- Vittjningsposition används för heatmap endast när GPS-fixen är färsk och tillräckligt noggrann.
- Turdistans filtrerar GPS-jitter, dålig noggrannhet och orimliga hopp.
- Kartan är låst till 2D: tilt och rotation är avstängda för att undvika skev visning.
- Försenad offline-synk av en äldre vittjning kan inte längre skriva tillbaka ett äldre `last_checked_at`.
- Desktop `Ny tina` fungerar igen och sparar manuell kartplacering tydligt som sådan i positionsloggen.
- Servern validerar koordinater striktare.

## Databas
Kör `migrations/0004_position_events.sql` en gång innan deployment av v3.4.
