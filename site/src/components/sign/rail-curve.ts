// Shared by the rail drawing and pre-paint post placement, without loading
// the React drawing module in the inline script.
/** The hero rail's width: the page's widest content, max-w-6xl less its
 * padding. */
export const HERO_RAIL_WIDTH = 1104;
/** The hero rail's base line in its SVG. */
export const HERO_RAIL_BASE = 14;

/** The hero rail's offset from its base line at x, positive down: one bend,
 * like the single stroke of a highway curve, with constant curvature and no
 * wobble. It peaks left of centre, and the ends rise 12 px above it, centred
 * so the rail sits on its base. */
export function heroBend(x: number, width: number) {
  const APEX = 0.32;
  const DEPTH = 12;
  const d = (x - APEX * width) / (Math.max(APEX, 1 - APEX) * width);
  return DEPTH * (0.5 - d * d);
}
