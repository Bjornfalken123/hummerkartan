# Hummerkartan

Aktuell release: **Hummerkartan 2.3**.

Familjens gemensamma sjökort, planering, hummerrunda och fångstjournal för svenska västkusten.

## Version 2.3

Samma D1-data och samma dagsplan används på telefon och dator, men gränssnittet är anpassat efter arbetsuppgiften.

### Telefon – två huvudlägen

- **Fiske** är ett eget huvudläge med GPS, fart, tur, Runda, burar och fångstregistrering.
- **Planering** är ett separat huvudläge med en permanent planeringsarbetsyta i stället för en modal ruta.
- Lägg en planerad plats på kartan eller från aktuell GPS-position.
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
- Visa ungefärlig **rak referenssträcka** i nautiska mil; den är inte en beräknad farled eller navigationsrutt.
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

Hummerkartan är ett personligt planerings- och loggverktyg. Planlinjer och målstreck är raka referenslinjer, inte beräknade farleder. EMODnet-djupet i appen är för grovt för automatisk sjönavigering och ersätter inte aktuellt officiellt sjökort eller ansvarig vuxens bedömning av förhållanden.
