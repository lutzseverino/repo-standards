---
name: readme-review
description: Review a project README against its active standards guidance and report gaps.
disable-model-invocation: true
---

# Review the README

Use for ordinary work when the author invokes readme-review. Produce a report;
keep project files unchanged and leave adoption to its separate workflow.

## Inputs and tools

Use an agent's local file-reading tools. No runtime, package installation,
network access, or credentials are required. Receive the README path, active
profile identity, and its applicable resolved README guidance from the caller.
If the active guidance is unavailable or ambiguous, ask the caller for it and
leave the review pending. Never infer a profile from the project type or combine
guidance from different profiles.

## Review

1. Read the supplied active guidance and README. Name the profile, guidance
   source, and README path in the report. If the README is missing or unreadable,
   report that blocker without creating it.
2. Assess every requirement in that guidance against the README as written.
   Report each as satisfied, missing, or uncertain with supporting quotations
   or line references and concise suggestions for gaps. Do not invent facts or
   impose requirements from another profile.
3. Assess command examples from their written content only. Do not run commands
   or edit files. Distinguish documented commands from verified command correctness.
4. Finish when every applicable requirement has a reported outcome, evidence,
   and any uncertainty. State that command correctness remains unverified by
   this review. This report is ordinary-work feedback, not an adoption assessment.

The standards source owns this whole skill directory; updates replace it as a unit.
