# Author format: repo-standards/v1

An independently authored standards repository supplies one root
`standards.yaml` and ordinary referenced files. Run
`repo-standards source validate [directory] [--json]` before publication. The
directory defaults to the current directory. All profiles are validated; there
is no profile filter. This command reads local sources, never executes author
scripts or prerequisite probes, and does not change the source or Git state.
Local-directory adoption is not an interface of this product.

## Root and profiles

The root requires exactly these fields. Unknown fields at every schema level
are errors, including adoption hooks, environment overrides, shell options,
custom working directories, and profile inheritance fields.

| Field | Value |
| --- | --- |
| `format` | Exactly `repo-standards/v1` |
| `name` | Nonempty descriptive string |
| `description` | Nonempty descriptive string |
| `requires` | Mapping containing only `repo-standards`, a nonempty npm SemVer range compatible with the running CLI |
| `defaults` | Mapping containing only `declarations`, a mapping of IDs to declarations (possibly empty) |
| `profiles` | Nonempty mapping of profile names to complete profiles |

Each profile requires a nonempty `description` and a `declarations` mapping,
which may be empty. Declaration IDs, skill names, and operation IDs use
lower-case ASCII kebab-case: letters or digits separated by single hyphens.
Declaration IDs are local to the source. Operation IDs are unique across the
checks and fixes of their declaration; another declaration may reuse one.

Exactly two resolution levels exist: defaults and one selected profile.
Omitting an ID inherits its whole declaration. Repeating it replaces the whole
declaration, including checks and fixes. A new ID adds a declaration.
`id: {exclude: true}` removes an existing default declaration and its operations;
it cannot have any other fields, appear in defaults, or name a nonexistent
default. Fields never merge. Resolved declarations are ordered by ID, with
operation list order preserved. No targets are compared across separate
profiles. Every declared reference is checked, including a default replaced or
excluded by all profiles.

YAML is a single document with string mapping keys and standard YAML 1.2
scalar types. Quote version ranges and literal numeric arguments. Duplicate
mapping keys are errors, including repeated profile and declaration IDs.
Anchors and nonrecursive aliases are supported; custom tags and merge keys are
not part of the format. Recursive, excessively deep, or excessively expanded
YAML is rejected with `YAML_STRUCTURE`. Duplicate fields remain invalid, but
their alternative values are still validated for independent errors; more than
256 ambiguous interpretations also produces `YAML_STRUCTURE`.

## Declarations

All four forms may contain optional `checks` and `fixes` lists. Omitted lists
resolve to empty lists. Their remaining fields are:

| Form | Required fields |
| --- | --- |
| Exact file | `kind: file`, one `target`, and `exact` referencing a regular source file |
| Contextual file | `kind: file`, one `target`, and `guidance` referencing a regular source file |
| Exact skill | `kind: skill`, `name`, and `source` referencing a whole directory containing a regular `SKILL.md` |
| Repository guidance | `kind: repository`, `guidance` referencing a regular file, and `targets` containing both `paths` and `directories` lists |

A file must have exactly one of `exact` or `guidance`. Repository guidance
needs at least one explicit path or directory. Exact skills target
`.agents/skills/<name>` as a whole. `adopt-standards` and `author-standards` are
product-owned system skill names reserved against author skills. Author skill
content remains ordinary Agent Skill material; source
validation verifies its directory and `SKILL.md` references, not prose quality
or skill behavior.

Source and target paths use repository-relative forward-slash syntax. Absolute
paths, drive prefixes, backslashes, control characters, empty components, `.`
and `..` components are rejected. Write `src/file.ts`, not `./src/file.ts`.
Targets also reject glob metacharacters (`* ? [ ] { }`). Paths are relative to
the source root or future adopting-project root, never the YAML file's section.

All referenced files, directory ancestors, and whole skill/resource trees must
exist and contain only regular files and directories, with no symbolic links.
The source root and `standards.yaml` cannot themselves be symbolic links.
Unreferenced source files are outside validation's selected material. Targets
need not exist in the standards repository; adopting-project symlink and
ownership checks belong to inspection and adoption.

Within each resolved profile, no target can equal, contain, or be contained
by another target, including two entries of one repository declaration.
Comparison also catches case-insensitive and Unicode-normalized collisions.
Product state (`.repo-standards`), both system skill targets
(`.agents/skills/adopt-standards` and `.agents/skills/author-standards`), Git
metadata (`.git`), and their ancestors and descendants are reserved targets.
These restrictions apply to exact files, contextual files, and repository
guidance as well as skills, using the same case-folded and Unicode-normalized
comparison. Validation checks defaults and every profile, including profiles
other than the one selected for inspection.

Reservation applies within the standards format; it does not manage unrelated
global skill installations. Adoption installs only the `adopt-standards` system
skill matched to the project's exact CLI pin. It does not automatically install
`author-standards` or change runtime ownership, integrity baselines, or the
independent standards and CLI update behavior.

## Checks and fixes

Every operation requires all of the following fields:

```yaml
checks:
  - id: headings
    run:
      executable: python3
      script: defaults/checks/readme.py
      resources: [defaults/checks/data]
      arguments: ["--strict", "two words", ""]
    prerequisite:
      version-arguments: ["--version"]
      version: ">=3.12.0 <4.0.0"
    timeout-seconds: 60
```

