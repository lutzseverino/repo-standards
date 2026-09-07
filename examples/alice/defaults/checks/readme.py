"""Check documentation structure; contextual usefulness remains agent evidence."""
import json
from pathlib import Path
import re
import sys

request = json.load(sys.stdin)
if request.get("format") != "repo-standards/operation/v1":
    raise ValueError("Unsupported operation input")
targets = request["allowedTargets"]["paths"]
if len(targets) != 1 or request["allowedTargets"]["directories"]:
    raise ValueError("Expected one contextual file target")
path = Path(request["projectRoot"]) / targets[0]
text = path.read_text() if path.is_file() else ""
headings = {match.casefold() for match in re.findall(r"^##[ \t]+(.+?)[ \t]*$", text, re.MULTILINE)}
missing = [heading for heading in ("Setup", "Usage", "Development") if heading.casefold() not in headings]
print(json.dumps({
    "format": "repo-standards/result/v1",
    "status": "failed" if missing else "passed",
    "message": "Missing README headings: " + ", ".join(missing) if missing else "Setup, Usage and Development headings are present; usefulness requires agent assessment.",
}))
