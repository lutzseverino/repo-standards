#!/usr/bin/env node

import { appendFileSync, readFileSync } from "node:fs";
import { interpretMarkdown } from "../../operations/lib/rendered-markdown.mjs";

const allowedTypes = [
  "feat",
  "fix",
  "docs",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "style",
  "chore",
  "revert",
];
const exactPlaceholders = new Set([
  "todo",
  "tbd",
  "n/a",
  "na",
  "none",
  "not applicable",
  "not available",
  "not provided",
  "not run",
  "not tested",
  "no tests",
  "placeholder",
  "coming soon",
  "to be determined",
  "fill this in",
  "fill it in",
  "same as title",
  "see above",
  "see title",
]);
const recognizedSections = new Set([
  "summary",
  "validation",
  "related issue",
  "impact",
  "migration",
]);
const issueUrl = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*\b/i;

function normalizedRenderedText(content, includeCode = true) {
  return content.text({ includeCode, blockBreaks: true }).text
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function isMeaningful(text) {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const placeholderCandidate = normalized.replace(/[.!?,;:…]+$/u, "").trim();
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];

  if (
    exactPlaceholders.has(placeholderCandidate) ||
    /^(?:todo|tbd|n\/?a|placeholder)\s*[:.\-–—]/i.test(normalized)
  ) {
    return false;
  }
  return words.length >= 2;
}

function requiredSection(sections, name, errors) {
  const matches = sections.get(name) ?? [];
  const displayName =
    name === "related issue"
      ? "Related issue"
      : name[0].toUpperCase() + name.slice(1);
  if (matches.length === 0) {
    errors.push(`Add a ${displayName} section.`);
    return null;
  }
  if (matches.length > 1) {
    errors.push(`Keep exactly one ${displayName} section.`);
  }
  return matches[0].content;
}

function hasIssueReference(content) {
  const rendered = content.text({ includeCode: false, blockBreaks: true });
  const text = rendered.text
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (
    issueUrl.test(text) ||
    /\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#[1-9]\d*\b/.test(text) ||
    /(^|[^A-Za-z0-9_])#[1-9]\d*\b/.test(text)
  ) {
    return true;
  }

  return rendered.links.some((href) => issueUrl.test(href));
}

function hasSmallCorrectionReason(content) {
  const rendered = normalizedRenderedText(content, false);
  const marker = rendered.match(/(?:^|\n)Small correction\s*:\s*([\s\S]*)$/i);
  if (!marker || !isMeaningful(marker[1])) {
    return false;
  }
  return /\b(?:typo|spelling|punctuation|format(?:ting)?|whitespace|(?:broken|dead)[\s-]+(?:Markdown[\s-]+)?(?:link|anchor))\b/i.test(
    marker[1],
  );
}

function inlineExplanation(content, label) {
  const text = normalizedRenderedText(content, false);
  const match = text.match(
    new RegExp(`(?:^|\\n)(?:[-+]\\s*)?${label}\\s*:\\s*([^\\n]+)`, "i"),
  );
  return match ? isMeaningful(match[1]) : false;
}

function hasExplanation(sections, bodyContent, label) {
  const section = sections.get(label)?.[0]?.content ?? null;
  return (
    (section !== null && isMeaningful(normalizedRenderedText(section))) ||
    inlineExplanation(bodyContent, label)
  );
}

function validateTitle(title, bodyContent, sections, errors) {
  const titleMatch = title.match(
    /^(?<type>[A-Za-z]+)(?<scope>\([^()\r\n]+\))?(?<breaking>!)?: (?<description>[^\r\n]+)$/,
  );
  if (!titleMatch) {
    errors.push(
      "Use a Conventional Commit title in the form type(scope): description, with ! before : for a breaking change.",
    );
    return;
  }

  const { type, scope, breaking, description } = titleMatch.groups;
  if (!allowedTypes.includes(type)) {
    errors.push(`Use an allowed lowercase type: ${allowedTypes.join(", ")}.`);
  }
  if (scope && scope.slice(1, -1).trim() !== scope.slice(1, -1)) {
    errors.push("Remove leading or trailing whitespace from the title scope.");
  }
  if (!/[\p{L}\p{N}]/u.test(description)) {
    errors.push("Write a title description containing a letter or number.");
  }
  if (description.trim() !== description) {
    errors.push("Remove leading or trailing whitespace from the title description.");
  }
  if (description.endsWith(".")) {
    errors.push("Remove the trailing period from the title description.");
  }

  const structuralBody = normalizedRenderedText(bodyContent, false);
  const hasBreakingFooter = /^BREAKING[ -]CHANGE\s*:/im.test(structuralBody);
  if (hasBreakingFooter && !breaking) {
    errors.push("Add ! before the title colon when the body declares a breaking change.");
  }
  if (breaking) {
    if (!hasExplanation(sections, bodyContent, "impact")) {
      errors.push("Explain the breaking change under an Impact heading or Impact: label.");
    }
    if (!hasExplanation(sections, bodyContent, "migration")) {
      errors.push("Explain migration under a Migration heading or Migration: label.");
    }
  }
}

function annotationValue(value) {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function writeSummary(errors) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  const lines = errors.length
    ? ["## PR metadata validation failed", "", ...errors.map((error) => `- ${error}`)]
    : ["## PR metadata validation passed", "", "The title and required PR sections have the expected structure."];
  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const eventPath = process.argv[2] ?? process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("Provide a GitHub pull request event through GITHUB_EVENT_PATH or the first argument.");
  }

  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const pullRequest = event.pull_request;
  if (!pullRequest || typeof pullRequest.title !== "string") {
    throw new Error("The event does not contain pull_request title and body metadata.");
  }

  const body = typeof pullRequest.body === "string" ? pullRequest.body : "";
  const errors = [];
  const document = interpretMarkdown(body);
  const sections = document.sections(recognizedSections, {
    hierarchy: "matching",
    nameSource: "rendered",
    stripTrailingColon: true,
  });
  const summary = requiredSection(sections, "summary", errors);
  const validation = requiredSection(sections, "validation", errors);
  const relatedIssue = requiredSection(sections, "related issue", errors);

  if (summary !== null && !isMeaningful(normalizedRenderedText(summary))) {
    errors.push("Replace the Summary placeholder with a meaningful problem and resulting change.");
  }
  if (validation !== null && !isMeaningful(normalizedRenderedText(validation))) {
    errors.push("Replace the Validation placeholder with checks and outcomes, or explain what was not run.");
  }
  if (
    relatedIssue !== null &&
    !hasIssueReference(relatedIssue) &&
    !hasSmallCorrectionReason(relatedIssue)
  ) {
    errors.push(
      "Link a related GitHub issue, or write Small correction: with a meaningful typo, broken-link, or formatting reason.",
    );
  }

  validateTitle(pullRequest.title, document.content, sections, errors);
  writeSummary(errors);

  if (errors.length) {
    for (const error of errors) {
      console.error(`::error title=PR metadata::${annotationValue(error)}`);
    }
    console.error(`PR metadata validation found ${errors.length} problem${errors.length === 1 ? "" : "s"}.`);
    process.exitCode = 1;
    return;
  }
  console.log("PR metadata validation passed.");
}

main();
