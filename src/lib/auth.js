// PBKDF2-SHA256 password hashing + HS256 JWT — Web Crypto, zero dependencies.
import { q } from './db.js';

const te = new TextEncoder();
const td = new TextDecoder();
const PBKDF2_ITERS = 100_000;

const b64u = (buf) =>
  Buffer.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf)
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uDecode = (str) => new Uint8Array(Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? b64uDecode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERS }, key, 256);
  return { hash: b64u(bits), salt: b64u(salt) };
}

async function hmacKey() {
  return crypto.subtle.importKey('raw', te.encode(process.env.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signJWT(payload, days = 90) {
  const header = b64u(te.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64u(te.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + days * 86400 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), te.encode(`${header}.${body}`));
  return `${header}.${body}.${b64u(sig)}`;
}

export async function verifyJWT(token) {
  try {
    const [h, b, s] = token.split('.');
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), b64uDecode(s), te.encode(`${h}.${b}`));
    if (!ok) return null;
    const payload = JSON.parse(td.decode(b64uDecode(b)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// Returns userId or null for an App Router Request
export async function requireUser(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const payload = await verifyJWT(token);
  return payload?.sub || null;
}

export async function register(email, password) {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError('Valid email required', 400);
  if (!password || password.length < 8) throw new HttpError('Password must be at least 8 characters', 400);
  email = email.toLowerCase();
  const { rows } = await q('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length) throw new HttpError('An account with this email already exists', 409);
  const id = crypto.randomUUID();
  const { hash, salt } = await hashPassword(password);
  await q('INSERT INTO users (id, email, pass_hash, salt, created_at) VALUES (?,?,?,?,?)',
    [id, email, hash, salt, Date.now()]);
  return { token: await signJWT({ sub: id, email }), email };
}

export async function login(email, password) {
  if (!email || !password) throw new HttpError('Email and password required', 400);
  const { rows } = await q('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  const user = rows[0];
  if (!user) throw new HttpError('Invalid email or password', 401);
  const { hash } = await hashPassword(password, user.salt);
  if (hash !== user.pass_hash) throw new HttpError('Invalid email or password', 401);
  return { token: await signJWT({ sub: user.id, email: user.email }), email: user.email };
}

export class HttpError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Small helpers shared by route handlers
export const jsonRes = (data, status = 200) => Response.json(data, { status });
export const errRes = (e) =>
  Response.json({ error: e.message || 'Server error' }, { status: e.status || 500 });
