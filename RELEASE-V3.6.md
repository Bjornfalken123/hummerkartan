# Hummerkartan v3.6

V3.6 är en sammanhållen fiske- och UI-polish inför fälttest.

## Arbetslogik

- Tinor får en tydlig åldersstatus baserad på senaste sättning eller vittjning:
  - **Ny / nyvittjad:** under 24 timmar
  - **Snart dags:** 24–72 timmar
  - **Prioritera:** 72 timmar eller mer
- Statusen är en arbetsprioritering, inte en juridisk tidsgräns.
- En vittjad tina ligger kvar på kartan eftersom den fortfarande är i vattnet, men markeras med **✓**, tonas ned och föreslås inte igen under samma tur.
- En tina som precis satts under aktuell tur föreslås inte som nästa vittjning.
- Närhetsassistansen kan föreslå både **Sätt P…** och **Vittja B…** när GPS-fixen är tillräckligt bra.
- Fångstdata/heatmap kan visas både i **Fiske** och **Planering**.

## Design

- Ett enhetligt marint färgsystem används genom hela appen.
- Blå = ny/nyvittjad, amber = snart dags, korall = prioritera.
- Cyan används för kart-/informationsaccent.
- Heatmapen använder nu cyan/blå/violett i stället för gul/röd, så "bra historisk fångst" aldrig förväxlas med en åtgärdsvarning.
- Knappar, chips, paneler, radier, typografi och spacing är harmoniserade.
- `Fångstdata` är en kompakt lagerkontroll med skydd mot textöverflöd på små mobiler.
- Statistik visar **Status nu** med samma arbetsstatus som Tina-vyn, medan historiska fångstsiffror hålls visuellt neutrala.

## Teknik och data

- GPS-, tur-, atomisk sättning och revisionslogik från v3.4/v3.5 behålls.
- Tidsstatus använder serverklockans offset när serverns tid finns.
- Ingen ny D1-migration tillkommer i v3.6. Befintliga installationer behöver fortfarande `0004` och `0005` om de inte redan är körda.
