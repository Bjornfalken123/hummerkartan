# Hummerkartan v3

Privat familjeapp för hummerfiske på Cloudflare Pages + D1.

## Appens tre delar

- **Planering:** karta, djup, fångst-heatmap, planerade tinor och tinor i vattnet.
- **Fiske:** GPS/tur, vittjning och sättning av tinor.
- **Rapporter:** fångststatistik, bästa tinor och turhistorik.

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

För ett befintligt v2-projekt behöver du bara köra `0003_planned_traps.sql`.

## Lokal kontroll

```bash
npm install
npm run check
```

Lokal Pages-utveckling:

```bash
npm run dev
```
