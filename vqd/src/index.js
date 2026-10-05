// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

export { Rng, fmix32, symbolSeed } from './rng.js';
export { crc16 } from './crc16.js';
export { buildDegreeTable, isValidDegreeTable, sampleDegree, segmentDegreeTable } from './degree.js';
export { SegmentDecoder, encodeSymbol, symbolNeighbors } from './fountain.js';
export {
  DATA_OVERHEAD,
  MANIFEST_OVERHEAD,
  MAX_FILE_SIZE,
  MAX_SEGMENTS,
  MODE_GZIP,
  MODE_RAW,
  TYPE_CALIBRATION,
  TYPE_DATA,
  TYPE_MANIFEST,
  VERSION,
  blockLenFor,
  decodeManifestBody,
  encodeCalibrationFrame,
  encodeDataFrame,
  encodeManifestBody,
  encodeManifestFrame,
  fileId32,
  manifestFrames,
  parseFrame,
  planSegments,
  segmentGeometry,
} from './format.js';
export { MIN_SAVING, gunzip, gzip, packSegment } from './compress.js';
export { createSender, defaultQuota, defaultSha256, fromBlob, fromBytes } from './sender.js';
export { MemorySegmentSink, MemorySymbolStore, Receiver } from './receiver.js';
export { DEFAULT_CALIBRATE_EVERY, createScreenStream } from './screen.js';
export { MAX_CONDITION, RAW_MATRIX, colourMatrix, maxChannel, measureCalibration, separateChannels } from './colour.js';
export { DEFAULT_ITERATIONS, MIN_PASSWORD_LENGTH, passwordLength } from './crypto.js';
export { FLAG_ENCRYPTED, MAX_ITERATIONS, MIN_ITERATIONS, TAG_BYTES } from './format.js';
