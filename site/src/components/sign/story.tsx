// "How it works", told where the sign stands. The sign sinks behind the
// guardrail and a short story plays in its place: an endless floor of
// repositories, each set up its own way, drifts towards the viewer; a plate
// of shared standards hangs in the middle, then falls, tipping into the
// floor's angle; a square wave spreads from where it lands, and every
// repository it passes updates until they all look alike. Then the sign
// comes back. The story names no product: the sign's Repo Canon plate is
// where it leads.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ArrowLeft, FolderGit2, RotateCcw } from "lucide-react";
import { Button } from "@/components/app/button";
import { Arrow } from "./arrow";
import { Surface } from "./face";
import { seeded } from "./rail";

/** The caption that is up, and how long it stays. */
export type Beat = { key: string; ms: number };

/* ---------- the repositories ---------- */

const NAMES = [
  "api",
  "web",
  "docs",
  "cli",
  "infra",
  "mobile",
  "billing",
  "auth",
  "search",
  "worker",
  "design",
  "sdk",
  "admin",
  "data",
  "edge",
  "payments",
  "notify",
  "gateway",
  "models",
  "analytics",
  "frontend",
  "backend",
  "scheduler",
  "mailer",
  "portal",
  "ios",
  "android",
  "desktop",
  "plugins",
  "theme",
  "website",
  "blog",
  "status",
  "chat",
  "storage",
  "queue",
  "cache",
  "metrics",
  "logs",
  "exports",
  "reports",
  "onboarding",
  "settings",
  "checkout",
  "catalog",
  "inventory",
  "pricing",
  "support",
];

// what each repository happens to have: some files, in someone's own way
const POOLS: (string | null)[][] = [
  ["README.md", "readme.txt", "README.rst", "README", "README.md"],
  ["CONTRIBUTING.md", "docs/contributing.txt", null, null],
  [
    ".github/workflows/ci.yml",
    ".gitlab-ci.yml",
    "Jenkinsfile",
    ".circleci/",
    null,
  ],
  ["CLAUDE.md", ".cursorrules", null, null, null],
  [".eslintrc.json", "biome.json", ".prettierrc", "tslint.json", null],
];
const HUES = [
  "#b4533a",
  "#5f7f2a",
  "#7a5c99",
  "#a8802a",
  "#3f7487",
  "#7d7d7d",
  "#a0466b",
];
const STYLES = ["sA", "sB", "sC", "sD"];
// the shared setup every repository ends up with
const AFTER = ["AGENTS.md", "CONTRIBUTING.md", "README.md", ".github/"];

type Repo = {
  name: string;
  files: string[];
  hue: string;
  style: string;
  tilt: number;
  r: number;
  c: number;
};

/* The floor: COPIES identical blocks of ROWS rows, stacked along the way the
   floor drifts, so it can loop forever: it drifts exactly one block, then
   starts over where the next block looks the same. */
const COLS = 12;
const ROWS = 6;
const COPIES = 3;
const PITCH_X = 168 + 16;
const PITCH_Y = 122 + 16;
const BLOCK = ROWS * PITCH_Y;
/** One block's drift, in milliseconds: slow. */
const DRIFT = 42000;
/** The square wave: from the plate's footprint out to past every card. */
const RING_FROM = 260;
const RING_TO = 3200;
const RING_MS = 2600;
/** The last card's entrance delay; leaving reverses the entrance. */
const MAX_ENTER = (ROWS * COPIES - 1) * 55 + (COLS - 1) * 20;

function repos(): Repo[] {
  const rnd = seeded(11);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const block = Array.from({ length: COLS * ROWS }, (_, i) => ({
    name: NAMES[i % NAMES.length],
    files: POOLS.map(pick)
      .filter((f): f is string => !!f)
      .slice(0, 4),
    hue: pick(HUES),
    style: pick(STYLES),
    tilt: rnd() < 0.35 ? (rnd() - 0.5) * 5 : 0,
    r: Math.floor(i / COLS),
    c: i % COLS,
  }));
  // the same block again, further along the drift
  return Array.from({ length: COPIES }, (_, k) =>
    block.map((repo) => ({ ...repo, r: repo.r + k * ROWS })),
  ).flat();
}

