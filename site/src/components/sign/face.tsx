// A sheeted sign plate. Every sign surface on the page is a Face, so it
// catches the same light. A Face renders a second, lit copy of itself masked
// to the beam's footprint. The lit copy always takes the plate's exact size,
// is hidden from assistive technology and ignores the pointer.
import type { ReactNode } from "react";

/** Retroreflective sheeting: the seal lattice, the slat joints of a large
 * plate, and, on the lit copy, the rainbow ring that microprisms split from
 * the beam. */
export function Surface({
  slats = false,
  lit = false,
}: {
  slats?: boolean;
  lit?: boolean;
}) {
  return (
    <span className="css-sheet" aria-hidden="true">
      <i className="seal" />
      {slats && <i className="slats" />}
      {lit && <i className="rainbow" />}
    </span>
  );
}

type FaceProps = {
  as?: "a" | "h1" | "p" | "div";
  kind: "blue" | "white";
  className?: string;
  href?: string;
  label?: string;
  hidden?: boolean;
  slats?: boolean;
  leds?: boolean;
  children: ReactNode;
};

export function Face({
  as: Tag = "div",
  kind,
  className = "",
  href,
  label,
  hidden = false,
  slats = false,
  leds = false,
  children,
}: FaceProps) {
  const classes = `face face--${kind} ${className}`;
  return (
    <div className="face-wrap" data-lo="" aria-hidden={hidden || undefined}>
      <Tag className={classes} href={href} aria-label={label}>
        <Surface slats={slats} />
        {children}
      </Tag>
      {/* the beam's footprint is an ellipse along the beam, so the lit copy
          sits in a frame rotated to the beam and counter-rotated back */}
      <div className="lit-rot" aria-hidden="true" inert>
        <div className={`${classes} face--lit`}>
          <Surface slats={slats} lit />
          <i className="lit-glint" />
          <i className="glare" />
          {children}
        </div>
      </div>
      {leds && (
        <span className="leds" aria-hidden="true">
          <i className="spill" />
          <i className="lens" />
          <i className="lens-shine" />
          <i className="lit" />
          <i className="flare-h" />
          <i className="flare-v" />
        </span>
      )}
    </div>
  );
}
