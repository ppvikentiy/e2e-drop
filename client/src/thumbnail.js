const MAX_SIDE = 192;
const QUALITY = 0.72;
const TIMEOUT_MS = 6000;
const MAX_DATA_URL = 52000; // matches the server's 40 KB decoded limit

function withTimeout(promise) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))]);
}

function toJpeg(source, width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', QUALITY);
  return url.length <= MAX_DATA_URL ? url : canvas.toDataURL('image/jpeg', 0.5);
}

async function imageThumb(file) {
  const bitmap = await createImageBitmap(file);
  try {
    return toJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close?.();
  }
}

function videoThumb(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (result) => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 3);
    };
    video.onseeked = () => {
      try {
        done(video.videoWidth ? toJpeg(video, video.videoWidth, video.videoHeight) : null);
      } catch {
        done(null);
      }
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

// Returns a small JPEG data URL, or null when the browser cannot decode the file (e.g. HEIC on desktop).
export async function makeThumbnail(file) {
  try {
    if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') return await withTimeout(imageThumb(file));
    if (file.type.startsWith('video/')) return await withTimeout(videoThumb(file));
  } catch {
    // undecodable file: fall back to the extension badge
  }
  return null;
}
