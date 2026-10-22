# Keep generated shadcn source read-only

The website uses shadcn/ui as a standard library, so its code stays predictable
and updatable. `site/src/components/ui/` holds unmodified registry output from
the exactly pinned shadcn CLI, in the `base-nova` style. Components are added
and refreshed only through `pnpm --dir site ui:add` and `ui:update`, which
record each generated file's checksum in `site/registry-manifest.json`, and
`ui:check` fails when the folder differs from that record. Formatting and
linting skip the folder, so they never rewrite it.

Pages import components from `site/src/components/app/`. An unchanged
component is a one-line re-export. A wrapper, such as an `AppCard` over `Card`,
exists only for a rule shared by several uses, keeps the component's props,
ref, `className` and composition, and duplicates as little as possible. A
custom component is written only where shadcn has nothing for the job, and
lives outside `components/app/`. Styling that applies to every component of a
kind, such as the homepage's light, targets the `data-slot` attribute the
components emit, in a stylesheet, so no generated file and no call site
changes. The theme follows shadcn: colour tokens in `:root` and `.dark`,
switched by the `.dark` class.

Editing the generated components was the alternative. It is quicker for one
change, but every later `ui:update` would have to merge registry changes into
local edits by hand. The same arrangement is used by `polity`'s `packages/ui`,
and it is recorded as candidate web stack rules on
[repo-canon#560](https://github.com/lutzseverino/repo-canon/issues/560#issuecomment-6344994041).