`run` and `prerequisite` are mappings with exactly the fields shown.
`executable` identifies one command name or executable path with this syntax:

- Allowed characters are ASCII letters, digits, `.`, `_`, `+`, `-`, and `/`.
- The value cannot begin with `-`. Use an explicit path such as `./-wrapper`
  for an executable whose basename starts with a hyphen.
- `/` separates path components; a leading `/` denotes an absolute path.
  Empty components elsewhere, a trailing `/`, and basenames `.` or `..`
  are rejected. Directory components `.` and `..` are allowed.

Examples: `python3`, `clang++`, `/usr/bin/python3`, `./tools/checker`, and
`../tools/checker`. This explicit character set rejects shell expressions,
quoting, whitespace, controls, and non-ASCII executable spellings. Executable
paths refer to installed tools on the adopting machine; they are not retained
source paths. Relative executable paths resolve from the adopting-project root.
The value is preserved literally and is not looked up or run during source
validation. A syntactically valid executable may be unavailable; adoption's
prerequisite checking reports that separately.

`script` must reference a regular source file.
`resources` explicitly lists any additional source files or whole directory
trees; an empty list is valid. `arguments` and `version-arguments` are literal
string lists; empty lists and empty string arguments are valid. NUL bytes
cannot occur in strings. The prerequisite `version` is a nonempty npm SemVer
range. `timeout-seconds` is a positive safe integer.

Confirmed adoption invokes the executable directly with the retained script path
followed by literal arguments, from the adopting-project root. No shell
expansion is applied to arguments. Scripts are trusted code; resources describe
retention and do not restrict host or network access. Fixes must be safe to
repeat; checks must not mutate project content. See the
[public script protocol](script-protocol.md) for the
versioned input/result protocol and execution rules. Source validation does not execute these operations.

## Results and diagnostics

Exit status is `0` for a valid source, `1` for source validation errors, and `2`
for unsupported CLI usage. `--help` and `--version` are available. Human success
output lists profiles; human errors go to stderr as
`file:line:column [CODE] message (path)`.

With `--json`, stdout is one JSON object, and expected validation failures do
not write stderr. A successful report contains `valid: true`, `errors: []`,
normalized root `source` metadata, and `profiles`, keyed by profile name. Each
profile has its description and the complete resolved declarations array.
Declarations include their `id` and explicit `checks` and `fixes` arrays.

A failed report contains `valid: false`, `errors`, and `profiles: {}`. Invalid
selections are never offered as resolved results. Each diagnostic contains a
stable `code`, explanatory `message`, absolute `file`, one-based `line` and
`column`, and an RFC 6901 JSON-pointer `path` into the YAML. Conflict errors
also identify `profile`, including conflicts inherited from defaults. Missing
fields point to their containing mapping; unreadable root documents use 1:1
and an empty path. Independent errors are collected across all profiles;
structurally invalid YAML may limit what can be determined.

| Code | Meaning |
| --- | --- |
| `SOURCE_READ` | Source document or referenced material cannot be read |
| `YAML_SYNTAX` | Invalid YAML, unsupported tag, or multiple documents |
| `YAML_STRUCTURE` | Unresolved/recursive alias or YAML expansion/depth limit |
| `DUPLICATE_IDENTITY` | Duplicate YAML key or operation ID |
| `UNKNOWN_FIELD` | Field outside the author schema |
| `REQUIRED_FIELD` | Required field omitted |
| `INVALID_TYPE` | Wrong mapping, list, scalar, or string type |
| `INVALID_FORMAT` | Unsupported format identity |
| `INVALID_VERSION` | Malformed SemVer range |
| `INCOMPATIBLE_CLI` | Running CLI does not satisfy the source range |
| `EMPTY_PROFILES` | No complete named profile |
| `INVALID_ID` | Declaration, skill, or operation identity is malformed |
| `INVALID_DECLARATION` | Unknown kind or file without exactly one content mode |
| `INVALID_EXCLUSION` | Invalid exclusion value, level, or default identity |
| `INVALID_EXECUTABLE` | Executable violates the documented name/path syntax |
| `INVALID_TIMEOUT` | Timeout is not a positive safe integer |
| `EMPTY_TARGETS` | Repository guidance has no targets |
| `UNSAFE_PATH` | Path can escape its root or uses unsupported path syntax |
| `MISSING_REFERENCE` | Referenced file or directory does not exist |
| `REFERENCE_TYPE` | Referenced entry has the wrong filesystem type |
| `SOURCE_SYMLINK` | Source document or selected material contains a symlink |
| `RESERVED_NAME` | An author tries to supply a product-owned system skill |
| `RESERVED_TARGET` | Target overlaps reserved storage |
| `TARGET_OVERLAP` | Two resolved targets overlap, including folded collisions |

## Alice's complete example

The executable [Alice fixture](../examples/alice/standards.yaml) uses the
accepted architecture example verbatim. Its `work` profile replaces agent
guidance, inherits README guidance, the review skill, and source-layout
guidance, and excludes contribution guidance. Exclusion leaves the future
adopting project's employer-owned `CONTRIBUTING.md` outside governance.

The example's Python check reads the public operation input and checks README
headings. It reports structural evidence; the agent separately assesses whether
commands and explanations are useful for the actual project. See
[Author workflow](authoring.md) for validation, publication and evolution.
