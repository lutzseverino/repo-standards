# External public CLI acquisition

Prerequisite command: `node --version`
Exit status: 0
Output:
```text
v24.11.1
```

Acquired from the public npm registry using:
```sh
author_cli_dir="$(mktemp -d "${TMPDIR:-/tmp}/author-standards-cli.XXXXXX")"
print -r -- "$author_cli_dir"
npm install --prefix "$author_cli_dir" --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org @lutzseverino/repo-standards@1.0.1
"$author_cli_dir/node_modules/.bin/repo-standards" --version
```
Exit status: 0
Output:
```text
/var/folders/8p/12p3f_8s5ssf7z3nck7dwwnh0000gn/T//author-standards-cli.oHb3bE

added 6 packages in 832ms
1.0.1
```

Read the installed skill's `references/cli.md`, then the matching installed package's `docs/author-format.md`, before creating source material. Both reads exited 0. The matching format is `repo-standards/v1`.
