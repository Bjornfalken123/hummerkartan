# Cloudflare-setup för Hummerkartan 2.2

## Arkitektur

- Cloudflare **Pages** kopplat till GitHub.
- Pages **Functions** i `/functions` för API och inloggning.
- Cloudflare **D1** för burar, vittjningar, turer, GPS-spår och dagsplaner.
- Appens egen server-side inloggning via Pages middleware och signerad HttpOnly-cookie.
- MapTiler används i klienten för kartan.

## 1. GitHub

Projektfilerna ska ligga direkt i repots rot. `index.html`, `app.js`, `functions/` och `migrations/` ska alltså synas direkt när repot öppnas.

Push ändringarna till produktionsbranchen, normalt `main`.

## 2. Cloudflare Pages

Projektet behöver ingen kompilerad frontend-build.

Rekommenderade inställningar:

- Framework preset: **None**
- Build command: `exit 0`
- Build output directory: `.`
- Root directory: lämna tom om projektet ligger i repo-roten

`/functions` används automatiskt av Pages Functions.

## 3. D1

Skapa databasen, t.ex. `hummerkartan-db`, och kör:

1. `migrations/0001_init.sql`
2. `migrations/0002_day_plans.sql`

Bind sedan databasen till Pages-projektet:

- Pages project → Settings → Bindings → Add → D1 database
- Variable name: **DB**
- Database: `hummerkartan-db`

Gör en ny deployment efter att bindningen lagts till.

## 4. Inloggning

Gå till Pages-projektet → **Settings → Variables and Secrets → Add**.

Lägg till:

- `AUTH_USERNAME` – användarnamnet. Kan vara vanlig variable.
- `AUTH_PASSWORD` – lösenordet. Välj **Encrypt**.
- `AUTH_SECRET` – en separat lång slumpmässig hemlighet för signering av sessionscookies. Välj **Encrypt**.

Använd minst cirka 32 slumpmässiga tecken för `AUTH_SECRET`. Det värdet ska inte vara samma som lösenordet och ska aldrig läggas i GitHub.

Gör en ny deployment efter att variablerna/secrets har sparats.

Om någon av de tre variablerna saknas visas en konfigurationsvarning på `/login` och resten av appen blockeras.

## 5. Test

Efter deployment:

1. Öppna appens `pages.dev`-adress.
2. Du ska skickas till `/login`.
3. Logga in med de värden du satt i Cloudflare.
4. Kontrollera att appen öppnas.
5. Testa `/api/health` när du är inloggad. Svaret ska innehålla `"db": true`.
6. Skapa en testplan på desktop och kontrollera att samma plan visas via **Planera** på mobilen.
7. Logga ut och kontrollera att appen åter visar inloggningssidan.

## 6. Preview deployments

Om du använder Cloudflare Pages preview deployments behöver samma D1-binding och auth-variabler finnas även i Preview-miljön om preview-adresserna ska fungera.

## 7. MapTiler

MapTiler-nyckeln är en publik klientnyckel. Begränsa den till Hummerkartans domän i MapTiler när den slutliga domänen är bestämd.

## 8. Ingen separat Worker behövs

Pages Functions körs på Workers-runtime. En separat Worker behövs inte för den här versionen.
