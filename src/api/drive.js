const BACKUP_FILE_NAME = 'daymate-backup.json';
const boundary = 'daymate_multipart_boundary';

async function findBackupFile(token) {
  const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and trashed=false`);
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,modifiedTime)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d = await r.json();
  return d.files?.[0] || null;
}

export async function driveBackup(token, data) {
  const json = JSON.stringify(data, null, 2);
  const meta = JSON.stringify({ name: BACKUP_FILE_NAME, mimeType: 'application/json' });

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

  const existing = await findBackupFile(token);
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
    throw new Error(err.error?.message || `Drive upload failed: ${resp.status}`);
  }
  return await resp.json();
}
