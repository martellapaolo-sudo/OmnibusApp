/**
 * OMNIBUS WORKER - Local Test Suite
 * Non richiede deploy. Testa la logica HMAC e le funzioni helper.
 * Esegui: node worker/test_suite.js
 */

const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ─── Helper: HMAC sign (mirrors CryptoEngine.generateDeviceHMAC) ──────────────
async function hmacSign(message, secret) {
  const enc = new TextEncoder();
  const key = await subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Helper: HMAC verify (mirrors Worker verifyHMAC) ─────────────────────────
async function hmacVerify(message, signature, secret) {
  const enc   = new TextEncoder();
  const bytes = new Uint8Array(signature.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(signature.slice(i * 2, i * 2 + 2), 16);
  const key = await subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  return subtle.verify('HMAC', key, bytes, enc.encode(message));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n🧪 Omnibus Worker Test Suite\n');

await Promise.resolve(); // allow top-level await polyfill

(async () => {
  await test('HMAC: firma e verifica corretta', async () => {
    const secret = 'testsecret';
    const msg    = 'roomId123deviceAbc16130000req_abc123{}';
    const sig    = await hmacSign(msg, secret);
    const ok     = await hmacVerify(msg, sig, secret);
    assert(ok, 'HMAC verification failed');
  });

  await test('HMAC: firma errata viene rifiutata', async () => {
    const sig = await hmacSign('originalmessage', 'secret');
    const ok  = await hmacVerify('tamperedmessage', sig, 'secret');
    assert(!ok, 'Should reject tampered message');
  });

  await test('HMAC: secret errato viene rifiutato', async () => {
    const sig = await hmacSign('message', 'correctsecret');
    const ok  = await hmacVerify('message', sig, 'wrongsecret');
    assert(!ok, 'Should reject wrong secret');
  });

  await test('Timestamp: finestra di 5 minuti', () => {
    const REPLAY_WINDOW_MS = 5 * 60 * 1000;
    const now = Date.now();
    assert(Math.abs(now - now) <= REPLAY_WINDOW_MS, 'Same time should be valid');
    const old = now - 6 * 60 * 1000;
    assert(Math.abs(now - old) > REPLAY_WINDOW_MS, 'Old timestamp should be rejected');
  });

  await test('randomHex: genera stringa hex di lunghezza corretta', () => {
    function randomHex(bytes) {
      const arr = new Uint8Array(bytes);
      webcrypto.getRandomValues(arr);
      return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    const h16 = randomHex(16);
    const h32 = randomHex(32);
    assert(h16.length === 32,  `Expected 32 chars, got ${h16.length}`);
    assert(h32.length === 64,  `Expected 64 chars, got ${h32.length}`);
    assert(/^[0-9a-f]+$/.test(h16), 'Not valid hex');
  });

  await test('CORS: allowed origin viene accettata', () => {
    function corsHeaders(allowedOrigin, reqOrigin) {
      const origin = (allowedOrigin && reqOrigin === allowedOrigin) ? allowedOrigin : 'null';
      return { 'Access-Control-Allow-Origin': origin };
    }
    const allowed = 'https://myapp.example.com';
    const h1 = corsHeaders(allowed, allowed);
    const h2 = corsHeaders(allowed, 'https://evil.com');
    assert(h1['Access-Control-Allow-Origin'] === allowed, 'Should allow correct origin');
    assert(h2['Access-Control-Allow-Origin'] === 'null',  'Should block wrong origin');
  });

  console.log(`\n─────────────────────────────────`);
  console.log(`  Risultato: ${passed} passati, ${failed} falliti`);
  if (failed === 0) console.log('  🎉 Tutti i test superati!\n');
  else console.log('  ⚠️  Alcuni test falliti.\n');
})();
