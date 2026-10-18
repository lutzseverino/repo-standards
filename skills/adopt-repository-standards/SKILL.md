---
name: adopt-repository-standards
description: Use when the user wants to adopt a standards source or adopt, set up, or apply shared repository conventions or standards in a repository.
disable-model-invocation: false
---

Adopt the standards source the user names in this repository; otherwise use Repo
Canon, `https://github.com/lutzseverino/repo-canon`. First check that the Git
working tree is clean and committed; if it isn't, stop and tell the maintainer.
Then run `npx @lutzseverino/repo-standards adopt <source>` with that source's URL
and follow the next steps it prints. Bring the maintainer every decision it
leaves to them instead of making it yourself, and leave its changes uncommitted
for them to review.