/** When a repository updates, counted from the moment the plate lands, with
 * the floor drifted by `o` (0 to BLOCK). The wave is a square ring growing
 * at an even pace: it reaches a card when its edge does, so the update
 * covers the floor evenly in every direction. */
function delay(repo: Repo, o: number) {
  const x = (repo.c - (COLS - 1) / 2) * PITCH_X;
  const y = (repo.r - (ROWS * COPIES - 1) / 2) * PITCH_Y + o - BLOCK / 2;
  const d = Math.max(Math.abs(x), Math.abs(y));
  const half = (RING_TO - RING_FROM) / 2;
  return Math.max(0, ((d - RING_FROM / 2) / half) * RING_MS);
}

/** One small repository: its own setup before, the shared one after. Both
 * faces are drawn; the update cross-fades them, after a pop and a scan. The
 * card moves in and out; its body pops. Kept apart, the pop's held end can
 * never stop the way out from animating. */
function Mini({ repo, d, enter }: { repo: Repo; d: number; enter: number }) {
  return (
    <div
      className="mini"
      style={
        {
          "--d": `${d}ms`,
          "--enter": `${enter}ms`,
          // leaving reverses the entrance: last in, first out
          "--exit": `${(MAX_ENTER - enter) * 0.45}ms`,
        } as CSSProperties
      }
    >
      <div className="mini-body">
        <div
          className={`mini-face mini-before ${repo.style}`}
          style={
            { "--hue": repo.hue, rotate: `${repo.tilt}deg` } as CSSProperties
          }
        >
          <div className="mini-head">
            <FolderGit2 size={11} />
            {repo.name}
          </div>
          <div className="mini-rows">
            {repo.files.map((f) => (
              <div key={f}>{f}</div>
            ))}
            {repo.files.length < 2 && (
              <div className="mini-missing">no docs</div>
            )}
          </div>
        </div>
        <div className="mini-face mini-after">
          <div className="mini-head">
            <FolderGit2 size={11} />
            {repo.name}
          </div>
          <div className="mini-rows">
            {AFTER.map((f) => (
              <div key={f}>{f}</div>
            ))}
          </div>
          <div className="mini-foot">✓ Checks pass</div>
        </div>
        <span className="mini-scan" />
      </div>
    </div>
  );
}

/** The plate for any set of standards. The shield says it is versioned. */
function StandardsPlate() {
  return (
    <div className="face face--blue story-plate">
      <Surface />
      <span className="face__inner flex items-center gap-4">
        <Arrow size={40} />
        <span className="shield tnum text-[16px]">v2.1.0</span>
        <span className="text-[34px] font-bold leading-none">
          Shared standards
        </span>
      </span>
    </div>
  );
}

const CAPTIONS = [
  "",
  "Every repository, set up its own way",
  "Write the setup down once",
  "Your coding agent applies it",
  "All alike, and kept that way",
];

// sink, rise, the plate appears, it falls, the wave, the end; the floor
// starts rising while the sign is still sinking, so the stage is never empty
const STEPS = [300, 4200, 4800, 650, 4400, 0];
/** How long each caption stays: the third runs from the plate's fall through
 * the wave, and the last for this long before the sign comes back. */
const BEATS = [0, STEPS[1], STEPS[2], STEPS[3] + STEPS[4], 4600];

/** Advances through STEPS from `from`; the last step holds. A new `restart`
 * starts the run over. */
function useSteps(from: number, restart: number) {
  const [step, setStep] = useState(from);
  useEffect(() => {
    let i = from;
    let id = 0;
    const next = () => {
      if (i >= STEPS.length - 1) return;
      id = window.setTimeout(() => {
        i += 1;
        setStep(i);
        next();
      }, STEPS[i]);
    };
    setStep(from);
    next();
    return () => window.clearTimeout(id);
  }, [from, restart]);
  return step;
}

