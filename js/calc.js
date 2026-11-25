// calc.js — ฟังก์ชันคำนวณล้วน ๆ ของกระปุกปลดหนี้ (ไม่แตะ DOM/Firebase) ตาม SPEC ข้อ 5
//
// หน่วย:
//   เงิน = สตางค์ (integer)   เช่น 17,040.16 บาท = 1704016
//   %    = basis points (integer)  1% = 100, ดอก 33% = 3300
// ห้ามใช้ float กับเงิน การหารทุกครั้งผ่าน roundDiv (BigInt, ปัดครึ่งขึ้น)
//
// รูปข้อมูล (SPEC ข้อ 6.1):
//   debt   = { id, creditor, account, initialSatang, rateBp, due, startMonth: "YYYY-MM", createdAt: ms }
//   months = { "YYYY-MM": { salarySatang, allocBp: {key: bp}, payments: {debtId: satang}, openingOverride?: {debtId: satang} } }
//   createdAt เป็นตัวเลข ms (store แปลง Timestamp ของ Firestore ก่อนส่งเข้ามา)

import { addMonths, prevMonth, monthRange, monthsOfYear } from './dates.js';

const BP_SCALE = 10000n; // 100% = 10000 bp
export const FULL_BP = 10000;

// ---------- พื้นฐาน ----------

/**
 * หาร integer แล้วปัดครึ่งขึ้น (ค่าลบปัดออกจากศูนย์ แบบสมมาตร)
 * ใช้ BigInt เพื่อไม่ให้ผลคูณใหญ่เกิน Number.MAX_SAFE_INTEGER และกรณี .5 ปัดถูกต้อง
 */
export function roundDiv(numer, denom) {
  let n = BigInt(numer);
  let d = BigInt(denom);
  if (d === 0n) throw new RangeError('division by zero');
  if (d < 0n) { n = -n; d = -d; }
  const neg = n < 0n;
  if (neg) n = -n;
  const q = (2n * n + d) / (2n * d);
  return Number(neg ? -q : q);
}

/**
 * ค่าเงิน/bp จากข้อมูลที่อ่านมา ให้เป็น integer ≥ 0 เสมอ
 * รับ number หรือ string ตัวเลข, ทศนิยมปัดครึ่งขึ้น, ค่าอื่น (NaN, ติดลบ, null, "abc") → fallback
 */
export function toSafeInt(v, fallback = 0) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return fallback;
  const r = Math.round(n);
  return Number.isSafeInteger(r) ? r : fallback;
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ---------- ยอดของหนี้แต่ละก้อน (ข้อ 5.2) ----------

/** ก้อนนี้มีอยู่ในเดือน M ไหม (M ≥ startMonth) */
export const isInMonth = (debt, M) => M >= debt.startMonth;

/** ยอดชำระที่บันทึกไว้ของก้อนนี้ในเดือน M (สตางค์) */
export function storedPay(debt, months, M) {
  if (!isInMonth(debt, M)) return 0;
  return toSafeInt(months[M]?.payments?.[debt.id]);
}

/** เดือนที่มีเอกสารและก้อนนี้มีอยู่ เรียงตามเวลา */
function debtMonthKeys(debt, months) {
  return Object.keys(months).filter((k) => isInMonth(debt, k)).sort();
}

/** ผลรวมยอดชำระของก้อนนี้ทุกเดือนที่ < M */
export function paidBefore(debt, months, M) {
  let sum = 0;
  for (const k of debtMonthKeys(debt, months)) {
    if (k >= M) break;
    sum += storedPay(debt, months, k);
  }
  return sum;
}

/**
 * ยอดต้นเดือน = max(0, initial − paidBefore)
 * ถ้าเดือน M มี openingOverride[debtId] (ข้อมูลเก่าจาก initialOverride) ใช้ค่านั้นแทน (มีผลเฉพาะเดือนนั้น เหมือนแอปเดิม)
 * เดือนที่ < startMonth ไม่มีก้อนนี้ → 0
 */
export function opening(debt, months, M) {
  if (!isInMonth(debt, M)) return 0;
  const override = months[M]?.openingOverride?.[debt.id];
  if (override != null) return toSafeInt(override);
  return Math.max(0, toSafeInt(debt.initialSatang) - paidBefore(debt, months, M));
}

