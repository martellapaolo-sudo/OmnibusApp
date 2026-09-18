import crypto from 'crypto';

const DEVICE_ID = 'dev_master_001';
const ROOM_ID = 'room_main_001';
const DEVICE_SECRET = '7090fd023fd2961ad8ea975a87d38a2b62aa8e656dd31420f8a66e579cf23427';
const BASE_URL = 'https://omnibus-sync-hub.marsibruno55.workers.dev';

async function computeHMAC(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Buffer.from(sig).toString('hex');
}

async function makeRequest(method, path, body = null) {
  const timestamp = Date.now();
  const requestId = crypto.randomUUID();
  const bodyText = body ? JSON.stringify(body) : '';
  const message = ROOM_ID + DEVICE_ID + timestamp + requestId + bodyText;
  const signature = await computeHMAC(message, DEVICE_SECRET);

  const opts = {
    method,
    headers: {
      'X-Omnibus-Device-Id': DEVICE_ID,
      'X-Omnibus-Timestamp': String(timestamp),
      'X-Omnibus-Request-Id': requestId,
      'X-Omnibus-HMAC-Signature': signature,
      'Content-Type': 'application/json',
    }
  };
  if (bodyText) opts.body = bodyText;

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  console.log(`\n[${method} ${path}] Status: ${res.status}`);
  console.log('Response:', text);
}

// Test GET /api/sync con roomId come query param
await makeRequest('GET', `/api/sync?roomId=${ROOM_ID}&since=0`);

// Test POST /api/sync con roomId nel body
await makeRequest('POST', '/api/sync', {
  roomId: ROOM_ID,
  payload: JSON.stringify({ test: 'hello world', ts: Date.now() })
});
