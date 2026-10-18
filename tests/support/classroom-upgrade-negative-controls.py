import pathlib,subprocess
p=pathlib.Path(__file__).resolve().parents[1]/'database'; original=(p/'classroom-upgrade.test.mjs').read_text()
mutants={
 'room-binding-removed':".replace(/alter table public.game_answers add constraint classroom_answer_player_room_fkey[\\s\\S]*?validate constraint classroom_answer_player_room_fkey;/, '')",
 'cascade-blocked':".replaceAll('before update on classroom_candidate_private.', 'before update or delete on classroom_candidate_private.')"
}
results=[]
for name,mutation in mutants.items():
 text=original.replace('const upgrade=await readFile(', 'const upgrade=(await readFile(').replace("'utf8');\nconst sid", "'utf8'))"+mutation+";\nconst sid")
 path=p/(name+'.test.mjs');path.write_text(text)
 try:
  r=subprocess.run(['node','--test',str(path)],capture_output=True,text=True)
  results.append(f'{name}: exit {r.returncode}\n{r.stdout}{r.stderr}')
  if r.returncode==0: raise Exception('mutant escaped '+name)
 finally:path.unlink()
print('\n'.join(results))
print('\n'.join(x.split('\n')[0] for x in results))
