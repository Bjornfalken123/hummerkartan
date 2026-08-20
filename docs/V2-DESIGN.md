# Hummerkartan v2 – arbetsmodell

## Grundprincip

Appen ska kännas som en marin plotter/GPS, inte som en generell webbapp. Sjökortet är alltid primärt. Sekundära funktioner ska vara diskreta och begripliga utan instruktioner.

## Telefon

Telefonen används ute i båten. Fyra primära åtgärder ligger längst ned och instrumentvärden ligger i en separat rad ovanför. Dagens plan hämtas automatiskt från familjens gemensamma databas.

## Desktop

Datorn används för planering och efteranalys. Vänsterpanelen har fyra fasta flikar. Sjökortet behåller största delen av skärmen.

## Heatmap

- Bas: humrar per vittjning.
- Aggregering: små geografiska celler på ungefär 200–250 meter.
- Datatilltro: områden med färre än fyra vittjningar får lägre vikt.
- Ingen historik: transparent.
- Färg: ljust/gult för svagare historiskt resultat, orange till rött för starkare resultat.
- Heatmap är alltid ett frivilligt lager.
