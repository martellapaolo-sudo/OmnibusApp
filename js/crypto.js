/**
 * OMNIBUS PROTOCOL PRO - CLIENT-SIDE CRYPTO ENGINE (crypto.js)
 * Features:
 * - End-to-End AES-256-GCM Data Encryption (Passphrase in RAM only)
 * - Device Web Crypto HMAC-SHA256 Request Signature Generation (using raw deviceAuthSecret)
 */

let inMemoryPassphrase = null;

const CryptoEngine = {
    setPassphrase: function(pass) {
        inMemoryPassphrase = (pass || '').trim();
    },

    getPassphrase: function() {
        return inMemoryPassphrase;
    },

    hasPassphrase: function() {
        return Boolean(inMemoryPassphrase && inMemoryPassphrase.length >= 6);
    },

    clearPassphrase: function() {
        inMemoryPassphrase = null;
    },

    deriveKey: async function(passphrase, saltBuffer) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(passphrase),
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

    /**
     * Generate HMAC-SHA256 Signature over messageStr using raw deviceAuthSecret
     */
    generateDeviceHMAC: async function(messageStr, deviceAuthSecret) {
        const enc = new TextEncoder();
        const key = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(deviceAuthSecret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        const signature = await window.crypto.subtle.sign("HMAC", key, enc.encode(messageStr));
        return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Encrypt Data Object with E2E Passphrase
     */
    encrypt: async function(dataObj, passphrase) {
        const activePass = passphrase || inMemoryPassphrase;
        if (!activePass) {
            throw new Error("Sincronizzazione disattivata: configura una passphrase per la cifratura end-to-end.");
        }

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

    /**
     * Decrypt Data Object with E2E Passphrase
     */
    decrypt: async function(base64Payload, passphrase) {
        const activePass = passphrase || inMemoryPassphrase;
        if (!activePass) {
            throw new Error("Impossibile decifrare: inserisci la tua passphrase personale.");
        }

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
            console.error("Decryption error:", e);
            throw new Error("Impossibile decifrare i dati remoti. Passphrase non valida.");
        }
    }
};

window.CryptoEngine = CryptoEngine;
