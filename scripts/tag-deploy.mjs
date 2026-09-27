// 프로덕션 배포 뒤 실행: 지금 커밋에 deploy-v버전 태그를 붙이고 GitHub에 올린다.
// 원복할 때 "운영에 나갔던 정확한 코드"를 이 태그로 찾는다 (예: git checkout deploy-v635).
// 사용: npm run tag:deploy   (vercel deploy --prod 성공 + 실제 반영 확인 뒤)
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const version = readFileSync(new URL('../src/version.js', import.meta.url), 'utf8').match(/APP_VERSION = '([^']+)'/)?.[1];
if (!version) { console.error('src/version.js에서 버전을 찾지 못했어요'); process.exit(1); }

// 커밋 안 된 변경이 있으면 배포된 코드와 커밋이 다를 수 있다
const dirty = sh('git status --porcelain');
if (dirty) {
  console.error('커밋 안 된 변경이 있어요. 배포한 내용과 태그가 어긋날 수 있으니 먼저 커밋하세요:\n' + dirty);
  process.exit(1);
}

const tag = `deploy-${version}`;
const head = sh('git rev-parse --short HEAD');
const existing = sh(`git tag -l ${tag}`);
if (existing) {
  const at = sh(`git rev-list -n 1 --abbrev-commit ${tag}`);
  if (at === head) { console.log(`${tag}는 이미 ${head}에 붙어 있어요`); process.exit(0); }
  console.error(`${tag}가 이미 다른 커밋(${at})에 있어요. 버전 갱신(npm run generate:version) 없이 배포한 건 아닌지 확인하세요`);
  process.exit(1);
}

const when = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
sh(`git tag -a ${tag} -m "프로덕션 배포 ${version} (${when})"`);
sh(`git push origin ${tag}`);
console.log(`태그 ${tag} → ${head} 붙이고 올렸어요`);
