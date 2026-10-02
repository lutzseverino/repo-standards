# Discover documentation scope

Draft the documentation scope with the drafter this source ships. Run it with
Node.js 24 from the standards source at the selected commit, the source that
holds this file, against the adopting repository:

```sh
node discovery/draft-documentation-scope.mjs --project /path/to/adopting-repository \
  > /tmp/documentation-scope.json
```

It reads the repository without changing it and writes a Repository Standards
scope proposal whose one entry is the `documentation` declaration's; the
entries of the other discovery declarations join it in the proposal. The
documentation rules in the `CONTRIBUTING.md` this source installs decide its
candidates: every file Git keeps under each documentation root, the index of
each root and of each directory under one, the development guide, the
repository root's glossary and context map, and each context glossary that
context map lists. Paths other declarations own, and paths Repository Standards
reserves, stay out, and so does every `README.md` outside the roots, which the
documentation check would read as a root's index; such a README cannot enter
this scope, even as a move source.

Decide only the cases in its unresolved questions, and remove each question once
it is decided:

- Whether a directory is a documentation root. For each one that is, draft
  again with `--root <directory>`. `docs` is always a root, and a documentation
  root never lies inside another.
- Whether a Markdown file outside the documentation roots is documentation that
  the scope must cover, such as a document to move into a category.
- Which category a file or directory directly under a root moves to, and which
  category holds the documents of a root that has none.
- Whether another `CONTEXT.md` or `CONTEXT-MAP.md` is a glossary or context map
  of this repository.
- What becomes of a file under a root that Git ignores, a directory under a root
  without a file that Git keeps, a symbolic link under a root, or an entry that
  blocks a root or an index, such as a file named `docs`.
- Whether to commit the first content of a documentation root or of a directory
  under one that has none, in a separate reviewed change, so that its new index
  has the evidence Repository Standards requires.

Then add each intended new path that the work needs and the draft cannot know: a
move destination, with the index of any new directory; `docs/agents/project.md`
when repository-specific constraints require it; and a file whose link to
documentation needs repair. Keep all declarations' paths disjoint: a Project
README under a documentation root belongs to one declaration only. A move
requires authority for its source, destination, and affected link repairs.

The draft does not confirm membership: the maintainer confirms the
documentation scope with the complete inspection.
