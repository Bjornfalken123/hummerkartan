# Hummerkartan v3.5

## UX-release före fälttest

- Mobil Fiske är situationsstyrt: **Starta tur** när ingen tur pågår, därefter **Sätt tina**.
- Kompakt turstatus visar fart och distans utan separat fart-ruta.
- Turstart har dubbeltrycksskydd, och manuellt val av en tina prioriteras framför automatiska närhetsförslag.
- När båten kommer nära en planerad P-punkt föreslår appen diskret **Sätt Pn**. Förslaget använder hysteresis och kan döljas.
- GPS/offline-status visas bara när något behöver uppmärksamhet.
- Redan vittjad tina markeras tydligt för att minska dubbelregistrering.
- Större osynliga touchytor runt kartpunkterna. Etiketter glesas ut vid låg zoom; vald/närliggande punkt behåller namn.
- Aktiv tina har en enhetlig marin färg; vittjad denna tur har tydlig status.
- **Översikt** heter nu **Visa alla**.
- Webbläsarens confirm-dialoger är ersatta med appens egna bottom sheets.
- Avslutad tur får ett tydligt slutkort med distans, tid, vittjade, satta och humrar.
- Desktop har nu **Planering · Tinor · Turer · Statistik**.
- Turer kan öppnas på desktop med GPS-spår och händelser. Vittjningar kan korrigeras eller tas bort i efterhand.
- Satta tinors position kan justeras manuellt; originalets GPS-position finns kvar i position_events som revisionsspår.
- Mobilmenyn har separata **Turer** och **Statistik**.
- Ny migration `0005_trip_events_corrections.sql` kopplar varje framtida sättning/vittjning explicit till rätt tur och sparar ett revisionsspår för efterhandskorrigeringar.
- Backup-exporten innehåller även `trip_events` och `correction_events`.


## Innan deploy

Kör `migrations/0005_trip_events_corrections.sql` i D1 Console efter `0004_position_events.sql`.

Verifiera sedan:

```sql
SELECT name FROM sqlite_master
WHERE type='table' AND name IN ('trip_events','correction_events')
ORDER BY name;

SELECT * FROM app_migrations
WHERE name='v3_5_trip_events_corrections';
```

Du ska få båda tabellerna och en migrationsmarkör.

## Medvetet kvar till fälttest

- Riktiga offlineområden för kartdata är inte byggda ännu.
- Samtidig skapning från flera offline-enheter kan fortfarande ge samma visningsnamn (UUID skiljer objekten åt).
- Närhetsgränsen för planerade punkter är satt konservativt och ska kalibreras efter första båttestet.
