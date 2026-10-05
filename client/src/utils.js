export const MAX_FILES = 10;
export const MAX_FILE_SIZE = 500 * 1024 * 1024;
export const MAX_DOWNLOADS = 1000;

export const EXPIRY_OPTIONS = [
  { value: '1d', label: '1 день' },
  { value: '3d', label: '3 дня' },
  { value: '7d', label: 'неделя' },
  { value: '30d', label: 'месяц' },
];

export const DOWNLOAD_OPTIONS = ['1', '5', '10'];

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`.replace('.', ',');
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const filesLabel = (n) => `${n} ${plural(n, 'файл', 'файла', 'файлов')}`;
export const downloadsLabel = (n) => `${n} ${plural(n, 'скачивание', 'скачивания', 'скачиваний')}`;

export function formatDate(value) {
  return new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const formatSpeed = (bytesPerSecond) => `${formatSize(Math.round(bytesPerSecond))}/с`;

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '…';
  const s = Math.max(1, Math.round(seconds));
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин ${String(s % 60).padStart(2, '0')} с`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

const GENERIC_PASTE_NAME = /^image\.(png|jpe?g|gif|webp|bmp)$/i;

// Clipboard screenshots all arrive as "image.png"; give them distinct, readable names.
export function renamePasted(file, index) {
  if (!GENERIC_PASTE_NAME.test(file.name)) return file;
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const ext = file.name.split('.').pop().toLowerCase();
  return new File([file], `screenshot-${stamp}${index ? `-${index + 1}` : ''}.${ext}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export function fileExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot > name.length - 7 ? name.slice(dot + 1).toUpperCase() : 'FILE';
}

// Pairing codes: 9 characters of Crockford base32, shown as K7M-4QX-9TD.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Canonical 9-character code from whatever a person typed, or null. O reads as 0, I and L as 1. */
export function normalizePairCode(value) {
  const code = String(value ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return code.length === 9 && [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
}

export const formatPairCode = (code) => `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6)}`;
