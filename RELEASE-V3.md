# Hummerkartan v3.0

V3 förenklar appen runt tre tydliga delar: **Planering**, **Fiske** och **Rapporter**.

## Ny mobilmodell

- Kartan är huvudytan i både Fiske och Planering.
- **Planering:** placera planerade tinor, flytta/ta bort dem, se översikt och slå på fångst-heatmap.
- **Fiske:** starta/se tur, vittja tinor och sätt nya tinor med aktuell GPS-position.
- En planerad tina ligger kvar tills den sätts eller tas bort. Ingen datumkoppling eller stoppordning.
- När en planerad tina sätts skapas en riktig tina på telefonens aktuella GPS-position och planen tas bort.
- "Runda" och raka navigationslinjer är borttagna.
- Vittjning är förenklad till antal humrar + Spara; återutsatta/anteckning ligger under "Mer".
- Första riktiga fiskeåtgärden startar en tur automatiskt om ingen tur redan pågår.
- Tinor som vittjats under pågående tur markeras med ✓ på kartan.

## Rapporter

Rapporter ligger i en separat vy och visar per år:

- humrar
- snitt per vittjning
- antal vittjningar
- antal turer
- körd distans och tid
- bästa tinor
- senaste fångstdagar
- turhistorik

## Databas

V3 kräver migration:

`migrations/0003_planned_traps.sql`

Den skapar `planned_traps` och försöker ta med planerade platser från den senast uppdaterade gamla dagsplanen. De gamla `day_plans`-tabellerna behålls som historik men används inte längre av v3-gränssnittet.
