/**
 * OMNIBUS PROTOCOL PRO - SECURE CLOUDFLARE WORKER SYNC & GEMINI HUB (index.js)
 * Security Features:
 * - STRICT CORS: Requires env.ALLOWED_ORIGIN to match incoming Origin header (No '*' wildcard fallback).
 * - AUTHENTICATED PAIRING INIT (/api/pair/init): Requires existing authorized device HMAC signature.
 * - HASHED QR PAIRING TOKENS IN D1 (SHA-256) & IMMEDIATE DELETION UPON REDEMPTION.
 * - Constant-Time HMAC Signature Verification with Master-Key Encrypted Device Secrets.
 * - Anti-Replay Protection & 2MB Body Hard Limit.
 * - Secure Serverless Proxy for Gemini Meal Parser.
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const originHeader = request.headers.get('Origin');

        // STRICT CORS ENFORCEMENT: Requires env.ALLOWED_ORIGIN. No '*' fallback.
        const allowedOriginConfig = env.ALLOWED_ORIGIN;
        if (!allowedOriginConfig || (originHeader && originHeader !== allowedOriginConfig)) {
            if (request.method === 'OPTIONS') {
                return new Response(null, { status: 403 });
            }
            return new Response(JSON.stringify({ error: "Accesso CORS negato: origine non autorizzata." }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const corsHeaders = {
            'Access-Control-Allow-Origin': allowedOriginConfig,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Omnibus-Device-Id, X-Omnibus-Timestamp, X-Omnibus-Request-Id, X-Omnibus-HMAC-Signature',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // STRICT WORKER_MASTER_KEY CHECK
        if (!env.WORKER_MASTER_KEY) {
            return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers: corsHeaders });
        }

        const masterKey = await getWorkerMasterKey(env.WORKER_MASTER_KEY);

        try {
            // =========================================================================
            // 1. PUBLIC UNAUTHENTICATED PAIRING REDEMPTION (/api/pair)
            // =========================================================================

            if (url.pathname === '/api/pair' && request.method === 'POST') {
                const bodyText = await request.text();
                const body = JSON.parse(bodyText);
                const { token, deviceName } = body;

                if (!token) {
                    return new Response(JSON.stringify({ error: "Token di pairing obbligatorio." }), { status: 400, headers: corsHeaders });
                }

                const tokenHash = await hashSHA256(token);

                const pairing = await env.DB.prepare(
                    `SELECT * FROM pairing_tokens WHERE token_hash = ? AND expires_at > ?`
                ).bind(tokenHash, Date.now()).first();

                if (!pairing) {
                    return new Response(JSON.stringify({ error: "Token di pairing non valido o scaduto." }), { status: 403, headers: corsHeaders });
                }

                // Delete token from D1 immediately upon redemption
                await env.DB.prepare(`DELETE FROM pairing_tokens WHERE token_hash = ?`).bind(tokenHash).run();

                // Issue new 256-bit random Device Auth Secret & Device ID
                const newDeviceId = 'dev_' + Array.from(crypto.getRandomValues(new Uint8Array(8)))
                    .map(b => b.toString(16).padStart(2, '0')).join('');
                const deviceAuthSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
                    .map(b => b.toString(16).padStart(2, '0')).join('');

                const encryptedObj = await encryptSecretWithMasterKey(deviceAuthSecret, masterKey);

                await env.DB.prepare(
                    `INSERT INTO authorized_devices (device_id, room_id, device_name, encrypted_device_secret, iv, key_version, linked_at, last_active, status)
                     VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'authorized')`
                ).bind(newDeviceId, pairing.room_id, deviceName || 'Dispositivo Secondario', encryptedObj.cipherBase64, encryptedObj.ivBase64, Date.now(), Date.now()).run();

                return new Response(JSON.stringify({
                    deviceId: newDeviceId,
                    deviceSecret: deviceAuthSecret,
                    roomId: pairing.room_id
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            // =========================================================================
            // 2. DEVICE AUTHENTICATION & HMAC VERIFICATION FOR ALL OTHER ENDPOINTS
            // =========================================================================

            const deviceId = request.headers.get('X-Omnibus-Device-Id');
            const timestamp = parseInt(request.headers.get('X-Omnibus-Timestamp') || '0');
            const requestId = request.headers.get('X-Omnibus-Request-Id');
            const signature = request.headers.get('X-Omnibus-HMAC-Signature');

            if (!deviceId || !timestamp || !requestId || !signature) {
                return new Response(JSON.stringify({ error: "Intestazioni di autenticazione dispositivo mancanti." }), { status: 401, headers: corsHeaders });
            }

            const now = Date.now();
            if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
                return new Response(JSON.stringify({ error: "Richiesta rifiutata: timestamp scaduto o non sincronizzato." }), { status: 401, headers: corsHeaders });
            }

            const replayCheck = await env.DB.prepare(`SELECT request_id FROM replay_cache WHERE request_id = ?`).bind(requestId).first();
            if (replayCheck) {
                return new Response(JSON.stringify({ error: "Richiesta rifiutata: replay attack rilevato." }), { status: 409, headers: corsHeaders });
            }
            await env.DB.prepare(`INSERT INTO replay_cache (request_id, device_id, timestamp, created_at) VALUES (?, ?, ?, ?)`).bind(requestId, deviceId, timestamp, now).run();

            const rateLimitKey = `rate_${deviceId}_${Math.floor(now / 60000)}`;
            const rateObj = await env.DB.prepare(`SELECT count FROM rate_limits WHERE key = ?`).bind(rateLimitKey).first();
            const count = (rateObj ? rateObj.count : 0) + 1;
            if (count > 30) {
                return new Response(JSON.stringify({ error: "Troppe richieste: rate limit superato (max 30 req/min)." }), { status: 429, headers: corsHeaders });
            }
            await env.DB.prepare(`INSERT INTO rate_limits (key, count, reset_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = ?`).bind(rateLimitKey, count, now + 60000, count).run();

            const dev = await env.DB.prepare(
                `SELECT room_id, encrypted_device_secret, iv, status FROM authorized_devices WHERE device_id = ?`
            ).bind(deviceId).first();

            if (!dev || dev.status === 'revoked' || !dev.encrypted_device_secret) {
                return new Response(JSON.stringify({ error: "Dispositivo non autorizzato o revocato." }), { status: 403, headers: corsHeaders });
            }

            const plainDeviceSecret = await decryptSecretWithMasterKey(dev.encrypted_device_secret, dev.iv, masterKey);

            let bodyText = "";
            if (request.method === 'POST') {
                bodyText = await request.text();
                if (bodyText.length > 2 * 1024 * 1024) {
                    return new Response(JSON.stringify({ error: "Dimensione payload superiore al limite di 2MB." }), { status: 413, headers: corsHeaders });
                }
            }

            const expectedSig = await computeHMAC(dev.room_id + deviceId + timestamp + requestId + bodyText, plainDeviceSecret);
            
            if (!timingSafeEqual(signature, expectedSig)) {
                return new Response(JSON.stringify({ error: "Firma HMAC non valida. Accesso negato." }), { status: 401, headers: corsHeaders });
            }

            await env.DB.prepare(`UPDATE authorized_devices SET last_active = ? WHERE device_id = ?`).bind(now, deviceId).run();

            // =========================================================================
            // 3. AUTHENTICATED PAIRING INIT (/api/pair/init)
            // =========================================================================

            if (url.pathname === '/api/pair/init' && request.method === 'POST') {
                const body = JSON.parse(bodyText);
                const { roomId } = body;

                if (roomId !== dev.room_id) {
                    return new Response(JSON.stringify({ error: "Dispositivo non autorizzato per questa stanza." }), { status: 403, headers: corsHeaders });
                }

                const rawToken = 'pair_' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
                    .map(b => b.toString(16).padStart(2, '0')).join('');
                const tokenHash = await hashSHA256(rawToken);

                const expiresAt = now + (10 * 60 * 1000); // 10 Minutes

                await env.DB.prepare(
                    `INSERT INTO pairing_tokens (token_hash, room_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
                ).bind(tokenHash, roomId, now, expiresAt).run();

                return new Response(JSON.stringify({ token: rawToken, expiresAt, roomId }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // =========================================================================
            // 4. SECURE SYNC API ENDPOINTS
            // =========================================================================

            if (url.pathname === '/api/sync' && request.method === 'POST') {
                const body = JSON.parse(bodyText);
                const { roomId, payload } = body;

                if (roomId !== dev.room_id) {
                    return new Response(JSON.stringify({ error: "Dispositivo non autorizzato per questa stanza." }), { status: 403, headers: corsHeaders });
                }

                const id = 'delta_' + now + '_' + Math.random().toString(36).substr(2, 4);
                await env.DB.prepare(
                    `INSERT INTO sync_deltas (id, room_id, device_id, store_name, entity_id, action, encrypted_payload, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                ).bind(id, roomId, deviceId, 'batch', 'batch', 'PUT', payload, now).run();

                return new Response(JSON.stringify({ success: true, timestamp: now }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            if (url.pathname === '/api/sync' && request.method === 'GET') {
                const roomId = url.searchParams.get('roomId');
                const since = parseInt(url.searchParams.get('since') || '0');

                if (roomId !== dev.room_id) {
                    return new Response(JSON.stringify({ error: "Dispositivo non autorizzato per questa stanza." }), { status: 403, headers: corsHeaders });
                }

                const { results } = await env.DB.prepare(
                    `SELECT encrypted_payload, updated_at FROM sync_deltas WHERE room_id = ? AND updated_at > ? ORDER BY updated_at ASC LIMIT 50`
                ).bind(roomId, since).all();

                return new Response(JSON.stringify({ results }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            if (url.pathname === '/api/devices/revoke' && request.method === 'POST') {
                const body = JSON.parse(bodyText);
                const { targetDeviceId } = body;

                await env.DB.prepare(
                    `UPDATE authorized_devices SET status = 'revoked', encrypted_device_secret = '', iv = '' WHERE device_id = ? AND room_id = ?`
                ).bind(targetDeviceId, dev.room_id).run();

                return new Response(JSON.stringify({ success: true, revoked: targetDeviceId }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // =========================================================================
            // 5. SECURE GEMINI AI MEAL PARSER PROXY
            // =========================================================================

            if (url.pathname === '/api/analyze-meal' && request.method === 'POST') {
                const body = JSON.parse(bodyText);
                const { mealDescription } = body;

                if (!mealDescription) {
                    return new Response(JSON.stringify({ error: "Descrizione del pasto obbligatoria." }), { status: 400, headers: corsHeaders });
                }

                const apiKey = env.GEMINI_API_KEY;
                if (!apiKey) {
                    return new Response(JSON.stringify({ error: "Chiave Gemini non configurata sul server Worker." }), { status: 500, headers: corsHeaders });
                }

                const promptText = `Agisci come nutrizionista sportivo. Analizza la descrizione del pasto: "${mealDescription}".
Estrai gli alimenti, le quantità ed i macronutrienti stimati.
Restituisci ESCLUSIVAMENTE un JSON strutturato con questa struttura senza formattazione markdown:
{
  "totalKcal": numero,
  "totalPro": numero,
  "totalCho": numero,
  "totalFat": numero,
  "totalFiber": numero,
  "confidence": "alta/media/bassa",
  "summary": "Breve descrizione del pasto",
  "items": [
    { "name": "Nome alimento", "qty": "Quantità", "kcal": numero, "pro": numero, "cho": numero, "fat": numero }
  ]
}`;

                const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptText }] }],
                        generationConfig: { responseMimeType: "application/json" }
                    })
                });

                if (!geminiRes.ok) {
                    return new Response(JSON.stringify({ error: "Chiamata Gemini API fallita." }), { status: 502, headers: corsHeaders });
                }

                const geminiData = await geminiRes.json();
                let rawJson = geminiData.candidates[0].content.parts[0].text;
                const start = rawJson.indexOf('{');
                const end = rawJson.lastIndexOf('}');
                if (start !== -1 && end !== -1) rawJson = rawJson.substring(start, end + 1);

                const parsed = JSON.parse(rawJson);
                parsed.dataQuality = 'stimato_gemini';

                return new Response(JSON.stringify(parsed), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response("Omnibus Secure Sync & Gemini Hub Online", { status: 200, headers: corsHeaders });

        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
    }
};

// =========================================================================
// HELPER CRYPTOGRAPHIC FUNCTIONS FOR WORKER
// =========================================================================

async function hashSHA256(str) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getWorkerMasterKey(rawMasterKeyStr) {
    const enc = new TextEncoder();
    const keyBuf = await crypto.subtle.digest("SHA-256", enc.encode(rawMasterKeyStr));
    return await crypto.subtle.importKey(
        "raw",
        keyBuf,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptSecretWithMasterKey(secretStr, masterKey) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        masterKey,
        enc.encode(secretStr)
    );
    return {
        cipherBase64: btoa(String.fromCharCode(...new Uint8Array(encryptedBuf))),
        ivBase64: btoa(String.fromCharCode(...iv))
    };
}

async function decryptSecretWithMasterKey(cipherBase64, ivBase64, masterKey) {
    const cipherArr = Uint8Array.from(atob(cipherBase64), c => c.charCodeAt(0));
    const ivArr = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
    
    const decryptedBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivArr },
        masterKey,
        cipherArr
    );
    const dec = new TextDecoder();
    return dec.decode(decryptedBuf);
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
