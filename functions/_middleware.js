import { authConfigured, readSession } from './_lib/auth.js';

const PUBLIC_PATHS = new Set(['/login', '/login.html', '/api/auth/login']);

function isApi(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function loginRedirect(request, setup = false) {
  const url = new URL('/login', request.url);
  if (setup) url.searchParams.set('setup', '1');
  return Response.redirect(url.toString(), 302);
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (PUBLIC_PATHS.has(url.pathname)) return context.next();

  if (!authConfigured(context.env)) {
    if (isApi(url.pathname)) {
      return new Response(JSON.stringify({ ok: false, error: 'Inloggningen är inte konfigurerad i Cloudflare.' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
    return loginRedirect(context.request, true);
  }

  const session = await readSession(context.request, context.env);
  if (!session) {
    if (isApi(url.pathname)) {
      return new Response(JSON.stringify({ ok: false, error: 'Du är inte inloggad.' }), {
        status: 401,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
    return loginRedirect(context.request);
  }

  return context.next();
}
