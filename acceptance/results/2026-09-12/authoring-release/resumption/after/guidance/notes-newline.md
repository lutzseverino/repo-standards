Keep docs/notes.md project-owned and require its final byte to be LF. Preserve all
existing content. An existing empty file can receive one LF byte. If the file is
missing, report a blocker; do not create missing notes content.
