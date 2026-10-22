// The torch: a hand torch held at the viewer's eye, in front
// of the centre of the screen, aimed at the pointer. Off-centre, its cone
// meets the page at a slant: the spot stretches away from the centre, its near
// side is brighter and it dims. The page starts floodlit; the light gathers to
// the pointer once one moves, follows keyboard focus, and floods again when
// the pointer leaves. With prefers-contrast: more it stays floodlit. The same
// torch works in both themes; only the palette under it changes.
//
// Performance: positions are measured once into cached origins (`data-lo`)
// and refreshed only when layout changes. Each frame writes a handful of
// page-level custom properties; CSS derives every plate's local coordinates.
// Plates far from the beam or off screen switch their lit copy off.
import { useEffect } from "react";
import type { Theme } from "@/lib/theme";

/** The beam's radius where it meets the screen head-on, in CSS pixels. */
const RADIUS = 760;
/** Components that move lit elements announce it with this event. */
export const MEASURE_EVENT = "light:measure";
export const announceLayout = () =>
  window.dispatchEvent(new Event(MEASURE_EVENT));

/** Distance from the eye to the screen, in CSS pixels. */
export const EYE = 1100;

type Origin = {
  el: HTMLElement;
  x: number;
  y: number;
  w: number;
  h: number;
  lit: boolean;
  off: boolean;
};
type Rail = { x: number; y: number; grads: SVGRadialGradientElement[] };