/**
 * ยอดชำระที่จะบันทึก: clamp 0 ≤ pay ≤ opening
 * รับสตางค์ (number) หรือ null/undefined/NaN/ติดลบ → 0
 */
export function clampPay(value, openingSatang) {
  const v = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
  return clamp(v, 0, Math.max(0, openingSatang));
}

/** ยอดชำระที่ใช้คำนวณในเดือน M (ไม่เกินยอดต้นเดือน กันกรณีแก้ยอดตั้งต้นลดลงทีหลัง) */
export function pay(debt, months, M) {
  return Math.min(storedPay(debt, months, M), opening(debt, months, M));
}

/** เหลือหลังชำระของเดือน M */
export const remainingAfter = (debt, months, M) => opening(debt, months, M) - pay(debt, months, M);

/** ยอดจ่ายรวมทุกเดือน ไม่เกินยอดตั้งต้น */
export function paidTotal(debt, months) {
  let sum = 0;
  for (const k of debtMonthKeys(debt, months)) sum += storedPay(debt, months, k);
  return Math.min(toSafeInt(debt.initialSatang), sum);
}

export const remaining = (debt, months) => toSafeInt(debt.initialSatang) - paidTotal(debt, months);
export const isClosed = (debt, months) => remaining(debt, months) === 0;

/**
 * % เป็นหน่วย 0.1% (integer) ปัดครึ่งขึ้น: 33.50218% → 335, ตัวหาร 0 → null
 * ใช้ format.formatPctOf สำหรับแสดงผล
 */
export function pctTenths(numer, denom) {
  if (!(denom > 0)) return null;
  return roundDiv(BigInt(Math.max(0, numer)) * 1000n, denom);
}

/** % ที่จ่ายแล้วของก้อนนี้ (หน่วย 0.1%) */
export const debtPctTenths = (debt, months) => pctTenths(paidTotal(debt, months), toSafeInt(debt.initialSatang));

// ---------- ลำดับการจ่าย (ข้อ 5.3) ----------

/**
 * เรียงลำดับการจ่าย: ยังไม่ปิดก่อน แล้วตามด้วยที่ปิดแล้ว
 * ภายในกลุ่ม: rateBp มาก → น้อย, remaining มาก → น้อย, createdAt เก่า → ใหม่ (สุดท้าย id เพื่อให้ผลคงที่)
 * @returns {{ debt, rank, remaining, closed }[]} rank เริ่มที่ 1
 */
export function priorityOrder(debts, months) {
  return debts
    .map((debt) => {
      const rem = remaining(debt, months);
      return { debt, remaining: rem, closed: rem === 0 };
    })
    .sort((a, b) =>
      (a.closed - b.closed)
      || (toSafeInt(b.debt.rateBp) - toSafeInt(a.debt.rateBp))
      || (b.remaining - a.remaining)
      || (toSafeInt(a.debt.createdAt) - toSafeInt(b.debt.createdAt))
      || String(a.debt.id).localeCompare(String(b.debt.id)))
    .map((x, i) => ({ ...x, rank: i + 1 }));
}

// ---------- ป้ายสถานะหน้าเดือนนี้ (ข้อ 5.4) ----------

export const STATUS = Object.freeze({
  CLOSED: 'closed',   // opening = 0 → ปิดแล้ว (ย้ายไปกลุ่มท้าย)
  CLOSING: 'closing', // pay > 0 และ remainingAfter = 0 → ปิดก้อนนี้
  PAID: 'paid',       // pay > 0 → จ่ายแล้ว
  UNPAID: 'unpaid',   // pay = 0 → ยังไม่จ่าย
});

export function payStatus(openingSatang, paySatang) {
  if (openingSatang === 0) return STATUS.CLOSED;
  if (paySatang > 0 && openingSatang - paySatang === 0) return STATUS.CLOSING;
  if (paySatang > 0) return STATUS.PAID;
  return STATUS.UNPAID;
}

// ---------- "ใช้ยอดเดือนก่อน" (ข้อ 5.6) ----------

/**
 * เดือนก่อน = เดือนตามปฏิทินก่อน M (ไม่ใช่เดือนล่าสุดที่บันทึก)
 * @returns {{ prevPay, value, show }} value = min(pay เดือนก่อน, opening เดือนนี้), show เมื่อ prevPay > 0
 */
export function prevPaySuggestion(debt, months, M) {
  const prevPay = storedPay(debt, months, prevMonth(M));
  const value = Math.min(prevPay, opening(debt, months, M));
  return { prevPay, value, show: prevPay > 0 };
}

