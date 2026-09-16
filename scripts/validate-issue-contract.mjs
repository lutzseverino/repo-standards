#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { lexer } from "../vendor/marked/marked.esm.js";
import { interpretMarkdown } from "../operations/lib/rendered-markdown.mjs";

const feedbackMarker = "<!-- repo-canon:issue-contract-feedback -->";
const feedbackStatePrefix = "<!-- repo-canon:issue-contract-state ";
const readyLabels = new Set(["ready-for-agent", "ready-for-human"]);
const workflowLabels = new Set(["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"]);
const categoryLabels = new Set(["bug", "enhancement"]);
const childLabels = new Set(["wayfinder:research", "wayfinder:prototype", "wayfinder:grilling", "wayfinder:task"]);
const agentBriefHeadingNames = new Set(["agent brief"]);
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
const contractFields = new Map([
  ["bug report", new Set(["steps to reproduce", "expected behavior", "actual behavior", "environment", "additional context"])],
  ["feature request", new Set(["problem", "desired outcome", "proposed approach", "additional context"])],
  ["specification", new Set(["problem statement", "solution", "user stories", "implementation decisions", "testing decisions", "out of scope", "further notes"])],
  ["implementation ticket", new Set(["parent", "what to build", "acceptance criteria", "blocked by"])],
]);
const wayfinderMapFields = new Set(["destination", "notes", "decisions so far", "not yet specified", "out of scope"]);
const wayfinderChildFields = new Set(["parent", "question"]);

const environment = process.env;
const event = JSON.parse(await readFile(required("GITHUB_EVENT_PATH"), "utf8"));

if (event.issue?.pull_request) {
  console.log("Skipped pull request discussion; issue contract validation handles issues only.");
  process.exit(0);
}

const issueNumber = event.issue?.number;
if (!Number.isInteger(issueNumber)) throw new Error("The event does not identify an issue number.");

const api = createApi({
  baseUrl: required("GITHUB_API_URL"),
  graphqlUrl: required("GITHUB_GRAPHQL_URL"),
  repository: required("GITHUB_REPOSITORY"),
  token: required("GITHUB_TOKEN"),
});

const issue = await api.getIssue(issueNumber);
if (issue.pull_request) {
  console.log("Skipped pull request discussion; issue contract validation handles issues only.");
  process.exit(0);
}

const comments = await api.listComments(issueNumber);
const blockedBy = await api.listBlockedBy(issueNumber);
const relationships = await readRelationships(api, issue, blockedBy);
const authoritativeLabels = new Set((issue.labels ?? []).map(labelName));
const transitionLabel = readyLabels.has(event.label?.name) ? event.label.name : null;
const validationIssue = transitionLabel && ["labeled", "unlabeled"].includes(event.action)
  ? {
      ...issue,
      labels: (issue.labels ?? []).filter((label) => {
        const name = labelName(label);
        if (!workflowLabels.has(name)) return true;
        return event.action === "labeled" ? name === transitionLabel : name === "needs-triage";
      }).concat(event.action === "unlabeled" ? [{ name: "needs-triage" }] : []),
    }
  : issue;
const result = validate({
  issue: validationIssue,
  comments,
  blockedBy: relationships.blockedBy,
  parent: relationships.parent,
  relationshipErrors: relationships.errors,
});
result.labels = authoritativeLabels;

if (!result.valid) {
  await removeReadiness(api, issueNumber, result.labels);
  if (result.triaged) await returnTriagedRequestToReview(api, issueNumber, result.labels);
  await maintainFeedback(api, issueNumber, comments, invalidFeedback(result.errors));
  console.error(result.errors.join("\n"));
  process.exit(1);
}

const previousFeedback = findFeedback(comments);
if (!result.contract) {
  if (previousFeedback) {
    await maintainFeedback(api, issueNumber, comments, resolvedFeedback(result.kind));
  }
  console.log(`Valid ${result.kind}.`);
  process.exit(0);
}

const contract = await contractRevision(api, issue, result);
const revision = contract.revision;
const issueEvents = await api.listEvents(issueNumber);
const readiness = await assessReadiness({ api, event, issue, result, issueEvents, previousFeedback, revision, openingEligible: contract.openingEligible });
if (!readiness.valid) {
  await removeReadiness(api, issueNumber, result.labels);
  if (result.triaged) await returnTriagedRequestToReview(api, issueNumber, result.labels);
  await maintainFeedback(api, issueNumber, comments, awaitingReviewFeedback(result.kind, revision, readiness.observedEventId, readiness.sourceInvalidation, readiness.error));
  console.error(readiness.error);
  process.exit(1);
}

