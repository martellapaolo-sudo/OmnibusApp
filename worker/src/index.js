/**
 * OMNIBUS PROTOCOL PRO - Cloudflare Worker
 * Endpoints:
 *   POST /api/pair/init  - Primary device generates QR pairing token
 *   POST /api/pair       - Secondary device redeems token
 *   POST /api/sync       - Push encrypted payload
 *   GET  /api/sync       - Pull updates
 *   GET  /health         - Health check
 */

const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000;       // 10 minutes
const REPLAY_WINDOW_MS     = 5 * 60 * 1000;        // 5 minutes
const MAX_BODY_BYTES       = 5 * 1024 * 1024;      // 5 MB
const RATE_LIMIT_WINDOW_S  = 60;
const RATE_LIMIT_MAX_REQ   = 30;

// ─── CORS ────────────────────────────────────────────────────────────────────

function corsHeaders(env, reqOrigin) {
  const allowed = (env.ALLOWED_ORIGIN || '').trim();

  // If ALLOWED_ORIGIN is set, echo it back only when the origin matches.
  // If it is not set (dev/test mode), fall back to * so the browser never
  // receives the invalid literal string "null" that triggers Failed to fetch.
  let origin;
  if (allowed) {
    origin = reqOrigin === allowed ? allowed : 'null';
  } else {
    origin = '*';
  }

  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Omnibus-Device-Id, X-Omnibus-Timestamp, X-Omnibus-Request-Id, X-Omnibus-HMAC-Signature',
    'Access-Control-Max-Age':       '86400',
  };
}

