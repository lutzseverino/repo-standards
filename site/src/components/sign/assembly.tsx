// The sign assembly at the top of the page. Two galvanised posts carry the
// title plate, the destination plate pointing to Repo Canon, and a
// supplementary notice. The structure tilts as one object with the viewer.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { repositoryUrl, type Source } from "@/lib/catalogue";
import { Arrow } from "./arrow";
import { Face, Surface } from "./face";
import { RailDrawing, curve } from "./rail";
import { EYE } from "./torch";

/** Seen from slightly below and to the left: the angle the sign rests at on
 * entry and whenever the pointer is gone. */
const POSE = { x: 4, y: -9 };

/** The pointer stands in for the viewer's eye and tilts the assembly. On entry
 * and when the pointer leaves, the sign settles into a presentational pose and
 * holds it a moment before following the pointer again. A soft spring drives
 * the tilt; the glare of the torch follows the tilt. */
function useTilt(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const cur = reduced ? { x: 0, y: 0 } : { ...POSE };
    const tgt = { ...cur };
    const vel = { x: 0, y: 0 };
    let following = false;
    let hold = 0;
    let raf = 0;
    let running = false;
    let last = 0;
    let pointer = { x: 0, y: 0 };

    const write = () => {
      const s = el.style;
      s.setProperty("--tilt-x", `${cur.x.toFixed(2)}deg`);
      s.setProperty("--tilt-y", `${cur.y.toFixed(2)}deg`);
      // the tube's highlight stripe follows the viewer round the cylinder
      s.setProperty("--post-hl", `${(38 + cur.y * 4).toFixed(1)}%`);
      // glare: where the plates face the eye, in page coordinates
      const ty = (cur.y * Math.PI) / 180;
      const tx = (cur.x * Math.PI) / 180;
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
    };
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const k = 38;
      const c = 2 * Math.sqrt(k) * 0.9;
      vel.x += (k * (tgt.x - cur.x) - c * vel.x) * dt;
      vel.y += (k * (tgt.y - cur.y) - c * vel.y) * dt;
      cur.x += vel.x * dt;
      cur.y += vel.y * dt;
      write();
      const settled =
        Math.abs(tgt.x - cur.x) < 0.01 &&
        Math.abs(tgt.y - cur.y) < 0.01 &&
        Math.hypot(vel.x, vel.y) < 0.02;
      if (settled) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(step);
    };
    const kick = () => {
      if (reduced || running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(step);
    };
    const follow = () => {
      const r = el.getBoundingClientRect();
      const px = Math.min(1.4, Math.max(-0.4, (pointer.x - r.left) / r.width));
      const py = Math.min(1.4, Math.max(-0.4, (pointer.y - r.top) / r.height));
      tgt.y = (px - 0.5) * 5;
      tgt.x = (0.5 - py) * 3;
      kick();
    };
    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (following) {
        follow();
        return;
      }
      if (!hold) {
        hold = window.setTimeout(() => {
          following = true;
          follow();
        }, 1200);
      }
    };
    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget !== null) return;
      following = false;
      window.clearTimeout(hold);
      hold = 0;
      tgt.x = POSE.x;
      tgt.y = POSE.y;
      kick();
    };
    const onScroll = () => write();
    write();
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hold);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, [ref]);
}

export function SignAssembly({
  start,
  notice,
}: {
  start: Source;
  notice: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useTilt(ref);

  return (
    <>
      <div className="flex flex-col items-center">
        <div ref={ref} className="assembly w-full max-w-[760px]">
          <div className="posts" aria-hidden="true">
            <span className="tube" style={{ left: "21%" }} />
            <span className="tube" style={{ left: "79%" }} />
          </div>

          <div className="mount">
            <Face as="h1" kind="blue" slats className="px-8 pb-6 pt-7 md:px-10">
              <span className="face__inner block text-[42px] font-bold leading-none md:text-[62px]">
                Repository Standards
              </span>
              <span className="face__inner mt-3 block text-[20px] font-medium leading-tight md:text-[25px]">
                Standards sources you can adopt in one command
              </span>
            </Face>
          </div>

          <div className="mount">
            <Face
              as="a"
              kind="blue"
              href={repositoryUrl(start)}
              slats
              leds
              label={`Repo Canon ${start.release.version}. A ready-made set of conventions to start from`}
              className="px-6 pb-5 pt-5 md:px-8"
            >
              <span className="face__inner flex flex-wrap items-center gap-x-5 gap-y-2">
                <Arrow size={58} />
                <span className="shield tnum text-[19px] md:text-[21px]">
                  {start.release.version}
                </span>
                <span className="text-[38px] font-bold leading-none md:text-[50px]">
                  Repo Canon
                </span>
              </span>
              <span className="inset face__inner mt-4 text-[18px] md:text-[21px]">
                <Surface />
                <span className="relative z-[3]">
                  A ready-made set of conventions to start from
                </span>
              </span>
            </Face>
          </div>

          <div className="mount mx-auto w-[82%]">
            <Face
              as="p"
              kind="white"
              className="px-6 py-4 text-[16px] font-medium leading-snug md:text-[17px]"
            >
              <span className="face__inner block">{notice}</span>
            </Face>
          </div>
        </div>
      </div>
      <HeroRail />
    </>
  );
}

/** The guardrail where the sign meets the list, on a gentle curve that fades
 * in and out instead of a hard rule. */
function HeroRail() {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const measure = () => setWidth(svg.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);
  const f = curve(7, 7);
  return (
    <svg ref={ref} className="rail-svg hero-rail" aria-hidden="true">
      {width > 0 && (
        <RailDrawing f={(x) => f(x, width)} width={width} base={14} />
      )}
    </svg>
  );
}
