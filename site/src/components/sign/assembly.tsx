// The sign assembly at the top of the page. Two galvanised posts carry the
// title plate, the destination plate pointing to Repo Canon, and a
// supplementary notice. The structure tilts as one object with the viewer.
// The sign is also the way into "How it works": its tab, its title and its
// notice sink it behind the guardrail and play the story in its place.
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { repositoryUrl, type Source } from "@/lib/catalogue";
import { Arrow } from "./arrow";
import { Face, Surface } from "./face";
import { sinkPosts } from "./posts";
import {
  HERO_RAIL_BASE,
  HERO_RAIL_WIDTH,
  RailDrawing,
  heroBend,
  railPath,
} from "./rail";
import { lightRig } from "./rig";
import { Story, type Beat } from "./story";

/** The sign's notice, in the homepage's own words. It says why a listing is
 * no endorsement: any repository with the topic and a stable release is
 * listed. */
const NOTICE = "Anyone can list a source here. Review one before you adopt it.";

/** The pointer stands in for the viewer's eye and tilts the assembly. On entry
 * and when the pointer leaves, the sign settles into a presentational pose and
 * holds it a moment before following the pointer again. A finger is no eye:
 * it never tilts the sign. A soft spring drives the tilt; the glare of the
 * torch follows the tilt. */
function useTilt(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rig = lightRig();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // the page was drawn at this pose before it hydrated (rig.ts)
    const rest = rig.pose();
    const cur = { ...rest };
    const tgt = { ...cur };
    const vel = { x: 0, y: 0 };
    let following = false;
    let hold = 0;
    let raf = 0;
    let running = false;
    let last = 0;
    let pointer = { x: 0, y: 0 };

    const write = () => rig.tilt(el, cur);
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
      if (e.pointerType === "touch") return;
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
      tgt.x = rest.x;
      tgt.y = rest.y;
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

/** Keeps the posts' feet behind the guardrail (posts.ts) as the page
 * changes size. */
function useSunkPosts(
  ref: RefObject<HTMLElement | null>,
  rail: RefObject<SVGSVGElement | null>,
) {
  useEffect(() => {
    const el = ref.current;
    const svg = rail.current;
    if (!el || !svg) return;
    const place = () => sinkPosts(el, svg, railAt, HERO_RAIL_BASE);
    place();
    const ro = new ResizeObserver(place);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [ref, rail]);
}

/** The story plays on its own once per visitor, after they have been still
 * for a while with the sign in view, so it never pulls the sign away
 * mid-read. Moving the pointer, scrolling or hiding the tab starts the wait
 * over; a click, a key or the sign scrolling out of view calls it off for
 * the visit. With reduced motion it never plays on its own. */
const AUTOPLAY_WAIT = 8000;
const SEEN = "story-seen";

function remembered() {
  try {
    return localStorage.getItem(SEEN) !== null;
  } catch {
    return true;
  }
}
function remember() {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    // private browsing: the story may play on its own again
  }
}

function useAutoplay(ref: RefObject<HTMLElement | null>, play: () => void) {
  const latest = useRef(play);
  useEffect(() => {
    latest.current = play;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || remembered()) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let id = 0;
    let inView = false;
    const arm = () => {
      window.clearTimeout(id);
      if (inView && document.visibilityState === "visible")
        id = window.setTimeout(() => latest.current(), AUTOPLAY_WAIT);
    };
    const restarts = ["pointermove", "scroll", "visibilitychange"] as const;
    const callsOff = ["click", "keydown"] as const;
    const off = () => {
      window.clearTimeout(id);
      restarts.forEach((e) => document.removeEventListener(e, arm));
      callsOff.forEach((e) => document.removeEventListener(e, off, true));
      seen.disconnect();
    };
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          inView = true;
          arm();
        } else if (inView) off();
      },
      { threshold: 0.6 },
    );
    seen.observe(el);
    restarts.forEach((e) =>
      document.addEventListener(e, arm, { passive: true }),
    );
    callsOff.forEach((e) => document.addEventListener(e, off, true));
    return off;
  }, [ref]);
}

type Phase = "idle" | "playing" | "leaving" | "rising";

