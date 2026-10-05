// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrame, encodeDataFrame, encodeManifestBody, decodeManifestBody, buildDegreeTable, planSegments, segmentGeometry,
  MODE_RAW, MODE_GZIP, MAX_FILE_SIZE, MAX_SEGMENTS, VERSION, TYPE_CALIBRATION, encodeCalibrationFrame,
} from '../src/index.js';

const fileId = Uint8Array.from([1, 2, 3, 4, 5, 6]);

test('data frame roundtrip and verdicts', () => {
  assert.equal(VERSION, 2);
  const payload = Uint8Array.from({ length: 40 }, (_, i) => i);
  const f = encodeDataFrame({ fileId, segment: 513, index: 0xfedcba98, payload });
  const p = parseFrame(f);
  assert.equal(p.verdict, 'ok');
  assert.equal(p.segment, 513);
  assert.equal(p.index, 0xfedcba98);
  assert.deepEqual([...p.payload], [...payload]);

  const bad = f.slice();
  bad[20] ^= 1;
  assert.equal(parseFrame(bad).verdict, 'corrupt');
  assert.equal(parseFrame(new TextEncoder().encode('https://example.org')).verdict, 'foreign');
  assert.equal(parseFrame(new Uint8Array(0)).verdict, 'foreign');
  // A version 1 sender (old app) is recognised and reported, not mistaken for noise.
  const v1 = f.slice();
  v1[2] = 1;
  assert.deepEqual(parseFrame(v1), { verdict: 'unsupported-version', version: 1 });
  assert.equal(parseFrame(f.subarray(0, 10)).verdict, 'corrupt');

  const cal = encodeCalibrationFrame({ fileId, primary: 2 });
  assert.equal(cal.length, 13);
  assert.deepEqual(parseFrame(cal), { verdict: 'ok', type: TYPE_CALIBRATION, fileId, primary: 2 });
  const padded = encodeCalibrationFrame({ fileId, primary: 1, length: 300 });
  assert.equal(padded.length, 300);
  assert.deepEqual(parseFrame(padded), { verdict: 'ok', type: TYPE_CALIBRATION, fileId, primary: 1 });
  const badPrimary = encodeCalibrationFrame({ fileId, primary: 3 });
  assert.equal(parseFrame(badPrimary).verdict, 'corrupt');
});

function sampleManifest() {
  const blockLen = 100;
  const { rawChunk, segmentCount } = planSegments(250000, blockLen, 100);
  const K = 100;
  const segments = Array.from({ length: segmentCount }, (_, s) => {
    const raw = Math.min(rawChunk, 250000 - s * rawChunk);
    // every other segment "compressed" to a third
    return s % 2 ? { storedLen: Math.ceil(raw / 3), mode: MODE_GZIP, hash: new Uint8Array(32).fill(s) } : { storedLen: raw, mode: MODE_RAW, hash: new Uint8Array(32).fill(s) };
  });
  return { blockLen, K, rawChunk, fileSize: 250000, table: buildDegreeTable(K), name: 'файл.bin', mime: 'application/octet-stream', segments };
}

test('manifest roundtrip and validation', () => {
  const m = sampleManifest();
  const body = encodeManifestBody(m);
  const d = decodeManifestBody(body);
  assert.equal(d.name, 'файл.bin');
  assert.equal(d.fileSize, 250000);
  assert.equal(d.rawChunk, m.rawChunk);
  assert.equal(d.segmentCount, m.segments.length);
  assert.deepEqual(d.segments.map((s) => s.mode), m.segments.map((s) => s.mode));
  assert.deepEqual(d.segments[1].hash, m.segments[1].hash);

  assert.throws(() => decodeManifestBody(body.subarray(0, body.length - 1)), /segment list/);
  const flagged = body.slice();
  flagged[1] = 1;
  assert.throws(() => decodeManifestBody(flagged), /flags/);
  const v1 = body.slice();
  v1[0] = 1;
  assert.throws(() => decodeManifestBody(v1), /version/);
  assert.throws(() => decodeManifestBody(body, { maxFileSize: 1000 }), /size/);

  // A raw segment must be exactly its chunk; a stored length beyond K blocks is refused.
  const wrongRaw = { ...m, segments: m.segments.map((s, i) => (i === 0 ? { ...s, storedLen: s.storedLen - 1 } : s)) };
  assert.throws(() => decodeManifestBody(encodeManifestBody(wrongRaw)), /raw length/);
  const tooLong = { ...m, segments: m.segments.map((s, i) => (i === 1 ? { ...s, storedLen: m.K * m.blockLen + 1 } : s)) };
  assert.throws(() => decodeManifestBody(encodeManifestBody(tooLong)), /stored length/);
  const badMode = { ...m, segments: m.segments.map((s, i) => (i === 1 ? { ...s, mode: 7 } : s)) };
  assert.throws(() => decodeManifestBody(encodeManifestBody(badMode)), /mode/);
});

test('segment plan covers the file in raw chunks that fit K blocks', () => {
  for (const [size, bl, kmax] of [[1, 100, 2048], [150e6, 2935, 2048], [MAX_FILE_SIZE, 2935, 2048], [999999, 77, 64], [2048 * 100 + 1, 100, 2048]]) {
    const { rawChunk, segmentCount } = planSegments(size, bl, kmax);
    assert.ok(Math.ceil(rawChunk / bl) <= kmax, 'an incompressible chunk still fits');
    assert.ok(rawChunk <= kmax * bl - 16, 'room for an authentication tag');
    assert.ok(segmentCount <= MAX_SEGMENTS);
    const segments = Array.from({ length: segmentCount }, (_, s) => ({ storedLen: Math.min(rawChunk, size - s * rawChunk), mode: MODE_RAW, hash: new Uint8Array(32) }));
    let covered = 0;
    for (let s = 0; s < segmentCount; s++) {
      const g = segmentGeometry({ blockLen: bl, fileSize: size, rawChunk, segments }, s);
      assert.equal(g.start, covered);
      assert.ok(g.K <= kmax);
      covered += g.length;
    }
    assert.equal(covered, size);
  }
});
