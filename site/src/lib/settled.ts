// The `client:settled` directive (hydration.ts), run in the browser: hydrate
// an island once the page has loaded, its fonts are ready and it has painted,
// then when the browser is idle. `client:idle` can fire before the first
// paint while the page still waits for its fonts, which puts the island's
// script on the path to the largest paint.
import type { ClientDirective } from "astro";

const loaded = () =>
  document.readyState === "complete"
    ? Promise.resolve()
    : new Promise((resolve) =>
        window.addEventListener("load", resolve, { once: true }),
      );

const frame = () => new Promise(requestAnimationFrame);

const idle = () =>
  new Promise((resolve) =>
    "requestIdleCallback" in window
      ? requestIdleCallback(resolve)
      : setTimeout(resolve, 200),
  );

const settled: ClientDirective = (load) => {
  void (async () => {
    await loaded();
    await document.fonts.ready;
    await frame();
    await frame();
    await idle();
    const hydrate = await load();
    await hydrate();
  })();
};

export default settled;
