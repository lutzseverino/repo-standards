# Expose installed skills through skill links

Every skill an adoption run installs lives in one canonical place,
`.agents/skills/<name>`, which most agents read, including Codex. Claude Code
reads only `.claude/skills/`, and no setting adds another directory, so it saw
none of the installed skills. For each skill a run installs, system or author,
the run now also installs a skill link: a relative symbolic link at
`.claude/skills/<name>` that points to `../../.agents/skills/<name>`. A skill
link is an ordinary installation target. Target ownership applies unchanged, the
inspection identity binds the link, and retiring the skill removes its link.
The product writes only links it owns. It never links a skill that the project
wrote itself, and it never replaces `.claude/skills` as a whole.

## Considered options

- **A second exact copy of each skill under `.claude/skills/`.** This works
  without symbolic links, but every skill exists twice in each adopting project
  and each update's diff carries both copies.
- **One link for the whole `.claude/skills` directory.** Claude Code doesn't
  document this. It would also expose skills the project owns and collide with
  an existing `.claude/skills` directory.
- **A list of agent locations declared by the author or chosen at adoption.**
  Each author would repeat the same list, and the format or selection would
  name tools. The product owns the one compatibility location instead, and adds
  another only if a widely used agent requires it.

## Consequences

Product-created links are the one exception to the rule that symbolic links in
installation targets are unsafe. On a checkout with `core.symlinks=false`, such
as Git for Windows without symlink privilege, the link is a small text file, and
Claude Code doesn't see the skill. That is what every Claude Code user had
before.
