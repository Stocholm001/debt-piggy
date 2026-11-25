// ui/avatar.js — รูปโปรไฟล์วงกลม (ไม่มีรูปใช้ตัวอักษรแรกของชื่อ) และย่อรูปที่เลือก (ยกจาก salary-calc)
import { html } from './dom.js';
import { openImage } from './image-load.js';

/** ตัวอักษรแรกของชื่อ ข้ามสระหน้า (เ แ โ ใ ไ) เช่น "ใบเฟิร์น" → "บ", "Baifern" → "B" */
export function initialOf(acc) {
  const name = String(acc?.firstName || acc?.displayName || acc?.username || '').replace(/^[เ-ไ]+/, '');
  return [...(name || '?')][0].toLocaleUpperCase();
}

/** เนื้อในวงกลม: รูป หรือ ตัวอักษรแรก */
export const avatarInner = (acc) => (acc?.photo
  ? html`<img class="avatar__img" src="${acc.photo}" alt="">`
  : html`<span>${initialOf(acc)}</span>`);

/** ครอปรูปเป็นสี่เหลี่ยมจัตุรัสตรงกลาง ย่อเป็น size px แล้วคืน data URL (JPEG) */
export async function squarePhoto(file, size = 256) {
  const img = await openImage(file);
  try {
    const side = Math.min(img.width, img.height);
    if (!side) throw new Error('empty image');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFC2D4';
    ctx.fillRect(0, 0, size, size); // รูปพื้นโปร่ง (PNG) จะได้พื้นชมพูแทนสีดำ
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.source, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    img.close();
  }
}
