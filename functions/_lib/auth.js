const COOKIE_NAME = 'hk_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function encodeJson(value) {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

function safeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function safeEqualText(a, b) {
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(a ?? ''))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(b ?? '')))
  ]);
  return safeEqualBytes(new Uint8Array(left), new Uint8Array(right));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function cookieValue(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function authConfigured(env) {
  return Boolean(env?.AUTH_USERNAME && env?.AUTH_PASSWORD && env?.AUTH_SECRET);
}

export async function credentialsMatch(env, username, password) {
  if (!authConfigured(env)) return false;
  const [userOk, passOk] = await Promise.all([
    safeEqualText(username, env.AUTH_USERNAME),
    safeEqualText(password, env.AUTH_PASSWORD)
  ]);
  return userOk && passOk;
}

export async function makeSession(env, username) {
  const payload = encodeJson({
    u: String(username),
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
  });
  const signature = bytesToBase64Url(await hmac(env.AUTH_SECRET, payload));
  return `${payload}.${signature}`;
}

export async function readSession(request, env) {
  if (!authConfigured(env)) return null;
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  try {
    const expected = await hmac(env.AUTH_SECRET, payload);
    const actual = base64UrlToBytes(signature);
    if (!safeEqualBytes(expected, actual)) return null;
    const data = decodeJson(payload);
    if (!data?.u || !Number.isFinite(data.exp) || data.exp < Math.floor(Date.now() / 1000)) return null;
    if (!(await safeEqualText(data.u, env.AUTH_USERNAME))) return null;
    return { username: data.u, expires: data.exp };
  } catch {
    return null;
  }
}

export function sessionCookie(request, token) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
