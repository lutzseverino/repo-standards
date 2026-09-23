// A deterministic unified diff of two text files, so a report can show an exact
// change without carrying either file's bytes. Lines keep their terminators, so
// a changed final newline is a changed line, marked as Git and diff mark it.

type Edit = { kind: ' ' | '-' | '+'; line: string };

const context = 3;
// Beyond this edit distance the diff replaces the changed region as a whole: it
// stays a correct diff while bounding the time and memory of the comparison.
const editLimit = 1_000;

function lines(text: string | undefined) {
  return text === undefined || text === '' ? [] : text.split(/(?<=\n)/);
}

// Myers' shortest edit script over the lines between the common prefix and
// suffix, or undefined when it needs more than the edit limit.
function shortestEdits(a: string[], b: string[]): Edit[] | undefined {
  const n = a.length, m = b.length, offset = n + m + 1;
  const furthest = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= Math.min(n + m, editLimit); d++) {
    trace.push(furthest.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && furthest[offset + k - 1]! < furthest[offset + k + 1]!) ? furthest[offset + k + 1]! : furthest[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      furthest[offset + k] = x;
      if (x >= n && y >= m) return backtrack(a, b, trace);
    }
  }
  return undefined;
}

function backtrack(a: string[], b: string[], trace: Int32Array[]): Edit[] {
  const edits: Edit[] = [];
  let x = a.length, y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const previous = trace[d]!;
    const at = (k: number) => previous[k + d + 1]!;
    const k = x - y;
    const previousK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const previousX = at(previousK), previousY = previousX - previousK;
    while (x > previousX && y > previousY) { edits.push({ kind: ' ', line: a[--x]! }); y--; }
    if (d > 0) edits.push(x === previousX ? { kind: '+', line: b[--y]! } : { kind: '-', line: a[--x]! });
    x = previousX; y = previousY;
  }
  return edits.reverse();
}

function edits(a: string[], b: string[]): Edit[] {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const oldMiddle = a.slice(prefix, a.length - suffix), newMiddle = b.slice(prefix, b.length - suffix);
  const middle = shortestEdits(oldMiddle, newMiddle)
    ?? [...oldMiddle.map(line => ({ kind: '-' as const, line })), ...newMiddle.map(line => ({ kind: '+' as const, line }))];
  return [...a.slice(0, prefix).map(line => ({ kind: ' ' as const, line })), ...middle, ...a.slice(a.length - suffix).map(line => ({ kind: ' ' as const, line }))];
}

function range(start: number, count: number) {
  return count === 1 ? `${start}` : `${count === 0 ? start - 1 : start},${count}`;
}

// Undefined text is an absent file. Hunks keep three lines of context and use
// the ranges and end-of-file marker of GNU diff. Without a changed line, such as
// creating or deleting an empty file, there is no diff: a unified diff cannot
// express that change, and the file's before and after state already do.
export function unifiedDiff(path: string, before: string | undefined, after: string | undefined) {
  const script = edits(lines(before), lines(after));
  if (script.every(edit => edit.kind === ' ')) return undefined;
  let output = `--- ${before === undefined ? '/dev/null' : `a/${path}`}\n+++ ${after === undefined ? '/dev/null' : `b/${path}`}\n`;
  const changed = script.flatMap((edit, index) => edit.kind === ' ' ? [] : [index]);
  let first = 0;
  while (first < changed.length) {
    let last = first;
    while (last + 1 < changed.length && changed[last + 1]! - changed[last]! <= 2 * context + 1) last++;
    const start = Math.max(0, changed[first]! - context), end = Math.min(script.length, changed[last]! + context + 1);
    let oldLine = 1, newLine = 1;
    for (const edit of script.slice(0, start)) { if (edit.kind !== '+') oldLine++; if (edit.kind !== '-') newLine++; }
    const hunk = script.slice(start, end);
    const oldCount = hunk.filter(edit => edit.kind !== '+').length, newCount = hunk.filter(edit => edit.kind !== '-').length;
    output += `@@ -${range(oldLine, oldCount)} +${range(newLine, newCount)} @@\n`;
    for (const edit of hunk) output += edit.kind + edit.line + (edit.line.endsWith('\n') ? '' : '\n\\ No newline at end of file\n');
    first = last + 1;
  }
  return output;
}