/** Runs the torch while mounted. The light restarts when the theme changes. */
export function useTorch(theme: Theme | null) {
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const contrast = window.matchMedia("(prefers-contrast: more)").matches;
    const full = () => Math.hypot(window.innerWidth, window.innerHeight) * 1.6;
    const narrow = () => (contrast ? full() : RADIUS);

    let origins: Origin[] = [];
    let rails: Rail[] = [];
    // page-wide layers: discs of diameter data-k × the beam radius, masked
    // to start where the list begins (--lit-top)
    let layers: HTMLElement[] = [];
    let litTop = 0;
    const observed = new WeakSet<Element>();
    let ro: ResizeObserver | null = null;
    let minor = RADIUS;
    let major = RADIUS;

    const measure = () => {
      const sx = window.scrollX;
      const sy = window.scrollY;
      // read everything first, then write, so layout is computed once
      const next = [...document.querySelectorAll<HTMLElement>("[data-lo]")].map(
        (el) => {
          const r = el.getBoundingClientRect();
          return {
            el,
            x: r.left + sx,
            y: r.top + sy,
            // the exact layout size: offsetWidth rounds, and a lit copy half a
            // pixel narrower than its plate can wrap a legend differently
            ...layoutSize(el),
            lit: el.querySelector(":scope > .lit-rot") !== null,
            off: false,
          };
        },
      );
      const nextRails = [
        ...document.querySelectorAll<SVGSVGElement>("svg.rail-svg"),
      ].map((svg) => {
        const r = svg.getBoundingClientRect();
        return {
          x: r.left + sx,
          y: r.top + sy,
          grads: [...svg.querySelectorAll("radialGradient")],
        };
      });
      for (const o of next) {
        const s = o.el.style;
        s.setProperty("--ox", `${o.x.toFixed(1)}px`);
        s.setProperty("--oy", `${o.y.toFixed(1)}px`);
        if (o.lit) {
          s.setProperty("--W", `${o.w.toFixed(2)}px`);
          s.setProperty("--H", `${o.h.toFixed(2)}px`);
          s.setProperty("--S", `${Math.hypot(o.w, o.h).toFixed(1)}px`);
          o.el.classList.remove("lit-off");
        }
      }
      origins = next;
      rails = nextRails;
      layers = [
        ...document.querySelectorAll<HTMLElement>("[data-light-layer]"),
      ];
      const region = document.querySelector<HTMLElement>(".lit-text");
      litTop = region ? region.getBoundingClientRect().top + sy : 0;
      // a plate that changes size later must be measured again
      for (const o of next) {
        if (observed.has(o.el)) continue;
        observed.add(o.el);
        ro?.observe(o.el);
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

    const start = {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.38,
      r: full(),
    };
    const cur = { ...start };
    const tgt = { ...start };
    const vel = { x: 0, y: 0 };
    let engaged = false;
    let engageTimer = 0;
    let widenTimer = 0;
    let raf = 0;
    let running = false;
    let last = 0;

    function apply() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sx = window.scrollX;
      const sy = window.scrollY;
      const dx = cur.x - vw / 2;
      const dy = cur.y - vh / 2;
      const slant = Math.atan(Math.hypot(dx, dy) / EYE);
      const cos = Math.cos(slant);
      const angle = Math.atan2(dy, dx);
      minor = cur.r / cos;
      major = cur.r / (cos * cos);
      const s = root.style;
      s.setProperty("--px", `${cur.x.toFixed(1)}px`);
      s.setProperty("--py", `${cur.y.toFixed(1)}px`);
      s.setProperty("--pxp", `${(cur.x + sx).toFixed(1)}px`);
      s.setProperty("--pyp", `${(cur.y + sy).toFixed(1)}px`);
      s.setProperty("--gcx", `${(vw / 2 + sx).toFixed(1)}px`);
      s.setProperty("--gcy", `${(vh / 2 + sy).toFixed(1)}px`);
      s.setProperty("--br", `${cur.r.toFixed(0)}px`);
      s.setProperty("--brx", `${major.toFixed(0)}px`);
      s.setProperty("--bry", `${minor.toFixed(0)}px`);
      s.setProperty("--cosA", Math.cos(angle).toFixed(4));
      s.setProperty("--sinA", Math.sin(angle).toFixed(4));
      s.setProperty("--bang", `${angle.toFixed(4)}rad`);
      s.setProperty("--gain", Math.max(0.6, cos * cos).toFixed(3));
      s.setProperty(
        "--hoff",
        `${(cur.r * 0.3 * Math.sin(slant)).toFixed(1)}px`,
      );

      // the page-wide layers are fixed-size discs moved by the compositor,
      // so a frame repaints none of them
      root.style.setProperty("--lit-top", `${(litTop - sy).toFixed(1)}px`);
      for (const layer of layers) {
        const disc = layer.firstElementChild as HTMLElement | null;
        if (!disc) continue;
        const d = Math.round(minor * Number(layer.dataset.lightLayer));
        disc.style.width = `${d}px`;
        disc.style.height = `${d}px`;
        disc.style.transform = `translate3d(${(cur.x - d / 2).toFixed(1)}px, ${(cur.y - d / 2).toFixed(1)}px, 0)`;
      }

      const ax = cur.x + sx;
      const ay = cur.y + sy;
      for (const rail of rails) {
        for (const g of rail.grads) {
          g.setAttribute("cx", (ax - rail.x).toFixed(1));
          g.setAttribute("cy", (ay - rail.y).toFixed(1));
          g.setAttribute("r", (minor * Number(g.dataset.k ?? "1")).toFixed(0));
        }
      }

      // switch off lit copies that the beam cannot reach or that are off screen
      for (const o of origins) {
        if (!o.lit) continue;
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        const far =
          Math.hypot(cx - ax, cy - ay) - Math.hypot(o.w, o.h) / 2 > major;
        const hidden = o.y > sy + vh || o.y + o.h < sy;
        const off = far || hidden;
        if (off !== o.off) {
          o.off = off;
          o.el.classList.toggle("lit-off", off);
        }
      }
    }

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

    const aim = (x: number, y: number) => {
      tgt.x = x;
      tgt.y = y;
      tgt.r = narrow();
      kick();
    };
    const flood = () => {
      tgt.r = full();
      kick();
    };

    const onMove = (e: PointerEvent) => {
      window.clearTimeout(widenTimer);
      if (!engaged) {
        // hold the floodlit entrance a moment, then gather to the pointer
        if (!engageTimer) {
          engageTimer = window.setTimeout(() => {
            engaged = true;
            aim(tgt.x, tgt.y);
          }, 900);
        }
        tgt.x = e.clientX;
        tgt.y = e.clientY;
        return;
      }
      aim(e.clientX, e.clientY);
    };
    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget === null) flood();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") {
        widenTimer = window.setTimeout(flood, 1500);
      }
    };
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !el.matches(":focus-visible")) return;
      const r = el.getBoundingClientRect();
      engaged = true;
      aim(r.left + r.width / 2, r.top + r.height / 2);
    };
    const onScroll = () => apply();

    ro = new ResizeObserver(remeasure);
    ro.observe(document.body);
    measure();
    void document.fonts.ready.then(remeasure);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    document.addEventListener("mouseout", onLeave);
    document.addEventListener("focusin", onFocus);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", remeasure);
    window.addEventListener(MEASURE_EVENT, remeasure);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.clearTimeout(engageTimer);
      window.clearTimeout(widenTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("mouseout", onLeave);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener(MEASURE_EVENT, remeasure);
      for (const o of origins) o.el.classList.remove("lit-off");
    };
  }, [theme]);
}

/** Layout size, unaffected by transforms such as the sign's tilt. */
function layoutSize(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return { w: parseFloat(cs.width), h: parseFloat(cs.height) };
}
