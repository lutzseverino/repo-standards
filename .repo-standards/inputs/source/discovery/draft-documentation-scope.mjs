import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  declarationTargets,
  developmentGuide,
  documentationCategories,
  documentationModel,
  documentationTree,
  inferredRoots,
  isMarkdownPath,
  repositoryDocumentationRoot,
} from "../operations/lib/documentation-model.mjs";

// Drafts the documentation scope of a repository from its tree, as a
// Repository Standards scope proposal for the `documentation` declaration.
// The agent runs it from the standards source at the selected commit, or from
// the inputs an adopting repository retains when that source is unavailable;
// the CLI never runs it. It decides only what the documentation rules decide,
// through the documentation model the check uses, and lists every other case
// as an unresolved question. It reads the project and writes the proposal to
// standard output.

const usage =
  "Usage: node discovery/draft-documentation-scope.mjs [--project <path>] [--root <path>]...";
const proposalFormat = "repo-standards/scope/v2";
const declarationId = "documentation";
// The declaration fields that decide its targets.
const targetFields = ["kind", "target", "name", "exclude"];
const glossary = "CONTEXT.md";
const contextMap = "CONTEXT-MAP.md";
const directoryIndex = "README.md";

// Paths Repository Standards reserves, which no declaration's scope can hold:
// its product state and its system skills.
const reservedPaths = [
  ".repo-standards",
  ".agents/skills/adopt-standards",
  ".agents/skills/author-standards",
];

// The other declarations' targets come from the source manifest beside this
// script, the one the selected commit ships. Without it, a drafter that an
// adopting repository retains under `.repo-standards/inputs/source` reads the
// manifest Repository Standards retains beside those inputs, resolved to the
// selected profile.
const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestPaths = [
  fileURLToPath(new URL("../standards.yaml", import.meta.url)),
];
if (
  sourceRoot.endsWith(`${sep}.repo-standards${sep}inputs${sep}source${sep}`)
) {
  manifestPaths.push(
    fileURLToPath(new URL("../../standards.yaml", import.meta.url)),
  );
}

function fail(message) {
  throw new Error(message);
}

function isInside(path, directory) {
  return path.startsWith(`${directory}/`);
}

function isWithin(path, directory) {
  return path === directory || isInside(path, directory);
}

function isReserved(path) {
  return reservedPaths.some((reserved) => isWithin(path, reserved));
}

