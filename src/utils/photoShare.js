// 사진 크게 보기의 공유·저장 (2026-11-05)
// 사진 파일은 저장소 CORS 때문에 브라우저가 바로 읽지 못해 같은 출처의 api/photo-proxy로 받는다(명함과 같은 방식).
const viaProxy = (url) => (/^(data:|blob:)/.test(url) ? url : `/api/photo-proxy?url=${encodeURIComponent(url)}`);

export async function fetchPhotoBlob(url) {
  const r = await fetch(viaProxy(url));
  if (!r.ok) throw new Error(`photo ${r.status}`);
  const blob = await r.blob();
  if (!blob.size || blob.type.startsWith("text/")) throw new Error("not a photo");
  return blob;
}

export const canSharePhotos = () => {
  if (window.daymateDesktop) return false; // 데스크탑 앱은 공유 창이 없다
  try {
    return !!navigator.canShare?.({ files: [new File([new Blob(["x"], { type: "image/jpeg" })], "a.jpg", { type: "image/jpeg" })] });
  } catch { return false; }
};

// 아이폰은 파일 내려받기 대신 공유 창의 "이미지 저장"으로 사진 앱에 넣는다
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const EXT = { "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic" };
export function photoFileName(blob, n = 1, now = new Date()) {
  const pad = (v) => String(v).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `daymate-${stamp}-${n}.${EXT[blob?.type] || "jpg"}`;
}

export function sharePhoto(blob, name) {
  const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  return navigator.share({ files: [new File([blob], name, { type })] });
}

export function downloadPhoto(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
