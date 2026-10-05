import { useEffect } from 'react';
import { navigate } from './router.jsx';

// Installed app: press the current section in the bottom bar and drag sideways to switch sections.
// A tap still works as before; the gesture starts only after the finger has moved a little.
// Off in the Simple and Accessible themes (`enabled` is false there) and wherever the bar is not a
// horizontal strip of buttons (the side rail on wide screens).
const START_DISTANCE = 10; // px of horizontal movement before a press becomes a drag

export default function useNavDrag(navRef, enabled) {
  useEffect(() => {
    const nav = navRef.current;
    if (!enabled || !nav) return undefined;

    let drag = null;
    let swallowClick = false;

    const links = () => [...nav.querySelectorAll('a')].filter((a) => a.offsetParent !== null);
    const linkAt = (x) => {
      const all = links();
      let best = null;
      let bestDistance = Infinity;
      for (const a of all) {
        const r = a.getBoundingClientRect();
        const distance = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        if (distance < bestDistance) {
          best = a;
          bestDistance = distance;
        }
      }
      return best;
    };
    const mark = (target) => {
      for (const a of links()) a.classList.toggle('drag-target', a === target);
    };
    const finish = () => {
      if (!drag) return;
      nav.classList.remove('dragging');
      mark(null);
      try {
        nav.releasePointerCapture(drag.id);
      } catch {
        // the pointer is already gone
      }
      drag = null;
    };

    const onDown = (e) => {
      if (e.button > 0 || e.pointerType === 'mouse') return;
      if (getComputedStyle(nav).flexDirection === 'column') return; // the side rail on wide screens
      const link = e.target instanceof Element ? e.target.closest('a.active') : null;
      if (!link || !nav.contains(link)) return;
      swallowClick = false;
      drag = { id: e.pointerId, x0: e.clientX, link, started: false };
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.started) {
        if (Math.abs(e.clientX - drag.x0) < START_DISTANCE) return;
        drag.started = true;
        nav.classList.add('dragging');
        try {
          nav.setPointerCapture(e.pointerId);
        } catch {
          // capture is a nicety: the gesture still follows the pointer events it receives
        }
        navigator.vibrate?.(8);
      }
      mark(linkAt(e.clientX));
    };
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const wasDrag = drag.started;
      const target = wasDrag ? linkAt(e.clientX) : null;
      const from = drag.link;
      finish();
      if (!wasDrag) return;
      swallowClick = true; // the click that follows a drag must not open the link under the finger
      setTimeout(() => {
        swallowClick = false;
      }, 400);
      if (target && target !== from) {
        const to = target.getAttribute('href');
        if (to) navigate(to);
      }
    };
    const onClick = (e) => {
      if (!swallowClick) return;
      e.preventDefault();
      e.stopPropagation();
    };

    nav.addEventListener('pointerdown', onDown);
    nav.addEventListener('pointermove', onMove);
    nav.addEventListener('pointerup', onUp);
    nav.addEventListener('pointercancel', finish);
    nav.addEventListener('click', onClick, true);
    return () => {
      finish();
      nav.removeEventListener('pointerdown', onDown);
      nav.removeEventListener('pointermove', onMove);
      nav.removeEventListener('pointerup', onUp);
      nav.removeEventListener('pointercancel', finish);
      nav.removeEventListener('click', onClick, true);
    };
  }, [navRef, enabled]);
}
