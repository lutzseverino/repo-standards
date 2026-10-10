# Repository license guidance

Target only the adopting repository's root `LICENSE`, with no directory
targets. The repository's visibility does not change this requirement.

First check for other root license files, such as `LICENSE.md`. They are outside
this declaration's target: never edit, rename, or delete them. If any exist,
leave `LICENSE` unchanged and assess `repository-license` as `blocked`, naming
the files the maintainer must reconcile before adoption continues.

When `LICENSE` already holds a single, clear license, keep it unchanged.
Otherwise, ask the maintainer to name the repository license; never select or
infer one. Until the maintainer answers, leave `LICENSE` unchanged and assess
`repository-license` as `blocked`, naming the decision needed. This assessment
stops the run before checks; contextual work continues once the maintainer
answers.

Write the named license's text in `LICENSE`, with the maintainer's copyright
notice where the license carries one. Ask for the copyright notice if needed.
A maintainer may grant no license. In that case, `LICENSE` states the copyright
holder and that all rights are reserved. The Repository README's License link
is labelled accordingly, such as `All rights reserved`.

Assess `repository-license` as `satisfied` once `LICENSE` holds the single,
clear license or all-rights-reserved notice and there are no other root license
files to reconcile. Cite the existing file or the maintainer's decision as
evidence. The separate `repository-readme` declaration writes the License
section according to the [Repository README guidance](repository-readme.md).
