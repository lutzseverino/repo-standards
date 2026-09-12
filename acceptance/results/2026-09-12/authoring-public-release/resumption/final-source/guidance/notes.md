# NOTES final newline

NOTES.md remains project-owned. When nonempty, its last byte must be LF.
An empty file is compliant; existing CRLF endings also satisfy this final-byte requirement.

The check reads only NOTES.md. The fix appends exactly one LF when missing,
keeping existing bytes and permission bits. Neither operation creates a missing
file, follows a symbolic link, handles a nonregular target, nor normalizes line
endings. Missing, unreadable, nonregular, symbolic-link, or out-of-scope targets
block; write failure also blocks the fix. Repeating a completed fix changes nothing.
