# Release v2

## Mobil – fiskläge
- Plotterlikt, avskalat gränssnitt.
- Sjökortet är huvudytan.
- Fart, kurs, turdistans och GPS-noggrannhet.
- Sätt bur, starta tur, följ dagens runda och öppna burregistret.
- Dagens sparade desktopplan används automatiskt av Runda.
- Fångstheatmap kan slås av/på som ett diskret lager.

## Desktop – planeringsläge
- Permanent vänsterpanel och stort sjökort.
- Plan: välj burar, ändra ordning, lägg planerade platser och se rak planeringssträcka.
- Burar: sök, filtrera, välj och redigera.
- Turer: öppna tidigare GPS-spår på kartan.
- Fångst: heatmap, totalsiffror och områdesranking.

## Heatmap
- Små geografiska områden (~200–250 m).
- Baseras på humrar per vittjning.
- Få observationer tonas ned genom en enkel tilltrofaktor.
- Områden utan data är transparenta.

## D1
Kör `0001_init.sql` och därefter `0002_day_plans.sql`.
