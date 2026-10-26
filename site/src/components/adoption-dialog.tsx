// What happens after you copy: a dialog that opens on Copy and walks through
// the three steps of an adoption, each with a small picture. It shows kinds
// of files, not one source's files.
import { XIcon } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/app/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/app/dialog";
import { Arrow } from "@/components/sign/arrow";
import { Surface } from "@/components/sign/face";
import type { MessageId, Strings } from "@/i18n/ids";
import type { InstallMode } from "@/lib/catalogue";

const GUIDE =
  "https://github.com/lutzseverino/repo-standards/blob/main/docs/usage/guides/adopt.md";

export const ADOPTION_DIALOG_STRINGS = [
  "adoption.prompt.start.title",
  "adoption.prompt.start.body",
  "adoption.prompt.apply.title",
  "adoption.prompt.apply.body",
  "adoption.prompt.review.title",
  "adoption.prompt.review.body",
  "adoption.terminal.start.title",
  "adoption.terminal.start.body",
  "adoption.terminal.apply.title",
  "adoption.terminal.apply.body",
  "adoption.terminal.review.title",
  "adoption.terminal.review.body",
  "adoption.dialog.prompt-copied",
  "adoption.dialog.command-copied",
  "adoption.dialog.description",
  "adoption.dialog.guide",
  "adoption.dialog.done",
  "adoption.dialog.close",
  "adoption.art.repository",
  "adoption.art.agent",
  "adoption.art.source",
  "adoption.art.tree.instructions",
  "adoption.art.tree.skills",
  "adoption.art.tree.guide",
  "adoption.art.tree.github",
  "adoption.art.tree.adapted",
  "adoption.art.review.changes",
  "adoption.art.review.installed",
  "adoption.art.review.adapted",
  "adoption.art.review.hint",
  "adoption.art.review.commit",
] as const satisfies readonly MessageId[];

type DialogStrings = Strings<(typeof ADOPTION_DIALOG_STRINGS)[number]>;

/* ================= the pictures ================= */

/** The agent's composer with the pasted prompt in it, or the terminal with
 * the command. The prompt stays in English, as the copied prompt does. */
function StartArt({
  mode,
  strings,
}: {
  mode: InstallMode;
  strings: DialogStrings;
}) {
  if (mode === "terminal")
    return (
      <div className="adoption-art adoption-art-term" aria-hidden="true">
        <span className="adoption-art-dots">
          <i />
          <i />
          <i />
        </span>
        <code>
          <span className="adoption-art-muted">
            ~/{strings["adoption.art.repository"]} $
          </span>{" "}
          npx @lutzseverino/repo-standards adopt{" "}
          <span className="adoption-art-chip">
            {strings["adoption.art.source"]}
          </span>
          <span className="adoption-art-caret" />
        </code>
      </div>
    );
  return (
    <div className="adoption-art adoption-art-agent" aria-hidden="true">
      <div className="adoption-art-agent-head">
        <span className="adoption-art-avatar" />
        <span className="adoption-art-muted">
          {strings["adoption.art.agent"]}
        </span>
      </div>
      <div className="adoption-art-composer">
        <span className="adoption-art-chip">
          Run `npx … adopt &lt;source&gt; --json` …
        </span>
        <span className="adoption-art-caret" />
        <span className="adoption-art-send">
          <Arrow size={14} />
        </span>
      </div>
    </div>
  );
}

// installed files replace what was there; only the project's own content
// is adapted
type DialogId = (typeof ADOPTION_DIALOG_STRINGS)[number];

const TREE: [string, "install" | "adapt", DialogId][] = [
  ["AGENTS.md", "install", "adoption.art.tree.instructions"],
  [".agents/skills/", "install", "adoption.art.tree.skills"],
  ["CONTRIBUTING.md", "install", "adoption.art.tree.guide"],
  [".github/", "install", "adoption.art.tree.github"],
  ["README.md", "adapt", "adoption.art.tree.adapted"],
];

