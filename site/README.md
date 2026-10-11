# Repository Standards website

The private `site/` workspace builds the Repository Standards website with
Astro, React, Tailwind 4 and shadcn/ui. It currently contains one placeholder
page; the site's direction and content follow separately.

## Development

Install dependencies from the repository root with `pnpm install --frozen-lockfile`.
Use the Node.js and pnpm versions in the repository's
[development guide](../docs/development/README.md), which also documents shared
validation and CI.

From the repository root:

```sh
pnpm --dir site dev
pnpm --dir site check
pnpm --dir site build
pnpm --dir site preview
```

The development server listens on `http://localhost:4321`. The build writes
static files to `site/dist/`; preview serves that output locally. Root
`pnpm lint`, `pnpm format:check` and `pnpm validate` cover this project. There is
no site test framework until the site has logic worth testing.

`src/pages/index.astro` owns the placeholder. React components live under
`src/components/`, shadcn components under `src/components/ui/`, and shared
Tailwind styles under `src/styles/global.css`. `components.json` configures
shadcn with the `@/` alias from `tsconfig.json`. Add components from this directory
with `pnpm dlx shadcn add <component>`, then run the root formatter and checks.

## Deployment

The Deploy site workflow builds every push to `main` and publishes `site/dist/`
with `actions/deploy-pages`. GitHub Pages uses GitHub Actions as its source and
`repo-standards.lutzseverino.com` as its custom domain. Astro's `site` is
`https://repo-standards.lutzseverino.com`, served from the root path with no `base`.
The site package is private and never published to npm.

The owner adds a DNS-only (unproxied) Cloudflare `CNAME` named `repo-standards`
in the `lutzseverino.com` zone, targeting `lutzseverino.github.io`. Account-level
GitHub Pages domain verification is optional. Once GitHub provisions the TLS
certificate after DNS resolves, enable Enforce HTTPS in the repository's Pages
settings.

Moving to `repo-standards.com` changes only Astro's `site` setting, the Pages
custom domain and DNS. Deployment from `main` can briefly describe merged but
unreleased CLI behaviour; releases normally follow within hours. The stack's
rationale is recorded in the [architecture decisions](../docs/adr/README.md).