if (readiness.approved && result.triaged) {
  await replaceTriagedState(api, issueNumber, result.labels, readiness.label);
} else if (event.action === "unlabeled" && transitionLabel && result.triaged) {
  const remainingStates = [...result.labels].filter((label) => workflowLabels.has(label));
  if (remainingStates.length === 0) await api.addLabels(issueNumber, ["needs-triage"]);
}

await maintainFeedback(
  api,
  issueNumber,
  comments,
  readiness.approved
    ? approvedFeedback(result.kind, revision, readiness.label, readiness.reviewer, readiness.reviewEventId, readiness.sourceInvalidation)
    : awaitingReviewFeedback(result.kind, revision, readiness.observedEventId, readiness.sourceInvalidation),
);
console.log(`Valid ${result.kind}${readiness.approved ? ` with ${readiness.label} bound to ${revision}` : "; awaiting authorized review"}.`);

function required(name) {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function createApi({ baseUrl, graphqlUrl, repository, token }) {
  const issuePath = `/repos/${repository}/issues`;

  async function requestResponse(path, { allowNotFound = false, ...options } = {}) {
    const response = await fetch(path.startsWith("http") ? path : `${baseUrl}${path}`, {
      ...options,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        ...options.headers,
      },
    });
    if (allowNotFound && response.status === 404) return { data: null, link: null };
    if (!response.ok) {
      throw new Error(`GitHub API ${options.method ?? "GET"} ${path} returned ${response.status}: ${await response.text()}`);
    }
    return {
      data: response.status === 204 ? null : await response.json(),
      link: response.headers.get("link"),
    };
  }

  async function request(path, options = {}) {
    return (await requestResponse(path, options)).data;
  }

  async function paginate(path, options = {}) {
    const values = [];
    let next = path;
    while (next) {
      const response = await requestResponse(next, options);
      if (!response.data) break;
      values.push(...response.data);
      next = response.link?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    }
    return values;
  }

  async function graphql(query, variables) {
    const response = await request(graphqlUrl, {
      method: "POST",
      body: JSON.stringify({ query, variables }),
    });
    if (response.errors?.length) {
      throw new Error(`GitHub GraphQL returned errors: ${response.errors.map(({ message }) => message).join("; ")}`);
    }
    return response.data;
  }

  return {
    getIssue: (number) => request(`${issuePath}/${number}`),
    getParent: (number) => request(`${issuePath}/${number}/parent`, { allowNotFound: true }),
    getOptionalUrl: (url) => request(url, { allowNotFound: true }),
    getPermission: (login) => request(`/repos/${repository}/collaborators/${encodeURIComponent(login)}/permission`, { allowNotFound: true }),
    getIssueBodyRevision: async (number) => {
      const [owner, name] = repository.split("/");
      const data = await graphql(
        "query IssueBodyRevision($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { id lastEditedAt } } }",
        { owner, name, number },
      );
      if (!data?.repository?.issue) throw new Error(`GitHub GraphQL did not return issue #${number}.`);
      return data.repository.issue;
    },
    listComments: (number) => paginate(`${issuePath}/${number}/comments?per_page=100`),
    listEvents: (number) => paginate(`${issuePath}/${number}/events?per_page=100`),
    listBlockedBy: (number) => paginate(`${issuePath}/${number}/dependencies/blocked_by?per_page=100`, { allowNotFound: true }),
    removeLabel: (number, label) => request(`${issuePath}/${number}/labels/${encodeURIComponent(label)}`, { method: "DELETE" }),
    addLabels: (number, labels) => request(`${issuePath}/${number}/labels`, { method: "POST", body: JSON.stringify({ labels }) }),
    createComment: (number, body) => request(`${issuePath}/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    updateComment: (id, body) => request(`${issuePath}/comments/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }),
  };
}

