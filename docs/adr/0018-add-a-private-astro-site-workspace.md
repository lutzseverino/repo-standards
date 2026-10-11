# Add a private Astro site workspace

Keep the published CLI at the repository root and add the website as a private
pnpm workspace at `site/`. Astro is a deliberate trial for static pages and for
reading Markdown from the rest of the repository, such as `docs/usage`; the
maintainer's other web projects use Vite and React. React, Tailwind 4 through
`@tailwindcss/vite`, and shadcn keep components consistent with those sites.

Use the repository's oxlint and Prettier instead of adding Biome or ESLint:
consistency within this repository matters more than consistency across
repositories. Astro checks the site's types. One root validation command checks
both projects, and a Linux site job runs on every pull request. Defer a site test
framework until the site has logic worth testing.

Deploy to GitHub Pages from `main`, keeping the homelab private. The site may
briefly describe merged but unreleased behaviour; this is accepted because CLI
releases normally follow within hours. The site is served at
`https://repo-standards.lutzseverino.com` without a base path; a later move to
`repo-standards.com` changes only Astro's site setting, the Pages custom domain
and DNS. The CLI remains the only npm publication.
