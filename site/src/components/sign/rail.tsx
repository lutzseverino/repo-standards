// The guardrail: the separator between the sign and the list. An
// abstract rail on a gentle, seeded highway curve, fading in and out at its
// ends. It catches the light: the torch moves each radial gradient's centre
// to the aim point.
import { useId } from "react";

/** Small seeded generator so every curve is random but stable. */
export function seeded(seed: number) {
  let a = seed * 2654435761;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A highway-like curve: a long bend, a shorter wobble and a slight slope. */
export function curve(seed: number, amplitude = 8) {
  const rnd = seeded(seed);
  const a1 = amplitude * (0.6 + rnd() * 0.4);
  const l1 = 700 + rnd() * 700;
  const p1 = rnd() * Math.PI * 2;
  const a2 = amplitude * (0.2 + rnd() * 0.2);
  const l2 = 240 + rnd() * 200;
  const p2 = rnd() * Math.PI * 2;
  const slope = (rnd() - 0.5) * 0.02;
  return (x: number, width: number) =>
    a1 * Math.sin((2 * Math.PI * x) / l1 + p1) +
    a2 * Math.sin((2 * Math.PI * x) / l2 + p2) +
    slope * (x - width / 2);
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
