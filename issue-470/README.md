# Issue 470 integration evidence

Base: `7970d986246e9f99eb5e5924bc89ad107ba1c70d`.
Head: `10fd1a89fb31b92ffa64a64b4cf348b3c8803c39`.
Browser: Chromium 156.0.8078.79 on Debian 12; device scale factor 2.

The [2026-11-14 continuation decision](https://github.com/lutzseverino/repo-standards/issues/470#issuecomment-6878592310)
authorizes the keep-both reconstruction on PR #514. The ADR index retains
0035 before 0036; the fixture retains #468/#513's explanation, #469's
explanation and `Since #470`. Its check computed the new hash
`1b2c48a3c721fbccdb49849c444a05cfeb21cf4b9506d724ed11555b97fbbfc4`
from the integrated source. The hash was regenerated once. The beam harness
now bundles the exported rig, retaining all culling and no-layout-read assertions.

## Browser comparison

The probes serve fixture builds from clean worktrees of the base and head.
`prepaint` blocks the external island JavaScript while allowing the synchronous
inline initialization; `hydrated` waits for hydration, fonts and a 300 ms settle.
All probes capture initialization, console and unhandled-rejection errors.
All captured error arrays are empty and all corresponding style snapshots match.

- `470-comparison-normal/`: normal-motion pre-paint comparison, with CSS
  animations paused at time zero before capture. All four base/head pairs at
  320/1280 CSS px in light/dark are pixel-identical.
- `470-comparison/`: initial reduced-motion comparison. Five pairs match,
  then hydrated 1280 px light differs by 627,936 color channels and pre-paint
  1280 px dark by 484,696. That last assertion fails; the run stops before
  the final hydrated pair. The unsuccessful result is retained.
- `470-comparison-frozen/`: reduced motion and CSS animation time set to zero.
  All four pre-paint pairs and three hydrated pairs match. The hydrated
  1280 px dark pair differs by 484,696 channels.
- `470-comparison-still/`: additionally disables CSS animations/transitions;
  the same seven pairs match and the same dark hydrated delta remains.
- `470-comparison-control/`: A/A control, using the base build for both labels,
  with the same still probe. It reproduces the identical 484,696-channel delta.
  That difference occupies the sign LED area (physical pixels x491–2068,
  y616–960 at the 2× device scale); it also occurs with unchanged source.

The probes, screenshots and `results.json` in each directory preserve the
observations and measurement limits. No exact animated hydrated pixel equality
is claimed. Normal-motion pre-paint equality and unchanged rest styles are
separately demonstrated. Earlier evidence remains at
[75bfae2](https://github.com/lutzseverino/repo-standards/blob/75bfae23985441bab37b88bb124e5d6d0ed8b026/issue-470/resume-73fcd2a/README.md).

To reproduce, create clean worktrees at the base and head, install the frozen
lockfile independently in each, and run `pnpm --dir site build:fixture` there.
Update the probe's local root/output paths, browser executable and imports to
those checkouts, then run it with Node 24 or 26. Dependencies linked from a
different worktree do not work with Astro's compile cache, so independent
installations are required. Initial shared-dependency worktree attempts
stopped with pnpm's `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` and Astro's
`No cached compile metadata found`; independently installing the frozen
lockfile resolved the setup. Both fixture builds then exited zero (72 base
pages and 73 head pages, including the new ADR's docs page).

## Validation

`470-beam-before.log` and `470-hash-before.log` record the integration failures.
`470-integration.log` records all 29 beam/docs tests passing after the fix.
`470-focused.log` records the remaining 83 focused tests passing.
The aggregate `REPO_STANDARDS_TEST_CONCURRENCY=2 pnpm validate` attempt
passed every prerequisite and all 1,162 CLI tests (no failures or skips), then
reached its 3,600-second shell guard during the site's keyboard matrix and
exited 124. This is an incomplete, failed aggregate attempt, not a pass.
All 18 primary phone routes and 10 complete keyboard route matrices had
passed before the guard canceled the remaining site tests. The timeout log
retains the cancellation diagnostics. The entire site validation command was
then restarted with its own bounded foreground execution; its final outcome
is recorded in the worker handoff and completed record below.

## Phone evidence and manual inspection

All 18 routes pass the 320/360/390 CSS px light/dark geometry matrix: the
homepage, How it works and both recorded sources in English, Spanish, Catalan
and the pseudo-locale, plus the two English docs routes. `phone/` retains the
36 loaded-page captures at 320 px and six representative menu/dialog states.
The complete successful rerun's measurement report is `phone/layout.json`; screenshots
referenced by that report beyond these selected 42 are not included.

Manual inspection covered both 320 px normal-motion pre-paint homepage themes,
the wide homepage comparison captures, the light homepage menu, the light
pseudo-locale menu, the dark docs menu, the light source adoption dialog and an
overview of the long dark How it works page. No overlapping or clipped text or
controls were observed in these captures. Keyboard navigation and the playing
story were not manually driven; the automated keyboard results are separate.
No frame-cost measurement was required or performed.

## Complete final-head site outcome

`SITE_LAYOUT_REPORT=/tmp/470-phone-final pnpm --dir site validate` exited 0
on the unchanged final head: generated shadcn source check, Astro check,
all 287 tests (no failures, cancellations or skips), and the 73-page fixture
build passed. This resolves the site stage canceled by the aggregate guard;
the earlier aggregate attempt itself remains a timeout, not a pass.
The initial 1,162-test CLI pass and this complete site pass cover every local
stage. Required hosted validation remains separately recorded in the PR handoff.

The successful report contains 940 records, including 744 geometry records,
108 loaded-page measurements across 18 routes, and the keyboard and motion
observations. Every geometry record has an empty violations list and its
scroll width equals its requested width (320, 360 or 390 CSS px).
All 16 complete keyboard route matrices pass. `phone/` is from this completed
run. `phone-initial/` preserves the earlier same-head 42 images, including
those manually inspected before the aggregate guard; all primary route
geometry checks had passed in that attempt too.
