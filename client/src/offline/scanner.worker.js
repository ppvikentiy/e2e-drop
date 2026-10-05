// Decodes camera frames and feeds them to the VQD receiver. Everything heavy lives here, off the UI thread.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import {
  MemorySegmentSink, MemorySymbolStore, RAW_MATRIX, Receiver, colourMatrix, maxChannel, measureCalibration, separateChannels,
} from 'vqd';
import { OpfsStorage, opfsSupported, pruneTransfers } from './opfsStore.js';

const READ_OPTIONS = {
  formats: ['QRCode'],
  maxNumberOfSymbols: 1,
  tryHarder: true,
  tryRotate: false,
  tryInvert: false,
  tryDownscale: false,
  textMode: 'Plain',
};

let receiver = null;
let storage = null;
let mode = 'memory';
let canvas = null;
let ctx = null;
let ready = null;
let lastReport = 0;
let lastResult = null;
let qrVisible = false;
let unsupportedVersion = null;
let badManifest = null;
// Password state shown to the user: null | 'wrong-password' | 'unlocked' | 'decrypt-failed'; passwordIgnored = sender used none.
let passwordResult = null;
let passwordIgnored = false;
const counters = { frames: 0, decoded: 0 };
// Colour mode starts with the first calibration frame and ends when they stop coming (the sender
// switched to normal codes): reading three channels costs three times the work.
const COLOUR_TIMEOUT_MS = 30000;
let colour = newColourState();

function newColourState() {
  return { active: false, lastCalibration: 0, samples: [null, null, null], matrix: RAW_MATRIX, quality: null, buffers: null };
}
// Without OPFS the whole file is assembled in memory: keep well below what a phone tab survives.
const MEMORY_MAX_FILE_SIZE = 128 * 1024 * 1024;

// The file is assembled on the device: it needs 1.1 times the file size, or the transfer is not started.
async function enoughStorage(size) {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (!quota) return true; // the browser does not say: assume there is room
    return quota - (usage || 0) >= size * 1.1;
  } catch {
    return true;
  }
}

function memoryReceiver() {
  return new Receiver({ store: new MemorySymbolStore(), sink: new MemorySegmentSink(), maxFileSize: MEMORY_MAX_FILE_SIZE });
}

async function init() {
  await prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) }, fireImmediately: true });
  if (await opfsSupported()) {
    storage = new OpfsStorage();
    mode = 'opfs';
    receiver = new Receiver({ store: storage, sink: storage, checkSpace: enoughStorage });
  } else {
    mode = 'memory';
    receiver = memoryReceiver();
  }
  postMessage({ type: 'ready', storage: mode, maxFileSize: mode === 'memory' ? MEMORY_MAX_FILE_SIZE : null });
}

function summary() {
  const r = receiver;
  const m = r.manifest;
  return {
    type: 'status',
    frames: counters.frames,
    decoded: counters.decoded,
    symbols: r.stats.symbols,
    duplicates: r.stats.duplicates,
    hashFailures: r.stats.hashFailures,
    unsupportedVersion,
    badManifest,
    password: { result: passwordResult, ignored: passwordIgnored },
    colour: { active: colour.active, quality: colour.quality },
    qrVisible,
    last: lastResult,
    manifest: m
      ? { fileId: r.fid, name: m.name, mime: m.mime, size: m.fileSize, segments: m.segmentCount, blockLen: m.blockLen, encrypted: r.encrypted, unlocked: r.unlocked }
      : null,
    progress: r.progress,
    segmentsDone: m ? r.done.slice() : [],
    complete: r.complete,
  };
}

function report(force) {
  const now = performance.now();
  if (!force && now - lastReport < 200) return;
  lastReport = now;
  postMessage(summary());
}

async function decodeFrame(bitmap) {
  counters.frames++;
  // The code is shown as a square: read the central square of the frame only.
  const side = Math.min(bitmap.width, bitmap.height);
  if (!canvas || canvas.width !== side) {
    canvas = new OffscreenCanvas(side, side);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, side, side);
  bitmap.close();
  const image = ctx.getImageData(0, 0, side, side);
  if (colour.active && performance.now() - colour.lastCalibration > COLOUR_TIMEOUT_MS) {
    colour = newColourState();
    report(true);
  }
  const codes = colour.active ? await readColour(image) : await readMono(image);
  const wasVisible = qrVisible;
  qrVisible = codes.length > 0;
  if (wasVisible !== qrVisible) report(true);
  if (!qrVisible) return;
  counters.decoded++;
  for (const code of codes) {
    await handleCode(code, image);
    if (receiver.complete) break;
  }
  if (receiver.complete) await finish();
}

let maxBuffer = null;

