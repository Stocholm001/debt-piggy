// migrate.js — แปลง state ของแอปเดิม (shinchan-debt) เป็นข้อมูลแอปใหม่ (SPEC ข้อ 7.3) ฟังก์ชันล้วน ไม่แตะ Firebase
//
// แอปเดิม users/{legacyName}.state = {
//   months: { "04": { salary, alloc: {key: %}, payments: {id: บาท}, initialOverride?: {id: บาท} }, … "12" },
//   debts: [{ id, creditor, account, initial, rate, due, priority }],
//   customCats?: [{ key, label, color, defaultPct }],
//   appTitle, nextId, preAprOverride?
// }
// เงินในแอปเดิมเป็นบาท float → สตางค์ด้วย Math.round(บาท × 100) (ค่าที่เก็บไว้เป็น float อยู่แล้ว จึงปัดคืนเป็นสตางค์ที่ใกล้ที่สุด)
// % เป็น float → bp = round(% × 100)
//
// id ของหนี้ใหม่ได้จาก id เดิมเสมอ (dbt_l<id>) จึงแปลงซ้ำได้ผลเดิม
// ถ้าเขียนข้อมูลพังกลางทาง การล็อกอินครั้งถัดไปทำต่อได้โดยไม่มีหนี้ซ้ำ (SPEC ข้อ 7.2 ขั้น 7)

import { BUILTIN_CATS, DEFAULT_ALLOC_BP, nextCatColor } from './calc.js';

export const LEGACY_YEAR = 2026; // แอปเดิมมีแค่ปี 2026
export const LEGACY_START_MONTH = `${LEGACY_YEAR}-04`;
export const DEFAULT_APP_TITLE = 'กระปุกปลดหนี้';

const LEGACY_MONTH_RE = /^(0[1-9]|1[0-2])$/;
const KEY_RE = /^[A-Za-z0-9_]{1,64}$/;

/** ตัวเลขจากแอปเดิม (number หรือ string) → number ≥ 0 ที่ใช้ได้ หรือ null */
function legacyNumber(v) {
  const n = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v.replace(/,/g, ''))) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/** บาท float เดิม → สตางค์ (ค่าผิด → 0) */
export function legacyBahtToSatang(v) {
  const n = legacyNumber(v);
  if (n == null) return 0;
  const s = Math.round(n * 100);
  return Number.isSafeInteger(s) ? s : 0;
}

/** % float เดิม → bp (ค่าผิด → 0) */
export function legacyPctToBp(v) {
  const n = legacyNumber(v);
  if (n == null) return 0;
  const bp = Math.round(n * 100);
  return Number.isSafeInteger(bp) ? bp : 0;
}

/** "04" → "2026-04", key อื่น → null */
export function legacyMonthKey(key) {
  return LEGACY_MONTH_RE.test(String(key)) ? `${LEGACY_YEAR}-${key}` : null;
}

/** id เดิม → id หนี้ใหม่ "dbt_l8" */
export function debtIdFor(legacyId) {
  return `dbt_l${String(legacyId).replace(/[^A-Za-z0-9]/g, '_')}`;
}

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/** customCats เดิม → allocCats (หมวดหลัก 4 หมวดก่อน แล้วตามด้วยหมวดที่เพิ่มเอง builtIn: false) */
function migrateCats(customCats) {
  const cats = BUILTIN_CATS.map((c) => ({ ...c }));
  const seen = new Set(cats.map((c) => c.key));
  for (const c of Array.isArray(customCats) ? customCats : []) {
    const key = str(c?.key);
    if (!KEY_RE.test(key) || seen.has(key)) continue;
    seen.add(key);
    const color = /^#[0-9A-Fa-f]{6}$/.test(str(c.color)) ? str(c.color).toUpperCase() : nextCatColor(cats);
    cats.push({ key, label: str(c.label) || key, color, builtIn: false });
  }
  return cats;
}

/** หนี้เดิม → หนี้ใหม่ (ข้ามรายการที่ไม่มี id) */
function migrateDebts(legacyDebts, createdAtBase) {
  const debts = [];
  const idMap = new Map(); // String(id เดิม) → id ใหม่
  (Array.isArray(legacyDebts) ? legacyDebts : []).forEach((d, i) => {
    if (d?.id == null || str(d.id) === '') return;
    const legacyKey = String(d.id);
    if (idMap.has(legacyKey)) return; // id ซ้ำในข้อมูลเดิม ใช้ตัวแรก
    const id = debtIdFor(d.id);
    idMap.set(legacyKey, id);
    const legacyIdNum = Number(d.id);
    debts.push({
      id,
      creditor: str(d.creditor),
      account: str(d.account) || str(d.creditor) || `หนี้ ${legacyKey}`,
      initialSatang: legacyBahtToSatang(d.initial),
      rateBp: legacyPctToBp(d.rate),
      due: str(d.due),
      startMonth: LEGACY_START_MONTH,
      createdAt: createdAtBase + i, // คงลำดับเดิมไว้ใช้ตอนดอก/ยอดเท่ากัน
      legacyId: Number.isSafeInteger(legacyIdNum) ? legacyIdNum : legacyKey,
    });
  });
  return { debts, idMap };
}

