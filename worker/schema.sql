-- Cloudflare D1 Database Schema for Omnibus Secure Sync & Pairing Hub

CREATE TABLE IF NOT EXISTS sync_deltas (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    store_name TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    encrypted_payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_updated ON sync_deltas(room_id, updated_at);

CREATE TABLE IF NOT EXISTS authorized_devices (
    device_id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    device_name TEXT,
    encrypted_device_secret TEXT NOT NULL, -- AES-256-GCM encrypted using WORKER_MASTER_KEY
    iv TEXT NOT NULL,                       -- 12-byte IV for AES-GCM
    key_version INTEGER DEFAULT 1,
    linked_at INTEGER NOT NULL,
    last_active INTEGER NOT NULL,
    status TEXT DEFAULT 'authorized'        -- 'authorized' or 'revoked'
);

CREATE INDEX IF NOT EXISTS idx_device_room ON authorized_devices(device_id, room_id);

CREATE TABLE IF NOT EXISTS pairing_tokens (
    token_hash TEXT PRIMARY KEY,             -- SHA-256 Hash of Pairing Token
    room_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS replay_cache (
    request_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at INTEGER NOT NULL
);