async function readRelationships(apiClient, issue, nativeBlockedBy) {
  const sections = parseSections(issue.body ?? "");
  const errors = [];
  const nativeParent = await apiClient.getParent(issue.number);
  const parentReference = firstIssueReference(sections.get("parent"));
  const fallbackParent = !nativeParent && parentReference ? await apiClient.getOptionalUrl(parentReference) : null;
  const parent = nativeParent ?? fallbackParent;
  if (parentReference && !parent) errors.push(`Could not resolve the \`Parent\` issue reference ${parentReference}.`);
  const blockedBy = [...nativeBlockedBy];
  const knownReferences = new Set(nativeBlockedBy.map((blocker) => issueReferenceFor(blocker)).filter(Boolean));
  for (const reference of issueReferences(sections.get("blocked by"))) {
    if (knownReferences.has(reference)) continue;
    const blocker = await apiClient.getOptionalUrl(reference);
    if (blocker) blockedBy.push(blocker);
    else errors.push(`Could not resolve the \`Blocked by\` issue reference ${reference}.`);
  }
  return { parent, blockedBy, errors };
}

function issueReferenceFor(issue) {
  if (issue.url) return new URL(issue.url).pathname;
  const match = issue.html_url?.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  return match ? `/repos/${match[1]}/${match[2]}/issues/${match[3]}` : null;
}

function firstIssueReference(value) {
  return issueReferences(value)[0] ?? null;
}

