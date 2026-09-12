from pathlib import Path
import base64,copy,json,os,re,shutil,stat,subprocess
E=Path('/tmp/repo-standards-31-public-release/creation-evidence')
S=Path('/tmp/repo-standards-author-vbJPu5/workspace/utility-standards')
V=json.loads((E/'11-two-profile-validation.json').read_text())
assert V['valid'] is True
R=E/'retained-source'
R.mkdir(exist_ok=True)
# The CLI supplies resolution: this harness does not parse or resolve YAML.
for profile in V['profiles'].values():
 for decl in profile['declarations']:
  for phase in ['checks','fixes']:
   for op in decl[phase]:
    for name in [op['run']['script'],*op['run']['resources']]:
     dest=R/name
     dest.parent.mkdir(parents=True,exist_ok=True)
     if not dest.exists(): shutil.copy2(S/name,dest)

def inventory(root):
 result={}
 for p in sorted(root.rglob('*')):
  st=p.lstat(); entry={'mode':oct(stat.S_IMODE(st.st_mode))}
  if p.is_symlink(): entry.update(type='symlink',target=os.readlink(p))
  elif p.is_dir(): entry['type']='directory'
  elif p.is_file():
   original=stat.S_IMODE(st.st_mode)
   try: data=p.read_bytes()
   except PermissionError:
    p.chmod(original|0o400)
    try: data=p.read_bytes()
    finally: p.chmod(original)
   entry.update(type='file',base64=base64.b64encode(data).decode())
  elif stat.S_ISFIFO(st.st_mode): entry['type']='fifo'
  else: entry['type']='other'
  result[str(p.relative_to(root))]=entry
 return result

records=[]
def save(record):
 records.append(record)
 (E/'operation-exercises.json').write_text(json.dumps(records,indent=2)+'\n')

