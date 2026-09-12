from pathlib import Path
import subprocess,shutil,json,hashlib,stat
base=Path('/tmp/repo-standards-31-public-release')
original=Path('/tmp/repo-standards-author-vbJPu5/workspace/utility-standards')
def inventory(root):
 out={}
 for p in sorted(root.rglob('*')):
  if '.git' in p.relative_to(root).parts or not p.is_file():continue
  out[str(p.relative_to(root))]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'mode':oct(stat.S_IMODE(p.stat().st_mode))}
 return out
for journey in ['revision','resumption']:
 root=base/(journey+'-workspace')/'standards';evidence=base/(journey+'-evidence')
 assert not root.exists(),root
 shutil.copytree(original,root);evidence.mkdir()
 commands=[]
 def git(*args):
  r=subprocess.run(['git',*args],cwd=root,capture_output=True,text=True)
  commands.append({'command':['git',*args],'status':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
  assert r.returncode==0,r.stderr
  return r.stdout
 git('init','--quiet','-b','main');git('config','maintenance.auto','false')
 (root/'scratch.txt').write_text('Existing author scratch baseline.\n')
 git('add','.')
 git('-c','user.name=Release acceptance','-c','user.email=release@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','commit','--quiet','-m','test: establish returning-author fixture')
 (root/'scratch.txt').write_text('Existing staged author work.\n');git('add','scratch.txt')
 (root/'scratch.txt').write_text('Existing staged author work.\nExisting unstaged author work.\n')
 (root/'local-draft.txt').write_text('Existing untracked author draft; retain verbatim.\n')
 if journey=='resumption':
  (root/'guidance/runbooks.md').write_text('# Runbook response guidance\n\nRunbooks under docs/runbooks/ must explain how to locate the current on-call responder\nand when and how to escalate an incident. Keep these details project-owned and factual.\nA recovery procedure and a named owner are no longer required by this declaration.\n')
  (evidence/'manual-edit.diff').write_text(git('diff','--','guidance/runbooks.md'))
 status=git('status','--porcelain=v1')
 state={'head':git('rev-parse','HEAD').strip(),'indexEntries':git('ls-files','--stage'),'indexSha256':hashlib.sha256((root/'.git/index').read_bytes()).hexdigest(),'status':status,'files':inventory(root),'setup':'Evaluator provisioned disposable Git fixture only. Authoring agent must preserve HEAD/index/staged/unstaged/untracked work and must not provision or commit.'}
 (evidence/'before.json').write_text(json.dumps(state,indent=2)+'\n')
 shutil.copytree(root,evidence/'before',ignore=shutil.ignore_patterns('.git'))
 (evidence/'setup-commands.json').write_text(json.dumps(commands,indent=2)+'\n')
 print(root)
