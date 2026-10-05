// Ciphertext staged for Background Fetch. One directory per drop, deleted once the drop is published.
export const BG_DIR = 'vd-bg';

export async function removeCipherDir(dropId) {
  if (!dropId || !navigator.storage?.getDirectory) return;
  try {
    const root = await navigator.storage.getDirectory();
    const parent = await root.getDirectoryHandle(BG_DIR);
    await parent.removeEntry(dropId, { recursive: true });
  } catch {
    // already removed, or OPFS is unavailable
  }
}
