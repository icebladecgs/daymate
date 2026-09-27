const BACKUP_FILE_NAME = 'daymate-backup.json';
const boundary = 'daymate_multipart_boundary';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ---------- 드라이브 폴더 구조 (2026-09-27) ----------
// 📁 DayMate
//    ├─ 📁 메모      월별 메모 정리본(2026-09.md …)
//    ├─ 📁 첨부파일  할일·긴 메모 첨부 파일
//    └─ 📁 백업      daymate-backup.json
// 예전에 드라이브 맨 위에 만들던 "Daymate 메모"·"DayMate 첨부파일" 폴더와 백업 파일은 처음 한 번 이 구조로 옮긴다.
// drive.file 권한이라 이 앱이 만든 파일·폴더만 보이고 옮길 수 있다(사용자가 직접 넣은 파일은 폴더째 함께 옮겨짐).
const ROOT_FOLDER = 'DayMate';
const SUB_FOLDERS = { memo: '메모', attach: '첨부파일', backup: '백업' };
const LEGACY_FOLDERS = { memo: 'Daymate 메모', attach: 'DayMate 첨부파일' };
// 합치고 남은 옛 폴더에 붙이는 이름 — 앱에 안 보이는 사용자 파일이 남아 있을 수 있어 지우지 않고 이름만 바꾼다
const LEFTOVER_SUFFIX = ' (정리됨·비었으면 삭제)';

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function listFiles(token, q, fields = 'id,name,parents,modifiedTime', orderBy = 'createdTime') {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`${q} and trashed=false`)}&spaces=drive&orderBy=${orderBy}&pageSize=1000&fields=files(${fields})`,
    { headers: auth(token) }
  );
  if (!r.ok) throw new Error(`Drive list failed: ${r.status}`);
  return (await r.json()).files || [];
}

const listFolders = (token, name, parentId) =>
  listFiles(token, `name='${name}' and mimeType='${FOLDER_MIME}'${parentId ? ` and '${parentId}' in parents` : ''}`);

async function createFolder(token, name, parentId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `Drive folder create failed: ${r.status}`);
  }
  return (await r.json()).id;
}

async function patchFile(token, id, params, body = {}) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}${params ? `?${params}` : ''}`, {
    method: 'PATCH', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Drive update failed: ${r.status}`);
}

// 파일·폴더를 다른 폴더로 옮긴다 (rename을 주면 이름도 바꿈)
const moveTo = (token, item, targetId, rename) => patchFile(
  token, item.id,
  `addParents=${targetId}${item.parents?.length ? `&removeParents=${item.parents.join(',')}` : ''}`,
  rename ? { name: rename } : {},
);

// fromId 폴더의 (앱에 보이는) 파일을 toId로 옮긴다.
// dedupe: 같은 이름이면 더 최근에 고친 것만 남기고 나머지는 휴지통으로(월별 메모처럼 다시 만들 수 있는 파일용, 30일간 되살릴 수 있음)
async function moveChildren(token, fromId, toId, dedupe) {
  const kept = dedupe ? new Map((await listFiles(token, `'${toId}' in parents`)).map(f => [f.name, f])) : null;
  for (const f of await listFiles(token, `'${fromId}' in parents`)) {
    const same = kept?.get(f.name);
    if (same && same.modifiedTime >= f.modifiedTime) { await patchFile(token, f.id, '', { trashed: true }); continue; }
    if (same) await patchFile(token, same.id, '', { trashed: true });
    await moveTo(token, f, toId);
    kept?.set(f.name, f);
  }
}

async function setupFolders(token) {
  // 1) 최상위 DayMate 폴더 (여러 개면 먼저 만든 것, 나머지의 내용은 옮기고 이름을 바꿔 둔다)
  const roots = await listFolders(token, ROOT_FOLDER, 'root');
  const rootId = roots[0]?.id || await createFolder(token, ROOT_FOLDER);
  for (const extra of roots.slice(1)) {
    await moveChildren(token, extra.id, rootId, false);
    await patchFile(token, extra.id, '', { name: ROOT_FOLDER + LEFTOVER_SUFFIX });
  }

  // 2) 하위 폴더 — 없으면 옛 폴더를 옮겨 이름을 바꾸고, 그것도 없으면 새로 만든다
  const ids = {};
  for (const [key, name] of Object.entries(SUB_FOLDERS)) {
    const current = await listFolders(token, name, rootId);
    const legacy = LEGACY_FOLDERS[key] ? await listFolders(token, LEGACY_FOLDERS[key]) : [];
    let id = current[0]?.id;
    let leftovers = [...current.slice(1), ...legacy];
    if (!id && legacy.length) {
      // 가장 먼저 만든 옛 폴더를 DayMate 안으로 옮겨 새 이름으로 쓴다(사용자가 넣은 파일도 함께 옮겨짐)
      id = legacy[0].id;
      await moveTo(token, legacy[0], rootId, name);
      leftovers = legacy.slice(1);
    }
    if (!id) id = await createFolder(token, name, rootId);
    for (const old of leftovers) {
      await moveChildren(token, old.id, id, key === 'memo');
      await patchFile(token, old.id, '', { name: (LEGACY_FOLDERS[key] || name) + LEFTOVER_SUFFIX });
    }
    ids[key] = id;
  }

  // 3) 백업 파일은 모두 백업 폴더로 (지우지 않음 — 예전 버전도 남겨 둔다)
  for (const f of await listFiles(token, `name='${BACKUP_FILE_NAME}'`)) {
    if (!(f.parents || []).includes(ids.backup)) await moveTo(token, f, ids.backup);
  }
  return ids;
}

// 폴더 구조를 한 번만 확인·정리하고 { memo, attach, backup } 폴더 id를 돌려준다.
// (예전엔 같은 이름 폴더를 동시에 두 번 찾으면 둘 다 "없음"으로 보고 두 개를 만들었다 — 한 번에 하나만 진행)
let foldersRequest = null;
export function getDriveFolders(token) {
  if (!foldersRequest) foldersRequest = setupFolders(token).catch((e) => { foldersRequest = null; throw e; });
  return foldersRequest;
}

// 백업 파일이 여러 개면 가장 최근에 고친 것을 덮어쓴다
async function findBackupFile(token, folderId) {
  const files = await listFiles(token, `name='${BACKUP_FILE_NAME}' and '${folderId}' in parents`, 'id,modifiedTime,parents', 'modifiedTime desc');
  return files[0] || null;
}

// 전체 데이터 백업(daymate-backup.json) → DayMate/백업
export async function driveBackup(token, data) {
  const { backup: folderId } = await getDriveFolders(token);
  const json = JSON.stringify(data, null, 2);
  const existing = await findBackupFile(token, folderId);
  const metaObj = { name: BACKUP_FILE_NAME, mimeType: 'application/json' };
  if (!existing) metaObj.parents = [folderId];
  const meta = JSON.stringify(metaObj);

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    meta,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    json,
    `--${boundary}--`,
  ].join('\r\n');

  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const resp = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      ...auth(token),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Drive upload failed: ${resp.status}`);
  }
  return await resp.json();
}

