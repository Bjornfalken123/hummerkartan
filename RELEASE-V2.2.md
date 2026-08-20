# Hummerkartan 2.2

## Mobil planering

- Tydligt kartplaceringsläge med instruktion och Avbryt.
- Mobilen återgår till planlistan efter ny kartpunkt.
- `Min position` väntar nu in en riktig GPS-fix om ingen färsk position finns.
- `Visa plan`, `Hämta om` och `Starta rundan` finns direkt i mobil planering.
- Större touchytor för ordning/ta bort.
- Planstatus visar sparar, sparad lokalt och konflikter.
- Desktop och mobil uppdaterar samma dagsplan utan att en pågående lokal redigering skrivs över.
- Optimistiskt konfliktskydd hindrar två enheter från att tyst skriva över varandras plan.

## Runda

- Planerade platser och burar körs i samma ordning.
- Både planerad plats och vanlig bur kan hoppas över.
- Osparad plan sparas innan byte till dagens runda.
- Framtidsplan tappas inte om man startar Runda.
- Utan plan krävs GPS-fix innan appen väljer närmaste bur.
- Planerad plats kan fortfarande bli en riktig bur och ersätts då i planen.

## PWA / offline

- Appens egna JS/CSS är network-first, så nya GitHub/Cloudflare-versioner inte fastnar bakom gammal PWA-cache.
- MapTiler-resurser och tidigare visade kartdata cachas opportunistiskt för bättre offline-tålighet.
- Djupdata som redan hämtats kan återanvändas offline.
- Offline-auth på en enhet gäller högst 30 dagar sedan senaste onlinekontroll.

## Datakvalitet

- Fångst-heatmap använder vittjningens GPS-position när den finns, inte burens senare flyttade position.
- Create-anrop för burar, vittjningar och turer är idempotentare vid tappade nätverkssvar.
- Senaste fångst visas även när en burs senaste vittjning ligger utanför de 100 senaste globala vittjningarna.

Ingen ny D1-migration krävs.
