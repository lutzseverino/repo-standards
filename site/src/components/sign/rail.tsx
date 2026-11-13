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

export { HERO_RAIL_WIDTH, HERO_RAIL_BASE, heroBend } from "./rail-curve";

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
          <stop offset="0" className="sign-rail-hot" />
          <stop offset="0.5" className="sign-rail-warm" />
          <stop offset="1" className="sign-rail-cold" />
        </radialGradient>
      </defs>
      <path className="sign-rail-shadow" d={d} />
      <path className="sign-rail-bar" d={d} />
      <path className="sign-rail-sheen" d={d} />
      <path className="sign-rail-top" d={d} stroke={`url(#edge-${id})`} />
    </>
  );
}
