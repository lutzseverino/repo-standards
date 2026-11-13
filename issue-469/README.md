# Issue 469 browser evidence

Base: `d835696e90f75b4594b87c41b6e00369cf7cf64b`.
Head: `c6a35e379f4e02f2eef8945038e7c0dddc9445b2`.
Browser: Google Chrome for Testing 157.0.8103.78, Debian 12 x86-64,
headless software rendering, 1x screenshots.

The browser was downloaded as the owner's 2026-11-13 answer directed.
Missing Debian runtime libraries are the existing #488 defect. For this run,
Debian bookworm packages were downloaded and extracted into
`/tmp/issue-469-browser/libs` without root, following #488's documented
user-space workaround. `LD_LIBRARY_PATH` names its `usr/lib/x86_64-linux-gnu`
and `lib/x86_64-linux-gnu` directories.

## Reproduction

Build the CLI with `pnpm build`. Before editing the rig, build the base with
`pnpm --dir site build:fixture --outDir ./node_modules/.issue-469-base`.
Build the committed head with the same command and `.issue-469-head`.
The captures use the existing `site/test/browser.ts` and `BrowserFixture`.
The three scripts here are the temporary scripts used, not maintained tools:
place them in `site/node_modules/` so their imports resolve and change the
workspace path if needed. Set `SITE_BROWSER` to the downloaded Chrome.

```
node site/node_modules/capture.mjs
node site/node_modules/controlled.mjs
node site/node_modules/media.mjs
```

`capture.mjs` opens both fixture builds in both themes, at rest and after
real mouse movement at 1440x900, and at rest at 320x900. The story is marked
seen; CSS animations are paused at their first frame for captures. Pointer
spring settling is time based, so these actual-interaction images are visual
comparisons, not exact pixel-equality assertions. The contact sheet puts base
on the left and head on the right: light/rest, light/pointer, dark/rest,
dark/pointer. The sign's post lighting, sunlight shading, tilt, plate glints
and legibility look unchanged.

`controlled.mjs` isolates cloned page elements from hydrated animation owners
and draws explicit identical rig states. Both resting captures and the dark
pointer captures are pixel-identical. The light pointer pair differs in 490
colour channels out of 3,888,000; visual inspection shows the same sign.
`controlled-pixels.json` retains the comparison counts. `pixels.json` retains
counts for the interaction captures without claiming pixel equality.

`writes.json` observes actual setProperty calls from one identical reachable
beam application. Each post takes 9 -> 0 writes by day and 9 -> 5 at night.
The retained night names are --lx, --ly, --brx, --bry and --gain.
Plate values compare exactly between base and head in both themes.
`media.json` records the six successful theme/media combinations: touch-first,
reduced motion and increased contrast. `red.log` records the new browser
regression failing against the original implementation in both themes.

The committed `site/test/sign-beam.test.ts` separately observes the real
pre-paint and hydrated writers, pointer motion, remeasurement, repeated theme
changes, footprint/viewport culling and recovery. Its guarded apply calls throw
on layout reads. No frame-cost or timing improvement is claimed.

Final source PR head: `5b4058528f2b9565888380bfad5252804c188786`.
Its only difference from the measured head is the HTML test baseline update.
`html-baseline.json` proves that substituting the base rest script in the head
reproduces the old normalized HTML hash exactly. `html-baseline.mjs` records
that comparison. The English and pseudo-locale 320 px loaded screenshots were
also inspected directly for clipping, overlap and post lighting.

The first local `pnpm --dir site validate` was stopped after the intentional
inline-script HTML hash mismatch was fixed. It had completed geometry checks
for all 18 routes at all three widths and both themes, plus the first keyboard
matrices. It is not a passing full-suite record. The contribution guide permits
all required Linux CLI and site matrix checks to replace a full local run;
complete final-head results belong to the PR worker handoff. The focused HTML
baseline and final sign browser checks were run separately after the fix.
