/** Sign arrow: a German-style direction arrow drawn as SVG. */
export function Arrow({ size = 44 }: { size?: number }) {
  return (
    <svg
      className="sign-arrow"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path
        d="M4 20h24v-9l16 13-16 13v-9H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The arrow on an exit tab. */
export function ExitArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 26 26" aria-hidden="true">
      <path
        d="M5 22 L19 8 M10 6 H20 V16"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="square"
      />
    </svg>
  );
}