function issueReferences(value = "") {
  const references = [];
  const seen = new Set();
  const repository = required("GITHUB_REPOSITORY");
  const expression = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)|(?:^|[\s(])#(\d+)\b/gim;
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

function markdownVisibleText(markdown) {
  return issueMarkdown(markdown).content.text().text;
}

function issueMarkdown(markdown) {
  return interpretMarkdown(markdown, { additionalNonRenderedElements: issueNonRenderedElements });
}

function validate({ issue, comments, blockedBy, parent, relationshipErrors }) {
  const labels = new Set((issue.labels ?? []).map(labelName));
  const body = issue.body ?? "";
  let sections = parseSections(body);
  const errors = [];

  if (labels.has("wayfinder:map")) {
    sections = parseSections(body, wayfinderMapFields);
    validateWayfinderMap(sections, labels, errors);
    return outcome("Wayfinder map", errors, labels, false);
  }

  const wayfinderChildren = [...labels].filter((label) => childLabels.has(label));
  if (wayfinderChildren.length > 0) {
    sections = parseSections(body, wayfinderChildFields);
    errors.push(...relationshipErrors);
    validateWayfinderChild(sections, labels, wayfinderChildren, parent, errors);
    return outcome("Wayfinder child", errors, labels, false);
  }

  const brief = latestAgentBrief(comments);
  const hasTriageCategory = [...labels].some((label) => categoryLabels.has(label));
  if (hasTriageCategory && labels.has("wontfix")) {
    validateTriagedLabels(labels, null, errors);
    return outcome("triaged wontfix request", errors, labels, true);
  }
  if (brief && hasTriageCategory) {
    validateTriagedLabels(labels, null, errors);
    validateAgentBrief(brief.body, labels, errors);
    return outcome("triaged Agent Brief", errors, labels, true, { type: "comment", comment: brief, body: brief.body ?? "" });
  }

  const contractKind = identifyContract(sections);
  sections = parseSections(body, contractFields.get(contractKind));
  if (!hasTriageCategory && contractKind === "specification") {
    requireSections(sections, ["Problem Statement", "Solution", "User Stories", "Out of Scope"], errors);
    for (const name of ["Implementation Decisions", "Testing Decisions", "Further Notes"]) {
      requireSection(sections, name, errors, { allowEmpty: true });
    }
    return outcome("specification", errors, labels, false, { type: "issue-body", body });
  }

  if (!hasTriageCategory && contractKind === "implementation ticket") {
    errors.push(...relationshipErrors);
    requireSections(sections, ["What to build", "Acceptance criteria"], errors);
    requireSection(sections, "Blocked by", errors, { allowExternalValue: blockedBy.length > 0 });
    return outcome("implementation ticket", errors, labels, false, { type: "issue-body", body });
  }

  if (brief) {
    validateTriagedLabels(labels, null, errors);
    validateAgentBrief(brief.body, labels, errors);
    return outcome("triaged Agent Brief", errors, labels, true, { type: "comment", comment: brief, body: brief.body ?? "" });
  }

  if (contractKind === "bug report") {
    requireSections(sections, ["Steps to reproduce", "Expected behavior", "Actual behavior"], errors);
    validateTriagedLabels(labels, "bug", errors);
    requireAgentBriefForReadiness(labels, errors);
    return outcome("bug report", errors, labels, true);
  }

  if (contractKind === "feature request") {
    requireSections(sections, ["Problem", "Desired outcome"], errors);
    validateTriagedLabels(labels, "enhancement", errors);
    requireAgentBriefForReadiness(labels, errors);
    return outcome("feature request", errors, labels, true);
  }

  if (hasTriageCategory) {
    validateTriagedLabels(labels, null, errors);
    errors.push("Add an Agent Brief for this category-labeled triaged request, or use the matching public bug or feature form.");
    return outcome("triaged request", errors, labels, true);
  }

  errors.push("Use one supported issue contract: a public form, native specification or ticket, triaged Agent Brief, Wayfinder map, or labeled Wayfinder child.");
  return outcome("issue contract", errors, labels, false);
}

function identifyContract(sections) {
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

function outcome(kind, errors, labels, triaged, contract = null) {
  return { valid: errors.length === 0, kind, errors: [...new Set(errors)], labels, triaged, contract };
}

function parseSections(markdown, acceptedNames = contractSectionNames) {
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

function findMarkdownHeadings(markdown, acceptedNames = null) {
  markdown = normalizeMarkdown(markdown);
  return issueMarkdown(markdown).markdownHeadings
    .filter(({ name }) => !acceptedNames || acceptedNames.has(normalize(name)));
}

function markdownTokenSpans(markdown) {
  markdown = normalizeMarkdown(markdown);
  let cursor = 0;
  return lexer(markdown).map((token) => {
    const index = markdown.indexOf(token.raw, cursor);
    if (index === -1) throw new Error(`Could not locate parsed Markdown token after offset ${cursor}.`);
    cursor = index + token.raw.length;
    return { token, index };
  });
}

function markdownInlineText(tokens) {
  return (tokens ?? []).map((token) => {
    if (token.type === "html") return "";
    if (token.type === "codespan") return token.text;
    if (token.tokens) return markdownInlineText(token.tokens);
    return typeof token.text === "string" ? token.text : "";
  }).join("");
}

function briefFieldMatches(markdown) {
  markdown = normalizeMarkdown(markdown);
  const matches = [];
  for (const { token, index } of markdownTokenSpans(markdown)) {
    if (token.type !== "paragraph") continue;
    let cursor = index;
    let lineStart = true;
    for (const inlineToken of token.tokens ?? []) {
      const inlineIndex = markdown.indexOf(inlineToken.raw, cursor);
      if (inlineIndex === -1) throw new Error(`Could not locate parsed inline Markdown token after offset ${cursor}.`);
      cursor = inlineIndex + inlineToken.raw.length;
      const fieldName = inlineToken.type === "strong" && lineStart
        ? markdownInlineText(inlineToken.tokens).match(/^([^:\n]+):$/)?.[1]
        : null;
      if (fieldName) matches.push({ index: inlineIndex, length: inlineToken.raw.length, name: fieldName });
      lineStart = inlineToken.raw.endsWith("\n");
    }
  }
  return matches;
}

function normalize(value) {
  return value.replace(/[*_`]/g, "").replace(/[ \t]+/g, " ").trim().toLowerCase();
}

function normalizeMarkdown(value) {
  return value.replace(/\r\n?/g, "\n");
}

function requireSections(sections, names, errors) {
  for (const name of names) requireSection(sections, name, errors);
}

function requireSection(sections, name, errors, { allowEmpty = false, allowExternalValue = false } = {}) {
  const key = normalize(name);
  if (!sections.has(key)) {
    errors.push(`Add the \`${name}\` section.`);
    return;
  }
  if (!allowEmpty && !allowExternalValue && isPlaceholder(sections.get(key))) {
    errors.push(`Replace the placeholder under \`${name}\` with the required information.`);
  }
}

function isPlaceholder(value) {
  const withoutEmptyTasks = value.replace(/^\s*[-+*]\s*\[[ xX]\]\s*$/gm, "");
  const visibleText = markdownVisibleText(withoutEmptyTasks).trim();
  if (!visibleText) return true;
  return /^(?:no response|tbd|todo|\[(?:your |add |describe |enter )?[^\]]+\])\.?$/i.test(visibleText);
}

function validateWayfinderMap(sections, labels, errors) {
  rejectPlanningReadiness(labels, errors);
  if ([...labels].some((label) => childLabels.has(label))) {
    errors.push("Keep `wayfinder:map` separate from Wayfinder child labels.");
  }
  requireSections(sections, ["Destination", "Notes", "Not yet specified", "Out of scope"], errors);
  requireSection(sections, "Decisions so far", errors, { allowEmpty: true });
}

function validateWayfinderChild(sections, labels, childLabelList, parent, errors) {
  rejectPlanningReadiness(labels, errors);
  if (childLabelList.length !== 1 || labels.has("wayfinder:map")) {
    errors.push("Apply exactly one Wayfinder child label and do not combine it with `wayfinder:map`.");
  }
  requireSection(sections, "Question", errors);
  if (!parent) {
    errors.push("Link the Wayfinder child to its parent map using the native parent relationship or a `Parent` section.");
  } else if (!(parent.labels ?? []).some((label) => labelName(label) === "wayfinder:map")) {
    errors.push("Link the Wayfinder child to an issue labeled `wayfinder:map`.");
  }
}

function rejectPlanningReadiness(labels, errors) {
  if ([...labels].some((label) => readyLabels.has(label))) {
    errors.push("Remove readiness labels from Wayfinder planning issues; their eligibility uses open state, assignment, and blockers.");
  }
}

function labelName(label) {
  return typeof label === "string" ? label : label.name;
}

function validateTriagedLabels(labels, expectedCategory, errors) {
  const categories = [...labels].filter((label) => categoryLabels.has(label));
  const states = [...labels].filter((label) => workflowLabels.has(label));
  if (categories.length !== 1) errors.push("Apply exactly one category label: `bug` or `enhancement`.");
  if (expectedCategory && (categories.length !== 1 || categories[0] !== expectedCategory)) {
    errors.push(`Use the \`${expectedCategory}\` category for this issue form.`);
  }
  if (states.length !== 1) errors.push("Apply exactly one workflow state label.");
}

function requireAgentBriefForReadiness(labels, errors) {
  if ([...labels].some((label) => readyLabels.has(label))) {
    errors.push("Add a reviewed Agent Brief before applying a readiness label to a triaged request.");
  }
}

function latestAgentBrief(comments) {
  return [...comments].reverse().find((comment) => agentBriefHeading(comment.body ?? ""));
}

function validateAgentBrief(body, labels, errors) {
  body = normalizeMarkdown(body);
  const heading = agentBriefHeading(body);
  if (!isAgentBriefPreamble(body.slice(0, heading.index))) {
    errors.push("Start the Agent Brief comment with `> *This was generated by AI during triage.*`.");
  }
  const fields = parseBriefFields(markdownSection(body, heading));
  for (const name of ["Category", "Summary", "Current behavior", "Desired behavior", "Key interfaces", "Acceptance criteria", "Out of scope"]) {
    if (!fields.has(normalize(name)) || isPlaceholder(fields.get(normalize(name)))) {
      errors.push(`Complete the Agent Brief \`${name}\` field.`);
    }
  }
  const category = normalize(fields.get("category") ?? "");
  if (category && !categoryLabels.has(category)) errors.push("Set the Agent Brief `Category` to `bug` or `enhancement`.");
  if (category && !labels.has(category)) errors.push(`Apply the Agent Brief's \`${category}\` category label.`);
}

function markdownSection(markdown, heading) {
  markdown = normalizeMarkdown(markdown);
  const end = findMarkdownHeadings(markdown)
    .find((candidate) => candidate.index > heading.index && candidate.level <= heading.level)?.index ?? markdown.length;
  return markdown.slice(heading.index + heading.length, end);
}

function parseBriefFields(body) {
  body = normalizeMarkdown(body);
  const matches = briefFieldMatches(body);
  const fields = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index + match.length;
    const end = matches[index + 1]?.index ?? body.length;
    fields.set(normalize(match.name), body.slice(start, end).trim());
  }
  return fields;
}

function isAgentBriefPreamble(markdown) {
  const blocks = lexer(markdown).filter((token) => token.type !== "space");
  if (blocks.length !== 1 || blocks[0].type !== "blockquote") return false;
  const quoteBlocks = blocks[0].tokens?.filter((token) => token.type !== "space") ?? [];
  if (quoteBlocks.length !== 1 || quoteBlocks[0].type !== "paragraph") return false;
  const inline = quoteBlocks[0].tokens ?? [];
  return inline.length === 1
    && inline[0].type === "em"
    && markdownInlineText(inline[0].tokens) === "This was generated by AI during triage.";
}

function agentBriefHeading(body) {
  return findMarkdownHeadings(body, agentBriefHeadingNames)[0] ?? null;
}

async function contractRevision(apiClient, issue, result) {
  let source;
  let openingEligible = false;
  if (result.contract.type === "issue-body") {
    const metadata = await apiClient.getIssueBodyRevision(issue.number);
    source = { type: "issue-body", id: metadata.id, editedAt: metadata.lastEditedAt ?? null };
    openingEligible = metadata.lastEditedAt == null;
  } else {
    const comment = result.contract.comment;
    source = {
      type: "comment",
      id: String(comment.node_id ?? comment.id),
      editedAt: comment.updated_at ?? null,
    };
  }
  const value = JSON.stringify({
    format: "repo-canon/issue-contract-revision/v1",
    kind: result.kind,
    source,
    body: result.contract.body,
  });
  return { revision: `sha256:${createHash("sha256").update(value).digest("hex")}`, openingEligible };
}

async function assessReadiness({ api: apiClient, event: currentEvent, issue, result, issueEvents, previousFeedback, revision, openingEligible }) {
  const currentReadyLabels = [...result.labels].filter((label) => readyLabels.has(label));
  const latestEvent = latestReadinessEvent(issueEvents);
  const observedEventId = latestEvent?.id == null ? null : String(latestEvent.id);
  if (currentReadyLabels.length > 1) {
    return { valid: false, observedEventId, error: "Apply only one readiness label to an implementation contract." };
  }

  const recorded = feedbackState(previousFeedback?.body);
  const deletedBrief = supersedingDeletedBrief(currentEvent, result);
  const sourceInvalidation = deletedBrief ?? recorded?.sourceInvalidation ?? null;
  if (deletedBrief && recorded?.sourceInvalidation !== deletedBrief) {
    return {
      valid: false,
      observedEventId,
      sourceInvalidation,
      error: "Deleting a newer Agent Brief invalidated the restored contract source. Review the published revision again.",
    };
  }
  const openingEvent = openingLabelEvent(currentEvent, issue, result, currentReadyLabels[0], issueEvents, latestEvent, openingEligible);
  const labelEvent = openingEvent ?? (
    currentReadyLabels.length === 1
      && latestEvent?.event === "labeled"
      && latestEvent.label?.name === currentReadyLabels[0]
      ? latestEvent
      : null
  );
  if (currentReadyLabels.length === 1 && await activeApproval(apiClient, recorded, revision, currentReadyLabels[0], latestEvent, issue)) {
    return {
      valid: true,
      approved: true,
      label: recorded.label,
      reviewer: recorded.reviewer,
      reviewEventId: recorded.reviewEventId,
      sourceInvalidation,
    };
  }

  const grant = readinessGrant(recorded, previousFeedback, revision, currentReadyLabels, labelEvent, issueEvents);
  if (grant.candidate) {
    if (!grant.valid) return { valid: false, error: grant.error, observedEventId, sourceInvalidation };
    const authority = await reviewerAuthority(apiClient, grant.reviewer);
    if (!authority.authorized) {
      return {
        valid: false,
        observedEventId,
        sourceInvalidation,
        error: authority.error
          ? `Could not verify @${grant.reviewer}'s review authority: ${authority.error}`
          : `@${grant.reviewer} is not authorized to grant readiness. Use a repository admin, maintainer, or collaborator with the triage role.`,
      };
    }
    return {
      valid: true,
      approved: true,
      label: grant.label,
      reviewer: grant.reviewer,
      reviewEventId: grant.reviewEventId,
      sourceInvalidation,
    };
  }

  if (currentReadyLabels.length === 0) {
    return { valid: true, approved: false, observedEventId, sourceInvalidation };
  }

  return {
    valid: false,
    observedEventId,
    sourceInvalidation,
    error: "Readiness is not bound to an authorized review of the current contract revision. Remove the stale attempt and review the published revision again.",
  };
}

function readinessGrant(recorded, previousFeedback, revision, currentReadyLabels, labelEvent, issueEvents) {
  if (currentReadyLabels.length !== 1) return { candidate: false };
  const label = currentReadyLabels[0];
  if (!labelEvent || labelEvent.id == null || labelEvent.event !== "labeled") {
    return { candidate: true, valid: false, error: "The authoritative issue timeline does not contain the current readiness label event." };
  }
  const reviewer = labelEvent.actor?.login;
  if (!reviewer) return { candidate: true, valid: false, error: "The readiness event does not identify its actor." };
  const reviewEventId = String(labelEvent.id);
  const openingReview = labelEvent.opening === true;
  const followsApprovedRevision = recorded?.status === "approved"
    && recorded.revision === revision
    && reviewEventFollows(recorded.reviewEventId, reviewEventId, issueEvents);
  const followsAwaitingRevision = recorded?.status === "awaiting-review"
    && recorded.revision === revision
    && previousFeedback?.updated_at
    && labelEvent.created_at
    && previousFeedback.updated_at < labelEvent.created_at
    && reviewEventFollows(recorded.observedEventId, reviewEventId, issueEvents);
  const followsRevisionNotice = followsApprovedRevision || followsAwaitingRevision;
  if (!openingReview && !followsRevisionNotice) {
    return {
      candidate: true,
      valid: false,
      error: "Wait for the validator to publish the exact contract revision before applying readiness, then review that revision and apply the label again.",
    };
  }
  return { candidate: true, valid: true, label, reviewer, reviewEventId };
}

function reviewEventFollows(previousEventId, reviewEventId, issueEvents) {
  if (previousEventId == null) return true;
  if (String(previousEventId).startsWith("opened:")) return true;
  const previousIndex = issueEvents.findIndex(({ id }) => String(id) === String(previousEventId));
  const reviewIndex = issueEvents.findIndex(({ id }) => String(id) === reviewEventId);
  return previousIndex >= 0 && reviewIndex > previousIndex;
}

async function activeApproval(apiClient, recorded, revision, label, latestEvent, issue) {
  const eventIsCurrent = latestEvent?.event === "labeled"
    && latestEvent.label?.name === label
    && String(latestEvent.id) === recorded?.reviewEventId;
  const openingIsCurrent = !latestEvent && recorded?.reviewEventId === openingReviewId(issue);
  if (recorded?.status !== "approved"
    || recorded.revision !== revision
    || recorded.label !== label
    || !recorded.reviewer
    || !recorded.reviewEventId
    || (!eventIsCurrent && !openingIsCurrent)) {
    return false;
  }
  return (await reviewerAuthority(apiClient, recorded.reviewer)).authorized;
}

function latestReadinessEvent(issueEvents) {
  return [...issueEvents].reverse().find((candidate) => {
    return ["labeled", "unlabeled"].includes(candidate.event) && readyLabels.has(candidate.label?.name);
  }) ?? null;
}

function openingLabelEvent(currentEvent, issue, result, label, issueEvents, latestEvent, openingEligible) {
  const openingReadyLabels = currentEvent.issue?.labels?.map(labelName).filter((name) => readyLabels.has(name)) ?? [];
  const firstEvent = issueEvents.find((candidate) => {
    return ["labeled", "unlabeled"].includes(candidate.event) && readyLabels.has(candidate.label?.name);
  }) ?? null;
  if (currentEvent.action !== "opened"
    || result.contract.type !== "issue-body"
    || !openingEligible
    || !label
    || currentEvent.issue?.body !== issue.body
    || openingReadyLabels.length !== 1
    || openingReadyLabels[0] !== label
    || (latestEvent && String(firstEvent?.id) !== String(latestEvent.id))
    || (latestEvent && (
      latestEvent.event !== "labeled"
      || latestEvent.label?.name !== label
      || latestEvent.actor?.login !== currentEvent.sender?.login
    ))) {
    return null;
  }
  return {
    id: latestEvent?.id ?? openingReviewId(issue),
    event: "labeled",
    label: { name: label },
    actor: currentEvent.sender,
    opening: true,
  };
}

function openingReviewId(issue) {
  return `opened:${issue.node_id ?? issue.id ?? issue.number}:${issue.created_at ?? "unknown"}`;
}

function supersedingDeletedBrief(currentEvent, result) {
  if (currentEvent.action !== "deleted"
    || result.contract.type !== "comment"
    || !agentBriefHeading(currentEvent.comment?.body ?? "")) {
    return null;
  }
  const deleted = currentEvent.comment;
  const selected = result.contract.comment;
  const deletedAt = deleted.created_at ?? "";
  const selectedAt = selected.created_at ?? "";
  let isNewer = deletedAt > selectedAt;
  if (deletedAt === selectedAt && deleted.id != null && selected.id != null) {
    isNewer = BigInt(deleted.id) > BigInt(selected.id);
  }
  return isNewer ? `deleted-comment:${deleted.node_id ?? deleted.id}` : null;
}

async function reviewerAuthority(apiClient, login) {
  let permission;
  try {
    permission = await apiClient.getPermission(login);
  } catch (error) {
    return { authorized: false, error: error.message };
  }
  if (!permission) return { authorized: false };
  const role = permission.role_name ?? permission.permission;
  return { authorized: ["admin", "maintain", "triage"].includes(role) };
}

function feedbackState(body = "") {
  const line = normalizeMarkdown(body).split("\n").find((candidate) => candidate.startsWith(feedbackStatePrefix) && candidate.endsWith(" -->"));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(feedbackStatePrefix.length, -4));
  } catch {
    return null;
  }
}

