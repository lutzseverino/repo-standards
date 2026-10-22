import { useEffect, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/app/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/app/toggle-group";
import { installText, type InstallMode, type Source } from "@/lib/catalogue";

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
}: {
  mode: InstallMode;
  onChange: (mode: InstallMode) => void;
}) {
  return (
    <ToggleGroup
      aria-label="What to copy"
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
        Agent prompt
      </ToggleGroupItem>
      <ToggleGroupItem
        value="terminal"
        className="px-3 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
      >
        Terminal
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function Install({
  source,
  mode,
}: {
  source: Source;
  mode: InstallMode;
}) {
  const [copied, setCopied] = useState(false);
  const text = installText(source, mode);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this", text);
    }
  };
  return (
    // the text wraps, so the source URL that tells the cards apart shows
    <InputGroup>
      <InputGroupTextarea
        readOnly
        value={text}
        aria-label={mode === "prompt" ? "Agent prompt" : "Terminal command"}
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-0 py-1.5 text-[14px] leading-snug wrap-anywhere"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          variant="default"
          size="sm"
          className="h-7 px-3"
          onClick={() => void copy()}
        >
          {copied ? "Copied" : "Copy"}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
