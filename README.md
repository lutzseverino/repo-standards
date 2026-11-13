# Clamp follow-up evidence for #468

Delivered code head: fc22097cc59bae6d9b58df73d7b575162cf769f6.
Before: 80ac324b8c21a036768edecd56262a431d46ccf7.
Appearance, modes, first paint and smoke captured the site source at
f296f8c1bac8d93c3271edb640eac892b4b2bf68; the final child commit only
refreshes test/docs.test.ts's normalized HTML baseline. Site source,
styles and documentation are byte-identical across those two commits.
The final focused phone/layout and remaining site tests use fc22097.
All 212 remaining site tests pass, with no skips (site-final.txt).

Chrome for Testing 156.0.8078.80 linux64, verified by --version.
Debian 12 x86-64, Node.js 24.11.1, Ryzen 7 3700X, software raster.
Acquired Google's exact versioned archive; shared libraries were extracted
locally from Debian packages and supplied through LD_LIBRARY_PATH.

## Appearance

Before/after screenshots cover the English homepage at 320, 360, 390 and
1440 CSS px in both themes, plus the development pseudo-locale at the three
phone widths. Desktop pointer positions are (409, 300) and (1059, 400),
following ten mouse moves from x=400 and x=1050. The pointer rests five
seconds; CSS animations are paused at time zero for comparison (spring-driven
JavaScript light and tilt still run). Screenshots use 2x scale and 900 px
viewport height. All 36 states contain 60 clamp faces and have no captured
console warnings, errors, unhandled errors or horizontal page overflow.

`pixel-comparison.json` records raw RGBA comparisons, without editing images.
All 14 rest pairs and both first-pointer pairs are pixel-identical. The
second-pointer pairs differ by at most 6 channel levels (light) or 5 (dark),
with no visible appearance change. The existing springs stop within their
own tolerances, so the final matrices/beam can differ slightly between runs.

Inspected 320 px English and pseudo-locale light/dark screenshots for wrapping,
readability, clamp placement and clipping, and desktop rest/pointer comparisons
for geometry, paint order and light appearance. No visible difference was
observed. Other browsers, GPU hardware and every lower-page interactive state
were not inspected manually.

`appearance.json.gz` retains the unedited DOM records; `capture.mts` and
`compare.mjs` retain the scripts used in this sandbox. Paths in these scripts
identify this run's worktrees and must be changed for another machine.

## Behavior and layout

- `visibility-before.txt` / `visibility-after.txt`: new rig over existing DOM,
  red then green. `clamps.txt`: all nine real-browser clamp tests, including
  independent corner orientation and a mirrored-axis negative control.
- `firstpaint.json.gz` / `firstpaint.txt`: external island JavaScript blocked,
  inline script draws every face; hydration preserves all transforms,
  visibility and pose in both themes.
- `modes.json` / `modes.txt`: reduced motion, increased contrast and touch-first
  movement/scrolling checks in both themes.
- `phone-layout.json`: 156 states from /, /es/, /ca/ at 320, 360, 390 px,
  light and dark, including loaded, resized and menu/dialog states.
- `pseudo-layout.json` / `pseudo-layout.txt`: 52 equivalent /en-xa/ states.
  Across both reports: 208 states, zero violations. The existing story test
  also passes entry from desktop navigation and the phone panel.

The first broad local validation attempt was stopped after an expected
homepage hash mismatch and an "Inspected target navigated or closed" error
while separate development-server captures were running. Its failed/aborted
result is retained in `initial-validation-interrupted.txt`; it is not a pass.
The HTML baseline was refreshed only after verifying that normalized
non-script markup differs solely by data-clamp-face. The pseudo-locale matrix
then passed in isolation. Final required hosted checks and the complete hosted
site validation are recorded on the PR; no local partial run substitutes for
those gates.

## Profiling smoke

`meta.json`, `records.jsonl` and `summary.json` are the original PR #466 public
script's output, using its compatible bf997b7 browser harness, this site build,
--runs 1 --moves 32, in one browser. Dark: 18.40 ms frame interval and 7.32 ms
rendering/main frame. Light: 16.69 ms and 6.85 ms/main frame. Host load was
approximately 2.05. These are acquisition/measurement smoke results only,
with no new performance comparison, tolerance or budget.

The durable rerun instructions are docs/development/sign-profiling.md on the
code head. Historical seven-run optimization measurements remain in PR #466.
