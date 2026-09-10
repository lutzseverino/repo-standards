# Live public-source adoption inspections

These are two disposable Harbor projects, on macOS and Linux, using public npm CLI 1.0.0 and unmodified unauthenticated GitHub acquisition. No source fixtures, transport shims, or credentials are used. Both select https://github.com/lutzseverino/repo-standards-example, published standards v1.0.0, commit 98b53f2087a4fe8a028ac60108a9545b7b9ea289, profile service.

## macos

Project: `/private/var/folders/8p/12p3f_8s5ssf7z3nck7dwwnh0000gn/T/repo-standards-source-x4wVGy`.

Inspection identity: `sha256:d21920ac44214b11c40cec05bd67bccc4dc4002c61b67ee7c285d9434770dc10`.

[Full report with all bytes, operations, targets and project state](live-macos/inspection.json).

## linux

Project: `/tmp/repo-standards-source-NDOrBg`.

Inspection identity: `sha256:dc57e1cfe50d175dd89e647b868aaa36b5af4faaa42acde1c0e7684c61711edc`.

[Full report with all bytes, operations, targets and project state](live-linux/inspection.json).

## Exact content and trusted operations

Create .editorconfig with these complete bytes:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

Install pinned CLI 1.0.0, its matching product-owned adopt-standards skill (one SKILL.md), and durable .repo-standards runtime/retained inputs/state. There are no author skills or exclusions in this profile and no ownership transfers. Contextual guidance applies only to docs/operations.md and docs/operating-status.json: describe real Startup, Health and Recovery, inspect server/configuration, preserve existing warnings/escalation, state restart data loss and unsupported recovery claims, and leave status unverified. Employer CONTRIBUTING.md remains outside scope.

Fix: `node <retained>/operations/initialize-status.mjs`, arguments [], resources [], working directory the project root, timeout 10 seconds. Creates docs/operating-status.json with status unverified only if absent; preserves existing content.

Check: `node <retained>/operations/check-operations.mjs`, arguments [], resources [operations/required-sections.json], working directory the project root, timeout 10 seconds. The resource contains ["Startup", "Health", "Recovery"]. The check verifies these sections and unverified status; agent assessment separately establishes usefulness.

Both use prerequisite `node --version` requiring >=24.0.0 <25.0.0. Inspections execute none of this code; prerequisites remain not-checked. No blockers were reported. Probes and scripts are trusted code with normal host, environment and network access; declared resources are retention, not a sandbox. Full script bytes are in the linked reports and match the previously disclosed Mira operations. Adoption must preserve HEAD/index and leave outputs uncommitted for review.

After complete initial adoption and its normal project commit, the remaining standards-update test will inspect published v1.1.0 while keeping CLI/source/profile fixed. That later update has no inspection identity yet and is not part of this confirmation.
