// format.js — จัดรูปแบบเงิน/%, แปลงข้อความที่ผู้ใช้กรอก, ซ่อนตัวเลข
// รับ/คืนค่าเป็นสตางค์และ basis points (integer) เสมอ ไม่แปลงผ่าน float (SPEC ข้อ 5.1)

export const MINUS = '−'; // U+2212
export const HIDDEN = '••••••';
export const NO_PCT = '—';

const intFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0, useGrouping: true });

/** หาร BigInt แล้วปัดครึ่งขึ้น (ค่าบวกเท่านั้น) */
function roundHalfUpBig(n, d) {
  return (2n * n + d) / (2n * d);
}

/** เงิน 2 ตำแหน่ง: 18200926 → "182,009.26" */
export function formatMoney(satang) {
  const neg = satang < 0;
  const abs = BigInt(Math.abs(satang));
  const body = `${intFmt.format(abs / 100n)}.${String(abs % 100n).padStart(2, '0')}`;
  return neg ? MINUS + body : body;
}

/** บาทเต็ม ปัดครึ่งขึ้น: 27370711 → "273,707", 50 → "1" */
export function formatBaht(satang) {
  const neg = satang < 0;
  const baht = roundHalfUpBig(BigInt(Math.abs(satang)), 100n);
  const body = intFmt.format(baht);
  return neg && baht !== 0n ? MINUS + body : body;
}

/**
 * % ทศนิยม 1 ตำแหน่ง ปัดครึ่งขึ้น จากเศษ/ส่วน (integer) เช่น ยอดจ่าย/ยอดตั้งต้น
 * ตัวหารเป็น 0 → "—"   formatPctOf(9169785, 27370711) → "33.5%"
 */
export function formatPctOf(numer, denom) {
  if (!(denom > 0)) return NO_PCT;
  const n = BigInt(Math.max(0, numer));
  const tenths = roundHalfUpBig(n * 1000n, BigInt(denom)); // หน่วย 0.1%
  return `${tenths / 10n}.${tenths % 10n}%`;
}

/** bp แบบตัดศูนย์ท้าย: 4000 → "40%", 1250 → "12.5%", 4115 → "41.15%" */
export function formatBp(bp) {
  if (bp == null) return NO_PCT;
  const neg = bp < 0;
  const abs = Math.abs(bp);
  const frac = String(abs % 100).padStart(2, '0').replace(/0+$/, '');
  const s = `${Math.trunc(abs / 100)}${frac ? '.' + frac : ''}%`;
  return neg ? MINUS + s : s;
}

/** ข้อความดอกเบี้ย: 4000 → "ดอก 40%/ปี" */
export const formatRate = (rateBp) => `ดอก ${formatBp(rateBp)}/ปี`;

/** ซ่อนยอดเงินเมื่อ hidden = true (ใช้กับข้อความเงินที่จัดรูปแบบแล้ว) */
export const maskMoney = (text, hidden) => (hidden ? HIDDEN : text);

// ---------- แปลงค่าที่ผู้ใช้กรอก ----------

// ตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง (หลังตัด , และช่องว่างแล้ว)
const FIXED2_RE = /^(\d+)(?:\.(\d{0,2}))?$/;

function parseFixed2(input, stripCommas) {
  if (typeof input === 'number') input = Number.isFinite(input) ? String(input) : '';
  if (typeof input !== 'string') return null;
  let s = input.replace(/\s+/g, '');
  if (stripCommas) s = s.replace(/,/g, '');
  if (s === '.') return null;
  if (s.startsWith('.')) s = '0' + s;
  const m = FIXED2_RE.exec(s);
  if (!m) return null;
  const value = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * ข้อความเงิน → สตางค์ ตัด , และช่องว่าง ทศนิยมไม่เกิน 2 ตำแหน่ง
 * "1,000" → 100000, "1000.5" → 100050, "0.10" → 10
 * ว่าง / ติดลบ / ตัวอักษร / ทศนิยมเกิน 2 ตำแหน่ง → null
 */
export const parseMoney = (input) => parseFixed2(input, true);

/** ข้อความ % → bp: "12.5" → 1250, "33" → 3300, ไม่ถูกต้อง → null (ไม่รับ comma เพราะ "1,5" อาจหมายถึง 1.5) */
export const parsePercent = (input) => parseFixed2(input, false);

/**
 * กรองข้อความในช่องเงินระหว่างพิมพ์ (กัน iOS ใส่ comma/ตัวอักษร)
 * เก็บแค่ตัวเลขกับจุดตัวแรก ทศนิยมไม่เกิน 2 ตำแหน่ง ตัด 0 นำหน้า
 * "1,000.567" → "1000.56", "007" → "7", "abc" → ""
 */
export function cleanMoneyTyping(raw) {
  let seenDot = false;
  let out = '';
  for (const c of String(raw ?? '')) {
    if (c >= '0' && c <= '9') out += c;
    else if (c === '.' && !seenDot) { seenDot = true; out += c; }
  }
  const dot = out.indexOf('.');
  let int = dot === -1 ? out : out.slice(0, dot);
  const frac = dot === -1 ? '' : out.slice(dot, dot + 3);
  int = int.replace(/^0+(?=\d)/, '');
  if (int === '' && frac) int = '0';
  return int + frac;
}

/** สตางค์ → ข้อความในช่องกรอก (ไม่มี comma): 100050 → "1000.50", 0 → "" */
export function moneyInputValue(satang) {
  if (!satang) return '';
  return `${Math.trunc(satang / 100)}.${String(satang % 100).padStart(2, '0')}`;
}
