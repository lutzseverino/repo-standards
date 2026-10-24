// A plate's name keeps to one line by shrinking, down to a floor; past the
// floor it wraps, and the row's plates take the extra line. Only the plate's
// own name is measured; its lit copy takes the result, so the two always
// share one layout. It runs before the first paint (rig.ts `restScript`), so
// the page is drawn with its names fitted, and again whenever a plate changes
// size or the fonts load. The inline copy is the function's source, so it
// must reference nothing outside its own body.
export function fitName(el: HTMLElement) {
  if (el.closest(".face--lit")) return;
  const SIZE = 25;
  const FLOOR = 18;
  const over = () => el.scrollWidth > el.clientWidth + 0.5;
  el.style.whiteSpace = "nowrap";
  let size = SIZE;
  el.style.fontSize = `${size}px`;
  while (over() && size > FLOOR) {
    size -= 0.5;
    el.style.fontSize = `${size}px`;
  }
  if (over()) el.style.whiteSpace = "normal";
  const lit = el
    .closest(".face-wrap")
    ?.querySelector<HTMLElement>(":scope > .lit-copy .signpost-name");
  if (lit) {
    lit.style.fontSize = el.style.fontSize;
    lit.style.whiteSpace = el.style.whiteSpace;
  }
}
