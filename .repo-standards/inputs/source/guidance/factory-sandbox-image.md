# Factory sandbox image guidance

Target only the adopting repository's `.sandcastle/Dockerfile`, with no
directory targets. Every factory run starts its agent in the image this file
builds.

Repo Canon ships the image's base as `operations/sandbox-image-base.Dockerfile`
in the standards source, also retained under `.repo-standards/inputs/source/`.
It provides Node.js, Git, the GitHub CLI, Claude Code, Codex, and the `agent`
user that Sandcastle runs. Start `.sandcastle/Dockerfile` with the base's
complete text, byte for byte. Never remove, change, or reorder anything in it,
and never put the toolchain inside it.

After the base, add the repository's toolchain: the runtimes, compilers,
package managers, and command-line tools that the development guide's Setup and
validation section requires, at the versions it names. Skip what the base
already provides at a satisfying version. Install system packages as root
between `USER root` and the base's `USER ${AGENT_UID}:${AGENT_GID}`, and end
as that user. Do not add `FROM`, `ENTRYPOINT`, or `CMD`. The factory builds the
image without a build context, so install with `RUN` from package sources, not
`COPY` or `ADD` from the repository. Leave the project's own dependencies, such
as `npm ci`, to the run, which installs them in its worktree as the development
guide says. When the guide requires nothing beyond the base, the file is the
base alone.

When `.sandcastle/Dockerfile` already exists, keep its toolchain additions that
the development guide still requires, and replace everything else with the
base. On an update whose base changed, replace the old base and keep the
additions after it.

Assess `factory-sandbox-image` as `satisfied` once the file is the base followed
only by the toolchain, citing the development guide's lines for each addition.
When the guide names a tool without enough detail to install it, such as a
missing version that matters, ask the maintainer, and assess the declaration as
`blocked` until they answer. The `sandbox-image-base` check verifies that the
file starts with the unchanged base and that the additions keep its stage,
entrypoint, and user; whether they install the right toolchain remains an agent
judgment.