function jsonResp(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ─── HMAC ────────────────────────────────────────────────────────────────────

async function importKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

async function verifyHMAC(message, signature, secret) {
  try {
    const key  = await importKey(secret);
    const enc  = new TextEncoder();
    const sig  = hexToBytes(signature);
    return crypto.subtle.verify('HMAC', key, sig, enc.encode(message));
  } catch {
    return false;
  }
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── RATE LIMITER (D1) ───────────────────────────────────────────────────────

async function checkRateLimit(db, deviceId) {
  const now    = Math.floor(Date.now() / 1000);
  const window = now - RATE_LIMIT_WINDOW_S;

  await db.prepare('DELETE FROM rate_limit WHERE window_start < ?').bind(window).run();

  const row = await db.prepare(
    'SELECT request_count FROM rate_limit WHERE device_id = ? AND window_start >= ?'
  ).bind(deviceId, window).first();

  if (row && row.request_count >= RATE_LIMIT_MAX_REQ) return false;

  if (row) {
    await db.prepare(
      'UPDATE rate_limit SET request_count = request_count + 1 WHERE device_id = ?'
    ).bind(deviceId).run();
  } else {
    await db.prepare(
      'INSERT INTO rate_limit (device_id, request_count, window_start) VALUES (?, 1, ?)'
    ).bind(deviceId, now).run();
  }
  return true;
}

// ─── REQUEST AUTH ─────────────────────────────────────────────────────────────

async function authenticateRequest(request, db, body) {
  const deviceId  = request.headers.get('X-Omnibus-Device-Id');
  const timestamp = request.headers.get('X-Omnibus-Timestamp');
  const reqId     = request.headers.get('X-Omnibus-Request-Id');
  const hmacSig   = request.headers.get('X-Omnibus-HMAC-Signature');

  if (!deviceId || !timestamp || !reqId || !hmacSig)
    return { ok: false, error: 'Missing auth headers', status: 401 };

  // Timestamp freshness
  const ts  = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(ts) || Math.abs(now - ts) > REPLAY_WINDOW_MS)
    return { ok: false, error: 'Request expired or clock skew too large', status: 401 };

  // Replay protection
  const existing = await db.prepare(
    'SELECT id FROM replay_cache WHERE request_id = ?'
  ).bind(reqId).first();
  if (existing)
    return { ok: false, error: 'Replay detected', status: 401 };

  // Device lookup
  const device = await db.prepare(
    'SELECT device_secret, room_id FROM devices WHERE device_id = ?'
  ).bind(deviceId).first();
  if (!device)
    return { ok: false, error: 'Unknown device', status: 403 };

  // HMAC verify
  const roomId  = device.room_id;
  const bodyStr = body || '';
  const message = roomId + deviceId + timestamp + reqId + bodyStr;
  const valid   = await verifyHMAC(message, hmacSig, device.device_secret);
  if (!valid)
    return { ok: false, error: 'Invalid signature', status: 401 };

  // Store replay entry
  const expiry = Math.floor((now + REPLAY_WINDOW_MS) / 1000);
  await db.prepare(
    'INSERT OR IGNORE INTO replay_cache (request_id, expires_at) VALUES (?, ?)'
  ).bind(reqId, expiry).run();

  return { ok: true, deviceId, roomId };
}

// ─── HANDLERS ────────────────────────────────────────────────────────────────

/** POST /api/pair/init */
async function handlePairInit(request, db, cors) {
  const bodyStr  = await readBody(request);
  const bodyObj  = JSON.parse(bodyStr);
  const { roomId, deviceId } = bodyObj;

  if (!roomId || !deviceId)
    return jsonResp({ error: 'roomId and deviceId required' }, 400, cors);

  const deviceId2 = request.headers.get('X-Omnibus-Device-Id');
  const timestamp = request.headers.get('X-Omnibus-Timestamp');
  const reqId     = request.headers.get('X-Omnibus-Request-Id');
  const hmacSig   = request.headers.get('X-Omnibus-HMAC-Signature');

  if (!deviceId2 || !timestamp || !reqId || !hmacSig)
    return jsonResp({ error: 'Missing auth headers' }, 401, cors);

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS)
    return jsonResp({ error: 'Request expired' }, 401, cors);

  // Look up the initiating device
  const device = await db.prepare(
    'SELECT device_secret FROM devices WHERE device_id = ? AND room_id = ?'
  ).bind(deviceId2, roomId).first();

  if (!device) {
    // First registration — auto-register the initiating device
    const newSecret = randomHex(32);
    await db.prepare(
      'INSERT OR IGNORE INTO devices (device_id, room_id, device_secret, device_name, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(deviceId2, roomId, newSecret, 'Primary Device', Date.now()).run();

    // For first-time registration we trust the call; no HMAC check needed
  } else {
    const message = roomId + deviceId2 + timestamp + reqId + bodyStr;
    const valid   = await verifyHMAC(message, hmacSig, device.device_secret);
    if (!valid)
      return jsonResp({ error: 'Invalid signature' }, 401, cors);
  }

  // Create pairing token
  const token   = randomHex(16);
  const expires = Date.now() + PAIRING_TOKEN_TTL_MS;
  await db.prepare(
    'INSERT INTO pairing_tokens (token, room_id, initiator_device_id, expires_at, used) VALUES (?, ?, ?, ?, 0)'
  ).bind(token, roomId, deviceId2, expires).run();

  return jsonResp({ token, roomId, expiresAt: expires }, 200, cors);
}

/** POST /api/pair */
async function handlePair(request, db, cors) {
  const body = await readBody(request);
  const { token, deviceName } = JSON.parse(body);

  if (!token)
    return jsonResp({ error: 'token required' }, 400, cors);

  const row = await db.prepare(
    'SELECT * FROM pairing_tokens WHERE token = ? AND used = 0'
  ).bind(token).first();

  if (!row)
    return jsonResp({ error: 'Invalid or expired pairing token' }, 400, cors);
  if (row.expires_at < Date.now())
    return jsonResp({ error: 'Pairing token expired' }, 400, cors);

  // Mark token used
  await db.prepare('UPDATE pairing_tokens SET used = 1 WHERE token = ?').bind(token).run();

  // Create new device credentials
  const newDeviceId     = 'dev_' + randomHex(8);
  const newDeviceSecret = randomHex(32);
  const name            = deviceName || 'New Device';

  await db.prepare(
    'INSERT INTO devices (device_id, room_id, device_secret, device_name, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(newDeviceId, row.room_id, newDeviceSecret, name, Date.now()).run();

  return jsonResp({
    deviceId:     newDeviceId,
    deviceSecret: newDeviceSecret,
    roomId:       row.room_id,
  }, 200, cors);
}

/** POST /api/sync */
async function handleSyncPush(request, db, cors) {
  const bodyStr = await readBody(request);
  const auth    = await authenticateRequest(request, db, bodyStr);
  if (!auth.ok)
    return jsonResp({ error: auth.error }, auth.status, cors);

  if (!await checkRateLimit(db, auth.deviceId))
    return jsonResp({ error: 'Rate limit exceeded' }, 429, cors);

  const body = JSON.parse(bodyStr);
  if (!body.payload)
    return jsonResp({ error: 'payload required' }, 400, cors);

  await db.prepare(
    'INSERT INTO sync_data (room_id, device_id, encrypted_payload, created_at) VALUES (?, ?, ?, ?)'
  ).bind(auth.roomId, auth.deviceId, body.payload, Date.now()).run();

  return jsonResp({ ok: true, ts: Date.now() }, 200, cors);
}

/** GET /api/sync */
async function handleSyncPull(request, db, cors) {
  const auth = await authenticateRequest(request, db, '');
  if (!auth.ok)
    return jsonResp({ error: auth.error }, auth.status, cors);

  const url   = new URL(request.url);
  const since = parseInt(url.searchParams.get('since') || '0', 10);

  const { results } = await db.prepare(
    'SELECT encrypted_payload, created_at FROM sync_data WHERE room_id = ? AND device_id != ? AND created_at > ? ORDER BY created_at ASC LIMIT 100'
  ).bind(auth.roomId, auth.deviceId, since).all();

  return jsonResp({ results, ts: Date.now() }, 200, cors);
}

// ─── BODY HELPER ─────────────────────────────────────────────────────────────

async function readBody(request) {
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_BYTES)
    throw new Error('Payload too large');
  return request.text();
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors   = corsHeaders(env, origin);

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });

    const url      = new URL(request.url);
    const pathname = url.pathname;
    const method   = request.method;
    const db       = env.DB;

    try {
      if (pathname === '/health' && method === 'GET')
        return jsonResp({ status: 'ok', ts: Date.now() }, 200, cors);

      if (pathname === '/api/pair/init' && method === 'POST')
        return await handlePairInit(request, db, cors);

      if (pathname === '/api/pair' && method === 'POST')
        return await handlePair(request, db, cors);

      if (pathname === '/api/sync' && method === 'POST')
        return await handleSyncPush(request, db, cors);

      if (pathname === '/api/sync' && method === 'GET')
        return await handleSyncPull(request, db, cors);

      return jsonResp({ error: 'Not Found' }, 404, cors);

    } catch (err) {
      console.error('Worker error:', err);
      return jsonResp({ error: 'Internal Server Error' }, 500, cors);
    }
  },
};
