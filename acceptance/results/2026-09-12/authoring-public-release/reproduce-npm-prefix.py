from pathlib import Path
import tempfile,os,subprocess,json
base=Path(tempfile.mkdtemp(prefix='repo-standards-npm-prefix-'))
real=base/'real';real.mkdir();alias=base/'alias';alias.symlink_to(real,target_is_directory=True)
workspace=alias/'workspace';workspace.mkdir();home=alias/'home';home.mkdir();(base/'empty.npmrc').write_text('');(base/'global.npmrc').write_text('')
env=os.environ.copy();env.update(HOME=str(home),npm_config_userconfig=str(base/'empty.npmrc'),npm_config_globalconfig=str(base/'global.npmrc'),npm_config_cache=str(base/'cache'))
npm='/tmp/repo-standards-31-public-release/npm-repro-tools/node_modules/npm/bin/npm-cli.js'
records=[]
for kind,prefix in [('symlink',alias/'cli'),('canonical',real/'canonical-cli')]:
 args=['node',npm,'install','--prefix',str(prefix),'--ignore-scripts','--no-audit','--no-fund','--save-exact','@lutzseverino/repo-standards@1.1.0']
 r=subprocess.run(args,cwd=workspace,env=env,capture_output=True,text=True)
 assert r.returncode==0,r.stderr
 lock=json.loads((prefix/'package-lock.json').read_text())
 record={'kind':kind,'command':args,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr,'lock':lock,'hasExpectedEntry':'node_modules/@lutzseverino/repo-standards' in lock['packages']}
 records.append(record)
 print(kind,record['hasExpectedEntry'],list(lock['packages']))
Path('/tmp/repo-standards-31-public-release/npm-prefix-reproduction.json').write_text(json.dumps({'npm':'11.6.2','root':str(base),'records':records},indent=2)+'\n')
assert records[0]['hasExpectedEntry']==False
assert records[1]['hasExpectedEntry']==True
