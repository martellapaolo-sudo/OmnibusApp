/**
 * OMNIBUS PROTOCOL PRO - TRANSPARENT CLIENT-SIDE CRYPTO ENGINE (crypto.js)
 * Modern 2026 Frictionless Cryptography:
 * - Auto-initializes a persistent local vault key (zero prompts on app open).
 * - Transparent AES-256-GCM encryption/decryption.
 * - Silent HMAC-SHA256 device signatures for Cloudflare Worker sync.
 * - Optional custom master passphrase for advanced users.
 */

const DEFAULT_VAULT_SEED = 'omnibus_vault_master_key_2026_secure';
let inMemoryPassphrase = null;

const CryptoEngine = {
    init: async function() {
        // Load or initialize persistent vault passphrase from StorageEngine
        let profile = await StorageEngine.get('Profile', 'main_profile');
        if (profile && profile.customPassphrase) {
            inMemoryPassphrase = profile.customPassphrase;
        } else if (profile && profile.autoVaultKey) {
            inMemoryPassphrase = profile.autoVaultKey;
        } else {
            // Generate a secure persistent 256-bit local vault key
            const randomBytes = new Uint8Array(32);
            window.crypto.getRandomValues(randomBytes);
            const generatedKey = 'vault_' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            inMemoryPassphrase = generatedKey;

            if (profile) {
                profile.autoVaultKey = generatedKey;
                await StorageEngine.put('Profile', profile);
            }
        }
        return inMemoryPassphrase;
    },

    setPassphrase: async function(pass) {
        inMemoryPassphrase = (pass || '').trim() || DEFAULT_VAULT_SEED;
        let profile = await StorageEngine.get('Profile', 'main_profile');
        if (profile) {
            profile.customPassphrase = inMemoryPassphrase;
            await StorageEngine.put('Profile', profile);
        }
    },

    getPassphrase: function() {
        return inMemoryPassphrase || DEFAULT_VAULT_SEED;
    },

    hasPassphrase: function() {
        return true; // Always ready and valid
    },

    clearPassphrase: function() {
        inMemoryPassphrase = DEFAULT_VAULT_SEED;
    },

    deriveKey: async function(passphrase, saltBuffer) {
        const enc = new TextEncoder();
        const activeSecret = passphrase || inMemoryPassphrase || DEFAULT_VAULT_SEED;
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(activeSecret),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );

        return await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: saltBuffer,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    generateDeviceHMAC: async function(messageStr, deviceAuthSecret) {
        const enc = new TextEncoder();
        const secret = deviceAuthSecret || 'omnibus_default_secret';
        const key = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        const signature = await window.crypto.subtle.sign("HMAC", key, enc.encode(messageStr));
        return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    encrypt: async function(dataObj, passphrase) {
        const activePass = passphrase || inMemoryPassphrase || DEFAULT_VAULT_SEED;
        const enc = new TextEncoder();
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        const key = await this.deriveKey(activePass, salt);
        const plaintext = enc.encode(JSON.stringify(dataObj));

        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            plaintext
        );

        const payload = {
            salt: Array.from(salt),
            iv: Array.from(iv),
            cipher: Array.from(new Uint8Array(ciphertext))
        };
        return btoa(JSON.stringify(payload));
    },

    decrypt: async function(base64Payload, passphrase) {
        const activePass = passphrase || inMemoryPassphrase || DEFAULT_VAULT_SEED;
        try {
            const payload = JSON.parse(atob(base64Payload));
            const salt = new Uint8Array(payload.salt);
            const iv = new Uint8Array(payload.iv);
            const cipher = new Uint8Array(payload.cipher);

            const key = await this.deriveKey(activePass, salt);

            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                key,
                cipher
            );

            const dec = new TextDecoder();
            return JSON.parse(dec.decode(decrypted));
        } catch(e) {
            console.warn("Decryption fallback:", e.message);
            return null;
        }
    }
};

window.CryptoEngine = CryptoEngine;
