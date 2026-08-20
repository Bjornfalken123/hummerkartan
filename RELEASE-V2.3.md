# Hummerkartan 2.3

## Två riktiga huvudlägen på mobil

- **Fiske** och **Planering** väljs från en permanent lägesväxlare högst upp.
- Fiske visar instrument, tur, Runda, Sätt bur och Burarna.
- Planering döljer fiskekontrollerna och visar en permanent planeringsarbetsyta med kartan ovanför.
- Planering är alltså inte längre ett sheet/modalfönster som öppnas ovanpå Fiske.
- Valet av huvudläge sparas lokalt på enheten.

## Planering

- Samma D1-dagsplan används fortfarande på desktop och mobil.
- Datum, stopp, rak referenssträcka, burar, kartplacering, GPS-punkt, ordning och autosave finns direkt i planeringsläget.
- Kartplacering gömmer tillfälligt planeringspanelen så hela kartan kan användas och återgår sedan till Planering.
- `Gå till Fiske och starta rundan` växlar uttryckligen till Fiske innan Runda startas.
- Planerade punkter kan fortfarande redigeras, flyttas och konverteras till burar.

## Sjökort och linjer

- Planlinjer och mållinjen är tydligare märkta som **raka referenslinjer**.
- Ingen automatisk farled eller djupstyrd båtrutt beräknas från EMODnet-datat.
- Djupskiktet ligger kvar som visuell planeringsinformation.

## PWA

- Shell-cachen är bumpad till `hummerkartan-shell-v6`.
- Appens JS/CSS fortsätter använda network-first så layoutändringen ska slå igenom efter deployment.

Ingen ny D1-migration behövs.
