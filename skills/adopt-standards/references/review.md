# Review completed outputs

A complete run leaves its changes uncommitted. Review their contents before the
maintainer's normal commit workflow, after initial adoption and after every
update. A list of filenames or hashes is not a content review. What a run
writes and records is defined in
[durable and local state](https://github.com/lutzseverino/repo-standards/blob/v5.1.1/docs/usage/adoption.md#durable-and-local-state).

## Enumerate every output

From the project root, obtain the tracked diff and a complete inventory of new
files:

```sh
git --no-optional-locks diff --no-ext-diff --no-textconv --binary --
git --no-optional-locks ls-files --others --exclude-standard -z
```

`git diff` omits untracked files, so the second command is required. Consume
its NUL-delimited paths without shell word splitting: paths may contain spaces,
newlines, or leading dashes.

## Read each new file

For each path, read its complete content and executable state, or invoke this
argument vector directly, substituting the literal path for `<path>`:

```text
["git", "--no-optional-locks", "diff", "--no-index", "--no-ext-diff",
 "--no-textconv", "--binary", "--", "/dev/null", "<path>"]
```

With `--no-index`, exit 1 means differences were found; treat any other failure
as an incomplete review. Binary patches keep bytes and mode changes, but
evaluate non-text content with a suitable viewer or an explicit binary-aware
inspection.

Account for every enumerated path, including hidden files: exact targets,
every installed skill file, retained inputs, the selection, lock, and state,
`.repo-standards/.gitignore`, and the runtime package manifest and lockfile.
The ordinary ignore rules exclude dependencies, caches, and local execution
logs; review script outcomes from the run report separately.

## Leave the project as the run left it

- Save review artifacts outside the adopting project, so they don't become new
  outputs themselves.
- Don't stage files, including with intent-to-add, to expose their contents.
- Confirm that HEAD, the index, and the working files are unchanged across the
  review.
- Report any unreadable or unreviewed output explicitly.

Only the maintainer's normal workflow stages or commits the completed adoption.