function baseName(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

// The directory that holds a path, or '' for a path at the repository root.
function parentOf(path) {
  const end = path.lastIndexOf("/");
  return end < 0 ? "" : path.slice(0, end);
}

function byPath(left, right) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function code(path) {
  return `\`${path}\``;
}

function series(items, conjunction = "and") {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`;
}

function parseArguments(argv) {
  let project = process.cwd();
  const roots = [];
  for (let position = 0; position < argv.length; position += 1) {
    const option = argv[position];
    if (option !== "--project" && option !== "--root")
      fail(`Unknown argument ${option}. ${usage}`);
    const value = argv[position + 1];
    if (value === undefined || value === "")
      fail(`${option} needs a path. ${usage}`);
    position += 1;
    if (option === "--project") project = value;
    else roots.push(value);
  }
  return { project: resolve(project), roots };
}

function absolutePath(projectRoot, path) {
  return `${projectRoot}${sep}${path.split("/").join(sep)}`;
}

// The errors that show no entry can exist at a path, as the documentation model
// reads them: it is absent, lies below a file or a symbolic link loop, or is
// too long.
const noEntryErrors = new Set(["ENOENT", "ENOTDIR", "ELOOP", "ENAMETOOLONG"]);

// The entry at a path, or null when no entry can exist there.
function entryAt(projectRoot, path) {
  try {
    return lstatSync(absolutePath(projectRoot, path));
  } catch (error) {
    if (noEntryErrors.has(error.code)) return null;
    throw error;
  }
}

function git(directory, args) {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// The top level of the Git working tree that holds the project, which
// Repository Standards inspects as the project root.
function projectRootOf(project) {
  try {
    return realpathSync(
      git(project, ["rev-parse", "--show-toplevel"]).replace(/\n$/, ""),
    );
  } catch {
    return fail(
      `Cannot find the Git working tree of ${project}; draft the scope of a Git repository.`,
    );
  }
}

// The first manifest that exists, with its path. A manifest that exists but
// cannot be read ends the search.
function readManifest() {
  const tried = [];
  for (const path of manifestPaths) {
    tried.push(path);
    try {
      return { path, text: readFileSync(path, "utf8") };
    } catch (error) {
      if (error.code !== "ENOENT") break;
    }
  }
  return fail(
    `Cannot read a standards manifest at ${tried.join(" or ")}; run the drafter from the standards source at the selected commit, or from the retained inputs of an adopting repository.`,
  );
}

// Whether a manifest key path holds declarations or a declaration's fields:
// the top level, `defaults`, `profiles`, a profile, a declarations mapping,
// or a declaration.
function holdsDeclarations(keyPath) {
  const [section, , declarations] = keyPath;
  if (keyPath.length === 0) return true;
  if (section === "defaults") return keyPath.length <= 3;
  if (section !== "profiles") return false;
  return (
    keyPath.length <= 2 ||
    (declarations === "declarations" && keyPath.length <= 4)
  );
}

// A scalar value without its quotes or trailing comment, undefined for none,
// or null for a quoted value the drafter does not decode: one with a
// backslash escape, without a closing quote, or with text after it.
function scalar(value) {
  if (value === undefined || value.startsWith("#")) return undefined;
  if (!/^["']/.test(value)) return value.replace(/\s+#.*$/, "");
  const single = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(value);
  if (single) return single[1].replaceAll("''", "'");
  const double = /^"([^"\\]*)"(?:\s+#.*)?$/.exec(value);
  return double ? double[1] : null;
}

// The declarations the manifest's one profile resolves to, with the fields
// that decide their targets. As Repository Standards resolves them, a profile
// declaration replaces the default of its ID, adds a new one, or, with
// `exclude: true`, removes it. The source's one profile selects every default
// declaration unchanged. The retained manifest holds the selected profile
// alone; Repository Standards 4.0.0 writes it with empty defaults and the
// profile's resolved declarations. The manifest's block mappings are read by
// indentation, and only the key paths below matter:
// `defaults.declarations.<id>.<field>` and
// `profiles.<profile>.declarations.<id>.<field>`. A field that decides a
// target holds a single-line value on its own line, plain or quoted; any other
// form fails rather than being misread.
function manifestDeclarations() {
  const { path: manifest, text } = readManifest();
  const unreadable = (id) =>
    fail(`${manifest} declares ${id} in a form the drafter cannot read.`);
  const defaults = new Map();
  const profiles = new Map();
  const keys = [];
  // The field read on the previous line, which no deeper line may continue.
  let readField = null;
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (readField && indent > readField.indent) unreadable(readField.id);
    readField = null;
    const entry = /^( *)([A-Za-z0-9._-]+):(?:\s+(\S.*?))?\s*$/.exec(line);
    if (!entry) {
      // A line that is not a plain key is a sequence item, a document marker
      // or directive, or continues a value above it. At the top level or
      // directly under a declaration, the declarations, or what holds them,
      // only a key in another form can be none of these.
      const parent = keys
        .filter((key) => key.indent < indent)
        .map(({ key }) => key);
      if (!/^\s*-|^\.\.\.|^%/.test(line) && holdsDeclarations(parent)) {
        const where =
          parent.length > 0 ? `under ${parent.join(".")}` : "at its top level";
        fail(
          `${manifest} has a line ${where} that the drafter cannot read: ${line.trim()}`,
        );
      }
      continue;
    }
    while (keys.length > 0 && keys.at(-1).indent >= indent) keys.pop();
    keys.push({ indent, key: entry[2] });
    const value = scalar(entry[3]);
    const keyPath = keys.map(({ key }) => key);
    // The declarations this line belongs to, and its key path below them.
    let declarations = null;
    let declarationPath = null;
    if (keyPath[0] === "defaults" && keyPath[1] === "declarations") {
      declarations = defaults;
      declarationPath = keyPath.slice(2);
    } else if (keyPath[0] === "profiles" && keyPath.length > 1) {
      if (!profiles.has(keyPath[1])) profiles.set(keyPath[1], new Map());
      if (keyPath[2] === "declarations") {
        declarations = profiles.get(keyPath[1]);
        declarationPath = keyPath.slice(3);
      }
    }
    // `defaults`, `profiles`, and each profile hold their mappings below them.
    const container =
      keyPath.length === 1
        ? ["defaults", "profiles"].includes(keyPath[0])
        : keyPath.length === 2 && keyPath[0] === "profiles";
    if (container && value !== undefined)
      fail(
        `${manifest} writes ${keyPath.join(".")} in a form the drafter cannot read.`,
      );
    if (!declarations) continue;
    const [id, field, ...deeper] = declarationPath;
    if (id === undefined) {
      if (value !== undefined && value !== "{}")
        fail(
          `${manifest} lists its declarations in a form the drafter cannot read.`,
        );
    } else if (field === undefined) {
      if (value === undefined) declarations.set(id, { id });
      else if (/^\{\s*exclude:\s*true\s*\}$/.test(value))
        declarations.set(id, { id, exclude: true });
      else unreadable(id);
    } else if (deeper.length === 0 && targetFields.includes(field)) {
      // A missing value, a block scalar, an anchor, alias, or tag, a flow
      // collection, or a quoted value the drafter does not decode. `-`, `?`,
      // and `:` are indicators only before whitespace.
      if (value == null || /^(?:[,[\]{}&*!|>%@`]|[-?:](?:\s|$))/.test(entry[3]))
        unreadable(id);
      readField = { indent, id };
      const declaration = declarations.get(id);
      if (field === "exclude") declaration.exclude = value === "true";
      else declaration[field] = value;
    }
  }
  if (profiles.size !== 1) {
    fail(
      `${manifest} declares ${profiles.size} profiles; the drafter reads a manifest with one profile.`,
    );
  }
  const resolved = new Map(defaults);
  for (const [id, declaration] of [...profiles.values()][0]) {
    if (declaration.exclude) resolved.delete(id);
    else resolved.set(id, declaration);
  }
  const declarations = [...resolved.values()];
  if (
    !declarations.some(
      (candidate) =>
        candidate.id === declarationId && candidate.kind === "repository",
    )
  ) {
    fail(`${manifest} declares no ${declarationId} repository declaration.`);
  }
  return declarations;
}

