-- OMNIBUS PROTOCOL PRO - D1 Database Schema
-- Run: npx wrangler d1 execute omnibus-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS devices (
  device_id     TEXT PRIMARY KEY,
  room_id       TEXT NOT NULL,
  device_secret TEXT NOT NULL,
  device_name   TEXT DEFAULT 'Device',
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pairing_tokens (
  token               TEXT PRIMARY KEY,
  room_id             TEXT NOT NULL,
  initiator_device_id TEXT NOT NULL,
  expires_at          INTEGER NOT NULL,
  used                INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_data (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id           TEXT NOT NULL,
  device_id         TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS replay_cache (
  request_id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit (
  device_id     TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_room ON sync_data (room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_devices_room ON devices (room_id);
CREATE INDEX IF NOT EXISTS idx_replay_expires ON replay_cache (expires_at);
