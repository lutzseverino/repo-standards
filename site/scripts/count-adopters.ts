import { writeFileSync } from "node:fs";
import { countAdopters, githubAdoptions } from "../src/lib/adopters.ts";
import { countOutput } from "../src/lib/adopter-counts.ts";
import {
  recordedAdoptions,
  sourceSearchInput,
} from "../src/lib/load-catalogue.ts";
import { searchRepositories } from "../src/lib/search-report.ts";

const [output] = process.argv.slice(2);
const run = process.env.GITHUB_RUN_ID;
const attempt = process.env.GITHUB_RUN_ATTEMPT;
if (!output || !run || !attempt)
  throw new Error(
    "Count production requires an output path, run ID and attempt.",
  );
const recording = process.env.SITE_SEARCH_RECORDING;
const input = recording
  ? recordedAdoptions(recording)
  : githubAdoptions({ token: process.env.GH_TOKEN ?? "" });
const repositories = await searchRepositories(sourceSearchInput());
const counts = await countAdopters(repositories, input);
// Write only after every source succeeds. The workflow passes a fresh temp
// path to this producer and to its build, without caching or uploading it.
writeFileSync(
  output,
  `${JSON.stringify(countOutput(counts, { run, attempt }))}\n`,
  { flag: "wx" },
);