async function removeReadiness(apiClient, number, labels) {
  for (const label of labels) {
    if (readyLabels.has(label)) await apiClient.removeLabel(number, label);
  }
}

async function returnTriagedRequestToReview(apiClient, number, labels) {
  const hadReadiness = [...labels].some((label) => readyLabels.has(label));
  const remainingStates = [...labels].filter((label) => workflowLabels.has(label) && !readyLabels.has(label));
  if (hadReadiness && remainingStates.length === 0) await apiClient.addLabels(number, ["needs-triage"]);
}

async function replaceTriagedState(apiClient, number, labels, readinessLabel) {
  for (const label of labels) {
    if (workflowLabels.has(label) && label !== readinessLabel) await apiClient.removeLabel(number, label);
  }
}

async function maintainFeedback(apiClient, number, comments, body) {
  const existing = findFeedback(comments);
  if (!existing) return apiClient.createComment(number, body);
  if (existing.body !== body) return apiClient.updateComment(existing.id, body);
}

function findFeedback(comments) {
  return [...comments].reverse().find((comment) => comment.body?.includes(feedbackMarker) && comment.user?.login === "github-actions[bot]");
}

function invalidFeedback(errors) {
  return `${feedbackMarker}\n## Issue contract needs attention\n\n${errors.map((error) => `- ${error}`).join("\n")}\n\nFix the items above. Structural validation will re-run, but only an authorized reviewer can grant readiness.`;
}

