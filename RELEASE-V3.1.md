# Hummerkartan v3.1

Polish-release ovanpå v3.0.

- Tydligare fångst-heatmap med högre kontrast, större radie och bättre synlighet över djupkartan.
- PWA-installation fungerar även när hemskärmsikonen läggs till från login-sidan.
- Manifest och appikoner är publika även före inloggning; övriga appen/API:t är fortsatt skyddade.
- PNG-ikoner för iOS/Android och apple-touch-icon.
- `start_url`, `scope` och `id` är låsta till `/`.
- Dubbeltryck/dubbelklick zoomar inte längre kartan. Pinch-zoom finns kvar.
- Appens UI använder `touch-action: manipulation` för att undvika webbläsarens dubbeltrycks-zoom utan att stänga av pinch-zoom.
