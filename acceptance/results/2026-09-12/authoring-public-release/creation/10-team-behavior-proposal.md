The team differences justify a second complete profile. Here is the proposed content and selection before I add the optional behavior.

| Declaration | Shared default / personal-tools | team-services |
| --- | --- | --- |
| editor-line-endings | Exact shared `.editorconfig` already accepted | Inherit identical declaration and bytes |
| readme-usage | Accepted tiny-tool purpose, invocation, concrete output, input/output guidance | Replace the whole declaration with the service guidance below |
| reproducible-bug-reports | Accepted project-owned `CONTRIBUTING.md` guidance | Exclude; employer content is outside this source’s governance and is not deleted |
| runbook-recovery | Absent | Add project-owned guidance across `docs/runbooks/` |

Replacement guidance, targeting only project-owned `README.md`:
```markdown
# README guidance for team services

Explain the service’s purpose, its startup command, and its health endpoint using the project’s actual facts.
Use the project’s own organization. No CLI-usage invocation or sample output is required beyond the requested startup command.
```
For a deployed service, this helps teammates start it and locate health information; keeping those facts accurate costs more than the tiny-tool README. The replacement carries none of the tiny-tool requirements.

New repository guidance, covering the explicit directory tree `docs/runbooks`:
```markdown
# Runbook recovery guidance

Runbooks under docs/runbooks/ must describe a recovery procedure and identify an owner to contact.
Keep the runbooks project-owned and use the service’s actual procedures and ownership information.
```
This helps someone handling an incident find recovery steps and a contact; owners and recovery instructions need maintenance. No tutorial profile will be created.

For both profiles, I propose these optional additions:

- `notes-final-newline`: project-owned `NOTES.md` guidance requiring a final LF byte when nonempty. A read-only check passes an empty file or any file ending in LF (including CRLF), fails a nonempty file without final LF, and blocks when the file is missing, not a regular file, a symbolic link, unreadable, or its operation request is out of scope. The fix appends exactly one LF only when missing, preserves all existing bytes and permission bits, and returns unchanged on repeat. It never creates missing NOTES.md or normalizes existing line endings; it blocks on the same conditions and on write failure. This adds focused verification and a repair beyond editor configuration. It makes no claim about the meaning or quality of notes.
- Both operations use `node` version `>=24.0.0 <25.0.0`, probe `node --version`, a 10-second timeout, no additional resources, and one shared script with literal argument `check` or `fix`. They need local read access to NOTES.md and write access for the fix, no network or credentials. Scripts run with the invoking user’s access; the disposable exercises are not a sandbox. Maintenance is a small byte-level script plus its protocol/version compatibility. I will exercise failing, blocked, repair, repeated-fix, and passing cases in both resolved profiles and compare bytes/modes, including unrelated files.
- `documentation-review`: a whole source-owned `.agents/skills/documentation-review` directory, replaced as a unit on updates, for an author-requested ordinary documentation review. It reads the selected profile’s guidance and project documents, reports concrete gaps with paths and suggested edits, and changes files only when the user asks. In personal-tools it reviews README purpose, invocation, sample output, input/output, and CONTRIBUTING reproducible-bug reporting. In team-services it reviews README purpose/startup/health and runbooks’ recovery/contact information, leaving CONTRIBUTING outside its review. It does not invoke adoption, change standards selection, enforce checks, execute documented commands, or assess runtime health. Prerequisites are an agent with file-reading ability and a known selected profile; when the profile is unknown it asks. It needs no extra runtime, network, or credentials. Its profile-specific checklist must be maintained alongside the guidance. I will exercise it on disposable documentation with deliberate gaps and record actual findings separately from structural validation.

Do you accept the concrete team guidance and both optional additions with these behaviors, prerequisites, boundaries, and maintenance costs?
