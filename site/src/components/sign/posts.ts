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
  for (const tube of assembly.querySelectorAll<HTMLElement>(".sign-tube")) {
    tube.style.bottom = "0px";
    const r = tube.getBoundingClientRect();
    const railY = s.top + base + railAt(r.left + r.width / 2 - s.left);
    // into the ground under the bar, so the tilt never shows the end
    tube.style.bottom = `${(a.bottom - railY - 6).toFixed(1)}px`;
  }
}

// The posts as the plates in front of them leave them, worked out once per
// layout, never per frame: the plates' shadows on the posts, as one static
// gradient for each theme; the clamps under each plate, and the angles the
// eye sees them from; and how much of each plate's folded edge the eye,
// below the sign, sees under it (sign.css). It runs with `sinkPosts`, and
// like it, the rest script inlines its source, so it must reference nothing
// outside its own body.
export function dressPosts(assembly: HTMLElement) {
  const posts = assembly.querySelector<HTMLElement>(".sign-posts");
  if (!posts) return;
  const top = posts.offsetTop;
  const height = posts.offsetHeight + 120;
  const mounts = [
    ...assembly.querySelectorAll<HTMLElement>(
      ":scope > .sign-mount:not(.sign-mount--tab)",
    ),
  ];
  // in the posts' own coordinates; layout positions, so the tilt does not
  // move them
  const plates = mounts.map((m) => ({
    t: m.offsetTop - top,
    b: m.offsetTop + m.offsetHeight - top,
  }));

  // How dark the post is at y. By day the sun stands up and to the left
  // behind the viewer, so a plate's bottom edge throws a shadow down the
  // posts 12 cm behind it, about 20 px, with a short penumbra; the gap
  // between two plates is all shadow. At night the torch is at the eye and
  // its shadows fall straight back, out of sight: only the occlusion where
  // plate and post meet is left.
  const day = (y: number) => {
    let v = 0;
    for (const { t, b } of plates) {
      if (y >= t && y <= b) v = Math.max(v, 0.5);
      const d = y - b;
      if (d > 0 && d <= 22) {
        const cast = d < 14 ? 0.46 : 0.46 * (1 - (d - 14) / 8);
        const ao = d < 6 ? 0.14 * (1 - d / 6) : 0;
        v = Math.max(v, cast + ao);
      }
      const u = t - y;
      if (u > 0 && u <= 7) v = Math.max(v, 0.22 * (1 - u / 7));
    }
    return v;
  };
  const night = (y: number) => {
    let v = 0;
    for (const { t, b } of plates) {
      if (y >= t && y <= b) v = Math.max(v, 0.5);
      const d = y - b;
      if (d > 0 && d <= 12) v = Math.max(v, 0.6 * (1 - d / 12) ** 2);
      const u = t - y;
      if (u > 0 && u <= 8) v = Math.max(v, 0.32 * (1 - u / 8));
    }
    return v;
  };
  // one gradient stop every 2 px, keeping only the ends of flat runs
  const gradient = (f: (y: number) => number) => {
    const stops: string[] = [];
    let prev = -1;
    for (let y = 0; y <= height; y += 2) {
      const v = Math.round(f(y) * 1000) / 1000;
      const next = Math.round(f(y + 2) * 1000) / 1000;
      if (v !== prev || next !== v || y === 0 || y + 2 > height) {
        stops.push(`rgb(0 0 0 / ${v}) ${y}px`);
      }
      prev = v;
    }
    return `linear-gradient(to bottom, ${stops.join(", ")})`;
  };
  // on the tubes, which React lets the rest script style before hydration
  const dayShade = gradient(day);
  const nightShade = gradient(night);
  posts.querySelectorAll<HTMLElement>(".sign-tube").forEach((tube) => {
    tube.style.setProperty("--shade-day", dayShade);
    tube.style.setProperty("--shade-night", nightShade);
  });

  // Each clamp is drawn in 3D, seen from where it stands relative to the
  // eye, which is in front of the assembly's foot (its transform origin) at
  // the tilt's perspective distance: from below by the angle up to it, and
  // from the side by the angle across to its post. The tilt adds to both,
  // per frame, in CSS.
  const foot = assembly.offsetHeight;
  const width = assembly.offsetWidth;
  const deg = (r: number) => `${((r * 180) / Math.PI).toFixed(2)}deg`;
  posts.querySelectorAll<HTMLElement>(".sign-clamp").forEach((c) => {
    const p = plates[Number(c.dataset.plate)];
    if (!p) return;
    // 15 px (60 mm) tall, its top 4 px behind the plate
    const y = p.b - 4;
    c.style.top = `${y.toFixed(1)}px`;
    const above = foot - (top + y + 7.5);
    const across = (parseFloat(c.style.left) / 100 - 0.5) * width;
    c.style.setProperty("--vx0", deg(Math.atan(above / 1600)));
    c.style.setProperty("--vy0", deg(Math.atan(across / 1600)));
  });

  // The eye is below the sign, near its foot, so it sees the underside of
  // each plate's 30 mm folded edge (7 px), more of it the higher the plate:
  // the edge's depth times how far the plate's bottom is above the eye over
  // the eye's distance, plus the backward tilt.
  mounts.forEach((m) => {
    const above = foot - (m.offsetTop + m.offsetHeight);
    const lip = `${(0.6 + (7 * above) / 800).toFixed(2)}px`;
    m.querySelectorAll<HTMLElement>(":scope > .sign-face-wrap").forEach((w) =>
      w.style.setProperty("--lip", lip),
    );
  });
}
