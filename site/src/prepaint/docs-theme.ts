import { themes } from "../lib/theme-core";

// The supported Starlight override replaces its separate storage key. Keep
// the shared theme's first-paint behavior and its class/attribute pair.
const theme = themes();
theme.sync();

document.addEventListener("DOMContentLoaded", () => {
  const selects = document.querySelectorAll<HTMLSelectElement>(
    "docs-theme-select select",
  );
  const update = () => {
    for (const select of selects) select.value = theme.preference();
    theme.sync();
  };
  for (const select of selects) {
    select.addEventListener("change", () => {
      const value = select.value;
      if (value !== "system" && value !== "dark" && value !== "light") return;
      theme.choose(value);
      update();
    });
  }
  window.matchMedia(theme.DARK).addEventListener("change", () => {
    update();
  });
  update();
});
