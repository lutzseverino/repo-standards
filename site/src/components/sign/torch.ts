// The torch: a hand torch held at the viewer's eye, in front
// of the centre of the screen, aimed at the pointer. Off-centre, its cone
// meets the page at a slant: the spot stretches away from the centre, its near
// side is brighter and it dims. The page starts floodlit; the light gathers to
// the pointer once one moves, follows keyboard focus, and floods again when
// the pointer leaves. With prefers-contrast: more it stays floodlit. A finger
// never aims it: on a touch-first screen the beam rests fixed to the screen
// instead of flooding, and the page scrolls through it (rig.ts). By day
// there is no torch: the same motion drives the sun's glint on the sheeting
// (rig.ts), which rests where it mirrors the sun to an eye at the centre.
//
// The rig (rig.ts) measures and draws the light; the torch moves it.
// Performance: positions are measured once into cached origins (`data-lo`)
// and refreshed only when layout changes. Each frame writes the beam's custom
// properties only to the elements that read them: the lit copy of each plate
// the beam reaches, in that plate's own coordinates, and the lit edges of
// shadcn components. Writing them to the root would restyle the whole page
// every frame. Plates far from the beam or off screen switch their lit copy
// off and get no writes. The page-wide layers are window-sized and paint
// their disc where the torch tells them; see light.css for why they never
// scale.
import { useEffect } from "react";
import type { Theme } from "@/lib/theme";
import { lightRig } from "./rig";

/** Components that move lit elements announce it with this event. */
export const MEASURE_EVENT = "light:measure";
export const announceLayout = () =>
  window.dispatchEvent(new Event(MEASURE_EVENT));

/** Runs the torch while mounted. The light restarts when the theme changes. */
export function useTorch(theme: Theme | null) {
  useEffect(() => {
    if (!theme) return;
    const rig = lightRig();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const contrast = window.matchMedia("(prefers-contrast: more)").matches;

    const observed = new WeakSet<Element>();
    let ro: ResizeObserver | null = null;
    let plates: HTMLElement[] = [];

    const measure = () => {
      plates = rig.measure();
      // a plate that changes size later must be measured again
      for (const el of plates) {
        if (observed.has(el)) continue;
        observed.add(el);
        ro?.observe(el);
      }
      apply();
    };
    let measureQueued = false;
    const remeasure = () => {
      if (measureQueued) return;
      measureQueued = true;
      requestAnimationFrame(() => {
        measureQueued = false;
        measure();
      });
    };

    // the page was drawn floodlit before it hydrated (rig.ts): start there
    const start = rig.start();
    const cur = { ...start };
    const tgt = { ...start };
    const vel = { x: 0, y: 0 };
    let engaged = false;
    // the pointer while the entrance holds
    let pointer = { x: start.x, y: start.y };
    // the beam covers the whole window: on entry, after the pointer leaves,
    // and always with prefers-contrast: more
    let flooded = true;
    let engageTimer = 0;
    let widenTimer = 0;
    let raf = 0;
    let running = false;
    let last = 0;

    const apply = () => rig.apply(cur);

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      if (reduced) {
        cur.x = tgt.x;
        cur.y = tgt.y;
        cur.r = tgt.r;
      } else {
        // a light, slightly underdamped spring: a torch with some weight
        const k = 110;
        const c = 2 * Math.sqrt(k) * 0.82;
        vel.x += (k * (tgt.x - cur.x) - c * vel.x) * dt;
        vel.y += (k * (tgt.y - cur.y) - c * vel.y) * dt;
        cur.x += vel.x * dt;
        cur.y += vel.y * dt;
        cur.r += (tgt.r - cur.r) * (1 - Math.exp(-dt * 3.5));
      }
      apply();
      const settled =
        Math.abs(tgt.x - cur.x) < 0.3 &&
        Math.abs(tgt.y - cur.y) < 0.3 &&
        Math.hypot(vel.x, vel.y) < 0.5 &&
        Math.abs(tgt.r - cur.r) < 1;
      if (settled) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(step);
    };
    const kick = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(step);
    };

    /** Aims the light for an eye at a point; focus is lit where it is. */
    const aim = (x: number, y: number, at = rig.toward(x, y)) => {
      tgt.x = at.x;
      tgt.y = at.y;
      tgt.r = rig.radius();
      flooded = contrast;
      kick();
    };
    // by day the sun returns to its resting glint, and on a touch-first
    // screen the beam to its fixed place
    const flood = () => {
      if (rig.day() || rig.touchFirst()) {
        const rest = rig.start();
        tgt.x = rest.x;
        tgt.y = rest.y;
      }
      tgt.r = rig.start().r;
      flooded = true;
      kick();
    };

    // a tap focuses without the keyboard, and the light stays where it is;
    // on a touch-first screen a finger returns it to its fixed place after
    // keyboard focus aimed it
    let touched = false;
    const onDown = (e: PointerEvent) => {
      touched = e.pointerType === "touch";
      if (touched && rig.touchFirst()) flood();
    };
    const onKey = () => {
      touched = false;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      window.clearTimeout(widenTimer);
      if (!engaged) {
        // hold the floodlit entrance a moment, then gather to the pointer
        if (!engageTimer) {
          engageTimer = window.setTimeout(() => {
            engaged = true;
            aim(pointer.x, pointer.y);
          }, 900);
        }
        pointer = { x: e.clientX, y: e.clientY };
        return;
      }
      aim(e.clientX, e.clientY);
    };
    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget === null) flood();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "pen") {
        widenTimer = window.setTimeout(flood, 1500);
      }
    };
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (touched || !el || !el.matches(":focus-visible")) return;
      const r = el.getBoundingClientRect();
      engaged = true;
      const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      aim(at.x, at.y, at);
    };
    const onScroll = () => apply();
    const touchFirst = window.matchMedia(rig.TOUCH_FIRST);
    // a flood sized for a smaller window would show its edge in a larger one,
    // and a fixed beam belongs to the window's new width
    const onResize = () => {
      if (flooded) {
        const entry = rig.start();
        tgt.r = cur.r = entry.r;
        if (!engaged || rig.touchFirst()) {
          tgt.x = cur.x = entry.x;
          tgt.y = cur.y = entry.y;
        }
      }
      remeasure();
    };

    // the inline rest script leaves the plates to the torch from here
    document.documentElement.setAttribute("data-torch", "");
    ro = new ResizeObserver(remeasure);
    ro.observe(document.body);
    measure();
    void document.fonts.ready.then(remeasure);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    touchFirst.addEventListener("change", flood);
    document.addEventListener("mouseout", onLeave);
    document.addEventListener("focusin", onFocus);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener(MEASURE_EVENT, remeasure);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.clearTimeout(engageTimer);
      window.clearTimeout(widenTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      touchFirst.removeEventListener("change", flood);
      document.removeEventListener("mouseout", onLeave);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener(MEASURE_EVENT, remeasure);
      for (const el of plates) el.classList.remove("lit-off");
      document.documentElement.removeAttribute("data-torch");
    };
  }, [theme]);
}
