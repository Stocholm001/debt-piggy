// profile.js — ข้อมูลส่วนตัวของผู้ใช้: ชื่อ*, นามสกุล, วันเกิด (ไม่บังคับ) (ยกจาก salary-calc)
// ไม่แตะ DOM/Firebase

import { THAI_MONTHS, toBE } from './dates.js';

export const NAME_MAX = 40;

/** ตัดช่องว่างหัวท้าย และยุบช่องว่างซ้อน */
const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

/** "YYYY-MM-DD" ที่เป็นวันจริง → { y, m, d } | null */
export function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** วันนี้ตามเวลาเครื่อง "YYYY-MM-DD" */
export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * ตรวจและจัดข้อมูลส่วนตัว
 * @returns {{ ok: true, value: { firstName, lastName, birthday, displayName } } | { ok: false, errors: { field: message } }}
 */
export function validateProfile({ firstName, lastName, birthday }, today = todayIso()) {
  const errors = {};
  const first = clean(firstName);
  const last = clean(lastName);
  const birth = String(birthday ?? '').trim();

  if (!first) errors.firstName = 'กรอกชื่อ';
  else if ([...first].length > NAME_MAX) errors.firstName = `ยาวได้ไม่เกิน ${NAME_MAX} ตัวอักษร`;
  if ([...last].length > NAME_MAX) errors.lastName = `ยาวได้ไม่เกิน ${NAME_MAX} ตัวอักษร`;

  if (birth) {
    const p = parseIsoDate(birth);
    if (!p || p.y < 1900) errors.birthday = 'วันเกิดไม่ถูกต้อง';
    else if (birth > today) errors.birthday = 'วันเกิดต้องไม่เกินวันนี้';
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      firstName: first,
      lastName: last,
      birthday: birth || null,
      displayName: fullName({ firstName: first, lastName: last }),
    },
  };
}

/** ชื่อเต็ม "ชื่อ นามสกุล" (ไม่มี firstName ใช้ displayName/username แทน) */
export function fullName(p) {
  const first = clean(p?.firstName) || clean(p?.displayName) || clean(p?.username);
  return [first, clean(p?.lastName)].filter(Boolean).join(' ');
}

/** ชื่อสำหรับทักทาย: ชื่ออย่างเดียว */
export function greetName(p) {
  return clean(p?.firstName) || clean(p?.displayName) || clean(p?.username);
}

/** "1997-03-05" → "5 มีนาคม 2540" */
export function formatBirthday(iso) {
  const p = parseIsoDate(iso);
  if (!p) return '';
  return `${p.d} ${THAI_MONTHS[p.m - 1]} ${toBE(p.y)}`;
}
