// The light's geometry: where the torch's beam, or by day the sun's glint,
// and the sign's tilt land on the page. The torch (torch.ts) and the tilt (assembly.tsx) move them; the rig
// measures the lit elements and writes the custom properties they read.
//
// The page also runs `lightRig` as an inline script right after the markup,
// before the first paint (`restScript`), so the page is drawn in its resting
// state, sign at its pose and lights on, instead of flat and dark until the
// page hydrates. It fits the list's plate names first (fit-name.ts), since
// they set the plates' sizes, and sinks the posts behind the rail
// (posts.ts). Hydration then writes the same values again.
// The inline copy is the function's source, so `lightRig` must reference
// nothing outside its own body.
import { fitName } from "./fit-name";
import { sinkPosts } from "./posts";
import { HERO_RAIL_BASE, HERO_RAIL_WIDTH, heroBend } from "./rail";

export type Beam = { x: number; y: number; r: number };
export type Pose = { x: number; y: number };

export function lightRig() {
  /** The beam's radius where it meets the screen head-on, in CSS pixels. */
  const RADIUS = 760;
  /** By day there is no torch. The sun stands behind the viewer, up and to
   * the left, and glints on the glossy sheeting where it mirrors the sun to
   * the eye: a spot of this radius that moves at half the eye's speed,
   * offset toward the sun. */
  const SUN_RADIUS = 460;
  const SUN_OFFSET = { x: -120, y: -90 };
  /** A touch-first device has no pointer to aim with, so at night the beam
   * is fixed to the screen, on the sign as the page opens, and the page
   * scrolls through it. */
  const TOUCH_FIRST = "(hover: none) and (pointer: coarse)";
  /** Distance from the eye to the screen, in CSS pixels. */
  const EYE = 1100;
  /** Seen from slightly below and to the left: the angle the sign rests at
   * on entry and whenever the pointer is gone. */
  const POSE = { x: 4, y: -9 };
  /** The shadcn components whose edges light.css lights, by their data-slot. */
  const LIT_EDGES =
    '[data-slot="input-group"], [data-slot="toggle-group-item"]';

  type Origin = {
    el: HTMLElement;
    /** The lit copy's frame, which reads the beam, if the plate has one. */
    rot: HTMLElement | null;
    x: number;
    y: number;
    w: number;
    h: number;
    off: boolean;
  };
  type Rail = { x: number; y: number; grads: SVGRadialGradientElement[] };

  let origins: Origin[] = [];
  let rails: Rail[] = [];
  // page-wide layers: discs of diameter data-light-layer × the beam radius
  let layers: HTMLElement[] = [];
  let edges: HTMLElement[] = [];

  const reduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const contrast = () => window.matchMedia("(prefers-contrast: more)").matches;
  const day = () => !document.documentElement.classList.contains("dark");
  const touchFirst = () => window.matchMedia(TOUCH_FIRST).matches;
  /** The beam fixed to a touch-first screen: a little wider than the
   * screen, so the whole sign sits inside it as the page opens. It is placed
   * by the width and the root's client height, the small viewport, neither
   * of which changes as the browser's toolbar shows and hides; the window's
   * inner height does. */
  const fixed = (): Beam => ({
    x: window.innerWidth / 2,
    y: Math.min(
      window.innerWidth * 0.9,
      document.documentElement.clientHeight * 0.45,
    ),
    r: window.innerWidth * 1.2,
  });
  /** A beam wide enough to flood the whole window. */
  const full = () => Math.hypot(window.innerWidth, window.innerHeight) * 1.6;
  /** The light's radius once it follows the eye: the sun's glint by day,
   * the torch's beam at night, and a flood with prefers-contrast: more. */
  const radius = () =>
    contrast()
      ? full()
      : day()
        ? SUN_RADIUS
        : touchFirst()
          ? fixed().r
          : RADIUS;
  /** Where the light lands for an eye at a point in the window: the torch
   * aims there, and the sun glints halfway to the window's centre. */
  const toward = (x: number, y: number) => {
    if (!day()) return { x, y };
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return {
      x: cx + (x - cx) * 0.5 + SUN_OFFSET.x,
      y: cy + (y - cy) * 0.5 + SUN_OFFSET.y,
    };
  };
  /** The light at rest, before the pointer moves and after it leaves: at
   * night the torch floods the page, or on a touch-first screen it is the
   * fixed beam, and by day the sun glints for an eye at the window's
   * centre. */
  const start = (): Beam => {
    if (day())
      return {
        ...toward(window.innerWidth / 2, window.innerHeight / 2),
        r: contrast() ? full() : SUN_RADIUS,
      };
    if (touchFirst() && !contrast()) return fixed();
    return {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.38,
      r: full(),
    };
  };
  /** The pose the sign rests at; it does not tilt with reduced motion. */
  const pose = (): Pose => (reduced() ? { x: 0, y: 0 } : { ...POSE });

  /** Layout size, unaffected by transforms such as the sign's tilt. */
  const layoutSize = (el: HTMLElement) => {
    const cs = getComputedStyle(el);
    return { w: parseFloat(cs.width), h: parseFloat(cs.height) };
  };

  /** Measures the lit elements' positions into cached origins and returns
   * the plates, whose later size changes need a new measurement. */
  function measure() {
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
          // the layout size, for how far the beam reaches
          ...layoutSize(el),
          rot: el.querySelector<HTMLElement>(":scope > .lit-copy"),
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
      if (o.rot) o.el.classList.remove("lit-off");
    }
    origins = next;
    rails = nextRails;
    layers = [...document.querySelectorAll<HTMLElement>("[data-light-layer]")];
    edges = [...document.querySelectorAll<HTMLElement>(LIT_EDGES)];
    return next.map((o) => o.el);
  }

  /** Writes the beam, aimed at a point in the window, to everything it
   * lights. */
  function apply(beam: Beam) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sx = window.scrollX;
    const sy = window.scrollY;
    const dx = beam.x - vw / 2;
    const dy = beam.y - vh / 2;
    const slant = Math.atan(Math.hypot(dx, dy) / EYE);
    const cos = Math.cos(slant);
    const angle = Math.atan2(dy, dx);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const minor = beam.r / cos;
    const major = beam.r / (cos * cos);
    // the lit copies take the footprint's extent along x and y: CSS draws no
    // rotated ellipse, and rotating the copy would move its text
    const extent = (k: number, l: number) => [
      Math.hypot(k * major * cosA, l * minor * sinA),
      Math.hypot(k * major * sinA, l * minor * cosA),
    ];
    const [ex, ey] = extent(1, 1);
    const [hx, hy] = extent(0.55, 0.6);
    // the near side's ellipse sits towards the eye, along the beam
    const near = beam.r * 0.3 * Math.sin(slant);
    const props: [string, string][] = [
      ["--br", `${beam.r.toFixed(0)}px`],
      ["--brx", `${ex.toFixed(0)}px`],
      ["--bry", `${ey.toFixed(0)}px`],
      ["--hrx", `${hx.toFixed(0)}px`],
      ["--hry", `${hy.toFixed(0)}px`],
      ["--hx", `${(near * cosA).toFixed(1)}px`],
      ["--hy", `${(near * sinA).toFixed(1)}px`],
      ["--gain", Math.max(0.6, cos * cos).toFixed(3)],
    ];

    // the edges' gradient is fixed to the viewport, so they take the aim
    // point in viewport coordinates
    const px = `${beam.x.toFixed(1)}px`;
    const py = `${beam.y.toFixed(1)}px`;
    const bry = `${minor.toFixed(0)}px`;
    for (const edge of edges) {
      edge.style.setProperty("--px", px);
      edge.style.setProperty("--py", py);
      edge.style.setProperty("--edge-r", bry);
    }

    for (const layer of layers) {
      const s = layer.style;
      s.setProperty("--disc-x", px);
      s.setProperty("--disc-y", py);
      s.setProperty(
        "--disc-r",
        `${((minor * Number(layer.dataset.lightLayer)) / 2).toFixed(0)}px`,
      );
    }

    const ax = beam.x + sx;
    const ay = beam.y + sy;
    for (const rail of rails) {
      for (const g of rail.grads) {
        g.setAttribute("cx", (ax - rail.x).toFixed(1));
        g.setAttribute("cy", (ay - rail.y).toFixed(1));
        g.setAttribute("r", (minor * Number(g.dataset.k ?? "1")).toFixed(0));
      }
    }

    // switch off lit copies that the beam cannot reach or that are off
    // screen, and light the rest in their own coordinates
    for (const o of origins) {
      if (!o.rot) continue;
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
      if (off) continue;
      // the aim point in plate coordinates
      const s = o.rot.style;
      s.setProperty("--lx", `${(ax - o.x).toFixed(1)}px`);
      s.setProperty("--ly", `${(ay - o.y).toFixed(1)}px`);
      for (const [name, value] of props) s.setProperty(name, value);
    }
  }

  /** Writes the sign's tilt to the assembly, with the post highlight and the
   * glare that follow it. */
  function tilt(el: HTMLElement, at: Pose) {
    const s = el.style;
    s.setProperty("--tilt-x", `${at.x.toFixed(2)}deg`);
    s.setProperty("--tilt-y", `${at.y.toFixed(2)}deg`);
    // the tube's highlight stripe follows the viewer round the cylinder
    s.setProperty("--post-hl", `${(38 + at.y * 4).toFixed(1)}%`);
    // glare: where the plates face the eye, in page coordinates
    const ty = (at.y * Math.PI) / 180;
    const tx = (at.x * Math.PI) / 180;
    const cx = window.innerWidth / 2 + window.scrollX;
    const cy = window.innerHeight / 2 + window.scrollY;
    s.setProperty(
      "--gxp",
      `${(cx - EYE * Math.sin(ty) * Math.cos(ty)).toFixed(1)}px`,
    );
    s.setProperty(
      "--gyp",
      `${(cy + EYE * Math.sin(tx) * Math.cos(tx)).toFixed(1)}px`,
    );
  }

  /** Draws the page at rest, before it hydrates: the sign at its pose and
   * the entrance flood. The lit shadcn components inherit their beam from the
   * root, since React would find a style on them it did not render; the
   * torch writes the same beam to each of them once it runs. */
  function rest() {
    const assembly = document.querySelector<HTMLElement>(".assembly");
    if (assembly) tilt(assembly, pose());
    measure();
    edges = [document.documentElement];
    apply(start());
  }

  return {
    day,
    touchFirst,
    TOUCH_FIRST,
    full,
    radius,
    toward,
    start,
    pose,
    measure,
    apply,
    tilt,
    rest,
  };
}

/** The inline script that draws the page at rest before its first paint. If
 * the fonts arrive before the page hydrates, the plates change size, so it
 * measures them again, unless the torch has taken over. */
export const restScript = () => `(() => {
  const fitName = ${fitName.toString()};
  const sinkPosts = ${sinkPosts.toString()};
  const heroBend = ${heroBend.toString()};
  const settle = () => {
    document.querySelectorAll(".signpost-name").forEach((el) => fitName(el));
    const assembly = document.querySelector(".assembly");
    const rail = document.querySelector("svg.hero-rail");
    if (assembly && rail)
      sinkPosts(assembly, rail, (x) => heroBend(x, ${HERO_RAIL_WIDTH}), ${HERO_RAIL_BASE});
  };
  const rig = (${lightRig.toString()})();
  settle();
  rig.rest();
  void document.fonts.ready.then(() => {
    if (document.documentElement.hasAttribute("data-torch")) return;
    settle();
    rig.rest();
  });
})();`;
