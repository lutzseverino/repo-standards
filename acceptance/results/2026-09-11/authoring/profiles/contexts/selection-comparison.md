# Final resolved-selection comparison

Compared the full all-profile public CLI output with the author-accepted complete selection table and all referenced material.

- personal: contribution-route inherits the exact CONTRIBUTING.md material in full; final-newline inherits the exact .editorconfig material in full; readme-usage inherits contextual README.md guidance in full. No vulnerability-reporting declaration.
- employer: final-newline inherits the same exact declaration; contribution-route is a complete contextual replacement with guidance/employer-contribution-route.md and no exact field or inherited personal issue-opening rule; readme-usage is absent, leaving README content in place; vulnerability-reporting is added with contextual SECURITY.md guidance.
- Each declaration has the accepted kind, root-level target, ownership mode and material reference. All checks and fixes arrays are empty. No unexpected profiles or declarations are present.
- All seven files retain their whole-source-reviewed SHA-256 hashes and 0644 modes. No source edits followed acceptance.

Result: exact resolved-declaration equality passed for both complete profiles. CLI 1.0.1 exited 0; valid is true; errors is empty; stderr is empty.

This establishes structural validity and matching selections. It does not establish guidance usefulness or future project compliance. No generated operations were exercised. The source remains local and unpublished; adoption requires a published public GitHub source and a stable tag.
