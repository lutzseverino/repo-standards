# Addition CLI prints `23` instead of `5` for arguments `2 3`

Environment: Node v24.11.1 on Linux arm64. This is a synthetic two-line local
fixture, with no package dependencies or release version.

## Reproduction steps

1. Save this as `add.mjs` in an empty directory:

   ```js
   const [left, right] = process.argv.slice(2);
   console.log(left + right);
   ```

2. From that directory, run `node add.mjs 2 3`.

## Expected behavior

The fixture README specifies the numeric sum `5` on stdout.

## Actual behavior

I reproduced stdout `23` followed by a newline, with exit status 0 and empty
stderr. The supplied symptom was also `23`; it is now observed for this example.

## Attempted actions and results

- Read the fixture README and all of `add.mjs`. The code only reads command-line
  arguments and writes stdout; it accesses no files, network, or credentials.
- Ran `node --version` from the fixture directory: exit 0, stdout `v24.11.1`,
  empty stderr.
- Ran `node add.mjs 2 3` once from the same directory: exit 0, stdout `23`,
  empty stderr. The command had a 10-second timeout and 1 MiB-per-stream output
  limit; neither limit was reached.
- Compared the fixture files before and after: bytes and modes were unchanged.

The exact disposable working directory and process records are retained in the
local exercise evidence; the reproduction above needs only its own directory.

## Limits

No other inputs, Node versions, or platforms were tested. No fix was attempted.
The string `+` operation is a possible cause inferred from the source, not a
separately tested fix. This draft was produced locally and was not submitted.
