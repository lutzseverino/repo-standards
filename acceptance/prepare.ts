// Manual real-agent setup only: no adoption, contextual edits or assessments.
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fixtureFiles, installCli, sourceFixture } from '../test/installed-cli.ts';
import { commit, git, remoteFixture } from '../test/remote-fixture.ts';
import { registryFixture } from '../test/registry-fixture.ts';

const [author, projectName] = process.argv.slice(2);
if (!['alice', 'mira'].includes(author!) || !['bob', 'harbor'].includes(projectName!)) {
  throw new Error('Usage: node acceptance/prepare.ts <alice|mira> <bob|harbor>');
}
const cli = installCli();
const files = fixtureFiles(`examples/${author}`);
const remote = remoteFixture(files['standards.yaml']!, files, [], `${author}/standards`);
const registry = await registryFixture(cli.root);
const project = sourceFixture('', fixtureFiles(`acceptance/projects/${projectName}`));
rmSync(join(project.root, 'standards.yaml'));
commit(project.root);
const session = join(cli.root, 'journey.json');
writeFileSync(session, JSON.stringify({
  project: project.root, cli: join(cli.root, 'node_modules/.bin/repo-standards'),
  package: join(cli.root, 'node_modules/@lutzseverino/repo-standards'),
  source: `https://github.com/${author}/standards`, profile: author === 'alice' ? 'work' : 'service',
  head: git(project.root, 'rev-parse', 'HEAD'),
  env: { NODE_OPTIONS: remote.env.NODE_OPTIONS, XDG_CACHE_HOME: remote.env.XDG_CACHE_HOME, ...registry.env },
}, null, 2));
console.log(session);
// Keep the registry available across separate agent tool calls. SIGINT/SIGTERM
// stop supporting processes while preserving the project, package and evidence.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  registry.close();
  process.exit();
});
