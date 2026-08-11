// 업로드 전 클라이언트 리사이즈+압축 (별도 라이브러리 없이 canvas API만 사용)

function drawToJpeg(source, srcW, srcH, maxDim, quality) {
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(source, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('compress_failed'))),
      'image/jpeg',
      quality
    );
  });
}

// HEIC 등 폭넓은 포맷 지원 + <img> onerror가 안 잡아내는 디코드 실패까지 커버
async function compressViaBitmap(file, maxDim, quality) {
  if (typeof createImageBitmap !== 'function') throw new Error('bitmap_unsupported');
  const bitmap = await createImageBitmap(file);
  try {
    return await drawToJpeg(bitmap, bitmap.width, bitmap.height, maxDim, quality);
  } finally {
    bitmap.close?.();
  }
}

// 구형 브라우저 등 createImageBitmap 미지원 시 폴백
function compressViaImageElement(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      drawToJpeg(img, img.width, img.height, maxDim, quality)
        .then(resolve, reject)
        .finally(() => URL.revokeObjectURL(url));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_failed'));
    };
    img.src = url;
  });
}

export async function compressImage(file, { maxDim = 1600, quality = 0.82 } = {}) {
  try {
    return await compressViaBitmap(file, maxDim, quality);
  } catch {
    try {
      return await compressViaImageElement(file, maxDim, quality);
    } catch {
      throw new Error('unsupported_image');
    }
  }
}

// 사진 첨부 컴포넌트(PhotoAttach/PhotoGallery/LongMemoEditor)가 공통으로 쓰는 에러 메시지 매핑
export function photoErrorMessage(err) {
  if (err?.message === 'unsupported_image') return '이 사진 형식은 처리할 수 없어요. 다른 사진으로 시도해주세요 ❌';
  if (err?.code === 'storage/unauthorized') return '로그인이 만료됐어요. 다시 로그인 후 시도해주세요 ❌';
  return '사진 업로드 실패 ❌';
}
