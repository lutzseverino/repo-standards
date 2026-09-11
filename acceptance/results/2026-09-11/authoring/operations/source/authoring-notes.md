# Authoring notes

Confirmed context: small Node command-line tools; one `node-cli` profile.

- `support-file` maps to `guidance/support.md`, the two operation scripts, and
  `resources/support-placeholder.json`. The project owns its destination and
  extra fields. Accepted shapes are unverified/null and configured/nonempty
  instructions; configured does not imply verified. This keeps forgotten support
  visible without inventing an address. The read-only check enforces shape; the
  adopted policy runs its create-only repair using the separately reviewable
  placeholder. Existing destinations and malformed files remain byte-for-byte
  unchanged. Interrupted partial content requires manual correction.
- Both operations require Node 24, probe `node --version`, use literal empty
  argument lists, and have 10-second probe/run timeouts. They need no network or
  credentials. Trusted operations inherit user access. Excluding the owning
  declaration removes both operations. No exclusions are configured here.
- `bug-report-routine` owns the complete `skills/draft-bug-report` directory for
  `.agents/skills/draft-bug-report`. Local edits conflict with its installed
  baseline and block updates; permitted updates replace the whole unchanged
  directory. Accepted ordinary work is a Markdown draft
  with reproduction steps, expected/actual behavior, and honest attempted-action
  evidence, never submission. Node 24 and local agent text/file/shell tools are
  used, with 10-second and 1 MiB-per-stream reproduction limits. Additional
  requirements need author input; no dependency installation is automatic.

Explicit non-preferences: no shared fixed destination, no overwrite of existing
support files, no destination-verification claim, and no automatic submission.

Deferred by the author: other testing, code organization, documentation, review,
agent behavior, and tooling topics. No additional contexts or profiles requested.
No unresolved policy decisions. Exercise evidence is retained outside this source;
structural validation alone does not verify behavior or future project compliance.
