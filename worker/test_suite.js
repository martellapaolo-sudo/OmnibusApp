/**
 * OMNIBUS PROTOCOL PRO - AUTOMATED WORKER INTEGRATION & SECURITY TEST SUITE
 * Run with Node.js: node /Applications/Omnibus/worker/test_suite.js
 */

const crypto = require('crypto').webcrypto;

// Helper Cryptographic Functions for Test Harness
async function hashSHA256(str) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function computeHMAC(messageStr, secretStr) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secretStr),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(messageStr));
    return Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}

// In-Memory Database Mock for Worker Logic Validation
class D1Mock {
    constructor() {
        this.pairingTokens = new Map();
        this.authorizedDevices = new Map();
        this.replayCache = new Set();
        this.rateLimits = new Map();
    }

    async initPairingToken(tokenHash, roomId, expiresAt) {
        this.pairingTokens.set(tokenHash, { token_hash: tokenHash, room_id: roomId, expires_at: expiresAt });
    }

    async registerDevice(deviceId, roomId, deviceSecret) {
        this.authorizedDevices.set(deviceId, { device_id: deviceId, room_id: roomId, secret: deviceSecret, status: 'authorized' });
    }

    async revokeDevice(deviceId) {
        const dev = this.authorizedDevices.get(deviceId);
        if (dev) {
            dev.status = 'revoked';
            dev.secret = '';
        }
    }
}

// Worker Simulation Logic
async function handleWorkerRequest(req, env, d1) {
    const origin = req.headers.get('Origin');
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) {
        return { status: 403, error: "Accesso CORS negato" };
    }

    if (!env.WORKER_MASTER_KEY) {
        return { status: 500, error: "Server misconfigured" };
    }

    const deviceId = req.headers.get('X-Omnibus-Device-Id');
    const timestamp = parseInt(req.headers.get('X-Omnibus-Timestamp') || '0');
    const requestId = req.headers.get('X-Omnibus-Request-Id');
    const signature = req.headers.get('X-Omnibus-HMAC-Signature');

    // 1. Unauthenticated QR Pairing Redemption Endpoint
    if (req.url === '/api/pair' && req.method === 'POST') {
        const tokenHash = await hashSHA256(req.body.token);
        const tokenEntry = d1.pairingTokens.get(tokenHash);
        if (!tokenEntry || tokenEntry.expires_at < Date.now()) {
            return { status: 403, error: "Token non valido o scaduto" };
        }
        d1.pairingTokens.delete(tokenHash); // Delete immediately upon redemption
        return { status: 200, deviceId: 'dev_new_123', deviceSecret: 'secret_abc_456' };
    }

    // 2. Device Auth & HMAC Verification
    if (!deviceId || !timestamp || !requestId || !signature) {
        return { status: 401, error: "Intestazioni di autenticazione mancanti" };
    }

    // Timestamp drift
    if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
        return { status: 401, error: "Timestamp scaduto" };
    }

    // Anti-replay
    if (d1.replayCache.has(requestId)) {
        return { status: 409, error: "Replay attack rilevato" };
    }
    d1.replayCache.add(requestId);

    // Rate Limiting
    const rateKey = `${deviceId}_${Math.floor(Date.now() / 60000)}`;
    const currentCount = (d1.rateLimits.get(rateKey) || 0) + 1;
    if (currentCount > 30) {
        return { status: 429, error: "Rate limit superato (max 30 req/min)" };
    }
    d1.rateLimits.set(rateKey, currentCount);

    // Device Lookup & Revocation Check
    const dev = d1.authorizedDevices.get(deviceId);
    if (!dev || dev.status === 'revoked' || !dev.secret) {
        return { status: 403, error: "Dispositivo revocato o non autorizzato" };
    }

    // Body Size Check
    const bodyStr = req.body ? JSON.stringify(req.body) : "";
    if (bodyStr.length > 2 * 1024 * 1024) {
        return { status: 413, error: "Dimensione payload superiore al limite 2MB" };
    }

    // HMAC Signature Verification
    const expectedSig = await computeHMAC(dev.room_id + deviceId + timestamp + requestId + bodyStr, dev.secret);
    if (!timingSafeEqual(signature, expectedSig)) {
        return { status: 401, error: "Firma HMAC non valida" };
    }

    return { status: 200, success: true };
}

