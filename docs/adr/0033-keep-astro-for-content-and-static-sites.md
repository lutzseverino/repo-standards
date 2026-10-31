# Keep Astro for content and static sites

Amends [ADR 0018](0018-add-a-private-astro-site-workspace.md).

ADR 0018 started the website on Astro as a deliberate trial, while the
maintainer's other web projects used Vite and React, and recorded no verdict.
The owner judged the trial on 2026-10-27, on `site/` as built from 2026-10-11
to 2026-10-26 together with their other web projects
([repo-canon#560](https://github.com/lutzseverino/repo-canon/issues/560#issuecomment-6451766356)).

The trial passed for content and static sites. It showed pages built from
build-time data, repository Markdown rendered in place through Starlight,
agent Markdown surfaces and small React islands. It said nothing about
client-side apps.

Sites use Astro, and client-side apps use Vite with React. Repo Canon records
the two web stacks, `typescript-astro` for its Sites and `typescript-vite` for
its Apps, in its
[ADR 0026](https://github.com/lutzseverino/repo-canon/blob/v0.20.0/docs/adr/0026-add-the-typescript-astro-and-typescript-vite-stacks.md).
`site/` is a Site in `typescript-astro`, on Astro 7 and Starlight 0.42, with
its own `validate` that the root validation calls. The rest of ADR 0018
stands.
