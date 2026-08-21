const AUTH_DEVICE_KEY = 'hummerkartan:auth-device:v1';
const OFFLINE_AUTH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const boot = document.getElementById('authBoot');

function bootMessage(text, error = false) {
  const span = boot?.querySelector('span');
  if (span) span.textContent = text;
  boot?.classList.toggle('error', error);
}

async function startApp() {
  boot?.classList.add('hidden');
  await import('./app.js?v=3.4.0');
}

function priorOfflineAuthIsValid() {
  try {
    const prior = JSON.parse(localStorage.getItem(AUTH_DEVICE_KEY) || 'null');
    return Boolean(prior?.checkedAt && Date.now() - Number(prior.checkedAt) <= OFFLINE_AUTH_MAX_AGE);
  } catch {
    return false;
  }
}

async function verifySession() {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin'
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      localStorage.setItem(AUTH_DEVICE_KEY, JSON.stringify({ user: data.user || '', checkedAt: Date.now() }));
      return startApp();
    }
    localStorage.removeItem(AUTH_DEVICE_KEY);
    if (res.status === 503) return location.replace('/login?setup=1');
    return location.replace('/login');
  } catch {
    if (priorOfflineAuthIsValid()) {
      bootMessage('Offline · använder tidigare godkänd inloggning på den här enheten');
      return startApp();
    }
    localStorage.removeItem(AUTH_DEVICE_KEY);
    bootMessage('Ingen anslutning. Anslut till internet och logga in igen innan offline-läget kan användas.', true);
  }
}

verifySession();
