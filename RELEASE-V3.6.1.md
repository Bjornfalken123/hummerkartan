# Hummerkartan v3.6.1

## Fångstplats / heatmap – datamodellfix

- Heatmapen använder nu alltid en snapshot av den valda tinans position vid vittjningen.
- Telefonens GPS-position när formuläret sparas lagras separat som observations-/revisionsdata och kan inte flytta heatmapen.
- Ny tabell `check_locations` separerar fångstplats från registreringsposition.
- Befintliga vittjningar backfillas från respektive tinas kanoniska position så gamla felaktiga telefonpositioner inte används av heatmapen.
- Om en vittjning i efterhand korrigeras till en annan tina flyttas även dess fångstplats till den nya tinans position.
- Backup innehåller nu `check_locations`.
