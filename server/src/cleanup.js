import { query } from './db.js';
import { abortMultipart, deleteObject } from './s3.js';

const INTERVAL_MS = 10 * 60 * 1000;
// Keep exhausted/expired drops a while after the last download request so paused downloads can resume.
const DOWNLOAD_GRACE = '24 hours';

let running = false;

// Removes the bucket objects (and any unfinished multipart) and then the database row.
// strict: a storage failure aborts before the row is deleted, so the caller can retry.
export async function destroyDrop(id, { strict = false } = {}) {
  const { rows: files } = await query('SELECT s3_key, s3_upload_id FROM files WHERE drop_id = $1', [id]);
  for (const f of files) {
    if (f.s3_upload_id) await abortMultipart(f.s3_key, f.s3_upload_id).catch(() => {});
    try {
      await deleteObject(f.s3_key);
    } catch (err) {
      if (strict) throw err;
    }
  }
  await query('DELETE FROM drops WHERE id = $1', [id]);
}

export async function runCleanup() {
  if (running) return 0;
  running = true;
  let removed = 0;
  try {
    const { rows: drops } = await query(
      `SELECT id FROM drops
       WHERE (expires_at < now() OR (status = 'ready' AND download_count >= max_downloads))
         AND (last_download_at IS NULL OR last_download_at < now() - interval '${DOWNLOAD_GRACE}')
       ORDER BY expires_at
       LIMIT 500`,
    );
    for (const { id } of drops) {
      try {
        await destroyDrop(id);
        removed++;
      } catch (err) {
        console.error(`[cleanup] failed to remove drop ${id}:`, err.message);
      }
    }
    await query('DELETE FROM pairings WHERE expires_at < now()'); // also drops any token still held
    if (removed > 0) console.log(`[cleanup] removed ${removed} drop(s)`);
    return removed;
  } finally {
    running = false;
  }
}

export function startCleanup() {
  const tick = () => runCleanup().catch((err) => console.error('[cleanup] run failed:', err));
  tick();
  setInterval(tick, INTERVAL_MS);
}
