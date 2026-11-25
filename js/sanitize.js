// sanitize.js — ตรวจ/ทำความสะอาดข้อมูลที่อ่านจาก storage ก่อนใช้ (ข้อมูลเพี้ยนต้องไม่ทำให้แอปพัง)
// คืนค่าในรูปที่ calc.js ใช้ได้ทันที: เงินเป็นสตางค์ integer ≥ 0, % เป็น bp integer ≥ 0

import { toSafeInt, BUILTIN_CATS, DEFAULT_ALLOC_BP } from './calc.js';
import { isMonthKey } from './dates.js';

export const MAX_TEXT = 60;
export const DEFAULT_APP_TITLE = 'กระปุกปลดหนี้';
export const DEFAULT_SETTINGS = Object.freeze({ hideOnOpen: false });

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** ข้อความ: ตัดช่องว่างหัวท้าย ไม่เกิน max ตัว ค่าที่ไม่ใช่ string → "" */
export function cleanText(v, max = MAX_TEXT) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** เวลา → ms (รับ number, Date, Timestamp ของ Firestore ที่มี toMillis) */
export function toMillis(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return 0;
}

/** หนี้ 1 ก้อน หรือ null ถ้าใช้ไม่ได้ (ไม่มี id) */
export function sanitizeDebt(raw, idHint) {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : idHint;
  if (!id || !ID_RE.test(id)) return null;
  return {
    id,
    creditor: cleanText(raw.creditor),
    account: cleanText(raw.account) || cleanText(raw.creditor) || 'ไม่มีชื่อ',
    initialSatang: toSafeInt(raw.initialSatang),
    rateBp: toSafeInt(raw.rateBp),
    due: cleanText(raw.due),
    startMonth: isMonthKey(raw.startMonth) ? raw.startMonth : '2000-01',
    createdAt: toMillis(raw.createdAt),
  };
}

/** map {key: จำนวน} → integer ≥ 0 (keepZero = false ตัดค่า 0 ทิ้ง) */
function cleanAmounts(obj, keepZero) {
  const out = {};
  if (!isObj(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (!ID_RE.test(k)) continue;
    const n = toSafeInt(v);
    if (n > 0 || keepZero) out[k] = n;
  }
  return out;
}

/** เอกสารเดือน หรือ null ถ้าไม่ใช่อ็อบเจกต์ */
export function sanitizeMonth(raw) {
  if (!isObj(raw)) return null;
  return {
    salarySatang: toSafeInt(raw.salarySatang),
    allocBp: { ...DEFAULT_ALLOC_BP, ...cleanAmounts(raw.allocBp, true) },
    payments: cleanAmounts(raw.payments, false),
    updatedAt: toMillis(raw.updatedAt),
  };
}

/** หมวดงบ: หมวดหลัก 4 หมวดก่อนเสมอ (ชื่อ/สีตาม BUILTIN_CATS) แล้วตามด้วยหมวดที่เพิ่มเอง */
export function sanitizeCats(raw) {
  const cats = BUILTIN_CATS.map((c) => ({ ...c }));
  const seen = new Set(cats.map((c) => c.key));
  for (const c of Array.isArray(raw) ? raw : []) {
    if (!isObj(c) || c.builtIn === true) continue;
    const key = typeof c.key === 'string' ? c.key : '';
    if (!ID_RE.test(key) || seen.has(key)) continue;
    seen.add(key);
    cats.push({
      key,
      label: cleanText(c.label, 30) || key,
      color: COLOR_RE.test(c.color ?? '') ? c.color.toUpperCase() : '#FF8C00',
      builtIn: false,
    });
  }
  return cats;
}

/** ข้อมูลบัญชี (ชื่อแอป, การตั้งค่า, หมวดงบ) */
export function sanitizeAccount(raw) {
  const a = isObj(raw) ? raw : {};
  const s = isObj(a.settings) ? a.settings : {};
  return {
    displayName: cleanText(a.displayName),
    username: cleanText(a.username),
    appTitle: cleanText(a.appTitle, 40) || DEFAULT_APP_TITLE,
    settings: { ...DEFAULT_SETTINGS, hideOnOpen: s.hideOnOpen === true },
    allocCats: sanitizeCats(a.allocCats),
    photo: sanitizePhoto(a.photo),
  };
}

/** รูปโปรไฟล์: data URL ของรูป (JPEG 256×256 จากหน้าตั้งค่า) ไม่ใช่รูป/ใหญ่เกิน → null */
export const PHOTO_MAX_CHARS = 300_000;
export function sanitizePhoto(v) {
  return typeof v === 'string' && v.length <= PHOTO_MAX_CHARS && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)
    ? v : null;
}
