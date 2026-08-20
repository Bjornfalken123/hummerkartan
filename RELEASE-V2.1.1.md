# Hummerkartan 2.1.1

Patch för uppgradering från äldre PWA-versioner.

- Ny auth-gate (`boot.js`) verifierar sessionen innan appen startar.
- Offline-läge tillåts först efter en godkänd onlineinloggning på enheten.
- Ny `/api/auth/session` för explicit sessionskontroll.
- Service worker v4 rensar äldre Hummerkartan-cachar och cachar inte längre appens HTML under installation.
- Utloggning rensar även enhetens lokala auth-markör.

Efter deployment: öppna sajten en gång i privat fönster för att verifiera att root redirectar till `/login`. På enheter som haft v2.0 installerad kan den gamla service workern behöva rensas manuellt en gång.
