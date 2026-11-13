# Profile the hero sign

Rerun the sign's frame-cost measurement with fixture production builds, a
versioned browser and the original public script. This is a manual diagnostic,
with no CI gate, budget or persistent profiling setting. Run commands from the
repository root, using [Setup and validation](README.md#setup-and-validation).

## Acquire and verify the browser

The historical measurement in [PR #466](https://github.com/lutzseverino/repo-standards/pull/466)
used **Chrome for Testing 156.0.8078.80, linux64**. On Linux x86-64, acquire
that exact browser from Google's
[Chrome for Testing distribution](https://github.com/GoogleChromeLabs/chrome-for-testing#json-api-endpoints):

```sh
profile_dir=$(mktemp -d)
curl --fail --location --retry 2 --max-time 180 \
  https://storage.googleapis.com/chrome-for-testing-public/156.0.8078.80/linux64/chrome-linux64.zip \
  -o "$profile_dir/chrome.zip"
unzip -q "$profile_dir/chrome.zip" -d "$profile_dir"
export SITE_BROWSER="$profile_dir/chrome-linux64/chrome"
"$SITE_BROWSER" --version
```

The last command must report `Google Chrome for Testing 156.0.8078.80`.
Keep this shell and `profile_dir` for the following commands. Chrome also
needs its Linux shared libraries. On a minimal Debian 12 installation, have
the system administrator install these packages before verifying the version:

```sh
apt-get update
apt-get install --no-install-recommends \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libdbus-1-3 libcups2 \
  libxkbcommon0 libasound2 libgbm1 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libatspi2.0-0 libavahi-client3 libavahi-common3 \
  libwayland-server0 libdrm2 libxi6
```

Other platforms can select their archive from the distribution's versioned
download data. Record the actual browser version, OS, architecture, machine
load and raster/GPU setup with results. Another machine or browser does not
reproduce the historical numbers directly.

## Acquire the script and compatible harness

The complete `profile.ts` source is in
[PR #466's Evidence](https://github.com/lutzseverino/repo-standards/pull/466),
under the expandable measurement-script listing. Extract it without copying
the surrounding Markdown, and use the harness from its measured head:

````sh
gh pr view 466 --repo lutzseverino/repo-standards --json body \
  > "$profile_dir/pr-466.json"
python3 - "$profile_dir" <<'PY'
import json
import pathlib
import sys

directory = pathlib.Path(sys.argv[1])
body = json.loads((directory / "pr-466.json").read_text())["body"]
script = body.split("```ts\n", 1)[1].split("\n```", 1)[0]
(directory / "profile.ts").write_text(script)
PY
git show bf997b7bc3ac8e3888e595c8f73215fe62ef3e6a:site/test/browser.ts \
  > "$profile_dir/browser.ts"
````

Use Node.js 24 for this script. The historical harness is self-contained and
accepts `Browser.launch(executable)`. The current harness also requires a
`BrowserFixture`; passing it to the unmodified historical script is
incompatible. The historical harness can serve the current fixture build;
it need not come from the build's revision.

## Smoke run and historical comparison

Build and smoke-test the current checkout, producing both measures in both
themes:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --dir site build:fixture
node "$profile_dir/profile.ts" "$profile_dir/browser.ts" "$SITE_BROWSER" \
  --runs 1 --moves 32 --out "$profile_dir/smoke" "head=$PWD/site/dist"
cat "$profile_dir/smoke/summary.json"
```

This short run verifies acquisition and measurement, and establishes no
performance comparison. Successful output has finite positive `frameMs` and
`renderMsPerFrame` values for both themes in `records.jsonl`, with
`medianFrameMs` and `medianRenderMsPerFrame` in `summary.json`. A missing
trace phase, nonfinite measure or failed command is unresolved measurement,
never a passing result.

The original comparison used these immutable build revisions:

| Label    | Build revision                             | Meaning                    |
| -------- | ------------------------------------------ | -------------------------- |
| baseline | `4245becb451483ba5871efe7c4d65e211d28c79a` | Before sign realism        |
| shipped  | `8ae6426f02c5c23fdd1c464a1cac5fa48bea06a1` | Before the optimization    |
| head     | `bf997b7bc3ac8e3888e595c8f73215fe62ef3e6a` | Measured optimization head |

Create separate worktrees so in-progress work stays intact. If a revision is
absent from a shallow clone, fetch that commit from `origin` first:

```sh
git worktree add --detach "$profile_dir/baseline" 4245becb451483ba5871efe7c4d65e211d28c79a
git worktree add --detach "$profile_dir/shipped" 8ae6426f02c5c23fdd1c464a1cac5fa48bea06a1
git worktree add --detach "$profile_dir/head" bf997b7bc3ac8e3888e595c8f73215fe62ef3e6a
for build in baseline shipped head; do
  (cd "$profile_dir/$build" && pnpm install --frozen-lockfile && pnpm build && pnpm --dir site build:fixture) || exit 1
done
```

Only after all three builds succeed, run the original comparison:

```sh
node "$profile_dir/profile.ts" "$profile_dir/browser.ts" "$SITE_BROWSER" \
  --runs 7 --moves 160 --out "$profile_dir/comparison" \
  "baseline=$profile_dir/baseline/site/dist" \
  "shipped=$profile_dir/shipped/site/dist" \
  "head=$profile_dir/head/site/dist"
```

The script interleaves build order in one browser, at 1440×900 CSS px and 2×
scale, without touch emulation. It sets each theme, disables automatic story
playback, lets the pointer engage for two seconds, then records a
`devtools.timeline` trace during a pointer sweep. Retain `meta.json`,
`records.jsonl` and `summary.json` with the PR or other lasting result record,
including each build revision and the command. Do not commit raw runs as
maintained documentation.

## Interpret the two measures

**Frame interval (`frameMs`)** is the mean interval between compositor
`DrawFrame` events. It includes waiting for display cadence. At 60 Hz, a
build that finishes work sooner can still draw every 16.67 ms. This is not
renderer work per frame and cannot reliably distinguish vsync-limited builds.

**Rendering (`renderMsPerFrame`)** is renderer main-thread time in style
recalculation, layout, pre-paint, paint, layerize, commit and animation-frame
callbacks, divided by `BeginMainThreadFrame` count. Overlapping intervals
are counted once, including forced style/layout inside callbacks. It excludes
raster workers, the compositor and GPU/viz time, which the script reports
separately. Do not add overlapping phase totals to recover rendering time.

The original values remain **historical evidence** in PR #466: light-theme
median frame intervals of 16.69/16.67 ms (baseline/head) are effectively held
at 60 Hz. Their 0.02 ms difference supports no meaningful cost claim. The
historical rendering medians, 8.77/6.4 ms, carry that light-theme cost
comparison. This interpretation preserves the original definitions and
measurements; it supplies no new tolerance or threshold. A new performance
claim needs its own recorded comparison.
