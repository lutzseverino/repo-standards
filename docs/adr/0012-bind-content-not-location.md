# Bind content, not location

Extends [ADR 0008](0008-bind-confirmation-identity-to-what-the-run-reads.md).

ADR 0008 bound confirmation to what a run reads, but the inspection and the
discovery request still bound the absolute project root, and the discovery
observation named the global excludes and the repository info exclude by their
absolute, machine-local locations. The same commit inspected from another clone
therefore had another identity and could not confirm a start, so a maintainer
could not inspect in a throwaway clone. The retained scope evidence also
committed those locations, publishing the layout of the machine that ran the
adoption in the adopting project's history.

Identities and committed evidence now bind content, not location. Neither the
inspection identity nor the discovery request identity binds the project root,
and the inspection report no longer carries it; the run records the root for
provenance only, as it already records HEAD. Git ignore inputs are named by
role: the global excludes, the repository info exclude, and each consulted
`.gitignore` by its project-relative path. Each keeps its content state, so a
change to what Git ignores still changes the identity, while moving an input
with unchanged content does not. No absolute location is observed into an
identity or committed.

The trade-off is that the identity no longer says where an inspection was made,
and an inspection from any checkout of the same content confirms a start in
this one. Start still reconstructs the inspection in its own checkout, under
its lock and from that checkout's own content, before it mutates anything, so a
confirmation carries over only when everything the run reads is the same.
