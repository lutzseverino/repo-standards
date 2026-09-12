For these tiny CSV/text tools, I recommend a short purpose sentence, one copyable invocation, and a brief explanation of its input and output. No required headings or installation section: that keeps maintenance small, though it gives readers less setup help if running the tool needs unusual prerequisites. For example, a CSV converter might show `csv-to-tsv input.csv > output.tsv` and explain that it reads the named CSV file and writes TSV to stdout. That example illustrates the guidance; it is not a command imposed on every project.

Proposed project-owned `README.md` guidance:
```markdown
# README guidance for small command-line utilities

Keep README.md brief. Include:
- One sentence explaining what the utility does.
- One working invocation for this project.
- A short explanation of that invocation’s input and output, including file paths or stdin/stdout where relevant.

Use the project’s own facts and organization. No particular headings or installation section are required.
```
This governs only `README.md`; an agent assesses or adapts the project’s own document.

Your exact `.editorconfig` will contain only:
```ini
[*]
end_of_line = lf
insert_final_newline = true
```
The source owns that whole file and its non-executable state; replacement covers the whole file, and later local edits conflict with its installed baseline. I have added no indentation, semicolon, signed-commit, or other defaults. CI is skipped and test requirements are deferred.

Does the proposed README guidance express the amount of structure you want?
