// The guardrail: the separator between the sign and the list. An
// abstract rail on a single highway bend, fading in and out at its ends. It
// catches the light: the torch moves each radial gradient's centre to the
// aim point.
import { useId } from "react";

/** Small seeded generator: random, but the same on every render. */
export function seeded(seed: number) {
  let a = seed * 2654435761;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The hero rail's width: the page's widest content, max-w-6xl less its
 * padding. */
export const HERO_RAIL_WIDTH = 1104;
/** The hero rail's base line in its SVG. */
export const HERO_RAIL_BASE = 14;

/** The hero rail's offset from its base line at x, positive down: one bend,
 * like the single stroke of a highway curve, with constant curvature and no
 * wobble. It peaks left of centre, and the ends rise 12 px above it, centred
 * so the rail sits on its base. The rest script inlines its source (rig.ts),
 * so it must reference nothing outside its own body. */
export function heroBend(x: number, width: number) {
  const APEX = 0.32;
  const DEPTH = 12;
  const d = (x - APEX * width) / (Math.max(APEX, 1 - APEX) * width);
  return DEPTH * (0.5 - d * d);
}

export function railPath(
  f: (x: number) => number,
  width: number,
  base: number,
) {
  const pts: string[] = [];
  for (let x = 0; x <= width + 0.1; x += 16) {
    pts.push(`${x.toFixed(0)} ${(base + f(x)).toFixed(1)}`);
  }
  return `M ${pts.join(" L ")}`;
}

/** The drawing for one rail, in the coordinates of its own SVG: a metal bar,
 * a steel band with a soft shadow under it and a brighter strip under its top
 * edge, and a line of light along the top edge that catches the light. */
export function RailDrawing({
  f,
  width,
  base,
}: {
  f: (x: number) => number;
  width: number;
  base: number;
}) {
  const id = useId().replace(/:/g, "");
  const d = railPath(f, width, base);
  return (
    <>
      <defs>
        <radialGradient
          id={`edge-${id}`}
          gradientUnits="userSpaceOnUse"
          cx="-9999"
          cy="-9999"
          r="600"
          data-k="1.1"
          // lit before the page hydrates (rig.ts)
          suppressHydrationWarning
        >
          <stop offset="0" className="rail-hot" />
          <stop offset="0.5" className="rail-warm" />
          <stop offset="1" className="rail-cold" />
        </radialGradient>
      </defs>
      <path className="rail-shadow" d={d} />
      <path className="rail-bar" d={d} />
      <path className="rail-sheen" d={d} />
      <path className="rail-top" d={d} stroke={`url(#edge-${id})`} />
    </>
  );
}
