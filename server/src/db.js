import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS drops (
  id                 uuid PRIMARY KEY,
  token_hash         text UNIQUE,
  upload_secret_hash text NOT NULL,
  password_hash      text,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  expiry_days        integer NOT NULL,
  max_downloads      integer NOT NULL,
  download_count     integer NOT NULL DEFAULT 0,
  expires_at         timestamptz NOT NULL,
  last_download_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drops_expires_at_idx ON drops (expires_at);

CREATE TABLE IF NOT EXISTS files (
  id       uuid PRIMARY KEY,
  drop_id  uuid NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  position integer NOT NULL,
  name     text NOT NULL,
  size     bigint NOT NULL,
  s3_key   text NOT NULL,
  uploaded boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS files_drop_id_idx ON files (drop_id);
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_bytes bigint NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS s3_upload_id text;

-- One row per counted download: resumes and per-file requests reuse the session.
CREATE TABLE IF NOT EXISTS download_sessions (
  drop_id      uuid NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  session_hash text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (drop_id, session_hash)
);

-- v1 stored plaintext tokens; replace them with SHA-256 hashes.
ALTER TABLE drops ADD COLUMN IF NOT EXISTS token_hash text;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drops' AND column_name = 'token') THEN
    UPDATE drops SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
      WHERE token_hash IS NULL AND status = 'ready';
    ALTER TABLE drops DROP COLUMN token;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS drops_token_hash_idx ON drops (token_hash);
ALTER TABLE files ADD COLUMN IF NOT EXISTS thumb bytea;

ALTER TABLE drops ADD COLUMN IF NOT EXISTS enc boolean NOT NULL DEFAULT false;
ALTER TABLE drops ADD COLUMN IF NOT EXISTS meta_ct bytea;

-- Short-code pairing: a computer waits for a phone's upload. The token is held in plaintext only until pickup.
CREATE TABLE IF NOT EXISTS pairings (
  code_hash   text PRIMARY KEY,
  secret_hash text NOT NULL,
  state       text NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting', 'attached', 'ready')),
  drop_id     uuid REFERENCES drops(id) ON DELETE CASCADE,
  token       text,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pairings_expires_at_idx ON pairings (expires_at);
CREATE INDEX IF NOT EXISTS pairings_drop_id_idx ON pairings (drop_id);

-- VDE2. The manifest (names, types, sizes, segment layout) is stored open, with the sender's HMAC tag.
-- A password-protected drop keeps only the SHA-256 of a gate token derived in the browser, plus the
-- public PBKDF2 parameters; the server never receives the password. files.size is the plaintext size,
-- files.cipher_size what the bucket holds, files.uploaded_at the server's own time of upload.
-- VDE1 rows (manifest IS NULL) are no longer served and age out through the regular cleanup;
-- their password_hash, enc and meta_ct columns are left untouched and unused.
ALTER TABLE drops ADD COLUMN IF NOT EXISTS manifest bytea;
ALTER TABLE drops ADD COLUMN IF NOT EXISTS manifest_mac text;
ALTER TABLE drops ADD COLUMN IF NOT EXISTS gate_hash text;
ALTER TABLE drops ADD COLUMN IF NOT EXISTS kdf_salt text;
ALTER TABLE drops ADD COLUMN IF NOT EXISTS kdf_iterations integer;
ALTER TABLE files ADD COLUMN IF NOT EXISTS mime text;
ALTER TABLE files ADD COLUMN IF NOT EXISTS cipher_size bigint;
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;
-- VDE2-5pr. Names, types, plaintext sizes and previews live only in the sealed manifest (drops.manifest,
-- manifest_mac NULL); files keeps just the ciphertext size. The open metadata of earlier formats and the
-- upload times are erased; those drops are no longer served and age out through the regular cleanup.
ALTER TABLE files ALTER COLUMN name DROP NOT NULL;
ALTER TABLE files ALTER COLUMN size DROP NOT NULL;
UPDATE files SET name = NULL, mime = NULL, uploaded_at = NULL
  WHERE name IS NOT NULL OR mime IS NOT NULL OR uploaded_at IS NOT NULL;
UPDATE files SET size = NULL WHERE size IS NOT NULL AND cipher_size IS NOT NULL;
UPDATE drops SET manifest = NULL WHERE manifest_mac IS NOT NULL;
`;

export async function migrate() {
  await pool.query(SCHEMA);
}
