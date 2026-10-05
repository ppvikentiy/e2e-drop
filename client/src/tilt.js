import { isStandalone } from './pwa.js';
import { getTheme, isStill } from './theme.js';

// Sheen on buttons and panels that follows how the device is held. The CSS reads --tilt-x / --tilt-y
// (-1..1) from <html>. Phones feed them from the orientation sensor; where there is none (a desktop),
// the pointer position stands in. Nothing runs in the still themes or with reduced motion.

const root = document.documentElement;
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const DENIED_KEY = 'vd-tilt-denied';
const EASE = 0.18;
const NEUTRAL_BETA = 40; // a phone held in the hand is tilted back about this much

let target = { x: 0, y: 0 };
let current = { x: 0, y: 0 };
let frame = 0;
let sensorSeen = false;

const clamp = (v) => Math.max(-1, Math.min(1, v));
const active = () => !REDUCED?.matches && !isStill(getTheme()) && document.visibilityState === 'visible';

function render() {
  frame = 0;
  current.x += (target.x - current.x) * EASE;
  current.y += (target.y - current.y) * EASE;
  root.style.setProperty('--tilt-x', current.x.toFixed(3));
  root.style.setProperty('--tilt-y', current.y.toFixed(3));
  if (Math.abs(target.x - current.x) > 0.004 || Math.abs(target.y - current.y) > 0.004) schedule();
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(render);
}

function onOrientation(event) {
  if (event.gamma == null || event.beta == null) return;
  sensorSeen = true;
  if (!active()) return;
  const gx = clamp(event.gamma / 40);
  const gy = clamp((event.beta - NEUTRAL_BETA) / 40);
  // the sensor axes follow the device, the page follows the screen
  const angle = ((screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
  if (angle === 90) target = { x: gy, y: -gx };
  else if (angle === 180) target = { x: -gx, y: -gy };
  else if (angle === 270) target = { x: -gy, y: gx };
  else target = { x: gx, y: gy };
  schedule();
}

function onPointer(event) {
  if (sensorSeen || event.pointerType === 'touch' || !active()) return;
  target = { x: clamp((event.clientX / window.innerWidth) * 2 - 1), y: clamp((event.clientY / window.innerHeight) * 2 - 1) };
  schedule();
}

function listenForSensor() {
  window.addEventListener('deviceorientation', onOrientation, { passive: true });
}

/** iOS asks permission, and only inside a tap. Everything else just listens. */
export function startTilt() {
  // The sheen exists only in the installed app on a touch device.
  if (!isStandalone() || !window.matchMedia?.('(pointer: coarse)').matches) return;
  const Orientation = window.DeviceOrientationEvent;
  window.addEventListener('pointermove', onPointer, { passive: true });
  if (!Orientation) return;
  if (typeof Orientation.requestPermission !== 'function') {
    listenForSensor();
    return;
  }
  let denied = false;
  try {
    denied = sessionStorage.getItem(DENIED_KEY) === '1';
  } catch {
    // ignore: asking once per page load is fine
  }
  if (denied) return;
  const ask = async () => {
    window.removeEventListener('click', ask, true);
    if (!active()) {
      window.addEventListener('click', ask, true); // ask later, from a tap made in a theme that uses it
      return;
    }
    try {
      if ((await Orientation.requestPermission()) === 'granted') {
        listenForSensor();
        return;
      }
    } catch {
      // not allowed here: fall through and remember
    }
    try {
      sessionStorage.setItem(DENIED_KEY, '1');
    } catch {
      // ignore
    }
  };
  window.addEventListener('click', ask, true);
}
