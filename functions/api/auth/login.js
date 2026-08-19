import { authConfigured, credentialsMatch, makeSession, sessionCookie } from '../../_lib/auth.js';

function redirect(request, params = {}, headers = {}) {
  const url = new URL('/login', request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, { status: 303, headers: { location: url.toString(), 'cache-control': 'no-store', ...headers } });
}

export async function onRequestPost(context) {
  if (!authConfigured(context.env)) return redirect(context.request, { setup: '1' });
  let username = '', password = '';
  const type = context.request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const body = await context.request.json().catch(() => ({}));
    username = String(body.username || '').trim();
    password = String(body.password || '');
  } else {
    const form = await context.request.formData().catch(() => new FormData());
    username = String(form.get('username') || '').trim();
    password = String(form.get('password') || '');
  }
  if (!(await credentialsMatch(context.env, username, password))) return redirect(context.request, { error: '1' });
  const token = await makeSession(context.env, context.env.AUTH_USERNAME);
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL('/', context.request.url).toString(),
      'set-cookie': sessionCookie(context.request, token),
      'cache-control': 'no-store'
    }
  });
}
