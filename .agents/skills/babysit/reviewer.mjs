import { readFileSync } from "node:fs";
import { join } from "node:path";

export const reviewerTarget = ".github/pull-request-reviewer.json";

export const readReviewer = (root = process.cwd()) => {
  let text;
  try {
    text = readFileSync(join(root, reviewerTarget), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const reviewer = JSON.parse(text);
  validateReviewer(reviewer);
  return reviewer;
};

const objectFields = (value, required, optional = [], path = "reviewer") => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} must be an object.`);
  for (const key of required)
    if (!Object.hasOwn(value, key))
      throw new Error(`${path}.${key} is required.`);
  for (const key of Object.keys(value))
    if (![...required, ...optional].includes(key))
      throw new Error(`${path}.${key} is unknown.`);
};
const textField = (value, path) => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${path} must be a nonempty string.`);
};

const validateReviewer = (reviewer) => {
  objectFields(
    reviewer,
    ["version", "account", "request", "unavailable", "bounds"],
    ["finished"],
  );
  if (reviewer.version !== 1) throw new Error("reviewer.version must be 1.");
  textField(reviewer.account, "reviewer.account");
  objectFields(reviewer.request, ["comment", "onOpen"], [], "reviewer.request");
  textField(reviewer.request.comment, "reviewer.request.comment");
  if (reviewer.request.comment !== reviewer.request.comment.trim())
    throw new Error("reviewer.request.comment must be trimmed.");
  if (typeof reviewer.request.onOpen !== "boolean")
    throw new Error("reviewer.request.onOpen must be boolean.");
  if (!Array.isArray(reviewer.unavailable))
    throw new Error("reviewer.unavailable must be an array of reply texts.");
  for (const reply of reviewer.unavailable)
    textField(reply, "reviewer.unavailable reply");
  objectFields(
    reviewer.bounds,
    ["responseMinutes", "reviewMinutes"],
    ["reviewRequests"],
    "reviewer.bounds",
  );
  for (const key of ["responseMinutes", "reviewMinutes"]) {
    if (!Number.isFinite(reviewer.bounds[key]) || reviewer.bounds[key] <= 0)
      throw new Error(
        `reviewer.bounds.${key} must be a positive finite number.`,
      );
  }
  if (
    Object.hasOwn(reviewer.bounds, "reviewRequests") &&
    (!Number.isInteger(reviewer.bounds.reviewRequests) ||
      reviewer.bounds.reviewRequests <= 0)
  )
    throw new Error(
      "reviewer.bounds.reviewRequests must be a positive integer.",
    );
  if (Object.hasOwn(reviewer, "finished")) {
    objectFields(
      reviewer.finished,
      ["commentMarker", "line"],
      [],
      "reviewer.finished",
    );
    textField(
      reviewer.finished.commentMarker,
      "reviewer.finished.commentMarker",
    );
    textField(reviewer.finished.line, "reviewer.finished.line");
    let groups;
    try {
      // The empty alternative exposes every named group even without a match.
      groups = new RegExp(`(?:${reviewer.finished.line})|`, "u").exec(
        "",
      ).groups;
    } catch {
      throw new Error(
        "reviewer.finished.line must be a valid regular expression.",
      );
    }
    if (
      !groups ||
      !Object.hasOwn(groups, "sha") ||
      !Object.hasOwn(groups, "at")
    )
      throw new Error("reviewer.finished.line needs named sha and at groups.");
  }
};

// Repository data determines requests, completion and bounded review waits.
const requestComments = (comments, reviewer) =>
  comments.filter(
    (comment) => comment.body.trim() === reviewer.request.comment,
  );

export const reviewRequestedAt = (openedAt, comments, reviewer) => {
  if (!reviewer) return null;
  const requests = requestComments(comments, reviewer).map((comment) =>
    Date.parse(comment.createdAt),
  );
  if (reviewer.request.onOpen) requests.push(openedAt);
  return requests.length ? Math.max(...requests) : null;
};

export const reviewerState = (
  reviewer,
  { head, requestedAt, pushedAt, comments, reviews = [], now },
) => {
  if (
    reviews.some(
      (review) =>
        review.user?.login === reviewer.account &&
        review.commit_id === head &&
        review.state !== "PENDING" &&
        (review.state === "APPROVED" ||
          review.state === "CHANGES_REQUESTED" ||
          Boolean(review.body?.trim()) ||
          review.comments?.some((comment) => comment.in_reply_to_id == null)),
    )
  )
    return "reviewed";
  const replies = comments.filter(
    (comment) => comment.login === reviewer.account,
  );
  if (reviewer.finished && requestedAt !== null) {
    const linePattern = new RegExp(reviewer.finished.line, "u");
    const finished = replies
      .filter((comment) =>
        comment.body.includes(reviewer.finished.commentMarker),
      )
      .some((comment) =>
        comment.body.split("\n").some((line) => {
          const groups = linePattern.exec(line)?.groups;
          return (
            groups?.sha &&
            head.startsWith(groups.sha) &&
            Date.parse(groups.at) >= requestedAt
          );
        }),
      );
    if (finished) return "reviewed";
  }
  if (requestedAt === null) return "not requested";
  // GitHub times have second resolution, so a same-second reply responds.
  const responses = replies.filter(
    (comment) =>
      Date.parse(comment.createdAt) >= requestedAt &&
      comment.body.trim() !== reviewer.request.comment,
  );
  if (
    replies.some(
      (comment) =>
        Date.parse(comment.createdAt) >= requestedAt &&
        reviewer.unavailable.some((reply) => comment.body.includes(reply)),
    )
  )
    return "unavailable";
  if (pushedAt > requestedAt) {
    const requests =
      Number(reviewer.request.onOpen) +
      requestComments(comments, reviewer).length;
    return requests >= reviewer.bounds.reviewRequests
      ? "request bound reached"
      : "not requested";
  }
  const waited = now - requestedAt;
  if (
    responses.length === 0 &&
    waited >= reviewer.bounds.responseMinutes * 60_000
  )
    return "no response";
  if (waited >= reviewer.bounds.reviewMinutes * 60_000) return "not reviewing";
  return "pending";
};

export const reviewerPhrase = (reviewer, state) =>
  ({
    reviewed: "reviewer reviewed",
    unavailable: "reviewer unavailable",
    "not requested": "review not requested for this head",
    "request bound reached": `review not requested for this head; review request bound reached (${reviewer.bounds.reviewRequests})`,
    "no response": `reviewer did not respond within ${reviewer.bounds.responseMinutes} minutes`,
    "not reviewing": `reviewer did not review within ${reviewer.bounds.reviewMinutes} minutes`,
    pending: "review pending",
  })[state];
