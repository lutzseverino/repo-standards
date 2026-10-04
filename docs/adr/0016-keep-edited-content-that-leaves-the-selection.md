# Keep edited content that leaves the selection

Amends [ADR 0010](0010-replace-tracked-content-block-only-untracked.md).

Installed exact content leaves the selection when the author drops its
declaration, when the selected profile starts to exclude it, or when the
maintainer changes the profile or the source. Since 4.0.0 an update removed
such a target in every case and listed an edited target as discarding edits.
A project that had taken over the file then had to restore it after the update.

An update now removes a target that leaves the selection only when it still
matches its installed baseline. That content was entirely the author's.
An edited target stays in place, and the product no longer owns it: the
inspection lists it as kept and now owned by the project, and later runs
neither track nor remove it. An edited whole skill directory stays as a unit.

The product can't tell why content left the selection or what anyone intends to
do with it. An edit is the one observable sign that the project owns the file.
This differs from a target that stays in the selection: there, the author still
owns the content, and ADR 0010 still replaces an edited target and lists the
edits it discards.