// The targets the other declarations own, and the declaration that owns a
// path, or null.
function ownership(declarations) {
  const others = declarations.filter(
    (declaration) => declaration.id !== declarationId,
  );
  const paths = new Map();
  const directories = [];
  for (const declaration of others) {
    const targets = declarationTargets([declaration]);
    for (const path of targets.paths) paths.set(path, declaration.id);
    for (const directory of targets.directories)
      directories.push([directory, declaration.id]);
  }
  return {
    declaredTargets: declarationTargets(others),
    owner: (path) =>
      paths.get(path) ??
      directories.find(([directory]) => isWithin(path, directory))?.[1] ??
      null,
  };
}

// The regular files Git keeps: tracked and untracked files that no ignore rule
// excludes, outside the reserved paths, reached through real directories only.
// These, and their directories, are the paths the CLI's discovery observation
// offers as evidence.
function keptTree(projectRoot) {
  const realDirectories = new Map();
  const isRealDirectory = (directory) => {
    if (!realDirectories.has(directory)) {
      realDirectories.set(
        directory,
        entryAt(projectRoot, directory)?.isDirectory() === true &&
          (parentOf(directory) === "" || isRealDirectory(parentOf(directory))),
      );
    }
    return realDirectories.get(directory);
  };
  const files = new Set();
  for (const path of git(projectRoot, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]).split("\0")) {
    if (!path || isReserved(path)) continue;
    if (
      (parentOf(path) === "" || isRealDirectory(parentOf(path))) &&
      entryAt(projectRoot, path)?.isFile()
    )
      files.add(path);
  }
  const directories = new Set();
  for (const path of files) {
    for (
      let directory = parentOf(path);
      directory !== "";
      directory = parentOf(directory)
    )
      directories.add(directory);
  }
  return { files, directories };
}

