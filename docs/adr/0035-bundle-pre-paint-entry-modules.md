# Bundle pre-paint entry modules

The site's sign rest, theme and locale initialization run before the first
paint. Copying functions with `toString()` made every helper responsible for
referencing nothing outside its own body, preventing ordinary imports and
forcing callers to supply the rail geometry that the post helper owns.

The owner chose bundled TypeScript entry modules on 2026-11-02 in
[#470](https://github.com/lutzseverino/repo-standards/issues/470). A local Vite
plugin registered in the Astro configuration turns a `?prepaint` entry import
into a minified, self-contained IIFE string in both development and production.
Astro inlines it as a synchronous classic script in its existing place. The
docs theme initializer uses the same seam and shared theme behavior. Entry
modules import their helpers normally; the light rig stays together, and
`sinkPosts` finds its rail and curve itself. Query imports stay in code loaded
by Astro/Vite, so directly imported Node modules remain resolvable.

A generated pre-build file would add an artifact to keep in sync. An external
classic script would add a request before the first paint. An ordinary Astro
script is a deferred module and cannot preserve the homepage's render block,
which waits for the marker after the rest script. Bundling in memory keeps
that ordering and moves the self-containment invariant into one build seam
without changing geometry, lighting, timing, theme or locale policy.
