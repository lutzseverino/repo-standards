// A source page's way to adopt the source: the agent prompt and the terminal
// command side by side, and the dialog that says what happens after a copy.
import { useState } from "react";
import { AdoptionDialog } from "./adoption-dialog";
import { Install } from "./install";
import type { InstallMode, Source } from "@/lib/catalogue";

const MODES: [InstallMode, string][] = [
  ["prompt", "Agent prompt"],
  ["terminal", "Terminal"],
];

export function SourceAdoption({ source }: { source: Source }) {
  const [copied, setCopied] = useState<InstallMode | null>(null);
  return (
    <>
      <div className="grid gap-4">
        {MODES.map(([mode, label]) => (
          <div key={mode}>
            <div className="mb-1.5 text-[15px] font-medium">{label}</div>
            <Install
              source={source}
              mode={mode}
              onCopied={() => setCopied(mode)}
            />
          </div>
        ))}
      </div>
      <AdoptionDialog copied={copied} onClose={() => setCopied(null)} />
    </>
  );
}
