// tests/ 안의 규칙 테스트를 차례로 실행하고 합계를 낸다 (에뮬레이터 안에서 rules.mjs가 부른다)
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./tests/', import.meta.url));
let pass = 0, total = 0, badFiles = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs')).sort()) {
  const r = spawnSync(process.execPath, [dir + f], { encoding: 'utf8' });
  const lines = (r.stdout || '').split('\n');
  const fails = lines.filter(l => l.startsWith('FAIL'));
  const m = (r.stdout || '').match(/(\d+)\/(\d+) passed/);
  if (m) { pass += +m[1]; total += +m[2]; }
  const ok = r.status === 0 && m && m[1] === m[2];
  if (!ok) badFiles++;
  console.log(`${ok ? '✅' : '❌'} ${f}  ${m ? `${m[1]}/${m[2]}` : '(실행 실패)'}`);
  for (const l of fails) console.log(`   ${l}`);
  if (!m && r.stderr) console.log(r.stderr.split('\n').slice(0, 8).join('\n'));
}
console.log(`\n규칙 테스트 합계: ${pass}/${total} 통과`);
if (badFiles) process.exitCode = 1;
