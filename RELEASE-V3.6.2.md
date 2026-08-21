# Hummerkartan v3.6.2

## Vittjning / fångstplats

- Heatmapens fångstplats är en snapshot av den valda tinans position – aldrig telefonens registreringsposition.
- Klienten skickar även tinans snapshot med offlinekön, så en senare synkning kan inte flytta fångstplatsen om tinan hunnit flyttas.
- Telefonens GPS sparas separat som revisionsdata när den finns.
- Desktop har en tydlig **Vittja**-knapp för aktiva tinor och använder samma formulär/API som mobilen.
- På desktop kan **Tidpunkt** anges vid registrering i efterhand. Om tidpunkten ligger inom en befintlig tur kopplas vittjningen automatiskt till den turen.
- `0006_check_locations.sql` krävs före deploy. Ingen ny migration utöver 0006.
