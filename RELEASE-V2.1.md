# Hummerkartan 2.1

## Nytt

- Mobil **Planera**-vy med samma dagsplan som desktop.
- Planerade platser kan läggas på kartan eller från GPS-position.
- Planstopp kan flyttas, döpas om, tas bort och sorteras om.
- Aktiva burar kan läggas till i planen från mobilen.
- Planändringar autosparas med offlinekö som tidigare.
- `Runda` hanterar både burar och planerade platser i samma ordning.
- Planerad plats kan ersättas med en riktig bur utan dubbelt stopp.
- Inloggning via Pages Functions middleware.
- Signerad HttpOnly-sessionscookie.
- Logout på desktop och mobil, inklusive rensning av appens privata lokala cache.
- Service worker använder network-first för sidnavigering så att utgången session kontrolleras online.

## Cloudflare

Nya runtime-värden krävs:

- `AUTH_USERNAME`
- `AUTH_PASSWORD` (Secret)
- `AUTH_SECRET` (Secret)

D1-bindingen är oförändrad och ska fortfarande heta `DB`.
