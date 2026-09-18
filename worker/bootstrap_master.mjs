import { webcrypto } from 'node:crypto';
const crypto = webcrypto;
const HEX = '1K8vQ2mX7rP4tN9cL1wD6aS3hF5zJ8uR2';
async function getMasterKey(h) {
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey('raw', enc.encode(h), {name:'PBKDF2'}, false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt:enc.encode('omnibus-master-salt'),iterations:1,hash:'SHA-256'}, km, {name:'AES-GCM',length:256}, false, ['encrypt']);
}
async function encrypt(secret, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const buf = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, enc.encode(secret));
    return { c: Buffer.from(buf).toString('base64'), iv: Buffer.from(iv).toString('base64') };
}
const key = await getMasterKey(HEX);
const secret = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
const {c, iv} = await encrypt(secret, key);
const now = Date.now();
const sql = `INSERT OR REPLACE INTO authorized_devices (device_id,room_id,device_name,encrypted_device_secret,iv,key_version,linked_at,last_active,status) VALUES ('dev_master_001','room_main_001','Master Device','${c}','${iv}',1,${now},${now},'authorized');`;
console.log('\n✅ device_secret (SALVALO ORA):', secret);
console.log('\n📋 Comando da eseguire:\n');
console.log(`npx wrangler d1 execute omnibus-db --remote --command "${sql}"\n`);
