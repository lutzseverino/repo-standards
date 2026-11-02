// The light's geometry: where the torch's beam, or by day the sun's glint,
// and the sign's tilt land on the page. The torch (torch.ts) and the tilt (assembly.tsx) move them; the rig
// measures the lit elements and writes the custom properties they read.
//
// The page also runs `lightRig` as an inline script right after the markup,
// before the first paint (`restScript`), so the page is drawn in its resting
// state, sign at its pose and lights on, instead of flat and dark until the
// page hydrates. It fits the list's plate names first (fit-name.ts), since
// they set the plates' sizes, sinks the posts behind the rail and dresses
// them for the plates in front of them (posts.ts). Hydration then writes the
// same values again.
// The inline copy is the function's source, so `lightRig` must reference
// nothing outside its own body.
import { fitName } from "./fit-name";
import { dressPosts, sinkPosts } from "./posts";
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
    '.sign-page [data-slot="input-group"], .sign-page [data-slot="toggle-group-item"]';
  /** The layers inside a plate's lit copy that read the beam, where they are
   * drawn: the rainbow ring, the glints and, by day, the sun's streak. */
  const LIT_LAYERS = ".rainbow, .sign-lit-glint, .sign-lit-streak";

  type Origin = {
    el: HTMLElement;
    /** What the beam lights: a plate's lit copy, a post itself, or
     * nothing. */
    lit: HTMLElement | null;
    /** The layers in a lit copy that read the beam where they are drawn.
     * Each takes the beam itself, so a write restyles only the elements that
     * draw it. */
    inside: HTMLElement[];
    x: number;
    y: number;
    w: number;
    h: number;
    off: boolean;
  };
  type Rail = { x: number; y: number; grads: SVGRadialGradientElement[] };
  /** A face of a clamp's flange: its two axes and its centre, in px from
   * the clamp's centre, in the clamp's own space: x right, y down, z towards
   * the eye. */
  type Face = {
    el: HTMLElement;
    u: number[];
    v: number[];
    at: number[];
    shown: boolean;
  };
  type Clamp = {
    el: HTMLElement;
    band: HTMLElement | null;
    under: HTMLElement | null;
    faces: Face[];
  };
  /** The assembly and what in it reads the tilt (sign.css). */
  type Tilted = {
    el: HTMLElement;
    posts: HTMLElement[];
    tubes: HTMLElement[];
    glares: HTMLElement[];
    clamps: Clamp[];
  };

  let origins: Origin[] = [];
  let rails: Rail[] = [];
  // page-wide layers: discs of diameter data-light-layer × the beam radius
  let layers: HTMLElement[] = [];
  let edges: HTMLElement[] = [];
  /** The names the edges take the ring's centre and radius under
   * (light.css): on each edge, names only its ring reads; on the root before
   * the page hydrates, names every edge inherits. */
  let ring = ["--lit-x", "--lit-y", "--lit-r"];
  let tilted: Tilted | null = null;
  /** The window's size and scroll position, read by `look` when they can
   * change, never by the per-frame writers: the torch and the tilt write in
   * the same frame, and a read after the other's writes restyles the page
   * there and then. */
  const view = { w: 0, h: 0, sx: 0, sy: 0 };
  const look = () => {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.sx = window.scrollX;
    view.sy = window.scrollY;
  };
  look();

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
    look();
    const { sx, sy } = view;
    // what is drawn: a layer a theme or a place hides reads nothing
    const shown = (el: HTMLElement) => getComputedStyle(el).display !== "none";
    // read everything first, then write, so layout is computed once
    const next = [...document.querySelectorAll<HTMLElement>("[data-lo]")].map(
      (el) => {
        const r = el.getBoundingClientRect();
        const copy = el.querySelector<HTMLElement>(":scope > .sign-lit-copy");
        return {
          el,
          x: r.left + sx,
          y: r.top + sy,
          // the layout size, for how far the beam reaches
          ...layoutSize(el),
          // a post has no lit copy: it takes the beam itself (sign.css)
          lit: copy ?? (el.classList.contains("sign-tube") ? el : null),
          inside: copy
            ? [...copy.querySelectorAll<HTMLElement>(LIT_LAYERS)].filter(shown)
            : [],
          off: false,
        };
      },
    );
    const nextRails = [
      ...document.querySelectorAll<SVGSVGElement>("svg.sign-rail-svg"),
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
      if (o.lit) o.el.classList.remove("sign-lit-off");
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
    const { w: vw, h: vh, sx, sy } = view;
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
    const [ex, ey] = extent(1, 1).map(Math.round);
    const [hx, hy] = extent(0.55, 0.6);
    // the near side's ellipse sits towards the eye, along the beam
    const near = beam.r * 0.3 * Math.sin(slant);
    const props: [string, string][] = [
      ["--brx", `${ex}px`],
      ["--bry", `${ey}px`],
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
    const [rx, ry, rr] = ring;
    for (const edge of edges) {
      edge.style.setProperty(rx, px);
      edge.style.setProperty(ry, py);
      edge.style.setProperty(rr, bry);
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

    // A lit copy shows only inside the beam's footprint, the ellipse its
    // mask draws round the aim point (sign.css). Switch off those whose
    // plate the footprint misses, and those off screen, and light the rest
    // in their own coordinates.
    const br = `${beam.r.toFixed(0)}px`;
    for (const o of origins) {
      if (!o.lit) continue;
      // the plate's point nearest the aim point, as the footprint measures
      const nx = Math.min(Math.max(ax, o.x), o.x + o.w) - ax;
      const ny = Math.min(Math.max(ay, o.y), o.y + o.h) - ay;
      const far = (nx / ex) ** 2 + (ny / ey) ** 2 >= 1;
      const hidden = o.y > sy + vh || o.y + o.h < sy;
      const off = far || hidden;
      if (off !== o.off) {
        o.off = off;
        o.el.classList.toggle("sign-lit-off", off);
      }
      if (off) continue;
      // the aim point in plate coordinates
      const lx = `${(ax - o.x).toFixed(1)}px`;
      const ly = `${(ay - o.y).toFixed(1)}px`;
      const s = o.lit.style;
      s.setProperty("--lx", lx);
      s.setProperty("--ly", ly);
      for (const [name, value] of props) s.setProperty(name, value);
      // the layers inside read only the aim point and the radius
      for (const layer of o.inside) {
        layer.style.setProperty("--lx", lx);
        layer.style.setProperty("--ly", ly);
        layer.style.setProperty("--br", br);
      }
    }
  }

  /** A clamp's band, its underside and the faces of its bolted flanges
   * (sign.css): the band R round the post's axis, and either side a flange
   * L long, D deep and H tall, its centre 1.5 px below the band's, with a
   * nut standing 2 px proud of the flange's front on a flank 0.6 px proud. */
  function clampOf(el: HTMLElement): Clamp {
    const cs = getComputedStyle(el);
    const [R, L, D, H] = ["--R", "--L", "--D", "--H"].map((name) =>
      parseFloat(cs.getPropertyValue(name)),
    );
    const across = [1, 0, 0];
    const down = [0, 1, 0];
    const faces = [
      ...el.querySelectorAll<HTMLElement>(".sign-clamp-lugs > i"),
    ].map((face) => {
      const s = face.classList.contains("sign-clamp-l") ? -1 : 1;
      const x = s * (R + L / 2);
      const kind = face.classList[0];
      const [u, v, at] =
        kind === "sign-clamp-end"
          ? // the outer end, turned to face out
            [[0, 0, -s], down, [s * (R + L), 1.5, 0]]
          : kind === "sign-clamp-bottom"
            ? // the underside, turned to face down
              [across, [0, 0, -1], [x, H / 2 + 1.5, 0]]
            : kind === "sign-clamp-front"
              ? [across, down, [x, 1.5, D / 2]]
              : kind === "sign-clamp-nut-side"
                ? [across, down, [x, 3, D / 2 + 0.6]]
                : [across, down, [x, 3, D / 2 + 2]];
      return { el: face, u, v, at, shown: true };
    });
    return {
      el,
      band: el.querySelector<HTMLElement>(".sign-clamp-band"),
      under: el.querySelector<HTMLElement>(".sign-clamp-under"),
      faces,
    };
  }

  /** Writes the sign's tilt to the assembly, and what follows it to what in
   * the assembly reads it, each only what it reads, so a write restyles
   * only those. */
  function tilt(el: HTMLElement, at: Pose) {
    if (tilted?.el !== el) {
      const all = (selector: string) => [
        ...el.querySelectorAll<HTMLElement>(selector),
      ];
      tilted = {
        el,
        posts: all(".sign-posts"),
        tubes: all(".sign-tube"),
        glares: all(".sign-glare"),
        clamps: all(".sign-clamp").map(clampOf),
      };
    }
    const { posts, tubes, glares, clamps } = tilted;
    const set = (els: HTMLElement[], name: string, value: string) => {
      for (const t of els) t.style.setProperty(name, value);
    };
    const ty = (at.y * Math.PI) / 180;
    const tx = (at.x * Math.PI) / 180;
    el.style.setProperty("--tilt-x", `${at.x.toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${at.y.toFixed(2)}deg`);
    // the posts slide behind the plates
    set(posts, "--tilt-y", `${at.y.toFixed(2)}deg`);
    // the posts' highlight moves round the tube by half the eye's angle,
    // and round the clamps' bands with it
    const hl = `${(34 + Math.sin(ty) * 30).toFixed(1)}%`;
    set(tubes, "--post-hl", hl);
    // glare: where the plates face the eye, in page coordinates
    const cx = view.w / 2 + view.sx;
    const cy = view.h / 2 + view.sy;
    set(
      glares,
      "--gxp",
      `${(cx - EYE * Math.sin(ty) * Math.cos(ty)).toFixed(1)}px`,
    );
    set(
      glares,
      "--gyp",
      `${(cy + EYE * Math.sin(tx) * Math.cos(tx)).toFixed(1)}px`,
    );
    // Each clamp turns as the eye moves, seen from below by vx and from the
    // side by vy: its own angles from the eye (posts.ts) plus the sign's
    // tilt. There is no perspective, so each face of its flanges is drawn
    // with the 2D transform that a turn in 3D would give it, and hidden when
    // it faces away.
    for (const clamp of clamps) {
      const vx = at.x + Number(clamp.el.dataset.vx0 ?? 8);
      const vy = at.y + Number(clamp.el.dataset.vy0 ?? 0);
      const c1 = Math.cos((vy * Math.PI) / 180);
      const s1 = Math.sin((vy * Math.PI) / 180);
      const c2 = Math.cos((vx * Math.PI) / 180);
      const s2 = Math.sin((vx * Math.PI) / 180);
      // a point turned by rotateX(vx) rotateY(vy), as the page shows it
      const seen = ([x, y, z]: number[]) => [
        x * c1 + z * s1,
        y * c2 + (x * s1 - z * c1) * s2,
      ];
      for (const face of clamp.faces) {
        const [a, b] = seen(face.u);
        const [c, d] = seen(face.v);
        const [e, f] = seen(face.at);
        const shown = a * d - b * c > 0;
        face.el.style.transform = `matrix(${[a, b, c, d].map((n) => n.toFixed(4)).join(", ")}, ${e.toFixed(3)}, ${f.toFixed(3)})`;
        if (shown !== face.shown) {
          face.shown = shown;
          face.el.style.visibility = shown ? "" : "hidden";
        }
      }
      const angle = `${vx.toFixed(2)}deg`;
      clamp.band?.style.setProperty("--post-hl", hl);
      clamp.band?.style.setProperty("--vx", angle);
      clamp.under?.style.setProperty("--vx", angle);
    }
  }

  /** Draws the page at rest, before it hydrates: the sign at its pose and
   * the entrance flood. The lit shadcn components inherit their beam from the
   * root, since React would find a style on them it did not render; the
   * torch writes the same beam to each of them once it runs. */
  function rest() {
    const assembly = document.querySelector<HTMLElement>(".sign-assembly");
    if (assembly) tilt(assembly, pose());
    measure();
    edges = [document.documentElement];
    ring = ["--px", "--py", "--edge-r"];
    apply(start());
  }

  return {
    look,
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
  const dressPosts = ${dressPosts.toString()};
  const heroBend = ${heroBend.toString()};
  const settle = () => {
    document.querySelectorAll(".signpost-name").forEach((el) => fitName(el));
    const assembly = document.querySelector(".sign-assembly");
    const rail = document.querySelector("svg.sign-hero-rail");
    if (assembly && rail) {
      sinkPosts(assembly, rail, (x) => heroBend(x, ${HERO_RAIL_WIDTH}), ${HERO_RAIL_BASE});
      dressPosts(assembly);
    }
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
