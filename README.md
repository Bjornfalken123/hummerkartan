# Hummerkartan v3.6

Privat familjeapp för hummerfiske på Cloudflare Pages + D1.

## Appens fyra delar

- **Planering:** karta, djup, Fångstdata, planerade tinor och tinor i vattnet.
- **Fiske:** GPS/tur, smart nästa-arbete, vittjning och sättning av tinor.
- **Turer:** turhistorik, spår och efterhandskorrigeringar.
- **Statistik:** aktuell tinstatus samt historisk fångststatistik.

Kartan är huvudytan. V3 använder inte längre dagsplan, stoppordning eller "Runda" i gränssnittet.

### Tinstatus

Tinans arbetsstatus räknas från senaste sättning eller vittjning:

- **Ny / nyvittjad:** < 24 timmar
- **Snart dags:** 24–72 timmar
- **Prioritera:** 72 timmar eller mer

Detta är appens arbetsprioritering, inte en juridisk tidsgräns.

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

För ett befintligt projekt: kör bara de migrationer som ännu inte är installerade, i nummerordning. **V3.6 har ingen ny migration** utöver 0004/0005 från tidigare releaser.

## Lokal kontroll

```bash
npm install
npm run check
npm test
```

Lokal Pages-utveckling:

```bash
npm run dev
```


## v3.6.1 – fångstplats
Heatmap/fångstplats och telefonens registrerings-GPS är separerade. Kör `migrations/0006_check_locations.sql` före deploy.

## v3.6.2 – korrekt fångstplats + desktopvittjning
Heatmap använder tinans positionssnapshot. Desktop kan vittja aktiva tinor och ange tidpunkt för efterhandsregistrering. Kör `migrations/0006_check_locations.sql` före deploy.
