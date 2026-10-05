// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import { TYPE_DATA, encodeCalibrationFrame } from './format.js';

export const DEFAULT_CALIBRATE_EVERY = 60;
const EARLY_REPEAT = 15;

/**
 * Groups a sender's frames into screens (informative, not part of the wire format).
 *
 * Mono: one frame per screen, drawn black on white.
 * Colour: one screen carries three data frames, one per display channel (red, green, blue): a module is
 * dark in a channel when it is dark in that channel's frame. Everything that is not a data frame is
 * shown alone in black and white, so it reads in any mode. The stream opens with three calibration
 * screens (a QR in pure red, green, blue on black) and repeats them every `calibrateEvery` screens, so a
 * receiver that joins late, or whose lighting changes, can measure how its camera sees this display.
 *
 * nextScreen() resolves to { kind: 'mono' | 'colour' | 'calibration', frames, primary? }:
 *   mono: frames = [frame]; colour: frames = [red, green, blue]; calibration: frames = [frame], primary 0..2.
 */
export function createScreenStream(sender, { colour = false, calibrateEvery = DEFAULT_CALIBRATE_EVERY } = {}) {
  const pending = [];
  let screens = 0;
  let calibration = colour ? 0 : -1; // index of the next calibration primary, or -1 when none is due

  const take = async () => pending.shift() ?? sender.nextFrame();
  const isData = (f) => f[3] === TYPE_DATA;

  return {
    get colour() {
      return colour;
    },
    async nextScreen() {
      screens++;
      if (!colour) return { kind: 'mono', frames: [await sender.nextFrame()] };
      if (calibration >= 0) {
        const primary = calibration;
        calibration = primary === 2 ? -1 : primary + 1;
        const frame = encodeCalibrationFrame({ fileId: sender.fileId, primary, length: sender.frameBytes });
        return { kind: 'calibration', primary, frames: [frame] };
      }
      // An early repeat helps a receiver that missed one of the opening calibration screens.
      if (screens % calibrateEvery === 0 || screens === EARLY_REPEAT) calibration = 0;
      const first = await take();
      if (!isData(first)) return { kind: 'mono', frames: [first] };
      const frames = [first];
      while (frames.length < 3) {
        const f = await take();
        if (!isData(f)) {
          pending.push(f); // shown alone on the next screen
          break;
        }
        frames.push(f);
      }
      // A short group repeats its frames: the receiver drops duplicates, and every channel stays a valid QR.
      for (let i = frames.length; i < 3; i++) frames.push(frames[i - 1]);
      return { kind: 'colour', frames };
    },
  };
}
