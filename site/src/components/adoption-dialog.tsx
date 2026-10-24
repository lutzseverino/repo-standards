// What happens after you copy: a dialog that opens on Copy and walks through
// the three steps of an adoption, each with a small picture. It shows kinds
// of files, not one source's files.
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/app/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/app/dialog";
import { Arrow } from "@/components/sign/arrow";
import { Surface } from "@/components/sign/face";
import type { InstallMode } from "@/lib/catalogue";

const GUIDE =
  "https://github.com/lutzseverino/repo-standards/blob/main/docs/usage/guides/adopt.md";

/* ================= the pictures ================= */

/** The agent's composer with the pasted prompt in it, or the terminal with
 * the command. */
function StartArt({ mode }: { mode: InstallMode }) {
  if (mode === "terminal")
    return (
      <div className="art art-term" aria-hidden="true">
        <span className="art-dots">
          <i />
          <i />
          <i />
        </span>
        <code>
          <span className="art-muted">~/your-repository $</span> npx
          @lutzseverino/repo-standards adopt{" "}
          <span className="art-chip">source</span>
          <span className="art-caret" />
        </code>
      </div>
    );
  return (
    <div className="art art-agent" aria-hidden="true">
      <div className="art-agent-head">
        <span className="art-avatar" />
        <span className="art-muted">Coding agent in your-repository</span>
      </div>
      <div className="art-composer">
        <span className="art-chip">
          Run `npx … adopt &lt;source&gt; --json` …
        </span>
        <span className="art-caret" />
        <span className="art-send">
          <Arrow size={14} />
        </span>
      </div>
    </div>
  );
}

// installed files replace what was there; only the project's own content
// is adapted
const TREE: [string, "install" | "adapt", string][] = [
  ["AGENTS.md", "install", "agent instructions"],
  [".agents/skills/", "install", "skills"],
  ["CONTRIBUTING.md", "install", "contribution guide"],
  [".github/", "install", "templates and checks"],
  ["README.md", "adapt", "your content, adapted"],
];

/** The repository after adoption: which kinds of files arrive. */
function TreeArt() {
  return (
    <div className="art art-tree" aria-hidden="true">
      <div className="art-tree-root">your-repository/</div>
      {TREE.map(([file, kind, note]) => (
        <div key={file} className={`art-row art-${kind}`}>
          <span className="art-mark">{kind === "install" ? "+" : "~"}</span>
          <span className="art-file">{file}</span>
          <span className="art-note">{note}</span>
        </div>
      ))}
    </div>
  );
}

/** The changes wait, uncommitted, for review. */
function ReviewArt() {
  return (
    <div className="art art-review" aria-hidden="true">
      <div className="art-review-bar">
        <span>Uncommitted changes</span>
        <span>
          <b className="art-plus">+ installed</b>{" "}
          <b className="art-tilde">~ adapted</b>
        </span>
      </div>
      <div className="art-review-foot">
        <span className="art-muted">Review, then commit as usual</span>
        <span className="art-button">Commit</span>
      </div>
    </div>
  );
}

/* ================= the steps ================= */

const REVIEW =
  "Nothing is committed for you. Review the changes, including any file the source replaced, then commit as usual.";

function steps(
  mode: InstallMode,
): { title: string; body: string; art: ReactNode }[] {
  return mode === "prompt"
    ? [
        {
          title: "Paste it into your coding agent",
          body: "Open the agent in the repository you want to set up, with at least one commit and no uncommitted changes. Any agent that can run commands works.",
          art: <StartArt mode="prompt" />,
        },
        {
          title: "The agent adopts the setup",
          body: "It chooses a version and profile and reviews the proposed changes. Then it installs the source's files, adapts your project's own content and runs the source's checks.",
          art: <TreeArt />,
        },
        {
          title: "You review and commit",
          body: `${REVIEW} To update later, give the agent the same prompt again.`,
          art: <ReviewArt />,
        },
      ]
    : [
        {
          title: "Run it in your repository",
          body: "In the repository you want to set up, with at least one commit and no uncommitted changes, using Node.js 24 or 26.",
          art: <StartArt mode="terminal" />,
        },
        {
          title: "Answer its questions",
          body: "It asks for a version and profile and shows the proposed changes. Then it installs the source's files, walks you through adapting your own content and runs the source's checks.",
          art: <TreeArt />,
        },
        {
          title: "Review and commit",
          body: `${REVIEW} Run the same command again later to update.`,
          art: <ReviewArt />,
        },
      ];
}

/** Opens once something has been copied, and says what to do with it. */
export function AdoptionDialog({
  copied,
  onClose,
}: {
  /** What was copied, or null while the dialog is closed. */
  copied: InstallMode | null;
  onClose: () => void;
}) {
  // focus starts on the dialog itself, so a phone opens it at its top
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={copied !== null} onOpenChange={(open) => !open && onClose()}>
      {copied && (
        <DialogContent
          ref={popup}
          className="adoption-dialog gap-5 p-6 sm:max-w-[640px]"
          initialFocus={popup}
        >
          {/* the dialog's one bold thing: a small sign spanning it, with the
              close button on it */}
          <div className="face face--blue dialog-plate">
            <Surface />
            <span className="face__inner flex items-center gap-3">
              <Arrow size={30} />
              <DialogTitle className="text-[26px] leading-none font-bold">
                {copied === "prompt" ? "Prompt copied" : "Command copied"}
              </DialogTitle>
            </span>
          </div>
          <DialogDescription className="sr-only">
            What happens next
          </DialogDescription>
          <ol className="dialog-steps">
            {steps(copied).map((s, i) => (
              <li key={s.title}>
                <span className="step-tab tnum" aria-hidden="true">
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
              Read the adoption guide
            </a>
            <Button onClick={onClose}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