export function Story({
  takeFocus,
  onBeat,
  leaving,
  onDone,
}: {
  /** Asked for by the visitor, rather than played on its own: the focus
   * moves from the sunk sign to the story's controls. */
  takeFocus: boolean;
  /** Tells the rail which caption is up and for how long. */
  onBeat: (beat: Beat | null) => void;
  /** The sign is rising again: the story plays its entrance backwards. */
  leaving: boolean;
  /** Go back, or the story's end: the sign comes back. */
  onDone: () => void;
}) {
  // Play again rewinds in place: the floor stays, the repositories turn back
  // into their own setups, and the story runs on from there
  const [replays, setReplays] = useState(0);
  const step = useSteps(replays > 0 ? 1 : 0, replays);
  const all = useMemo(repos, []);
  const drift = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (takeFocus) back.current?.focus({ preventScroll: true });
  }, []);
  // where the drifting floor stood when the plate landed
  const [landedAt, setLandedAt] = useState<number | null>(null);
  useEffect(() => {
    if (step < 4) setLandedAt(null);
    if (step !== 4) return;
    const t = drift.current?.getAnimations()[0]?.currentTime;
    const ms = typeof t === "number" ? t : 0;
    setLandedAt(((ms % DRIFT) / DRIFT) * BLOCK);
  }, [step]);
  const beat = step < 3 ? step : step < 5 ? 3 : 4;
  const beatMs = BEATS[beat];
  const beatKey = `${replays}-${beat}`;
  // after the last caption's time, the sign comes back
  useEffect(() => {
    if (step !== 5 || leaving) return;
    const id = window.setTimeout(onDone, beatMs);
    return () => window.clearTimeout(id);
  }, [step, leaving, replays]);
  useEffect(() => {
    onBeat(beat >= 1 && !leaving ? { key: beatKey, ms: beatMs } : null);
  }, [beatKey, leaving]);
  const plate =
    step < 2
      ? "away"
      : step === 2
        ? "above"
        : step === 3
          ? "falling"
          : "landed";
  return (
    <div
      className="story"
      data-leaving={leaving || undefined}
      style={
        {
          "--block": `${BLOCK}px`,
          "--drift": `${DRIFT}ms`,
          "--ring-from": `${RING_FROM}px`,
          "--ring-to": `${RING_TO}px`,
          "--ring-ms": `${RING_MS}ms`,
        } as CSSProperties
      }
    >
      {step >= 1 && (
        <div
          key={beatKey}
          className="face face--white story-caption"
          role="status"
        >
          <Surface />
          <span className="face__inner">{CAPTIONS[beat]}</span>
        </div>
      )}
      <div className="story-floor" aria-hidden="true">
        <div className="story-plane">
          <div className="story-drift" ref={drift}>
            <div
              className="story-repos"
              data-up={step >= 1 || undefined}
              data-adopted={(step >= 4 && landedAt !== null) || undefined}
              style={{ gridTemplateColumns: `repeat(${COLS}, var(--mini-w))` }}
            >
              {all.map((repo) => (
                <Mini
                  key={`${repo.r}-${repo.c}`}
                  repo={repo}
                  d={landedAt === null ? 0 : delay(repo, landedAt)}
                  // nearest rows first, as if coming up from below
                  enter={(ROWS * COPIES - 1 - repo.r) * 55 + repo.c * 20}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* the shadow and the ring lie on the floor itself, outside its fade;
          the plate hangs in the middle facing the viewer, then falls,
          tipping into the floor's angle, onto the floor's centre */}
      <div className="story-fall-scene" aria-hidden="true">
        <div className="story-plane">
          <span className="story-shadow" data-plate={plate} />
          <span className="story-ring" data-plate={plate} />
        </div>
        <div className="story-fall" data-plate={plate}>
          <StandardsPlate />
        </div>
      </div>
      <div className="story-controls" role="group" aria-label="How it works">
        <Button variant="outline" onClick={() => setReplays((r) => r + 1)}>
          <RotateCcw data-icon="inline-start" />
          Play again
        </Button>
        <Button ref={back} onClick={onDone}>
          <ArrowLeft data-icon="inline-start" />
          Go back
        </Button>
      </div>
    </div>
  );
}
