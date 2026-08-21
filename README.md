# Hummerkartan v3.5

Privat familjeapp för hummerfiske på Cloudflare Pages + D1.

## Appens fyra delar

- **Planering:** karta, djup, fångst-heatmap, planerade tinor och tinor i vattnet.
- **Fiske:** GPS/tur, vittjning och sättning av tinor.
- **Turer:** turhistorik, spår och efterhandskorrigeringar.
- **Statistik:** fångststatistik och bästa tinor.

Kartan är huvudytan. V3 använder inte längre dagsplan, stoppordning eller "Runda" i gränssnittet.

## Cloudflare

Pages-projektet behöver:

- D1-binding `DB`
- `AUTH_USERNAME`
- krypterad `AUTH_PASSWORD`
- krypterad `AUTH_SECRET`

Kör migrationerna i ordning:

1. `migrations/0001_init.sql`
2. `migrations/0002_day_plans.sql`
3. `migrations/0003_planned_traps.sql`
4. `migrations/0004_position_events.sql`
5. `migrations/0005_trip_events_corrections.sql`

För ett befintligt projekt: kör bara de migrationer som ännu inte är installerade, i nummerordning. V3.5 behöver både `0004_position_events.sql` och `0005_trip_events_corrections.sql`.

## Lokal kontroll

```bash
npm install
npm run check
```

Lokal Pages-utveckling:

```bash
npm run dev
```
