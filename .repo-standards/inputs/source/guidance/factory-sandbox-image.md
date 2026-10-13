# Factory toolchain image guidance

Target only the adopting repository's `.factory/Dockerfile`, with no directory
targets. The factory profile installs it for a repository that a factory
serves. The factory builds the repository's toolchain image from this file, then
adds its own agent layer on top, and every run starts its agent in the result.

Write the toolchain only, on a Debian-based image. The file holds the runtimes,
compilers, package managers, and command-line tools that the development
guide's Setup and validation section requires, at the versions it names, and
nothing for the agent. The factory's layer brings Git, the GitHub CLI, the
agent CLIs, the `agent` user, the working directory, and the entrypoint, so do
not install those for the agent, create users, or add `ENTRYPOINT` or `CMD`.
Start from a Debian or Ubuntu base where `apt-get` is available, install the
toolchain system-wide, and assume no user or home directory other than `agent`
and `/home/agent`. The factory's layer adds no Node.js: a toolchain that needs
Node starts from a Debian-based Node image, such as `node:24-bookworm`, or
installs Node itself.

The factory builds the image without a build context, so install with `RUN`
from package sources, not `COPY` or `ADD` from the repository. Leave the
project's own dependencies, such as `npm ci`, to the run, which installs them in
its worktree as the development guide says. The factory's
[sandbox image contract](https://github.com/lutzseverino/repo-canon/blob/scriptorium-v1.0.1/factory/docs/usage/sandbox-image.md)
states the full contract.

When the repository still has a `.sandcastle/Dockerfile` from an earlier Repo
Canon release, write `.factory/Dockerfile` from its toolchain lines, the lines
after Repo Canon's base, and start it from the image the toolchain needs: the
old base's `node:24-bookworm` when the toolchain uses Node, or another
Debian-based image. Leave out the old base's agent tooling and user setup.

Assess `factory-sandbox-image` as `satisfied` once the file installs only the
toolchain on a Debian-based image, citing the development guide's lines for
each tool. When the guide names a tool without enough detail to install it,
such as a missing version that matters, ask the maintainer, and assess the
declaration as `blocked` until they answer. No check reads the file; whether it
installs the right toolchain is an agent judgment.

The factory profile also installs `.github/workflows/sandbox-image.yml`. On
every pull request that changes `.factory/Dockerfile` or the workflow itself,
it builds `.factory/Dockerfile` on standard input without a build context. The
build proves the toolchain commands execute, and a failing command fails the
job with its build output. Pull requests with no such changes pass without
building. The workflow builds only the toolchain image, not the factory's
layer, and runs nothing inside it.
