# Issue 470 browser evidence

Implementation: `9ccde20319b1196fae438e3b58556d595121cfdb`.
Base: `80ac324b8c21a036768edecd56262a431d46ccf7`.
Browser: Google Chrome for Testing 157.0.8103.78, Linux, device scale factor 2.

`comparison/` contains the original base/head homepage screenshots at 320 and
1280 CSS px, in light and dark, before and after hydration. All eight pairs
have zero differing pixel channels. The four pre-hydration style snapshots
also match exactly. Both stages collect no initialization, console or
hydration errors. The probe blocks external hydration modules only in the
prepaint stage and verifies islands remain unhydrated there; the hydrated
stage verifies all islands complete. `results.json` retains the snapshots and
counts; `probe.ts` is the actual local probe, with this run's absolute paths.

`phone/` contains representative original 320 px screenshots from the phone
suite, including all page families/locales and both themes. The suite's 18
route checks passed at 320, 360 and 390 px, light and dark, including the menus,
dialogs and resize states exercised by the test. Documentation is English only.
The pseudo-locale is served by the development server; the other locales and
docs use the fixture production build.

The asset branch retains only this issue's evidence as changes against its
pinned default-branch base, allowing the run's requested history and base-diff
audits on both delivery refs. It is never merged into the default branch and
must be retained with the `pr-assets/*` branches.

The full local `pnpm --dir site validate` command reached its 1200-second
execution guard during the later keyboard matrix (exit 124); it did not pass.
The 18 completed geometry test outcomes are retained in `phone/routes.log`.
The focused bundling/theme/locale/clamp run passed 43 tests; theme
defaults/storage browser checks passed 6 tests, and real navigation and keyboard
theme-menu checks passed 2 tests. Full required hosted validation is recorded
in the pull request's worker handoff.
