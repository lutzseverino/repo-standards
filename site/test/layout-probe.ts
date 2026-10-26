// What a phone shows of a page, measured in the browser after layout: the
// page's own horizontal overflow, and every piece of text and every control
// that lies off the screen, is cut off by an ancestor that clips, or sticks
// out of the box that holds it. A page can be exactly as wide as the screen
// and still hide content: a clipping ancestor, such as `.sign-page`, keeps
// it from widening the page. A code block or a table, such as the installs
// table, may scroll sideways in its own box, which keeps what it scrolls
// reachable, so only that box must fit; any other box that scrolls sideways
// hides content as surely as one that clips. The plates' lit copies are inert
// decoration, drawn over the plates they copy, and are never content.

/** One piece of content a phone does not show whole. */
export type Violation = {
  /** `page`: the page scrolls sideways. `screen`: the content lies past an
   * edge of the screen. `clipped`: an ancestor that clips cuts it off.
   * `box`: it sticks out of the box that lays it out. `scroll`: a box
   * other than a code block or a table scrolls sideways to show it. */
  kind: "page" | "screen" | "clipped" | "box" | "scroll";
  /** The content, as `tag.class` steps from its nearest landmark. */
  element: string;
  /** The start of its text, if it has any. */
  text: string;
  /** How it overflows, in CSS pixels. */
  detail: string;
};

export type Layout = {
  /** The page's scroll width, which a page that fits keeps at the screen's
   * width. */
  scrollWidth: number;
  violations: Violation[];
};

/** Measures the page in a screen `width` CSS pixels wide. Run in the
 * browser, so it references nothing outside its own body. */
