import QRCode from 'qrcode';

// Frame sizes are the exact byte-mode capacities of QR codes at error correction level L.
export const PROFILES = [
  { id: 'max', version: 40, frameBytes: 2953, label: 'Максимум', hint: 'QR версии 40 — для хорошей камеры и яркого экрана' },
  { id: 'mid', version: 30, frameBytes: 1732, label: 'Средне', hint: 'QR версии 30 — надёжнее на средних камерах' },
  { id: 'low', version: 20, frameBytes: 858, label: 'Надёжно', hint: 'QR версии 20 — для слабой камеры или маленького экрана' },
];

export const QUIET = 4; // modules of white border required around a QR code

/**
 * Draws one frame as a QR code onto a canvas, one pixel per module (scale with CSS, image-rendering: pixelated).
 * @param {HTMLCanvasElement} canvas
 * @param {Uint8Array} bytes
 * @param {number} version
 */
export function drawQr(canvas, bytes, version) {
  const qr = QRCode.create([{ data: bytes, mode: 'byte' }], { errorCorrectionLevel: 'L', version });
  const size = qr.modules.size;
  const side = size + 2 * QUIET;
  if (canvas.width !== side) {
    canvas.width = side;
    canvas.height = side;
  }
  const ctx = canvas.getContext('2d', { alpha: false });
  const image = ctx.createImageData(side, side);
  const px = new Uint32Array(image.data.buffer);
  px.fill(0xffffffff);
  const modules = qr.modules.data;
  for (let y = 0; y < size; y++) {
    const row = (y + QUIET) * side + QUIET;
    for (let x = 0; x < size; x++) if (modules[y * size + x]) px[row + x] = 0xff000000;
  }
  ctx.putImageData(image, 0, 0);
  return side;
}

// ImageData is RGBA in memory: on little-endian machines a Uint32 pixel reads 0xAABBGGRR.
const CHANNEL = [0x000000ff, 0x0000ff00, 0x00ff0000];
const OPAQUE = 0xff000000;

/**
 * Draws one screen of a VQD screen stream (see vqd createScreenStream).
 *   mono: black on white; colour: three QR codes, one per channel — a module is dark in a channel when
 *   it is dark in that channel's code; calibration: the code in one pure primary on black.
 */
export function drawScreen(canvas, screen, version) {
  if (screen.kind === 'mono') return drawQr(canvas, screen.frames[0], version);
  const codes = screen.frames.map((bytes) => QRCode.create([{ data: bytes, mode: 'byte' }], { errorCorrectionLevel: 'L', version }).modules);
  const size = codes[0].size;
  const side = size + 2 * QUIET;
  if (canvas.width !== side) {
    canvas.width = side;
    canvas.height = side;
  }
  const ctx = canvas.getContext('2d', { alpha: false });
  const image = ctx.createImageData(side, side);
  const px = new Uint32Array(image.data.buffer);
  if (screen.kind === 'calibration') {
    const lit = OPAQUE | CHANNEL[screen.primary];
    px.fill(lit);
    const modules = codes[0].data;
    for (let y = 0; y < size; y++) {
      const row = (y + QUIET) * side + QUIET;
      for (let x = 0; x < size; x++) if (modules[y * size + x]) px[row + x] = OPAQUE;
    }
  } else {
    px.fill(0xffffffff);
    const [m0, m1, m2] = codes.map((c) => c.data);
    for (let y = 0; y < size; y++) {
      const row = (y + QUIET) * side + QUIET;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        px[row + x] = OPAQUE | (m0[i] ? 0 : CHANNEL[0]) | (m1[i] ? 0 : CHANNEL[1]) | (m2[i] ? 0 : CHANNEL[2]);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return side;
}
