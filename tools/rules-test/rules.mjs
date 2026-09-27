// Firestore 보안 규칙 테스트·게시 — 원본은 저장소 루트의 firestore.rules
//   npm run test:rules    에뮬레이터(demo-daymate, 실제 서버 접속 없음)로 tests/ 전부 실행
//   npm run rules:deploy  테스트 통과 후 실제 Firebase(daymate-a9ff6)에 게시 — 사용자 승인 뒤에만 실행
// 처음 한 번: 도구 설치(자동), 게시하려면 `npm run rules:login`으로 Firebase 로그인
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const toolDir = fileURLToPath(new URL('.', import.meta.url));
const root = path.resolve(toolDir, '../..');
const isWin = process.platform === 'win32';
const firebaseBin = path.join(toolDir, 'node_modules', '.bin', isWin ? 'firebase.cmd' : 'firebase');
const cmd = process.argv[2] || 'test';

const run = (bin, args, opts = {}) => spawnSync(bin, args, { cwd: root, stdio: 'inherit', shell: isWin, ...opts }).status ?? 1;

if (!existsSync(firebaseBin)) {
  console.log('규칙 도구를 처음 설치해요 (tools/rules-test)…');
  if (run('npm', ['install', '--prefix', toolDir, '--no-audit', '--no-fund']) !== 0) process.exit(1);
}

// 에뮬레이터는 Java가 필요하다. 윈도우 PC는 바둑 프로그램에 딸린 Java 11을 쓴다 (firebase-tools 13 기준)
const env = { ...process.env };
const winJava = 'C:\\baduk\\LizzieYZY\\jre\\java11\\bin';
if (isWin && existsSync(winJava)) env.PATH = `${winJava};${env.PATH}`;

function test() {
  const inner = `node "${path.join(toolDir, 'run-all.mjs')}"`;
  return run(firebaseBin, ['emulators:exec', '--only', 'firestore', '--project', 'demo-daymate', isWin ? `"${inner}"` : inner], { env });
}

if (cmd === 'test') process.exit(test());
if (cmd === 'login') process.exit(run(firebaseBin, ['login']));
if (cmd === 'deploy') {
  if (test() !== 0) { console.error('\n규칙 테스트가 실패해서 게시하지 않았어요.'); process.exit(1); }
  console.log('\n테스트 통과 — 실제 Firebase(daymate-a9ff6)에 규칙을 게시해요…');
  process.exit(run(firebaseBin, ['deploy', '--only', 'firestore:rules', '--project', 'daymate-a9ff6']));
}
console.error(`모르는 명령: ${cmd} (test | deploy | login)`);
process.exit(1);