export function measureLayout(width: number): Layout {
  const SLACK = 1;
  const CONTROLS =
    "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=menuitem], [role=menuitemradio], [role=option]";
  const round = (n: number) => Math.round(n * 10) / 10;

  const name = (el: Element) => {
    const classes = [...el.classList]
      .filter((c) => !/[:[\]/]/.test(c))
      .slice(0, 2);
    return [el.localName, ...classes].join(".");
  };
  const path = (el: Element) => {
    const steps = [];
    for (
      let at: Element | null = el;
      at && at !== document.body && steps.length < 4;
      at = at.parentElement
    ) {
      steps.unshift(name(at));
      if (/^(main|nav|header|footer|aside|dialog)$/.test(at.localName)) break;
    }
    return steps.join(" > ");
  };
  const snippet = (node: Node) =>
    (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48);

  const style = (el: Element) => getComputedStyle(el);
  /** The box inside an element's borders, where its content may draw. */
  const paddingBox = (el: Element) => {
    const rect = el.getBoundingClientRect();
    const s = style(el);
    return {
      left: rect.left + parseFloat(s.borderLeftWidth),
      right: rect.right - parseFloat(s.borderRightWidth),
      top: rect.top + parseFloat(s.borderTopWidth),
      bottom: rect.bottom - parseFloat(s.borderBottomWidth),
    };
  };
  const containsBlock = (s: CSSStyleDeclaration) =>
    s.position !== "static" ||
    s.transform !== "none" ||
    s.filter !== "none" ||
    /paint|layout|strict|content/.test(s.contain);
  const scrolls = (s: CSSStyleDeclaration) =>
    s.overflowX === "auto" || s.overflowX === "scroll";
  /** A box made to scroll sideways: a code block or a table. */
  const sideways = (el: Element) =>
    el.matches("pre, table") ||
    el.querySelector(":scope > pre, :scope > table") !== null;

  type Edge = { at: number; by: string };
  type Area = Record<"left" | "right" | "top" | "bottom", Edge>;
  const SCREEN = "the screen";
  /** Where content starting at `start` can show: the screen, cut down by
   * each ancestor that clips it, with what sets each edge. Null when a
   * local scroller holds it, so scrolling reaches it, or when it is
   * visually hidden for screen readers only. */
  const visibleArea = (start: Element, absolute: boolean): Area | null => {
    const area: Area = {
      left: { at: 0, by: SCREEN },
      right: { at: width, by: SCREEN },
      top: { at: -Infinity, by: SCREEN },
      bottom: { at: Infinity, by: SCREEN },
    };
    const narrow = (edge: keyof Area, at: number, by: Element) => {
      const inward = edge === "left" || edge === "top";
      if (inward ? at > area[edge].at : at < area[edge].at)
        area[edge] = { at, by: path(by) };
    };
    let escaping = absolute;
    for (
      let at: Element | null = start;
      at && at !== document.body && at !== document.documentElement;
      at = at.parentElement
    ) {
      const s = style(at);
      // an absolutely positioned box escapes clipping up to its
      // containing block
      if (escaping && !containsBlock(s)) continue;
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const rect = at.getBoundingClientRect();
        if (rect.width <= SLACK && rect.height <= SLACK) return null;
        if (scrolls(s)) return null;
        const box = paddingBox(at);
        const margin =
          s.overflowX === "clip" ? parseFloat(s.overflowClipMargin) || 0 : 0;
        if (s.overflowX !== "visible") {
          narrow("left", box.left - margin, at);
          narrow("right", box.right + margin, at);
        }
        if (s.overflowY === "hidden" || s.overflowY === "clip") {
          narrow("top", box.top - margin, at);
          narrow("bottom", box.bottom + margin, at);
        }
      }
      if (s.position === "fixed") break;
      escaping = s.position === "absolute";
    }
    return area;
  };

  /** The nearest ancestor that lays out `el`'s line or box. */
  const layoutBox = (el: Element | null) => {
    for (let at = el; at && at !== document.body; at = at.parentElement) {
      const display = style(at).display;
      if (display !== "inline" && display !== "contents") return at;
    }
    return null;
  };

  /** Content no visitor sees or reaches: inert decoration, hidden boxes and
   * the menus and dialogs a page has not opened. */
  const unseen = (el: Element) =>
    el.closest("[inert], script, style, template, noscript, option") !== null ||
    !el.checkVisibility({ opacityProperty: true, visibilityProperty: true });

  type Extent = { left: number; right: number; top: number; bottom: number };
  const violations: Violation[] = [];
  const reported = new Set<Element>();
  const report = (
    kind: Violation["kind"],
    el: Element,
    node: Node,
    detail: string,
  ) => {
    // one report for a box and everything in it that overflows with it
    for (let at: Element | null = el; at; at = at.parentElement)
      if (reported.has(at)) return;
    reported.add(el);
    violations.push({ kind, element: path(el), text: snippet(node), detail });
  };

  /** Checks one piece of content, `extent` drawn by `el` (its own box, or
   * the lines of its text `node`), against where it can show and the box
   * that lays it out. */
  const check = (el: Element, node: Node, extent: Extent, own: boolean) => {
    const s = style(el);
    if (own && s.position === "fixed") {
      if (extent.left < -SLACK || extent.right > width + SLACK)
        report(
          "screen",
          el,
          node,
          `spans x=${round(extent.left)}–${round(extent.right)} on a ${width} px screen`,
        );
      return;
    }
    const area = own
      ? visibleArea(el.parentElement!, s.position === "absolute")
      : visibleArea(el, false);
    if (!area) return;
    const crossed = (["left", "right", "top", "bottom"] as const).find(
      (edge) =>
        edge === "left" || edge === "top"
          ? extent[edge] < area[edge].at - SLACK
          : extent[edge] > area[edge].at + SLACK,
    );
    if (crossed) {
      const spans = `spans x=${round(extent.left)}–${round(extent.right)}, y=${round(extent.top)}–${round(extent.bottom)}`;
      const edge = area[crossed];
      const axis = crossed === "left" || crossed === "right" ? "x" : "y";
      if (edge.by === SCREEN)
        report("screen", el, node, `${spans} on a ${width} px screen`);
      else
        report(
          "clipped",
          el,
          node,
          `${spans}, cut off at ${axis}=${round(edge.at)} by ${edge.by}`,
        );
      return;
    }
    // positioned boxes are placed on purpose, often past their parent
    if (own && s.position === "absolute") return;
    const holder = own ? layoutBox(el.parentElement) : layoutBox(el);
    if (!holder || style(holder).overflowX !== "visible") return;
    const box = paddingBox(holder);
    // a negative margin places a box past its parent on purpose, as shadcn's
    // input group does with the buttons at its ends
    if (own) {
      box.left += Math.min(0, parseFloat(s.marginLeft));
      box.right -= Math.min(0, parseFloat(s.marginRight));
    }
    if (extent.left < box.left - SLACK || extent.right > box.right + SLACK)
      report(
        "box",
        el,
        node,
        `spans x=${round(extent.left)}–${round(extent.right)}, outside ${path(holder)} at x=${round(box.left)}–${round(box.right)}`,
      );
  };

  const extentOf = (rects: Iterable<DOMRect>): Extent | null => {
    let extent: Extent | null = null;
    for (const r of rects) {
      if (r.width === 0 && r.height === 0) continue;
      extent = extent
        ? {
            left: Math.min(extent.left, r.left),
            right: Math.max(extent.right, r.right),
            top: Math.min(extent.top, r.top),
            bottom: Math.max(extent.bottom, r.bottom),
          }
        : { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }
    return extent;
  };

  // controls, and the grid and flex items that lay out cards and rows
  for (const el of document.body.querySelectorAll("*")) {
    const parent = el.parentElement;
    const laidOut = parent !== null && /flex|grid/.test(style(parent).display);
    const scroller = scrolls(style(el));
    if (!el.matches(CONTROLS) && !laidOut && !scroller) continue;
    if (unseen(el)) continue;
    const extent = extentOf([el.getBoundingClientRect()]);
    if (extent) check(el, el, extent, true);
    if (scroller && el.scrollWidth > el.clientWidth + SLACK && !sideways(el))
      report(
        "scroll",
        el,
        el,
        `scrolls sideways, showing ${el.clientWidth} px of its ${el.scrollWidth} px content`,
      );
  }

  // text
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!el || !node.textContent?.trim() || unseen(el)) continue;
    range.selectNodeContents(node);
    const extent = extentOf(range.getClientRects());
    if (extent) check(el, node, extent, false);
  }

  const scrollWidth = document.documentElement.scrollWidth;
  if (scrollWidth > width + SLACK)
    violations.unshift({
      kind: "page",
      element: "html",
      text: "",
      detail: `the page is ${scrollWidth} px wide on a ${width} px screen`,
    });
  return { scrollWidth, violations };
}