async function readMono(image) {
  const found = await readBarcodes(image, READ_OPTIONS);
  if (found.length && found[0].isValid) return [found[0]];
  // On a miss, look for a colour calibration code, which plain luminance may not see.
  if (maxBuffer?.length !== image.data.length) maxBuffer = null;
  maxBuffer = maxChannel(image.data, maxBuffer ?? undefined);
  const again = await readBarcodes(new ImageData(maxBuffer, image.width, image.height), READ_OPTIONS);
  return again.length && again[0].isValid ? [again[0]] : [];
}

// Colour mode: the display's three channels are separated with the calibrated matrix and read as three codes.
async function readColour(image) {
  if (colour.buffers?.[0].length !== image.data.length) colour.buffers = null;
  colour.buffers = separateChannels(image.data, colour.matrix, colour.buffers ?? undefined);
  const out = [];
  for (const data of colour.buffers) {
    const found = await readBarcodes(new ImageData(data, image.width, image.height), READ_OPTIONS);
    if (found.length && found[0].isValid) out.push(found[0]);
  }
  return out;
}

function calibrate(code, image, primary) {
  const p = code.position;
  const quad = [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft];
  const sample = measureCalibration(image.data, image.width, image.height, quad, primary);
  if (!sample) return;
  colour.samples[primary] = sample;
  if (colour.samples.every(Boolean)) {
    const m = colourMatrix(colour.samples);
    colour.matrix = m;
    const quality = m.ok ? 'ok' : m.reason;
    if (quality !== colour.quality) {
      colour.quality = quality;
      report(true);
    }
  }
}

async function handleCode(code, image) {
  const previousFid = receiver.fid;
  const result = await receiver.push(code.bytes);
  if (result.kind === 'calibration') {
    if (!colour.active) {
      colour.active = true;
      report(true);
    }
    colour.lastCalibration = performance.now();
    calibrate(code, image, result.primary);
  }
  lastResult = result.kind;
  if (result.kind === 'unsupported-version') unsupportedVersion = result.version;
  if (result.kind === 'bad-manifest') {
    // The manifest arrived intact (its hash matched) but describes something this device refuses.
    const tooLarge = /size/.test(result.error);
    const noSpace = Boolean(result.noSpace);
    const changed = badManifest?.tooLarge !== tooLarge || badManifest?.noSpace !== noSpace;
    badManifest = { tooLarge, noSpace };
    if (changed) report(true);
  }
  if (result.kind === 'manifest') {
    badManifest = null;
    passwordResult = result.unlock?.kind ?? null;
    passwordIgnored = Boolean(result.passwordIgnored);
  }
  if (result.kind === 'manifest' && mode === 'opfs' && previousFid !== receiver.fid) {
    // Only one transfer is kept: a new file replaces whatever was stored before.
    await pruneTransfers(receiver.fid);
  }
  if (result.kind === 'manifest' || result.kind === 'segment-complete') report(true);
}

async function finish() {
  const m = receiver.manifest;
  let file;
  if (mode === 'opfs') {
    file = await storage.file(receiver.fid, m.fileSize);
  } else {
    file = new Blob([receiver.result()]);
  }
  postMessage({ ...summary(), type: 'complete', file, name: m.name, mime: m.mime });
  receiver.clearPassword(); // the password lived in this worker's memory only
}

onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      ready ??= init();
      await ready;
    } else if (msg.type === 'frame') {
      await ready;
      if (receiver.complete) {
        msg.bitmap.close();
      } else {
        await decodeFrame(msg.bitmap);
        report(false);
      }
      postMessage({ type: 'idle' });
    } else if (msg.type === 'password') {
      await ready;
      const res = await receiver.setPassword(msg.password);
      if (res.kind === 'wrong-password' || res.kind === 'unlocked' || res.kind === 'decrypt-failed') passwordResult = res.kind;
      if (res.kind === 'not-encrypted') passwordIgnored = true;
      report(true);
      if (receiver.complete) await finish();
    } else if (msg.type === 'reset') {
      await ready;
      const fid = receiver.fid;
      storage?.close();
      if (mode === 'opfs') {
        storage = new OpfsStorage();
        receiver = new Receiver({ store: storage, sink: storage, checkSpace: enoughStorage });
        if (msg.discard && fid) await pruneTransfers(null);
      } else {
        receiver = memoryReceiver();
      }
      unsupportedVersion = null;
      badManifest = null;
      passwordResult = null;
      passwordIgnored = false;
      colour = newColourState();
      lastResult = null;
      qrVisible = false;
      counters.frames = 0;
      counters.decoded = 0;
      report(true);
    }
  } catch (error) {
    postMessage({ type: 'error', message: String(error?.message || error) });
    if (msg.type === 'frame') postMessage({ type: 'idle' });
  }
};

