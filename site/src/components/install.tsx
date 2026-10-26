import { useEffect, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/app/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/app/toggle-group";
import type { Strings } from "@/i18n/ids";
import { installText, type InstallMode, type Source } from "@/lib/catalogue";

export const INSTALL_MODE_STRINGS = [
  "adoption.mode.label",
  "adoption.mode.prompt",
  "adoption.mode.terminal",
] as const;

export const INSTALL_STRINGS = [
  "adoption.field.prompt",
  "adoption.field.terminal",
  "adoption.copy",
  "adoption.copied",
  "adoption.copy-by-hand",
] as const;

const MODE_KEY = "install-mode";

function readStored(): InstallMode | null {
  try {
    const value = window.localStorage.getItem(MODE_KEY);
    return value === "prompt" || value === "terminal" ? value : null;
  } catch {
    // storage can be unavailable, as in some private windows
    return null;
  }
}

/** What the copy fields hold: the agent prompt by default, or the terminal
 * command, remembered across visits. */
export function useInstallMode(): [InstallMode, (mode: InstallMode) => void] {
  const [mode, setMode] = useState<InstallMode>("prompt");
  useEffect(() => {
    const stored = readStored();
    if (stored) setMode(stored);
  }, []);
  const choose = (next: InstallMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // the choice then lasts only for this page
    }
  };
  return [mode, choose];
}

export function InstallModeSwitch({
  mode,
  onChange,
  strings,
}: {
  mode: InstallMode;
  onChange: (mode: InstallMode) => void;
  strings: Strings<(typeof INSTALL_MODE_STRINGS)[number]>;
}) {
  return (
    <ToggleGroup
      aria-label={strings["adoption.mode.label"]}
      variant="outline"
      size="lg"
      spacing={1.5}
      value={[mode]}
      onValueChange={(value: string[]) => {
        const next = value[0];
        if (next === "prompt" || next === "terminal") onChange(next);
      }}
    >
      <ToggleGroupItem
        value="prompt"
        className="px-3 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
      >
        {strings["adoption.mode.prompt"]}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="terminal"
        className="px-3 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
      >
        {strings["adoption.mode.terminal"]}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function Install({
  source,
  mode,
  onCopied,
  strings,
}: {
  source: Source;
  mode: InstallMode;
  /** Something was copied, or offered to copy by hand. */
  onCopied: () => void;
  strings: Strings<(typeof INSTALL_STRINGS)[number]>;
}) {
  const [copied, setCopied] = useState(false);
  const text = installText(source, mode);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt(strings["adoption.copy-by-hand"], text);
    }
    onCopied();
  };
  return (
    <InputGroup className="h-9">
      <InputGroupInput
        readOnly
        value={text}
        title={text}
        aria-label={
          strings[
            mode === "prompt"
              ? "adoption.field.prompt"
              : "adoption.field.terminal"
          ]
        }
        onFocus={(e) => e.currentTarget.select()}
        className="text-[14px] text-ellipsis"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          variant="default"
          size="sm"
          className="h-7 px-3"
          onClick={() => void copy()}
        >
          {strings[copied ? "adoption.copied" : "adoption.copy"]}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