for profile,selection in V['profiles'].items():
 declarations=selection['declarations']
 ids={d['id'] for d in declarations}
 assert ('reproducible-bug-reports' in ids)==(profile=='personal-tools')
 assert ('runbook-recovery' in ids)==(profile=='team-services')
 owner=next(d for d in declarations if d['id']=='notes-final-newline')
 operations={'check':('checks',owner['checks'][0]),'fix':('fixes',owner['fixes'][0])}
 def fixture(name,data=b'memo'):
  root=E/'operation-fixtures'/profile/name
  root.mkdir(parents=True,exist_ok=False)
  (root/'NOTES.md').write_bytes(data); (root/'NOTES.md').chmod(0o751)
  (root/'unrelated.bin').write_bytes(bytes(range(256))); (root/'unrelated.bin').chmod(0o640)
  (root/'CONTRIBUTING.md').write_bytes(b'Employer-owned sentinel\r\n'); (root/'CONTRIBUTING.md').chmod(0o600)
  return root
 def run(root,mode,expected,scope=True):
  phase,op=operations[mode]
  request={'format':'repo-standards/operation/v1','operation':{'declaration':owner['id'],'phase':phase,'id':op['id']},
   'projectRoot':str(root),'standards':{'repository':'https://github.com/synthetic-fixtures/standards','version':'v0.0.0-fixture','commit':'0'*40},
   'profile':profile,'declarations':declarations,'allowedTargets':{'paths':['NOTES.md' if scope else 'OTHER.md'],'directories':[]}}
  command=[op['run']['executable'],str(R/op['run']['script']),*op['run']['arguments']]
  before=inventory(root)
  probe_command=[op['run']['executable'],*op['prerequisite']['version-arguments']]
  probe=subprocess.run(probe_command,cwd=root,capture_output=True,text=True,timeout=op['timeout-seconds'])
  assert probe.returncode==0
  m=re.search(r'(?<![0-9])v?(\d+)\.(\d+)\.(\d+)(?![0-9])',probe.stdout) or re.search(r'(?<![0-9])v?(\d+)\.(\d+)\.(\d+)(?![0-9])',probe.stderr)
  assert m and int(m[1])==24 and op['prerequisite']['version']=='>=24.0.0 <25.0.0'
  r=subprocess.run(command,cwd=root,input=json.dumps(request),text=True,capture_output=True,timeout=op['timeout-seconds'])
  assert len(r.stdout.encode())<=1048576 and len(r.stderr.encode())<=1048576
  parsed=json.loads(r.stdout)
  after=inventory(root)
  record={'profile':profile,'fixture':str(root),'phase':phase,'command':command,'request':request,
   'prerequisite':{'command':probe_command,'exitCode':probe.returncode,'stdout':probe.stdout,'stderr':probe.stderr,'compatible':True},
   'process':{'exitCode':r.returncode,'signal':None,'error':None,'timedOut':False},'stdout':r.stdout,'stderr':r.stderr,'result':parsed,
   'before':before,'after':after,'expectedStatus':expected}
  save(record)
  assert r.returncode==0 and parsed.keys()=={'format','status','message'} and parsed['format']=='repo-standards/result/v1' and isinstance(parsed['message'],str)
  assert parsed['status']==expected,(profile,root.name,mode,parsed)
  assert parsed['status'] in (['passed','failed','blocked'] if mode=='check' else ['changed','unchanged','blocked'])
  if expected!='changed': assert before==after,(root,mode,'changed unexpectedly')
  else:
   assert {k:v for k,v in before.items() if k!='NOTES.md'}=={k:v for k,v in after.items() if k!='NOTES.md'}
   assert before['NOTES.md']['mode']==after['NOTES.md']['mode']
   assert base64.b64decode(after['NOTES.md']['base64'])==base64.b64decode(before['NOTES.md']['base64'])+b'\n'
  return parsed
 root=fixture('repair')
 run(root,'check','failed'); run(root,'fix','changed'); run(root,'fix','unchanged'); run(root,'check','passed')
 for name,data in [('empty',b''),('lf',b'line\n'),('crlf',b'line\r\n'),('binary-preserved',b'\x00\xff\rtext')]:
  root=fixture(name,data)
  compliant=not data or data.endswith(b'\n')
  run(root,'check','passed' if compliant else 'failed')
  run(root,'fix','unchanged' if compliant else 'changed')
  run(root,'fix','unchanged'); run(root,'check','passed')
 for kind in ['missing','symlink','directory','fifo','unreadable','unwritable','out-of-scope']:
  root=fixture(kind)
  target=root/'NOTES.md'
  if kind in ['missing','symlink','directory','fifo']:
   target.unlink()
   if kind=='symlink': target.symlink_to('unrelated.bin')
   if kind=='directory': target.mkdir()
   if kind=='fifo': os.mkfifo(target)
  if kind=='unreadable': target.chmod(0)
  if kind=='unwritable': target.chmod(0o400)
  run(root,'check','failed' if kind=='unwritable' else 'blocked',scope=kind!='out-of-scope')
  run(root,'fix','blocked',scope=kind!='out-of-scope')
 root=fixture('missing-runtime')
 empty_path=E/'empty-executable-path'; empty_path.mkdir(exist_ok=True)
 for mode,(phase,op) in operations.items():
  command=[op['run']['executable'],*op['prerequisite']['version-arguments']]
  before=inventory(root)
  try:
   subprocess.run(command,cwd=root,env={**os.environ,'PATH':str(empty_path)},capture_output=True,text=True,timeout=op['timeout-seconds'])
  except FileNotFoundError as error:
   save({'profile':profile,'fixture':str(root),'phase':phase,'prerequisite':{'command':command,'PATH':str(empty_path),'error':str(error),'compatible':False},
    'operationExecuted':False,'behavior':'unverified in missing-runtime environment','before':before,'after':inventory(root)})
  else: raise AssertionError('Node unexpectedly available on empty PATH')
  assert before==inventory(root)
summary={'profiles':list(V['profiles']),'operationInvocations':sum('result' in r for r in records),'missingRuntimeProbes':sum('operationExecuted' in r for r in records),
 'allAssertionsPassed':True,'runtime':'v24.11.1','retainedFiles':[str(p.relative_to(R)) for p in R.rglob('*') if p.is_file()],
 'limits':['Linux only; macOS not exercised.','Concurrent writers, forced termination during append/chmod/fsync, disk-full and I/O failure injection were not exercised.',
 'Missing runtime was exercised by an empty PATH; incompatible, timed-out and unreadable-version probes were not exercised.',
 'Direct protocol exercises do not verify the CLI adoption lifecycle, integrity enforcement or prerequisite orchestration.']}
(E/'operation-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
