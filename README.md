# Hummerkartan

Familjens gemensamma sjökort, hummerrunda och fångstjournal för svenska västkusten.

## Version 2

Samma data och samma sjökort används på telefon och dator, men gränssnittet anpassas efter arbetsuppgiften.

### Telefon – fiskläge

- Sjökort som huvudyta.
- Fart i knop, kurs, GPS-noggrannhet och körd distans.
- GPS-spår under aktiv tur.
- Fyra stora huvudknappar: **Sätt bur**, **Starta tur**, **Runda**, **Burarna**.
- Dagens planerade burordning från desktop används automatiskt av `Runda`.
- Navigering till vald bur med avstånd och bäring.
- Snabb vittjning och fångstregistrering.
- Diskret valbart fångstlager/heatmap.
- Lokal cache och offlinekö vid dålig täckning.

### Desktop – planeringsläge

- Permanent planeringspanel bredvid sjökortet.
- Flikar för **Plan**, **Burar**, **Turer** och **Fångst**.
- Bygg dagens runda och ändra ordningen.
- Visa ungefärlig rak linjesträcka i nautiska mil.
- Lägg ut planerade platser direkt på kartan.
- Burregister med sökning och filter.
- Visa historiska GPS-spår från tidigare turer.
- Fångstheatmap och ranking av områden.

### Heatmap

Heatmapen bygger på fångst per vittjning i små geografiska områden, inte på total fångst. Ett område med få observationer tonas ned för att ett enda lyckat vittjningstillfälle inte ska dominera kartan. Områden utan historik färgas inte.

## Gemensam familjedata

Cloudflare D1 lagrar burar, vittjningar, turer, GPS-spår och dagens planer. Cloudflare Access rekommenderas framför appen så att bara familjen kan nå den.

## Deployment

Se `docs/CLOUDFLARE-SETUP.md`.

## D1

Kör migrationerna i ordning:

1. `migrations/0001_init.sql`
2. `migrations/0002_day_plans.sql`

Pages-bindingen måste heta `DB`.

## Viktigt

Hummerkartan är ett personligt planerings- och loggverktyg. Kartdata och de raka planeringslinjerna ersätter inte officiell navigation eller bedömning av farbar väg.
