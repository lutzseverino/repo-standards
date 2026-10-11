// Identifies the kind of an issue's contract from its labels and body, and
// the parent its `Parent` section names, with the issue Markdown parsing they
// rest on. The issue-contract validator and the factory share it, so they
// agree on which issues are specifications and which issue a `Parent` section
// names.
import { interpretMarkdown } from "./rendered-markdown.mjs";

export const categoryLabels = new Set(["bug", "enhancement"]);
export const wayfinderChildLabels = new Set([
  "wayfinder:research",
  "wayfinder:prototype",
  "wayfinder:grilling",
  "wayfinder:task",
]);
const issueNonRenderedElements = ["head", "title"];
const contractSectionNames = new Set([
  "acceptance criteria",
  "actual behavior",
  "additional context",
  "blocked by",
  "decisions so far",
  "destination",
  "desired outcome",
  "environment",
  "expected behavior",
  "further notes",
  "implementation decisions",
  "not yet specified",
  "notes",
  "out of scope",
  "parent",
  "problem",
  "problem statement",
  "proposed approach",
  "question",
  "solution",
  "steps to reproduce",
  "testing decisions",
  "user stories",
  "what to build",
]);

// Whether an issue's contract is a directly authored specification: it carries
// no Wayfinder or triage category label, and its body's recognized contract
// headings identify a specification. Labels are names or GitHub label objects.
export function isSpecification({ labels, body }) {
  const names = (labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
  return (
    !names.some(
      (name) => name === "wayfinder:map" || wayfinderChildLabels.has(name),
    ) &&
    !names.some((name) => categoryLabels.has(name)) &&
    identifyContract(parseSections(body ?? "")) === "specification"
  );
}

// The first issue reference in the body's `Parent` section, as an API path
// such as `/repos/<owner>/<name>/issues/<n>`, or null. An issue with no native
// parent counts as the child of the issue it references.
export function parentSectionReference(body, repository) {
  return (
    issueReferences(parseSections(body).get("parent"), repository)[0] ?? null
  );
}

// The distinct issue references in Markdown, as API paths; a bare `#<n>`
// resolves against `repository`, written `<owner>/<name>`.
export function issueReferences(value = "", repository) {
  const references = [];
  const seen = new Set();
  const expression =
    /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)|(?:^|[\s(])#(\d+)\b/gim;
  for (const match of markdownReferenceText(value).matchAll(expression)) {
    const reference = match[4]
      ? `/repos/${repository}/issues/${match[4]}`
      : `/repos/${match[1]}/${match[2]}/issues/${match[3]}`;
    if (!seen.has(reference)) {
      seen.add(reference);
      references.push(reference);
    }
  }
  return references;
}

function markdownReferenceText(markdown) {
  return issueMarkdown(markdown).content.text({
    includeCode: false,
    includeKeyboardInput: true,
    includeImageAlt: false,
    includeLinkTargets: true,
  }).text;
}

export function identifyContract(sections) {
  const headings = new Map([
    ["problem statement", "specification"],
    ["solution", "specification"],
    ["user stories", "specification"],
    ["what to build", "implementation ticket"],
    ["blocked by", "implementation ticket"],
    ["steps to reproduce", "bug report"],
    ["expected behavior", "bug report"],
    ["actual behavior", "bug report"],
    ["problem", "feature request"],
    ["desired outcome", "feature request"],
  ]);
  for (const heading of sections.keys()) {
    if (headings.has(heading)) return headings.get(heading);
  }
  return null;
}

export function parseSections(markdown, acceptedNames = contractSectionNames) {
  markdown = normalizeMarkdown(markdown);
  const occurrences = issueMarkdown(markdown).sections(acceptedNames, {
    hierarchy: "outermost",
    nameSource: "markdown",
  });
  const sections = new Map();
  for (const [name, matches] of occurrences) {
    sections.set(name, matches.at(-1).source);
  }
  return sections;
}

export function issueMarkdown(markdown) {
  return interpretMarkdown(markdown, {
    additionalNonRenderedElements: issueNonRenderedElements,
  });
}

export function normalizeMarkdown(value) {
  return value.replace(/\r\n?/g, "\n");
}