// ---------- ยอดรวม (ข้อ 5.5) ----------

export function totals(debts, months) {
  let totalInitial = 0;
  let totalPaid = 0;
  let closedCount = 0;
  for (const d of debts) {
    totalInitial += toSafeInt(d.initialSatang);
    totalPaid += paidTotal(d, months);
    if (isClosed(d, months)) closedCount++;
  }
  return {
    totalInitial,
    totalPaid,
    totalRemaining: totalInitial - totalPaid,
    progressTenths: pctTenths(totalPaid, totalInitial), // null เมื่อไม่มีหนี้
    closedCount,
    debtCount: debts.length,
  };
}

/** ยอดรวมของเดือน M (เฉพาะก้อนที่มีอยู่ในเดือนนั้น) */
export function monthTotals(debts, months, M) {
  let monthOpening = 0;
  let monthPaid = 0;
  for (const d of debts) {
    if (!isInMonth(d, M)) continue;
    monthOpening += opening(d, months, M);
    monthPaid += pay(d, months, M);
  }
  return { monthOpening, monthPaid, monthRemaining: monthOpening - monthPaid };
}

/**
 * ข้อมูลสำหรับหน้าเดือนนี้ (D04) เรียงตามลำดับการจ่าย
 * active = ก้อนที่ startMonth ≤ M และยอดต้นเดือน > 0 (มีช่องกรอก)
 * closed = ก้อนที่ startMonth ≤ M และยอดต้นเดือน = 0
 */
export function monthView(debts, months, M) {
  const active = [];
  const closed = [];
  for (const { debt, rank } of priorityOrder(debts, months)) {
    if (!isInMonth(debt, M)) continue;
    const op = opening(debt, months, M);
    const p = pay(debt, months, M);
    const row = {
      debt, rank,
      opening: op,
      pay: p,
      remainingAfter: op - p,
      status: payStatus(op, p),
      prev: prevPaySuggestion(debt, months, M),
    };
    (op > 0 ? active : closed).push(row);
  }
  return { active, closed, ...monthTotals(debts, months, M) };
}

// ---------- เดือน (ข้อ 6.3) ----------

/** ช่วงเดือนใน <select>: min(startMonth ทุกก้อน, เดือนปัจจุบัน) … เดือนปัจจุบัน + 12 */
export function monthOptions(debts, currentKey) {
  let first = currentKey;
  for (const d of debts) if (d.startMonth && d.startMonth < first) first = d.startMonth;
  return monthRange(first, addMonths(currentKey, 12));
}

// ---------- หมวดงบ (ข้อ 5.7) ----------

export const BUILTIN_CATS = Object.freeze([
  Object.freeze({ key: 'debt', label: 'ชำระหนี้', color: '#B4441A', builtIn: true }),
  Object.freeze({ key: 'saving', label: 'ออม/สำรอง', color: '#2F6B45', builtIn: true }),
  Object.freeze({ key: 'living', label: 'ค่าครองชีพ', color: '#E9B949', builtIn: true }),
  Object.freeze({ key: 'other', label: 'อื่น ๆ', color: '#FFA8C1', builtIn: true }),
]);

export const DEFAULT_ALLOC_BP = Object.freeze({ debt: 4000, saving: 1000, living: 4000, other: 1000 });

export const CAT_PALETTE = Object.freeze([
  '#FF8C00', '#00B4D8', '#E56399', '#7B2CBF', '#43AA8B',
  '#F72585', '#4361EE', '#FFB703', '#8AC926', '#6A4C93',
]);

/** สีถัดไปที่ยังไม่ใช้จาก palette (ใช้หมดแล้ววนสีแรกตามจำนวนหมวด) */
export function nextCatColor(cats) {
  const used = new Set(cats.map((c) => c.color.toUpperCase()));
  return CAT_PALETTE.find((c) => !used.has(c)) ?? CAT_PALETTE[cats.length % CAT_PALETTE.length];
}

/** เงินของหมวด: roundHalfUp(salary × bp / 10000) */
export function allocAmount(salarySatang, bp) {
  return roundDiv(BigInt(toSafeInt(salarySatang)) * BigInt(toSafeInt(bp)), BP_SCALE);
}

