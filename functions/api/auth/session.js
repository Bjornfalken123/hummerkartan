import { authConfigured, readSession } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  if (!authConfigured(context.env)) {
    return Response.json({ ok: false, error: 'Inloggningen är inte konfigurerad.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  const session = await readSession(context.request, context.env);
  if (!session) {
    return Response.json({ ok: false, error: 'Du är inte inloggad.' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  return Response.json({ ok: true, user: session.username, expires: session.expires }, { headers: { 'cache-control': 'no-store' } });
}