// The documentation roots: `docs`, which always is one, and each directory the
// agent decided is one. A decided root is a repository-relative directory that
// holds a file Git keeps, outside `docs`, the reserved paths, and every other
// root, since a documentation root never lies inside another. No other
// declaration may own it or its index, which names it as a root.
function decidedRoots(values, kept, owner) {
  const roots = [];
  for (const value of values) {
    const path = value.replace(/\/+$/, "");
    if (
      !path ||
      isAbsolute(path) ||
      path.includes("\\") ||
      posix.normalize(path) !== path ||
      path === "." ||
      path === ".." ||
      path.startsWith("../")
    ) {
      fail(`--root ${value} must be a repository-relative directory path.`);
    }
    if (
      isWithin(path, repositoryDocumentationRoot) ||
      isInside(repositoryDocumentationRoot, path)
    ) {
      fail(
        `--root ${value} cannot be used: ${repositoryDocumentationRoot} is always a documentation root, and a documentation root never lies inside another.`,
      );
    }
    if (isReserved(path))
      fail(`--root ${value} lies in a path Repository Standards reserves.`);
    if (!kept.directories.has(path))
      fail(`--root ${value} is not a directory that holds a file Git keeps.`);
    const declaration = owner(path) ?? owner(`${path}/${directoryIndex}`);
    if (declaration)
      fail(
        `--root ${value} cannot be used: the ${declaration} declaration owns it or its ${directoryIndex}.`,
      );
    if (!roots.includes(path)) roots.push(path);
  }
  for (const root of roots) {
    const outer = roots.find((other) => isInside(root, other));
    if (outer)
      fail(
        `--root ${root} lies inside --root ${outer}; a documentation root never lies inside another.`,
      );
  }
  return [repositoryDocumentationRoot, ...roots].sort();
}

const reasons = {
  file: (root) => `A file under the documentation root ${code(root)}.`,
  rootIndex: (root) =>
    `The index of the documentation root ${code(root)}, to create.`,
  directoryIndex: (directory) =>
    `The index of the documentation directory ${code(directory)}, to create.`,
  developmentGuide:
    "The development guide, which the contribution guide requires, to create.",
  owned: (id) => `Owned by the ${code(id)} declaration.`,
  glossary: "The domain glossary at the repository root.",
  contextMap: "The context map at the repository root.",
  contextGlossary: `A context glossary that ${code(contextMap)} lists.`,
  outsideIndex: `A ${directoryIndex} outside the documentation roots, which the documentation check would read as a documentation root's index.`,
};

const questions = {
  root: (candidate, directories, outer) =>
    `Is ${code(candidate)} a documentation root${outer.length > 0 ? `, if ${series(outer.map(code), "or")} is not` : ""}? Its ${series(directories.map(code))} ${directories.length === 1 ? "directory holds" : "directories hold"} Markdown documents. If it is, draft again with ${code(`--root ${candidate}`)}.`,
  outside: (group, files) =>
    `Which of these Markdown files ${group === "." ? "at the repository root" : `under ${code(group)}`} are documentation this scope must cover, such as a document to move into a documentation category: ${series(files.map(code))}? Include each one, with its destination when it moves.`,
  stray: (entry, root) =>
    `${code(entry)} lies directly under the documentation root ${code(root)}, outside the ${series(documentationCategories)} categories. Which category does it move to? Include each destination path and any new directory's index; the files Git keeps in it are already included.`,
  unkept: (directory, root) =>
    `${code(directory)} under the documentation root ${code(root)} holds no file that Git keeps, but the documentation check reads it. Should it be removed, or kept by Git and drafted again?`,
  ignored: (path, root) =>
    `Git ignores ${code(path)}, which lies under the documentation root ${code(root)}. Should it be removed, moved outside the root, or kept by Git and drafted again?`,
  special: (path, root) =>
    `${code(path)} under the documentation root ${code(root)} is a symbolic link or special file, which the scope cannot hold. Should it be replaced with a regular file or removed?`,
  glossary: (path) =>
    `Is ${code(path)} a domain glossary or context map of this repository? Include it if it is.`,
  ambiguous: (root) =>
    `The documentation check cannot tell that ${code(root)} is a documentation root without a ${series(documentationCategories, "or")} directory index. Which category will hold its documents? Include that category's ${code(directoryIndex)}.`,
  notDirectory: (directory) =>
    `${code(directory)} must be a directory to hold its documentation index, but it is not. Should it be removed or renamed?`,
  notIndex: (path) =>
    `${code(path)} must be a file, the documentation index of its directory, but it is a directory. Should it be removed or renamed?`,
  strayOwned: (entry, root) =>
    `${code(entry)} lies directly under the documentation root ${code(root)}, outside the ${series(documentationCategories)} categories, but its files belong to other declarations or to Repository Standards, so this scope cannot move it. Is ${code(root)} a documentation root after all?`,
  unsupported: (index, directory) =>
    `Repository Standards accepts the new ${code(index)} only with evidence inside ${code(directory)}, where Git keeps no file yet. Should that directory's first content be committed in a separate reviewed change before drafting again?`,
};

