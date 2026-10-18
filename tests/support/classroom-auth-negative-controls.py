"""Run isolated source mutants; success means the intended regressions were detected."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
cases=[
 ('owner-guard','lib/classroom-server/scoped-adapter.mjs','tests/database/classroom-http-integration.test.mjs',
  "if (!guardedPlayer || guardedPlayer.user_id !== proof.expectedOwnerId) fail('forbidden');",
  "if (!guardedPlayer) fail('forbidden');",'Expected values to be strictly equal'),
 ('auth-downgrade','lib/classroom-server/auth-verifier.mjs','tests/offline/classroom-auth-verifier.test.mjs',
  'if (result.error) {','if (result.error) { return null;','Missing expected rejection')
]
for name,module,test,old,new,expected in cases:
 module=root/module;test=root/test
 mutant=module.with_name('negative-'+name+'.mjs'); probe=test.with_name('negative-'+name+'.test.mjs')
 assert not mutant.exists() and not probe.exists(), 'refusing to overwrite temporary probes'
 source=module.read_text();assert source.count(old)==1,'mutation anchor drifted'
 try:
  mutant.write_text(source.replace(old,new))
  probe.write_text(test.read_text().replace('/'+module.name,"/"+mutant.name))
  result=subprocess.run(['node','--import','./tests/support/deny-network.mjs','--test',str(probe)],cwd=root,capture_output=True,text=True)
  output=result.stdout+result.stderr
  if result.returncode==0 or expected not in output or 'SyntaxError' in output or 'TypeError' in output:
   raise RuntimeError(name+' did not fail at expected assertion:\n'+output)
  print(name+': expected regression detected')
 finally:
  if mutant.exists():mutant.unlink()
  if probe.exists():probe.unlink()