/** map {id เดิม: บาท} → {id ใหม่: สตางค์} เฉพาะหนี้ที่ยังมีอยู่ */
function mapAmounts(obj, idMap, keepZero) {
  const out = {};
  for (const [legacyId, v] of Object.entries(obj && typeof obj === 'object' ? obj : {})) {
    const id = idMap.get(String(legacyId));
    if (!id) continue;
    const satang = legacyBahtToSatang(v);
    if (satang > 0 || keepZero) out[id] = satang;
  }
  return out;
}

function isDefaultAlloc(allocBp, cats) {
  return cats.every((c) => allocBp[c.key] === (c.builtIn ? DEFAULT_ALLOC_BP[c.key] : 0));
}

/** เดือนเดิม 1 เดือน → เอกสารเดือนใหม่ หรือ null ถ้าว่างทั้งหมด */
function migrateMonth(m, cats, idMap) {
  const alloc = m?.alloc && typeof m.alloc === 'object' ? m.alloc : {};
  const allocBp = {};
  for (const c of cats) {
    // แอปเดิม: หมวดหลักที่ไม่มีค่าใช้ % เริ่มต้น, หมวดที่เพิ่มเองไม่มีค่า = 0
    const has = alloc[c.key] !== undefined && alloc[c.key] !== null;
    allocBp[c.key] = has ? legacyPctToBp(alloc[c.key]) : (c.builtIn ? DEFAULT_ALLOC_BP[c.key] : 0);
  }
  const salarySatang = legacyBahtToSatang(m?.salary);
  const payments = mapAmounts(m?.payments, idMap, false);
  // openingOverride = 0 มีความหมาย (ยอดต้นเดือน 0) จึงเก็บไว้ด้วย
  const openingOverride = mapAmounts(m?.initialOverride, idMap, true);

  const empty = salarySatang === 0
    && Object.keys(payments).length === 0
    && Object.keys(openingOverride).length === 0
    && isDefaultAlloc(allocBp, cats);
  if (empty) return null;

  const doc = { salarySatang, allocBp, payments };
  if (Object.keys(openingOverride).length) doc.openingOverride = openingOverride;
  return doc;
}

/**
 * แปลง state เดิมทั้งก้อน
 * @param state  users/{legacyName}.state (null/undefined ได้ → บัญชีว่าง)
 * @param opts.createdAtBase  ms ของ createdAt หนี้ก้อนแรก (ก้อนถัดไป +1 ms)
 * @returns {{ account: { appTitle, allocCats }, debts: object[], months: { [YYYY-MM]: object } }}
 */
export function migrateState(state, { createdAtBase = Date.now() } = {}) {
  const st = state && typeof state === 'object' ? state : {};
  const allocCats = migrateCats(st.customCats);
  const { debts, idMap } = migrateDebts(st.debts, createdAtBase);

  const months = {};
  for (const [legacyKey, m] of Object.entries(st.months && typeof st.months === 'object' ? st.months : {})) {
    const key = legacyMonthKey(legacyKey);
    if (!key) continue;
    const doc = migrateMonth(m, allocCats, idMap);
    if (doc) months[key] = doc;
  }

  return {
    account: { appTitle: str(st.appTitle) || DEFAULT_APP_TITLE, allocCats },
    debts,
    months,
  };
}

/**
 * ยอดคงเหลือรวมแบบที่แอปเดิมคำนวณ (สตางค์) ใช้เทียบหลังย้ายบัญชี (SPEC ข้อ 11.3)
 * แอปเดิม: คงเหลือ = max(0, initial − Σ payments ทุกเดือน)
 */
export function legacyRemainingTotal(state) {
  const st = state && typeof state === 'object' ? state : {};
  const months = Object.values(st.months && typeof st.months === 'object' ? st.months : {});
  let total = 0;
  for (const d of Array.isArray(st.debts) ? st.debts : []) {
    const paid = months.reduce((s, m) => s + legacyBahtToSatang(m?.payments?.[d.id]), 0);
    total += Math.max(0, legacyBahtToSatang(d.initial) - paid);
  }
  return total;
}