function awaitingReviewFeedback(kind, revision, observedEventId = null, sourceInvalidation = null, reason = null) {
  const state = JSON.stringify({ status: "awaiting-review", revision, label: null, reviewer: null, observedEventId, sourceInvalidation });
  const explanation = reason ? `\n\nThe last readiness attempt was rejected: ${reason}` : "";
  return `${feedbackMarker}\n${feedbackStatePrefix}${state} -->\n## Issue contract awaiting review\n\nThe ${kind} has the required structure at revision \`${revision}\`.${explanation}\n\nA fresh authorized review is required. A repository admin, maintainer, or explicitly authorized triage-role collaborator must review this exact revision, then apply one readiness label. For an Agent Brief, wait for this revision notice before applying the label. Structural validation never grants readiness.`;
}

function approvedFeedback(kind, revision, label, reviewer, reviewEventId, sourceInvalidation = null) {
  const state = JSON.stringify({ status: "approved", revision, label, reviewer, reviewEventId, sourceInvalidation });
  return `${feedbackMarker}\n${feedbackStatePrefix}${state} -->\n## Issue contract readiness recorded\n\nThe ${kind} at revision \`${revision}\` was reviewed by @${reviewer}, whose repository role authorizes triage, and is bound to \`${label}\`. Editing or replacing the contract or removing readiness invalidates this association.`;
}

function resolvedFeedback(kind) {
  return `${feedbackMarker}\n## Issue contract structure corrected\n\nThe ${kind} now has the required structure. A fresh authorized review is still required before restoring readiness.`;
}
