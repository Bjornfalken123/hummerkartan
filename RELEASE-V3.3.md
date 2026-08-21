# Hummerkartan v3.3

## Kartpositioner
- Lagda och planerade tinor ritas nu som GeoJSON circle/symbol-lager inne i kartans WebGL-rendering.
- DOM-markörer för tinor är borttagna, vilket eliminerar visuell markördrift vid zoom.
- Punktens centrum är den faktiska lat/lon-positionen.

## GPS vid sättning
- Positionen låses inte längre när dialogen öppnas.
- När **Sätt tina** bekräftas används GPS-fixen närmast själva knapptryckningen.
- GPS-cache är avstängd (`maximumAge: 0`) för både engångsfix och kontinuerlig tracking.
- Den sparade tiden utgår från GPS-fixens timestamp.
- Efter sättning visas GPS-noggrannheten i bekräftelsen.

Ingen D1-migration behövs.