// 할일·긴 메모 첨부용: 사용자 드라이브의 DayMate/첨부파일 폴더에 파일을 올리고 링크를 돌려준다.
// drive.file 권한이라 이 앱이 올린 파일만 접근 가능. 큰 파일도 되도록 재개 가능 업로드(resumable) 사용.
export const DRIVE_ATTACH_FOLDER = 'DayMate/첨부파일';
export const DRIVE_ATTACH_MAX_BYTES = 100 * 1024 * 1024;

export async function uploadFileToDrive(token, file, onProgress) {
  const { attach: folderId } = await getDriveFolders(token);
  const contentType = file.type || 'application/octet-stream';
  const init = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({ name: file.name, parents: [folderId] }),
    }
  );
  if (!init.ok) {
    const err = await init.json().catch(() => ({}));
    throw Object.assign(new Error(err.error?.message || `Drive upload init failed: ${init.status}`), { status: init.status });
  }
  const sessionUrl = init.headers.get('Location');
  if (!sessionUrl) throw new Error('Drive upload session missing');

  // 진행률 표시를 위해 fetch 대신 XHR
  const result = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sessionUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Drive upload parse failed')); }
      } else reject(Object.assign(new Error(`Drive upload failed: ${xhr.status}`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Drive upload network error'));
    xhr.send(file);
  });
  return {
    id: result.id,
    name: result.name || file.name,
    mimeType: result.mimeType || contentType,
    size: Number(result.size || file.size) || 0,
    link: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
  };
}

async function findFileInFolder(token, folderId, fileName) {
  const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d = await r.json();
  return d.files?.[0] || null;
}

export async function uploadMarkdownFile(token, folderId, fileName, markdownText) {
  const meta = { name: fileName, mimeType: 'text/markdown' };
  const existing = await findFileInFolder(token, folderId, fileName);
  if (!existing) meta.parents = [folderId];

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(meta),
    `--${boundary}`,
    'Content-Type: text/markdown; charset=UTF-8',
    '',
    markdownText,
    `--${boundary}--`,
  ].join('\r\n');

  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const resp = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Drive markdown upload failed: ${resp.status}`);
  }
  return await resp.json();
}
