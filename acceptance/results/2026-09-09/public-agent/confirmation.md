# Initial adoption inspections for confirmation

All four use public npm package `@lutzseverino/repo-standards@1.0.0`, with npm lifecycle scripts disabled. Standards acquisition uses independent temporary Git-source fixtures (not live public repositories) through the installed public CLI. Each project is disposable, committed and clean. Inspection ran no author operations. No known blockers; prerequisite versions remain unverified until start.

## macos-alice

- [Full inspection including bytes, guidance, scripts and resources](macos-alice/inspection.json)
- Source: https://github.com/alice/standards (fixture), v1.0.0, commit `1ed2952cdbb3ff68f7f4fa4f63f4eb440a2d079c`, profile `work`.
- Inspection identity: `sha256:37bbdb931e74a9606f2dadaccedae900389a4ba91a811e864ef0c5c68f565896`.
- Project: `/private/var/folders/8p/12p3f_8s5ssf7z3nck7dwwnh0000gn/T/repo-standards-source-FfHf38`.

## macos-mira

- [Full inspection including bytes, guidance, scripts and resources](macos-mira/inspection.json)
- Source: https://github.com/mira/standards (fixture), v1.0.0, commit `7507569fe48845a8c83b5705b37a85f024942811`, profile `service`.
- Inspection identity: `sha256:9786cb6ee34f065f3977ab63ddb82333b998fc75c796f1df1c899b476484248d`.
- Project: `/private/var/folders/8p/12p3f_8s5ssf7z3nck7dwwnh0000gn/T/repo-standards-source-vLlafg`.

## linux-alice

- [Full inspection including bytes, guidance, scripts and resources](linux-alice/inspection.json)
- Source: https://github.com/alice/standards (fixture), v1.0.0, commit `38b64456155254faaeb18e01ec3cdfa6992f464f`, profile `work`.
- Inspection identity: `sha256:b7d20acca1adb254848ab4814b30f7fe2915137e646077376d566207a95c8f9e`.
- Project: `/tmp/repo-standards-source-gF6uO6`.

## linux-mira

- [Full inspection including bytes, guidance, scripts and resources](linux-mira/inspection.json)
- Source: https://github.com/mira/standards (fixture), v1.0.0, commit `f91f6785034496548a8aed10d732a53275fcf582`, profile `service`.
- Inspection identity: `sha256:b9fa8b7c561e885fb8a777b132980aacb923ad11f257828e47607bbd2b57ecf2`.
- Project: `/tmp/repo-standards-source-8t3aUt`.

## Changes and trusted operations

Alice/work creates AGENTS.md containing “Follow employer policies and read the project documentation.” and the exact review skill at .agents/skills/review/SKILL.md (the complete one-file inventory is in the reports). It applies contextual guidance to README.md and the src directory tree, and excludes contribution guidance so employer CONTRIBUTING.md stays untouched. No fixes. Its check invokes `python3 <retained>/defaults/checks/readme.py` with no additional arguments or resources, at the project root, timeout 60 seconds. The probe is `python3 --version`, requiring >=3.12.0 <4.0.0. It checks Setup, Usage and Development headings; the agent separately assesses usefulness.

Mira/service creates the exact .editorconfig shown in each report and guides docs/operations.md and docs/operating-status.json. Its fix invokes `node <retained>/operations/initialize-status.mjs` with no extra arguments/resources and initializes status as unverified only if absent. Its check invokes `node <retained>/operations/check-operations.mjs` with no extra arguments, retaining operations/required-sections.json containing ["Startup", "Health", "Recovery"]. Both run at the project root with a 10-second timeout and use `node --version`, requiring >=24.0.0 <25.0.0.

All four also install their exact CLI runtime, matching product-owned adopt-standards skill and durable .repo-standards material. Probes and scripts are trusted code with normal host/environment/network access; resource declarations are retention, not a sandbox. No adoption commits or HEAD movement are permitted. Each start must use the exact identity above; a contextual handoff is incomplete until assessment and checks succeed.
