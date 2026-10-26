// A source page's way to adopt the source: the agent prompt and the terminal
// command side by side, and the dialog that says what happens after a copy.
import { useState } from "react";
import { ADOPTION_DIALOG_STRINGS, AdoptionDialog } from "./adoption-dialog";
import { INSTALL_STRINGS, Install } from "./install";
import type { Strings } from "@/i18n/ids";
import type { InstallMode, Source } from "@/lib/catalogue";

const MODES = [
  ["prompt", "adoption.mode.prompt"],
  ["terminal", "adoption.mode.terminal"],
] as const;

export const SOURCE_ADOPTION_STRINGS = [
  "adoption.mode.prompt",
  "adoption.mode.terminal",
  ...INSTALL_STRINGS,
  ...ADOPTION_DIALOG_STRINGS,
] as const;

export function SourceAdoption({
  source,
  strings,
}: {
  source: Source;
  strings: Strings<(typeof SOURCE_ADOPTION_STRINGS)[number]>;
}) {
  const [copied, setCopied] = useState<InstallMode | null>(null);
  return (
    <>
      <div className="grid gap-4">
        {MODES.map(([mode, label]) => (
          <div key={mode}>
            <div className="mb-1.5 text-[15px] font-medium">
              {strings[label]}
            </div>
            <Install
              source={source}
              mode={mode}
              onCopied={() => setCopied(mode)}
              strings={strings}
            />
          </div>
        ))}
      </div>
      <AdoptionDialog
        copied={copied}
        onClose={() => setCopied(null)}
        strings={strings}
      />
    </>
  );
}
