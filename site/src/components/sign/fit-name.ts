// A plate's name keeps to one line by shrinking, down to a floor; past the
// floor it wraps, and the row's plates take the extra line. It runs before
// the first paint (rig.ts `restScript`), so the page is drawn with its names
// fitted, and again whenever a plate changes size. The inline copy is the
// function's source, so it must reference nothing outside its own body.
export function fitName(el: HTMLElement) {
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
}
