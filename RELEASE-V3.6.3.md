# Hummerkartan v3.6.3

## Vittjning efter reset / stale turstatus

- Servern validerar alltid ett skickat `trip_id` mot D1 innan `trip_events` skapas.
- Ett gammalt lokalt tur-ID kan därför inte längre orsaka foreign-key-fel och rulla tillbaka en vittjning.
- Om tur-ID:t är gammalt försöker servern i stället hitta en riktig tur som täcker händelsetiden; annars sparas vittjningen utan turkoppling.
- Klienten rensar automatiskt lokal `activeTrip` när servern visar att turen inte längre finns eller redan är avslutad.
- Gamla GPS-spår mot en raderad tur ignoreras säkert i stället för att ge 500-fel.
- `/api/state` rapporterar nu explicit om `check_locations` finns, så saknad 0006 kan skiljas från andra databasfel.
- Ingen ny D1-migration krävs utöver 0006.
- Null/empty GPS coordinates can no longer be interpreted as 0°,0°.
