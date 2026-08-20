import { clearSessionCookie } from '../../_lib/auth.js';

export async function onRequestPost(context) {
  return new Response(null, {
    status: 204,
    headers: {
      'set-cookie': clearSessionCookie(context.request),
      'cache-control': 'no-store'
    }
  });
}