/** โหมด ฿: bp = roundHalfUp(baht / salary × 10000), salary = 0 → null (ใช้โหมดนี้ไม่ได้) */
export function bpFromAmount(amountSatang, salarySatang) {
  if (!(salarySatang > 0)) return null;
  return roundDiv(BigInt(toSafeInt(amountSatang)) * BP_SCALE, salarySatang);
}

export const canUseAmountMode = (salarySatang) => salarySatang > 0;

/**
 * สรุปการแบ่งงบตามลำดับหมวด
 * widthBp = ความกว้างบนแถบ (หน่วย bp ของแถบเต็ม) = bp / max(allocTotalBp, 10000) ปัดลง เพื่อรวมแล้วไม่ล้นแถบ
 */
export function allocSummary(salarySatang, allocBp, cats) {
  const items = cats.map((c) => ({ ...c, bp: toSafeInt(allocBp?.[c.key]) }));
  const totalBp = items.reduce((s, x) => s + x.bp, 0);
  const scale = BigInt(Math.max(totalBp, FULL_BP));
  for (const x of items) {
    x.amount = allocAmount(salarySatang, x.bp);
    x.widthBp = Number((BigInt(x.bp) * BP_SCALE) / scale);
  }
  return { items, totalBp, over: totalBp > FULL_BP, overBp: Math.max(0, totalBp - FULL_BP) };
}

/** งบชำระหนี้ของเดือน = amount ของหมวด debt */
export const debtBudget = (month) => allocAmount(month?.salarySatang ?? 0, month?.allocBp?.debt ?? 0);

/**
 * ข้อมูลเดือน M สำหรับแสดงผล
 * มีเอกสาร → ใช้ตามนั้น (draft = false)
 * ยังไม่มี → ร่าง: เงินเดือน/allocBp จากเดือนล่าสุดก่อนหน้าที่มีเอกสาร (ไม่มีเลยใช้ 0 และ 40/10/40/10), payments ว่าง
 */
export function resolveMonth(months, M) {
  const doc = months[M];
  if (doc) {
    return {
      salarySatang: toSafeInt(doc.salarySatang),
      allocBp: { ...DEFAULT_ALLOC_BP, ...(doc.allocBp ?? {}) },
      payments: { ...(doc.payments ?? {}) },
      openingOverride: { ...(doc.openingOverride ?? {}) },
      draft: false,
    };
  }
  const before = Object.keys(months).filter((k) => k < M).sort();
  const src = before.length ? months[before[before.length - 1]] : null;
  return {
    salarySatang: toSafeInt(src?.salarySatang),
    allocBp: { ...DEFAULT_ALLOC_BP, ...(src?.allocBp ?? {}) },
    payments: {},
    openingOverride: {},
    draft: true,
  };
}

// ---------- สรุปปี (ข้อ 5.8) ----------

/**
 * @param ceYear ปี ค.ศ.
 * @returns {{
 *   months: { key, recorded, paid, remaining }[],  // 12 เดือน, remaining = null ถ้ายังไม่บันทึก
 *   totalPaid, recordedCount, endRemaining,        // endRemaining = คงเหลือ ณ เดือนล่าสุดที่บันทึกของปีนั้น (null ถ้าไม่มี)
 *   byDebt: { debt, paid }[]                       // จ่ายในปีนี้ของแต่ละก้อน มาก → น้อย (ไม่รวมก้อนที่ไม่ได้จ่ายเลย)
 * }}
 */
export function yearSummary(debts, months, ceYear) {
  let totalPaid = 0;
  let recordedCount = 0;
  let endRemaining = null;
  const rows = monthsOfYear(ceYear).map((key) => {
    if (!months[key]) return { key, recorded: false, paid: 0, remaining: null };
    const t = monthTotals(debts, months, key);
    totalPaid += t.monthPaid;
    recordedCount++;
    endRemaining = t.monthRemaining;
    return { key, recorded: true, paid: t.monthPaid, remaining: t.monthRemaining };
  });
  const keys = rows.filter((r) => r.recorded).map((r) => r.key);
  const byDebt = debts
    .map((debt, i) => ({ debt, i, paid: keys.reduce((s, k) => s + pay(debt, months, k), 0) }))
    .filter((x) => x.paid > 0)
    .sort((a, b) => b.paid - a.paid || a.i - b.i)
    .map(({ debt, paid }) => ({ debt, paid }));
  return { months: rows, totalPaid, recordedCount, endRemaining, byDebt };
}
