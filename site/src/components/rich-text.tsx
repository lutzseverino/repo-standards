import { Fragment, type ReactNode } from "react";
import type { Rich } from "@/i18n/ids";

/** A message with elements in it (`rich` in i18n/format.ts), each slot filled
 * with its element where the message places it. */
export function RichText({
  parts,
  slots,
}: {
  parts: Rich;
  slots: Record<string, ReactNode>;
}) {
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        if (!(part in slots))
          throw new Error(`No element fills the message's slot ${part}.`);
        return <Fragment key={i}>{slots[part]}</Fragment>;
      })}
    </>
  );
}
