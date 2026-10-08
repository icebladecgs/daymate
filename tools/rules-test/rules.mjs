// Firestore 보안 규칙 테스트·게시 — 원본은 저장소 루트의 firestore.rules
//   npm run test:rules    에뮬레이터(demo-daymate, 실제 서버 접속 없음)로 tests/ 전부 실행
//   npm run rules:deploy  테스트 통과 후 실제 Firebase(daymate-a9ff6)에 게시 — 사용자 승인 뒤에만 실행
// 처음 한 번: 도구 설치(자동), 게시하려면 `npm run rules:login`으로 Firebase 로그인
import { existsSync, readdirSync } from 'node:fs';
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

// 에뮬레이터는 Java가 필요하다 (firebase-tools 13 기준 11 이상).
// 찾는 순서: 바둑 프로그램에 딸린 Java 11 → 설치된 Temurin(설치 직후 PATH가 안 바뀐 터미널 대비) → PATH의 java.
// 윈도우에서 하나도 없으면 winget으로 Temurin 17을 설치한다(관리자 확인 창에서 "예"). 맥은 설치 안내만 한다.
const env = { ...process.env };
// 윈도우는 변수 이름이 'Path'라서 env.PATH로 쓰면 원래 경로를 잃는다 — 실제 이름을 찾아 쓴다
const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
const addPath = dir => { env[pathKey] = `${dir}${path.delimiter}${env[pathKey] || ''}`; };
const hasJava = () => spawnSync('java', ['-version'], { env, stdio: 'ignore', shell: isWin }).status === 0;
function winJavaDirs() {
  const dirs = ['C:\\baduk\\LizzieYZY\\jre\\java11\\bin'];
  const adoptium = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium');
  if (existsSync(adoptium)) {
    for (const d of readdirSync(adoptium).sort().reverse()) dirs.push(path.join(adoptium, d, 'bin'));
  }
  return dirs.filter(d => existsSync(path.join(d, 'java.exe')));
}
function ensureJava() {
  if (isWin) {
    const dir = winJavaDirs()[0];
    if (dir) { addPath(dir); return true; }
  }
  if (hasJava()) return true;
  if (!isWin) {
    console.error('\nJava가 없어서 규칙 테스트를 못 해요. 설치 후 다시 실행하세요: brew install --cask temurin@17');
    return false;
  }
  console.log('\nJava가 없어서 Temurin 17을 설치해요 (관리자 확인 창이 뜨면 "예")…');
  run('winget', ['install', '--id', 'EclipseAdoptium.Temurin.17.JRE', '-e', '--accept-source-agreements', '--accept-package-agreements']);
  const dir = winJavaDirs()[0];
  if (dir) { addPath(dir); return true; }
  console.error('\nJava 설치를 확인하지 못했어요. 직접 설치 후 다시 실행하세요: winget install --id EclipseAdoptium.Temurin.17.JRE -e');
  return false;
}

function test() {
  if (!ensureJava()) return 1;
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
