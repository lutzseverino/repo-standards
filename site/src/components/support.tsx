// The header's one Support control, on every page: it opens a choice of
// GitHub Sponsors and Ko-fi in a native popover, so it needs no script and
// also renders statically in Astro and Starlight. support.css styles it, and
// SupportLine.astro is the footer's line.
import { ArrowUpRightIcon, HeartIcon } from "lucide-react";
import { SUPPORT, SUPPORT_LABEL } from "@/lib/support";

// one control per page, so one id
const MENU = "support-menu";

/** `compact` shows the heart alone on a phone, for a nav with no room to
 * spare. */
export function SupportMenu({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "support support--compact" : "support"}>
      <button type="button" className="support-trigger" popoverTarget={MENU}>
        <HeartIcon aria-hidden="true" />
        <span className="support-trigger-label">Support</span>
      </button>
      <div
        id={MENU}
        popover="auto"
        role="group"
        aria-labelledby={`${MENU}-title`}
        className="support-menu"
      >
        <p id={`${MENU}-title`} className="support-menu-title">
          {SUPPORT_LABEL}
        </p>
        <ul className="support-options">
          {SUPPORT.map(({ name, url }) => (
            <li key={url}>
              <a className="support-option" href={url}>
                <span className="support-option-name">{name}</span>
                <span className="support-option-url">
                  {url.replace(/^https:\/\//, "")}
                </span>
                <ArrowUpRightIcon aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
