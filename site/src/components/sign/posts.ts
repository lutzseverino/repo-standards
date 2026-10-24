// The posts end behind the guardrail: each foot ends under the rail's bar
// where the post crosses it, so it disappears behind and below the rail at
// any width and tilt. It runs before the first paint (rig.ts `restScript`)
// and whenever the page changes size. The inline copy is the function's
// source, so it must reference nothing outside its own body: the rail's
// curve comes in as `railAt`, in the rail SVG's coordinates, with the base
// line it is drawn on.
export function sinkPosts(
  assembly: HTMLElement,
  rail: SVGSVGElement,
  railAt: (x: number) => number,
  base: number,
) {
  const s = rail.getBoundingClientRect();
  const a = assembly.getBoundingClientRect();
  for (const tube of assembly.querySelectorAll<HTMLElement>(".tube")) {
    tube.style.bottom = "0px";
    const r = tube.getBoundingClientRect();
    const railY = s.top + base + railAt(r.left + r.width / 2 - s.left);
    // into the ground under the bar, so the tilt never shows the end
    tube.style.bottom = `${(a.bottom - railY - 6).toFixed(1)}px`;
  }
}
