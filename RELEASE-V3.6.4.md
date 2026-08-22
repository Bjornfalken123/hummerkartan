# Hummerkartan v3.6.4

## Vittja – kärnflödet förenklat

- `checks.lat/lon` är nu den kanoniska, frysta fångstplatsen: den valda tinans position vid vittjningen.
- Telefonens GPS-position sparas bara som revisionsdata i `position_events` och påverkar aldrig heatmapen.
- `check_locations`, `position_events` och `trip_events` är inte längre kritiska beroenden för att kunna spara en vittjning.
- Själva vittjningen (`checks` + tinans `last_checked_at`) sparas först i en liten kärntransaktion.
- Revisions-/metadata skrivs därefter best-effort och kan inte rulla tillbaka fångsten.
- Heatmapen fungerar även utan `check_locations`; om tabellen finns används den för äldre snapshots.
- Efterhandsflytt av en vittjning till en annan tina uppdaterar även `checks.lat/lon` till den nya tinans position.
- Backup tolererar att revisions-/hjälptabeller saknas.
- Ingen ny D1-migration krävs.