function coverage(roots) {
  const plural = roots.length > 1;
  return `Drafted from the repository tree by ${code("discovery/draft-documentation-scope.mjs")}: every file Git keeps under the documentation ${plural ? "roots" : "root"} ${series(roots.map(code))}, a new index for each of ${plural ? "their" : "its"} directories without one, the development guide, and the domain glossaries and context maps the rules identify. Paths other declarations own are left out, and so is each ${directoryIndex} outside the documentation roots. Link-repair files and move destinations enter when the work needs them.`;
}

// A draft in progress: its candidates by path, the new indexes among them by
// their directory, its questions about one path, each asked once, and its
// other questions.
class Draft {
  candidates = new Map();
  createdIndexes = new Map();
  unresolved = new Map();
  otherQuestions = [];

  include(path, reason, evidence) {
    this.candidates.set(path, { path, decision: "include", reason, evidence });
  }

  exclude(path, reason) {
    this.candidates.set(path, {
      path,
      decision: "exclude",
      reason,
      evidence: [path],
    });
  }

  ask(path, question) {
    if (!this.unresolved.has(path)) this.unresolved.set(path, question);
  }

  isAsked(path) {
    return [...this.unresolved.keys()].some((asked) => isWithin(path, asked));
  }

  included() {
    return [...this.candidates.values()]
      .filter((candidate) => candidate.decision === "include")
      .map((candidate) => candidate.path);
  }

  // A new index that cites nothing lacks the evidence Repository Standards
  // requires; a question says what it needs.
  evidenceQuestions() {
    return [...this.createdIndexes]
      .filter(([path]) => this.candidates.get(path)?.evidence.length === 0)
      .map(([path, directory]) => questions.unsupported(path, directory));
  }

  proposal(roots) {
    return {
      format: proposalFormat,
      declarations: [
        {
          id: declarationId,
          coverage: coverage(roots),
          candidates: [...this.candidates.values()].sort(byPath),
          unresolved: [
            ...this.unresolved.values(),
            ...this.otherQuestions,
            ...this.evidenceQuestions(),
          ].sort(),
        },
      ],
    };
  }
}

// A new index for a directory. It cites its directory, which Repository
// Standards requires to hold a file for a missing README; without one, the
// index is still drafted, citing nothing. A directory path that is not a
// directory cannot hold an index, which is a question.
function createIndex(draft, context, directory, root) {
  const path = `${directory}/${directoryIndex}`;
  if (context.owner(path) || draft.candidates.has(path)) return;
  const entry = entryAt(context.projectRoot, directory);
  if (entry && !entry.isDirectory()) {
    draft.ask(directory, questions.notDirectory(directory));
    return;
  }
  let reason = reasons.directoryIndex(directory);
  if (path === developmentGuide) reason = reasons.developmentGuide;
  else if (directory === root) reason = reasons.rootIndex(root);
  draft.include(
    path,
    reason,
    context.kept.directories.has(directory) ? [directory] : [],
  );
  draft.createdIndexes.set(path, directory);
}

