# CLI-update inspections for confirmation

Each fresh clone restores the committed adoption with npm ci --ignore-scripts from the public registry. The candidate CLI was separately installed from public npm. These updates change CLI 1.0.0 to published 1.0.1 only, retaining source/tag/commit/profile. Source access is deliberately unavailable; candidate inspection used retained inputs. No blockers, no retired declarations or ownership transfers.

## macos-alice

- Project: `/private/var/folders/8p/12p3f_8s5ssf7z3nck7dwwnh0000gn/T/repo-standards-restoration-0DXpmd/project`.
- Identity: `sha256:a9d6c17c6d4d39a757ed4ec94f536056d67964991f03b611e06183ba540f18e6`.
- [Full inspection with exact bytes, whole skills, contextual targets and operations](macos-alice/cli-update-inspection.json).
- Retained selection: `https://github.com/alice/standards`, `v1.0.0`, commit `1ed2952cdbb3ff68f7f4fa4f63f4eb440a2d079c`, profile `work`.

## macos-mira

- Project: `/private/var/folders/8p/12p3f_8s5ssf7z3nck7dwwnh0000gn/T/repo-standards-restoration-XjYAqj/project`.
- Identity: `sha256:b1be39b1b08fc6603a135719e10b58361492b47b903492c877f33612cc679290`.
- [Full inspection with exact bytes, whole skills, contextual targets and operations](macos-mira/cli-update-inspection.json).
- Retained selection: `https://github.com/mira/standards`, `v1.0.0`, commit `7507569fe48845a8c83b5705b37a85f024942811`, profile `service`.

## linux-alice

- Project: `/tmp/repo-standards-restoration-41jRMF/project`.
- Identity: `sha256:475a7c486a07def85c826cc8dcdb0464b5c7dd5e23ac9f0ccb59d6ccaafba766`.
- [Full inspection with exact bytes, whole skills, contextual targets and operations](linux-alice/cli-update-inspection.json).
- Retained selection: `https://github.com/alice/standards`, `v1.0.0`, commit `38b64456155254faaeb18e01ec3cdfa6992f464f`, profile `work`.

## linux-mira

- Project: `/tmp/repo-standards-restoration-kYgQvS/project`.
- Identity: `sha256:e0922d42826ec5de43a70e11ea3c8ebf4a231599886a6cdf27d04eccaf2f63aa`.
- [Full inspection with exact bytes, whole skills, contextual targets and operations](linux-mira/cli-update-inspection.json).
- Retained selection: `https://github.com/mira/standards`, `v1.0.0`, commit `f91f6785034496548a8aed10d732a53275fcf582`, profile `service`.

## Exact content, context and trusted operations

Alice/work: AGENTS.md and the one-file review skill are byte-for-byte matches (full before/after inventories in each report). Context remains README.md and the src tree; employer CONTRIBUTING.md remains excluded. The check is `python3 <retained>/defaults/checks/readme.py`, args [], resources [], project-root cwd, 60-second timeout. Probe `python3 --version` requires >=3.12.0 <4.0.0. No fixes.

Mira/service: .editorconfig is a byte-for-byte match. Context remains docs/operations.md and docs/operating-status.json. Fix `node <retained>/operations/initialize-status.mjs`, args [], resources [], preserves the existing unverified status. Check `node <retained>/operations/check-operations.mjs`, args [], resources [operations/required-sections.json] containing ["Startup", "Health", "Recovery"]. Both use project-root cwd, 10-second timeout and `node --version` >=24.0.0 <25.0.0.

Both update the pinned runtime and its matching product-owned adopt-standards skill plus durable selection/state. Prerequisites are not verified by inspection. Fixes/checks run again as trusted code with normal host/environment/network access; the source-unavailability control affects CLI fetch, not a sandbox for author code. Fresh contextual assessment is required, even if the existing project documentation already satisfies the guidance. Adoption itself must preserve HEAD and index.
