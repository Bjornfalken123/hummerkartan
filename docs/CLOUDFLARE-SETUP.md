# Cloudflare-setup för Hummerkartan

## Rekommenderad arkitektur

- Ett **nytt Cloudflare Pages-projekt** kopplat till det nya GitHub-repot.
- En **ny D1-databas** för familjens burar, vittjningar och turer.
- Pages **Functions** i `/functions` är appens API. Du behöver inte skapa separata Workers för dem.
- Cloudflare **Access** framför appen, med familjens e-postadresser som tillåtna användare.
- MapTiler-nyckeln används i klienten. Begränsa nyckeln till den nya domänen i MapTiler.

## 1. GitHub

1. Skapa ett nytt repo, t.ex. `hummerkartan`.
2. Packa upp projektet och lägg filerna i repo-roten.
3. Push till `main`.

## 2. Cloudflare Pages

1. Workers & Pages → Create application → Pages → Connect to Git.
2. Välj det nya GitHub-repot.
3. Framework preset: None.
4. Build command: lämna tomt.
5. Build output directory: `/` eller repo-roten beroende på dashboardens val.
6. Deploy.

`/functions` läses automatiskt av Pages och blir server-side API-routes.

## 3. D1

Skapa en ny D1-databas, t.ex. `hummerkartan-db`.

Kör migrationerna i ordning mot databasen:

1. `migrations/0001_init.sql`
2. `migrations/0002_day_plans.sql`

Det går via D1-konsolen i dashboarden eller Wrangler.

Bind databasen till Pages-projektet:

- Pages project → Settings → Bindings → Add → D1 database
- Variable name: **DB**
- Database: `hummerkartan-db`
- Spara och gör en ny deployment.

Testa därefter `/api/health`. Svaret ska innehålla `"db": true`.

## 4. Familjeinloggning med Cloudflare Access

Rekommenderat för privat familjebruk:

1. Lägg en egen subdomän på Pages-projektet, t.ex. `hummer.dindoman.se`.
2. Zero Trust → Access controls → Applications → Create application → Self-hosted and private.
3. Lägg till appens publika hostname.
4. Skapa en Allow-policy med exakt de e-postadresser som familjen ska använda.
5. Aktivera One-time PIN eller en befintlig identitetsleverantör.
6. Skydda även `*.pages.dev`-adressen/preview-deployments eller stäng/redirecta den, så databasen inte får en oskyddad alternativ ingång.

När Access är aktivt skickar Cloudflare användarens verifierade e-post till appen. Hummerkartan sparar den som `updated_by`/`actor` så familjen kan se vem som ändrat data.

## 5. MapTiler

Projektet innehåller samma publika MapTiler-klientnyckel som Weatherbear för att kartan ska fungera direkt. För det nya repot rekommenderas att du i MapTiler begränsar nyckeln till Hummerkartans nya domän, eller skapar en separat publik nyckel för appen.

## 6. Ingen extra Worker behövs

För version 2 behövs ingen separat Worker. Pages Functions körs på Workers-runtime automatiskt. Separat Worker blir först relevant om vi senare vill ha t.ex. särskild realtidstjänst, köer eller en separat integrationsservice.
