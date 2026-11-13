# Issue 470 reconstruction evidence

Base: `d835696e90f75b4594b87c41b6e00369cf7cf64b`.
Visual head: `73fcd2a1424d5d717af01bcf440c91c121aceafa`.
Final head: `f07c7856b6349aa4604bd3b330def2a8aa396486`; this adds only the clamp-test harness adaptation. Product files and the fixture build inputs are unchanged.
Previous implementation: `9ccde20319b1196fae438e3b58556d595121cfdb`.
Browser: Chrome for Testing 157.0.8103.78, device scale factor 2.

The [owner answer](https://github.com/lutzseverino/repo-standards/issues/470#issuecomment-6859641165)
authorizes reconciling the fixture conflict on current main. The replay retained
#513's explanation and changes, added the `Since #470` explanation, and regenerated
the integrated homepage fingerprint. The range comparison with the recovered
commit differs only at that fixture adjustment.

`comparison/` records normal-motion homepage captures at 320 and 1280 CSS px,
both themes, before and after hydration. All four pre-paint pairs are pixel-identical;
all eight style snapshots match; there are no captured initialization or hydration
errors. Seven of eight screenshot pairs are pixel-identical. The hydrated
1280 px light pair differs by 693085 color channels. A second attempt pausing CSS
animations still differed on one hydrated pair, in dark (577815 channels);
its snapshots also match. The paused attempt's JSON and probe are retained here.

`comparison-reduced/` records the same eight pairs with the supported reduced-motion
preference and a 300 ms settle after hydration. All eight are pixel-identical,
with matching styles and no captured errors. The normal-motion pre-paint result
is retained independently; exact hydrated pixel equality is asserted only for
this stable observation. The screenshots and each probe's JSON expose the limits
of the comparison.

The original implementation evidence at `../comparison/` and `../phone/`, along
with the original PR handoff, remains unchanged.

All 18 routes passed the phone geometry matrix at 320, 360 and 390 CSS px,
in light and dark: the homepage, How it works and both recorded source pages
in English, Spanish, Catalan and the pseudo-locale; plus the two English docs
routes. `phone/routes.log` records those outcomes. The 40 retained images
include every route at 320 px in both themes and representative menu/dialog
states. Keyboard navigation and further regression checks are recorded in the
final validation outcome, separately from these completed route checks.

Manual inspection covered the current homepage at 320 and 1280 px in both
themes, a 320 px pseudo-locale menu, a source dialog, the How it works page and
the docs menu. No overlapping, unreadable or clipped text was observed in those
captures. Keyboard focus and the playing story were not manually inspected.
No new frame-cost measurement was required or performed.

The full local site run on the visual head exited 1: 280/281 tests passed.
The failure was the #513 test extracting the removed `const rig = (...)`
serialization. The final head bundles the exported `lightRig` module in that
test instead, preserving every pose and face assertion. All nine focused clamp
tests passed after the adaptation. Final required validation is recorded in
the PR handoff.