// Every entry under a root, by the tree walk the check uses.
function draftRoot(draft, context, root) {
  const { kept, owner } = context;
  const { directories } = documentationTree(context.projectRoot, root);
  const skipped = [];
  for (const { path: directory, entries } of directories) {
    if (skipped.some((other) => isWithin(directory, other))) continue;
    if (directory !== root && isReserved(directory)) {
      skipped.push(directory);
      continue;
    }
    const directoryOwner = directory === root ? null : owner(directory);
    if (directoryOwner) {
      for (const path of kept.files) {
        if (isInside(path, directory))
          draft.exclude(path, reasons.owned(directoryOwner));
      }
      skipped.push(directory);
      continue;
    }
    if (
      directory !== root &&
      !kept.directories.has(directory) &&
      !reservedPaths.some(
        (reserved) =>
          isInside(reserved, directory) &&
          entryAt(context.projectRoot, reserved),
      )
    ) {
      draft.ask(directory, questions.unkept(directory, root));
      skipped.push(directory);
      continue;
    }
    let indexed = false;
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.name === directoryIndex) indexed = true;
      if (entry.isDirectory()) {
        if (entry.name === directoryIndex) {
          draft.ask(path, questions.notIndex(path));
          skipped.push(path);
        }
        continue;
      }
      const declaration = owner(path);
      if (declaration) {
        if (kept.files.has(path))
          draft.exclude(path, reasons.owned(declaration));
      } else if (!entry.isFile()) {
        draft.ask(path, questions.special(path, root));
      } else if (kept.files.has(path)) {
        draft.include(path, reasons.file(root), [path]);
      } else {
        draft.ask(path, questions.ignored(path, root));
      }
    }
    if (!indexed) createIndex(draft, context, directory, root);
  }
  if (directories.length === 0) createIndex(draft, context, root, root);
}

// The repository root's glossary and context map are decided, and so is each
// context glossary that context map lists by file or directory. Any other
// glossary or context map is a question.
function draftGlossaries(draft, context, roots, model) {
  const glossaries = [...context.kept.files]
    .filter(
      (path) =>
        [glossary, contextMap].includes(baseName(path)) &&
        !roots.some((root) => isInside(path, root)) &&
        !context.owner(path),
    )
    .sort();
  const listed = model.links
    .filter(
      (link) =>
        link.source === contextMap &&
        !link.broken &&
        typeof link.path === "string",
    )
    .map((link) => link.path.replace(/\/+$/, ""));
  for (const path of glossaries) {
    if (path === glossary) draft.include(path, reasons.glossary, [path]);
    else if (path === contextMap)
      draft.include(path, reasons.contextMap, [path]);
    else if (
      baseName(path) === glossary &&
      draft.candidates.has(contextMap) &&
      (listed.includes(path) || listed.includes(parentOf(path)))
    ) {
      draft.include(path, reasons.contextGlossary, [path, contextMap]);
    } else {
      draft.ask(path, questions.glossary(path));
    }
  }
}

// Top-level entries outside the categories move into one; no rule decides
// which. Their files are already included as move sources, and a moved
// directory needs no new index where it is now. An entry with nothing to move
// but files of other declarations or Repository Standards cannot move in this
// scope. A decided root without a category is ambiguous to the check, which
// then also reads the indexes inside it as candidate roots; only the decided
// roots are asked about.
function askStrayEntries(draft, context, model, roots) {
  const holdsOthersFiles = (entry) =>
    [...context.kept.files].some(
      (path) => isWithin(path, entry) && context.owner(path),
    ) ||
    reservedPaths.some(
      (reserved) =>
        isWithin(reserved, entry) && entryAt(context.projectRoot, reserved),
    );
  for (const root of model.roots.filter((candidate) =>
    roots.includes(candidate.path),
  )) {
    const included = draft.included();
    for (const entry of root.strayEntries) {
      if (draft.isAsked(entry)) continue;
      const moves = included.some(
        (path) => isWithin(path, entry) && !draft.createdIndexes.has(path),
      );
      draft.ask(
        entry,
        !moves && holdsOthersFiles(entry)
          ? questions.strayOwned(entry, root.path)
          : questions.stray(entry, root.path),
      );
      for (const path of draft.createdIndexes.keys()) {
        if (isInside(path, entry)) draft.candidates.delete(path);
      }
    }
  }
  for (const root of model.ambiguousRoots.filter((candidate) =>
    roots.includes(candidate),
  )) {
    draft.ask(root, questions.ambiguous(root));
  }
}