export function SignAssembly({
  start,
  playRequest,
}: {
  start: Source;
  /** Changes whenever the page asks for the story, from its nav. */
  playRequest: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const railRef = useRef<SVGSVGElement>(null);
  useTilt(ref);
  useSunkPosts(ref, railRef);
  // idle: the sign stands; playing: it has sunk and the story runs;
  // leaving: the story plays its entrance backwards, the floor sinking last
  // in, first out; rising: the sign comes back up as the floor goes
  const [phase, setPhaseState] = useState<Phase>("idle");
  const phaseRef = useRef(phase);
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  // a new run mounts a fresh story; `asked` when the visitor asked for it
  const [run, setRun] = useState({ n: 0, asked: false });
  const cue = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const play = (asked = true) => {
    clear();
    remember();
    // a story still on its way out plays on from where it is
    if (phaseRef.current === "idle") setRun((r) => ({ n: r.n + 1, asked }));
    setPhase("playing");
  };
  const stop = () => {
    if (phaseRef.current !== "playing") return;
    clear();
    setPhase("leaving");
    timers.current = [
      window.setTimeout(() => setPhase("rising"), 900),
      window.setTimeout(() => {
        // the story's controls held the focus: it returns to the sign
        const held = document.activeElement?.closest(".story");
        setPhase("idle");
        if (held) cue.current?.focus({ preventScroll: true });
      }, 1800),
    ];
  };
  useAutoplay(ref, () => play(false));
  useEffect(() => {
    if (playRequest > 0) play();
  }, [playRequest]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stop();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clear();
    };
  }, []);
  // the caption that is up, and how long it stays, for the rail's light
  const [beat, setBeat] = useState<Beat | null>(null);
  const sunk = phase === "playing" || phase === "leaving";

  return (
    <>
      {/* clipped along the rail, so whatever sinks or rises there vanishes
          behind the rail and nowhere else */}
      <div
        className="hero-stage flex flex-col items-center"
        data-sunk={sunk || undefined}
        style={{ clipPath: RAIL_CLIP }}
      >
        <div className="sink w-full max-w-[760px]" inert={sunk || undefined}>
          {/* tilted before the page hydrates (rig.ts) */}
          <div
            ref={ref}
            className="assembly w-full max-w-[760px]"
            suppressHydrationWarning
          >
            <div className="posts" aria-hidden="true">
              {/* sunk behind the rail before the page hydrates (rig.ts) */}
              <span
                className="tube"
                style={{ left: "21%" }}
                suppressHydrationWarning
              />
              <span
                className="tube"
                style={{ left: "79%" }}
                suppressHydrationWarning
              />
            </div>

            <div className="mount mount--tab story-cue">
              <Face kind="white" className="tab-face" hidden>
                <span className="face__inner flex items-center gap-1.5">
                  How it works
                  <Arrow size={16} />
                </span>
              </Face>
              <button
                ref={cue}
                type="button"
                className="story-cue-button"
                aria-label="How it works: play a short story"
                onClick={() => play()}
              />
            </div>

            {/* the title and the notice play the story too; the tab and the
                nav's link are the buttons for it */}
            <div className="mount" data-panel="" onClick={() => play()}>
              <Face
                as="h1"
                kind="blue"
                slats
                className="px-8 pb-6 pt-7 md:px-10"
              >
                <span className="face__inner block text-[42px] font-bold leading-none md:text-[62px]">
                  Repo Standards
                </span>
                <span className="face__inner mt-3 block text-[20px] font-medium leading-tight md:text-[25px]">
                  Write your setup down once. Your coding agent applies it to
                  every repository.
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
                label={`Repo Canon ${start.release.version}. A ready-made setup to start from`}
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
                    A ready-made setup to start from
                  </span>
                </span>
              </Face>
            </div>

            <div
              className="mount mx-auto w-[82%]"
              data-panel=""
              onClick={() => play()}
            >
              <Face
                as="p"
                kind="white"
                className="px-6 py-4 text-[16px] font-medium leading-snug md:text-[17px]"
              >
                <span className="face__inner block">{NOTICE}</span>
              </Face>
            </div>
          </div>
        </div>
        {phase !== "idle" && (
          <Story
            key={run.n}
            takeFocus={run.asked}
            onBeat={setBeat}
            leaving={phase === "leaving" || phase === "rising"}
            onDone={stop}
          />
        )}
      </div>
      <HeroRail ref={railRef} beat={phase === "playing" ? beat : null} />
    </>
  );
}

const railAt = (x: number) => heroBend(x, HERO_RAIL_WIDTH);

/** The hero's clip: everything above the rail's bar, following its bend,
 * and the whole page to either side and above. The rail's centre lies 6 px
 * below the stage (its 8 px pull-up less its base line) plus the bend. */
const RAIL_CLIP = (() => {
  const below = (x: number) =>
    `calc(100% + ${(6 + railAt(x) + 2).toFixed(1)}px)`;
  const pts = ["-100vw -100vh", `-100vw ${below(0)}`];
  for (let x = 0; x <= HERO_RAIL_WIDTH; x += 24) pts.push(`${x}px ${below(x)}`);
  pts.push(
    `calc(100% + 100vw) ${below(HERO_RAIL_WIDTH)}`,
    "calc(100% + 100vw) -100vh",
  );
  return `polygon(${pts.join(", ")})`;
})();

/** The guardrail where the sign meets the list, on a single bend that fades
 * in and out instead of a hard rule. It is drawn for the widest page, so the
 * server can draw it: a narrower page shows its left part, and the fade at
 * the rail's ends masks the cut. The ground just behind it is opaque under
 * the bar and fades out below, so the posts vanish behind and below it.
 * While the story plays, a light runs along its top over each caption's
 * time. */
function HeroRail({
  ref,
  beat,
}: {
  ref: RefObject<SVGSVGElement | null>;
  beat: Beat | null;
}) {
  return (
    <svg ref={ref} className="rail-svg hero-rail" aria-hidden="true">
      {GROUND.map(([dy, o]) => (
        <path
          key={dy}
          className="rail-ground"
          d={railPath(railAt, HERO_RAIL_WIDTH, HERO_RAIL_BASE + dy)}
          opacity={o}
        />
      ))}
      <RailDrawing f={railAt} width={HERO_RAIL_WIDTH} base={HERO_RAIL_BASE} />
      {beat && (
        <path
          key={beat.key}
          className="rail-progress"
          d={railPath(railAt, HERO_RAIL_WIDTH, HERO_RAIL_BASE)}
          pathLength={1}
          style={{ "--ms": `${beat.ms}ms` } as CSSProperties}
        />
      )}
    </svg>
  );
}

/** The ground's strokes under the rail: offset below its base, opacity. */
const GROUND: [number, number][] = [
  [3, 1],
  [8, 1],
  [13, 1],
  [18, 0.55],
  [23, 0.2],
];
