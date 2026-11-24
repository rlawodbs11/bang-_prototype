export async function resizeProfileImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 선택할 수 있습니다.');
  }

  const SIZE = 96;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('이미지 처리를 초기화할 수 없습니다.');
  }

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try {
      const side = Math.min(bitmap.width, bitmap.height);
      const sx = (bitmap.width - side) / 2;
      const sy = (bitmap.height - side) / 2;
      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
    } finally {
      bitmap.close();
    }
  } else {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
      el.src = dataUrl;
    });

    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
  }

  return canvas.toDataURL('image/jpeg', 0.78);
}