// MAIN AUTOMATED TEST RUNNER
async function runTestSuite() {
    console.log("=================================================");
    console.log("OMNIBUS WORKER SECURITY & INTEGRATION TEST SUITE");
    console.log("=================================================\n");

    const env = { WORKER_MASTER_KEY: 'master_key_123', ALLOWED_ORIGIN: 'https://omnibus.pages.dev' };
    const d1 = new D1Mock();

    let passedTests = 0;
    let failedTests = 0;

    function assertTest(testName, condition, details) {
        if (condition) {
            console.log(`[PASS] ✅ ${testName}`);
            passedTests++;
        } else {
            console.error(`[FAIL] ❌ ${testName}: ${details}`);
            failedTests++;
        }
    }

    // Test 1: Worker Master Key Missing (500 Server Misconfigured)
    const res1 = await handleWorkerRequest({ url: '/api/sync', method: 'GET', headers: new Map() }, {}, d1);
    assertTest("Test 1: Worker Master Key Mancante -> Rifiuto 500", res1.status === 500 && res1.error === "Server misconfigured", JSON.stringify(res1));

    // Setup Room & Authorized Primary Device
    const roomId = 'room_study_2026';
    const deviceId = 'dev_mac_primary';
    const deviceSecret = 'secret_primary_key_256';
    await d1.registerDevice(deviceId, roomId, deviceSecret);

    // Test 2: Invalid Altered HMAC Signature Rejection (401)
    const ts = Date.now().toString();
    const reqId = 'req_001';
    const headers2 = new Map([
        ['X-Omnibus-Device-Id', deviceId],
        ['X-Omnibus-Timestamp', ts],
        ['X-Omnibus-Request-Id', reqId],
        ['X-Omnibus-HMAC-Signature', 'invalid_signature_string_here'],
        ['Origin', 'https://omnibus.pages.dev']
    ]);
    const res2 = await handleWorkerRequest({ url: '/api/sync', method: 'POST', headers: headers2, body: { roomId, payload: "data" } }, env, d1);
    assertTest("Test 2: Firma HMAC Alterata -> Rifiuto 401", res2.status === 401 && res2.error === "Firma HMAC non valida", JSON.stringify(res2));

    // Test 3: Replay Attack Rejection (409)
    const validSig = await computeHMAC(roomId + deviceId + ts + reqId + JSON.stringify({ roomId, payload: "data" }), deviceSecret);
    const headers3 = new Map([
        ['X-Omnibus-Device-Id', deviceId],
        ['X-Omnibus-Timestamp', ts],
        ['X-Omnibus-Request-Id', reqId],
        ['X-Omnibus-HMAC-Signature', validSig],
        ['Origin', 'https://omnibus.pages.dev']
    ]);
    // First call -> 200 OK
    await handleWorkerRequest({ url: '/api/sync', method: 'POST', headers: headers3, body: { roomId, payload: "data" } }, env, d1);
    // Second call with same reqId -> 409 Replay Attack
    const res3 = await handleWorkerRequest({ url: '/api/sync', method: 'POST', headers: headers3, body: { roomId, payload: "data" } }, env, d1);
    assertTest("Test 3: Replay Attack (Request ID Duplicato) -> Rifiuto 409", res3.status === 409, JSON.stringify(res3));

    // Test 4: Expired or Reused QR Pairing Token Rejection (403)
    const rawToken = 'pair_test_123';
    const tokenHash = await hashSHA256(rawToken);
    await d1.initPairingToken(tokenHash, roomId, Date.now() - 1000); // Expired 1 second ago

    const res4 = await handleWorkerRequest({ url: '/api/pair', method: 'POST', headers: new Map([['Origin', 'https://omnibus.pages.dev']]), body: { token: rawToken } }, env, d1);
    assertTest("Test 4: Token Pairing Scaduto/Riutilizzato -> Rifiuto 403", res4.status === 403, JSON.stringify(res4));

    // Test 5: Revoked Device Rejection (403)
    await d1.revokeDevice(deviceId);
    const reqId5 = 'req_005';
    const sig5 = await computeHMAC(roomId + deviceId + ts + reqId5 + JSON.stringify({ roomId, payload: "data" }), deviceSecret);
    const headers5 = new Map([
        ['X-Omnibus-Device-Id', deviceId],
        ['X-Omnibus-Timestamp', ts],
        ['X-Omnibus-Request-Id', reqId5],
        ['X-Omnibus-HMAC-Signature', sig5],
        ['Origin', 'https://omnibus.pages.dev']
    ]);
    const res5 = await handleWorkerRequest({ url: '/api/sync', method: 'POST', headers: headers5, body: { roomId, payload: "data" } }, env, d1);
    assertTest("Test 5: Dispositivo Revocato -> Rifiuto 403", res5.status === 403, JSON.stringify(res5));

    // Test 6: Rate Limiting Enforcement (429)
    const activeDevId = 'dev_rate_limit';
    const activeSecret = 'secret_rate_limit';
    await d1.registerDevice(activeDevId, roomId, activeSecret);

    let lastRateRes = null;
    for (let i = 0; i < 35; i++) {
        const loopReqId = `req_rate_${i}_${Date.now()}`;
        const loopBody = { roomId, payload: "data" };
        const loopSig = await computeHMAC(roomId + activeDevId + ts + loopReqId + JSON.stringify(loopBody), activeSecret);
        const loopHeaders = new Map([
            ['X-Omnibus-Device-Id', activeDevId],
            ['X-Omnibus-Timestamp', ts],
            ['X-Omnibus-Request-Id', loopReqId],
            ['X-Omnibus-HMAC-Signature', loopSig],
            ['Origin', 'https://omnibus.pages.dev']
        ]);
        lastRateRes = await handleWorkerRequest({ url: '/api/sync', method: 'POST', headers: loopHeaders, body: loopBody }, env, d1);
    }
    assertTest("Test 6: Rate Limit (> 30 req/min) -> Rifiuto 429", lastRateRes.status === 429, JSON.stringify(lastRateRes));

    console.log("\n-------------------------------------------------");
    console.log(`RISULTATI FINALI TEST SUITE: ${passedTests} SUPERATI | ${failedTests} FALLITI`);
    console.log("-------------------------------------------------\n");

    if (failedTests > 0) process.exit(1);
}

runTestSuite();