// A directory outside the roots whose category-named directories hold
// Markdown documents may be a documentation root; no rule decides it, unless
// another declaration owns it or its index. A candidate inside another can be
// a root only if the outer one is not.
function askCandidateRoots(draft, context, roots) {
  const { kept, owner } = context;
  const categoryDirectories = [...kept.directories]
    .filter((directory) =>
      documentationCategories.includes(baseName(directory)),
    )
    .filter(
      (directory) =>
        !roots.some((root) => isWithin(directory, root)) && !owner(directory),
    )
    .filter((directory) =>
      [...kept.files].some(
        (path) => isInside(path, directory) && isMarkdownPath(path),
      ),
    );
  const { candidatesWithCategories } = inferredRoots(
    categoryDirectories.map((directory) => `${directory}/${directoryIndex}`),
  );
  const candidates = candidatesWithCategories
    .filter(
      (candidate) =>
        !roots.some(
          (root) => isWithin(candidate, root) || isInside(root, candidate),
        ),
    )
    .filter(
      (candidate) =>
        !owner(candidate) && !owner(`${candidate}/${directoryIndex}`),
    );
  for (const candidate of candidates) {
    const directories = categoryDirectories
      .filter((directory) => parentOf(directory) === candidate)
      .sort();
    const outer = candidates.filter((other) => isInside(candidate, other));
    draft.ask(candidate, questions.root(candidate, directories, outer));
  }
}

// A README outside the roots is never in this scope: the check reads every
// README in the scope as a documentation root's index. Other Markdown files
// outside the roots may be documentation to cover or move, one question per
// top-level directory.
function draftOutsideRoots(draft, context, roots) {
  const groups = new Map();
  for (const path of [...context.kept.files].sort()) {
    if (
      !isMarkdownPath(path) ||
      roots.some((root) => isInside(path, root)) ||
      context.owner(path)
    )
      continue;
    if (baseName(path) === directoryIndex) {
      draft.exclude(path, reasons.outsideIndex);
      continue;
    }
    if ([glossary, contextMap].includes(baseName(path))) continue;
    const group = path.includes("/") ? path.slice(0, path.indexOf("/")) : ".";
    groups.set(group, [...(groups.get(group) ?? []), path]);
  }
  for (const [group, files] of groups)
    draft.otherQuestions.push(questions.outside(group, files));
}

function draftDocumentationScope(project, rootArguments) {
  const projectRoot = projectRootOf(project);
  const { declaredTargets, owner } = ownership(manifestDeclarations());
  const kept = keptTree(projectRoot);
  const context = { projectRoot, kept, owner };
  const roots = decidedRoots(rootArguments, kept, owner);
  const draft = new Draft();

  for (const root of roots) draftRoot(draft, context, root);
  const guideDirectory = parentOf(developmentGuide);
  if (
    !draft.candidates.has(developmentGuide) &&
    !draft.isAsked(guideDirectory) &&
    !draft.isAsked(developmentGuide)
  ) {
    createIndex(draft, context, guideDirectory, repositoryDocumentationRoot);
  }
  for (const path of [glossary, contextMap]) {
    if (kept.files.has(path) && !owner(path))
      draft.include(
        path,
        path === glossary ? reasons.glossary : reasons.contextMap,
        [path],
      );
  }

  const model = documentationModel(projectRoot, draft.included(), {
    declaredTargets,
  });
  draftGlossaries(draft, context, roots, model);
  askStrayEntries(draft, context, model, roots);
  askCandidateRoots(draft, context, roots);
  draftOutsideRoots(draft, context, roots);
  return draft.proposal(roots);
}

try {
  const { project, roots } = parseArguments(process.argv.slice(2));
  process.stdout.write(
    `${JSON.stringify(draftDocumentationScope(project, roots), null, 2)}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
