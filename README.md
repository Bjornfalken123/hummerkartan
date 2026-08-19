# Hummerkartan

Familjens gemensamma sjökort, planering, hummerrunda och fångstjournal för svenska västkusten.

## Version 2.1

Samma D1-data och samma dagsplan används på telefon och dator, men gränssnittet är anpassat efter arbetsuppgiften.

### Telefon – fiske och planering

- Sjökort som huvudyta med GPS, fart, kurs och aktiv tur.
- **Planera** direkt i mobilen: lägg en plats på kartan eller från aktuell GPS-position.
- Lägg till befintliga aktiva burar i dagens plan.
- Ändra ordningen, flytta, döp om och ta bort planerade platser.
- Planen autosparas och är samma plan som visas på desktop.
- **Runda** följer både befintliga burar och planerade platser i planens ordning.
- En planerad plats kan öppnas, hoppas över, flyttas eller ersättas av en riktig bur.
- När en planerad plats blir en bur ersätts planpunkten i stället för att skapa ett dubbelt stopp.
- Snabb vittjning och fångstregistrering.
- Lokal cache och offlinekö vid dålig täckning.

### Desktop – planeringsläge

- Permanent planeringspanel bredvid sjökortet.
- Flikar för **Plan**, **Burar**, **Turer** och **Fångst**.
- Bygg dagens runda och ändra ordningen.
- Visa ungefärlig rak linjesträcka i nautiska mil.
- Lägg ut planerade platser direkt på kartan.
- Klicka på planerade platser för att öppna samma åtgärder som på mobilen.
- Burregister med sökning och filter.
- Visa historiska GPS-spår från tidigare turer.
- Fångstheatmap och ranking av områden.

### Privat inloggning

Appen skyddas av `functions/_middleware.js` innan både statiska filer och API-routes levereras.

Inloggningsuppgifterna ligger **inte** i GitHub. De anges som Cloudflare Pages Variables/Secrets:

- `AUTH_USERNAME`
- `AUTH_PASSWORD`
- `AUTH_SECRET`

`AUTH_PASSWORD` och `AUTH_SECRET` ska vara krypterade Secrets. Sessionen lagras i en HttpOnly-cookie. **Logga ut** rensar även Hummerkartans lokala cache/data på enheten.

## Gemensam familjedata

Cloudflare D1 lagrar burar, vittjningar, turer, GPS-spår och dagsplaner.

## Deployment

Se `docs/CLOUDFLARE-SETUP.md`.

## D1

Kör migrationerna i ordning:

1. `migrations/0001_init.sql`
2. `migrations/0002_day_plans.sql`

Pages-bindningen måste heta `DB`.

## Viktigt

Hummerkartan är ett personligt planerings- och loggverktyg. Kartdata, GPS-värden och raka planeringslinjer ersätter inte officiellt sjökort, säker navigation eller egen bedömning av farbar väg och förhållanden.
