// dates.js — ชื่อเดือนไทย, แปลง พ.ศ./ค.ศ., คีย์เดือน "YYYY-MM", เลื่อนเดือน
// คีย์เดือนเป็น ค.ศ. เสมอ ("2026-11") แปลงเป็น พ.ศ. เฉพาะตอนแสดงผล
// คีย์รูปแบบนี้เทียบลำดับด้วย < > ของ string ได้ตรง ๆ
// ชื่อที่แสดงผลตามภาษาใน i18n.js (ไทยใช้ พ.ศ., อังกฤษใช้ ค.ศ.)

import { getLang } from './i18n.js';

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isEn = () => getLang() === 'en';
/** ชื่อเดือนเต็ม/ย่อตามภาษา (month 1–12) */
export const monthName = (m) => (isEn() ? EN_MONTHS : THAI_MONTHS)[m - 1];
export const monthShortName = (m) => (isEn() ? EN_MONTHS_SHORT : THAI_MONTHS_SHORT)[m - 1];
/** ปีสำหรับแสดงผล: ไทย 2569 (พ.ศ.), อังกฤษ 2026 */
export const yearNumber = (ceYear) => (isEn() ? ceYear : ceYear + 543);
/** ตัวเลือกปี: ไทย "พ.ศ. 2569", อังกฤษ "2026" */
export const yearLabel = (ceYear) => (isEn() ? String(ceYear) : `พ.ศ. ${ceYear + 543}`);

export const toBE = (ceYear) => ceYear + 543;
export const toCE = (beYear) => beYear - 543;

const KEY_RE = /^(\d{4})-(\d{2})$/;

/** monthKey(2026, 4) → "2026-04" */
export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** "2026-04" → { year: 2026, month: 4 }, รูปแบบผิด → null */
export function parseMonthKey(key) {
  const m = typeof key === 'string' ? KEY_RE.exec(key) : null;
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export const isMonthKey = (key) => parseMonthKey(key) !== null;

function mustParse(key) {
  const p = parseMonthKey(key);
  if (!p) throw new Error(`invalid month key: ${key}`);
  return p;
}

/** เลื่อนเดือน: addMonths("2026-12", 1) → "2027-01" */
export function addMonths(key, delta) {
  const p = mustParse(key);
  const idx = p.year * 12 + (p.month - 1) + delta;
  return monthKey(Math.floor(idx / 12), (idx % 12 + 12) % 12 + 1);
}

/** เดือนก่อนหน้าตามปฏิทิน */
export const prevMonth = (key) => addMonths(key, -1);
export const nextMonth = (key) => addMonths(key, 1);

/** คีย์เดือนปัจจุบันตามเวลาเครื่อง */
export function currentMonthKey(date = new Date()) {
  return monthKey(date.getFullYear(), date.getMonth() + 1);
}

/** ทุกเดือนตั้งแต่ from ถึง to (รวมทั้งสองฝั่ง) ถ้า from > to คืน [] */
export function monthRange(from, to) {
  mustParse(from);
  mustParse(to);
  const out = [];
  for (let k = from; k <= to; k = nextMonth(k)) out.push(k);
  return out;
}

/** 12 เดือนของปี ค.ศ. */
export function monthsOfYear(ceYear) {
  return monthRange(monthKey(ceYear, 1), monthKey(ceYear, 12));
}

/** "2026-11" → "พฤศจิกายน 2569" */
export function monthLabel(key) {
  const p = mustParse(key);
  return `${monthName(p.month)} ${yearNumber(p.year)}`;
}

/** "2026-10" → "ต.ค." */
export function monthShortLabel(key) {
  return monthShortName(mustParse(key).month);
}

/** "2026-10" → "ต.ค. 69" (ใช้ในกราฟ/ตาราง) */
export function monthShortYearLabel(key) {
  const p = mustParse(key);
  return `${monthShortName(p.month)} ${String(yearNumber(p.year)).slice(-2)}`;
}
