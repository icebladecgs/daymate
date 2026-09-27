const BACKUP_FILE_NAME = 'daymate-backup.json';
const boundary = 'daymate_multipart_boundary';

// 백업 파일이 여러 개면 가장 먼저 만든 것을 쓴다(늘 같은 파일을 덮어쓰도록)
async function findBackupFile(token) {
  const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and trashed=false`);
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&orderBy=createdTime&fields=files(id,modifiedTime,parents)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d = await r.json();
  return d.files?.[0] || null;
}

// 전체 데이터 백업(daymate-backup.json) — folderId를 주면 그 폴더에 두고, 예전처럼 드라이브 맨 위에 있던 파일은 그 폴더로 옮긴다
export async function driveBackup(token, data, folderId) {
  const json = JSON.stringify(data, null, 2);
  const existing = await findBackupFile(token);
  const metaObj = { name: BACKUP_FILE_NAME, mimeType: 'application/json' };
  if (!existing && folderId) metaObj.parents = [folderId];
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

  // 폴더 옮기기: 수정(PATCH) 때 addParents/removeParents를 함께 보낸다
  const move = existing && folderId && !(existing.parents || []).includes(folderId)
    ? `&addParents=${folderId}${existing.parents?.length ? `&removeParents=${existing.parents.join(',')}` : ''}`
    : '';
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart${move}`
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
    throw new Error(err.error?.message || `Drive upload failed: ${resp.status}`);
  }
  return await resp.json();
}

// 같은 이름 폴더를 동시에 두 번 찾으면 둘 다 "없음"으로 보고 두 개를 만들던 문제(Daymate 메모 폴더 중복) —
// 이름별로 진행 중인 찾기·만들기를 하나로 합친다. 이미 여러 개면 가장 먼저 만든 폴더를 쓴다.
const folderRequests = new Map();
export function findOrCreateFolder(token, name) {
  if (!folderRequests.has(name)) {
    folderRequests.set(name, lookupOrCreateFolder(token, name).catch((e) => { folderRequests.delete(name); throw e; }));
  }
  return folderRequests.get(name);
}

async function lookupOrCreateFolder(token, name) {
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&orderBy=createdTime&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d = await r.json();
  if (d.files?.[0]) return d.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Drive folder create failed: ${createRes.status}`);
  }
  return (await createRes.json()).id;
}

// 할일·긴 메모 첨부용: 사용자 드라이브의 "DayMate 첨부파일" 폴더에 파일을 올리고 링크를 돌려준다.
// drive.file 권한이라 이 앱이 올린 파일만 접근 가능. 큰 파일도 되도록 재개 가능 업로드(resumable) 사용.
export const DRIVE_ATTACH_FOLDER = 'DayMate 첨부파일';
export const DRIVE_ATTACH_MAX_BYTES = 100 * 1024 * 1024;

export async function uploadFileToDrive(token, file, onProgress) {
  const folderId = await findOrCreateFolder(token, DRIVE_ATTACH_FOLDER);
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