/** The repository after adoption: which kinds of files arrive. */
function TreeArt({ strings }: { strings: DialogStrings }) {
  return (
    <div className="adoption-art adoption-art-tree" aria-hidden="true">
      <div className="adoption-art-tree-root">
        {strings["adoption.art.repository"]}/
      </div>
      {TREE.map(([file, kind, note]) => (
        <div key={file} className={`adoption-art-row adoption-art-${kind}`}>
          <span className="adoption-art-mark">
            {kind === "install" ? "+" : "~"}
          </span>
          <span className="adoption-art-file">{file}</span>
          <span className="adoption-art-note">{strings[note]}</span>
        </div>
      ))}
    </div>
  );
}

/** The changes wait, uncommitted, for review. */
function ReviewArt({ strings }: { strings: DialogStrings }) {
  return (
    <div className="adoption-art adoption-art-review" aria-hidden="true">
      <div className="adoption-art-review-bar">
        <span>{strings["adoption.art.review.changes"]}</span>
        <span>
          <b className="adoption-art-plus">
            {strings["adoption.art.review.installed"]}
          </b>{" "}
          <b className="adoption-art-tilde">
            {strings["adoption.art.review.adapted"]}
          </b>
        </span>
      </div>
      <div className="adoption-art-review-foot">
        <span className="adoption-art-muted">
          {strings["adoption.art.review.hint"]}
        </span>
        <span className="adoption-art-button">
          {strings["adoption.art.review.commit"]}
        </span>
      </div>
    </div>
  );
}

/* ================= the steps ================= */

function steps(
  mode: InstallMode,
  strings: DialogStrings,
): { title: string; body: string; art: ReactNode }[] {
  const arts = {
    start: <StartArt mode={mode} strings={strings} />,
    apply: <TreeArt strings={strings} />,
    review: <ReviewArt strings={strings} />,
  };
  return (["start", "apply", "review"] as const).map((step) => ({
    title: strings[`adoption.${mode}.${step}.title`],
    body: strings[`adoption.${mode}.${step}.body`],
    art: arts[step],
  }));
}

/** Opens once something has been copied, and says what to do with it. */
export function AdoptionDialog({
  copied,
  onClose,
  strings,
}: {
  /** What was copied, or null while the dialog is closed. */
  copied: InstallMode | null;
  onClose: () => void;
  strings: DialogStrings;
}) {
  // focus starts on the dialog itself, so a phone opens it at its top
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={copied !== null} onOpenChange={(open) => !open && onClose()}>
      {copied && (
        // it scrolls on a short screen, and keeps shadcn's line height at
        // its larger text
        <DialogContent
          ref={popup}
          className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 text-[15px] leading-(--text-sm--line-height) sm:max-w-[640px]"
          initialFocus={popup}
          showCloseButton={false}
        >
          {/* the dialog's one bold thing: a small sign spanning it, with the
              close button on it */}
          <div className="sign-face sign-face--blue adoption-plate">
            <Surface />
            <span className="sign-face__inner flex items-center gap-3">
              <Arrow size={30} />
              <DialogTitle className="font-(family-name:--font-sign) text-[26px] leading-none font-bold">
                {
                  strings[
                    copied === "prompt"
                      ? "adoption.dialog.prompt-copied"
                      : "adoption.dialog.command-copied"
                  ]
                }
              </DialogTitle>
            </span>
          </div>
          <DialogDescription className="sr-only">
            {strings["adoption.dialog.description"]}
          </DialogDescription>
          <ol className="adoption-steps">
            {steps(copied, strings).map((s, i) => (
              <li key={s.title}>
                <span
                  className="adoption-step-tab tabular-nums"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
                {s.art}
              </li>
            ))}
          </ol>
          <DialogFooter className="items-center sm:justify-between">
            <a
              className="text-[14px] text-muted-foreground underline underline-offset-4"
              href={GUIDE}
            >
              {strings["adoption.dialog.guide"]}
            </a>
            <Button onClick={onClose}>{strings["adoption.dialog.done"]}</Button>
          </DialogFooter>
          {/* shadcn's close button, on the plate, white */}
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-[38px] right-[36px] text-white hover:bg-[rgb(255_255_255/0.16)] hover:text-white dark:hover:bg-[rgb(255_255_255/0.16)]"
              />
            }
          >
            <XIcon />
            <span className="sr-only">{strings["adoption.dialog.close"]}</span>
          </DialogClose>
        </DialogContent>
      )}
    </Dialog>
  );
}
