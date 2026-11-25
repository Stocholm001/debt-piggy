// csv.js — ส่งออก CSV สรุปปี / สำรองข้อมูลทั้งหมด (SPEC ข้อ 9)
// ฟังก์ชันล้วน ๆ ไม่แตะ DOM: สร้างข้อความ CSV (UTF-8 มี BOM, คั่นด้วย comma, ขึ้นบรรทัดด้วย CRLF)
// ตัวเลขเงิน/% เขียนแบบไม่มี comma คั่นหลัก (เช่น 4000.00) ให้ Excel อ่านเป็นตัวเลข

import {
  yearSummary, monthTotals, priorityOrder, isInMonth, opening, pay, debtBudget,
} from './calc.js';
import { monthLabel, monthRange, toBE } from './dates.js';

export const BOM = '﻿';

/** สตางค์ → "1234.50" / "-1234.50" */
export function csvMoney(satang) {
  const neg = satang < 0;
  const abs = BigInt(Math.abs(satang));
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** bp → "33" / "12.5" */
export function csvPct(bp) {
  const frac = String(bp % 100).padStart(2, '0').replace(/0+$/, '');
  return `${Math.trunc(bp / 100)}${frac ? '.' + frac : ''}`;
}

/**
 * ค่าในช่องเดียว: ใส่ "" ถ้ามี comma, ", ขึ้นบรรทัด
 * ข้อความที่ขึ้นต้นด้วย = + - @ (เช่น ชื่อบัญชี) ใส่ ' นำหน้า กัน Excel ตีความเป็นสูตร
 * ตัวเลขที่เราสร้างเอง (ส่งมาเป็น { num }) ไม่ใส่ '
 */
export function csvCell(v) {
  if (v == null) return '';
  let s;
  if (typeof v === 'object' && 'num' in v) s = String(v.num);
  else {
    s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const num = (s) => ({ num: s });
const money = (satang) => num(csvMoney(satang));

/** แถว → ข้อความ CSV ทั้งไฟล์ (มี BOM) */
export function toCsv(rows) {
  return BOM + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---------- สรุปปี: debt-<พ.ศ.>.csv ----------

export const yearCsvFilename = (ceYear) => `debt-${toBE(ceYear)}.csv`;

/**
 * เฉพาะเดือนที่บันทึกแล้ว + แถวรวมท้ายไฟล์
 * คอลัมน์: เดือน, ยอดต้นเดือนรวม, ชำระรวม, คงเหลือปลายเดือน, เงินเดือน, งบชำระหนี้
 */
export function yearCsv(debts, months, ceYear) {
  const y = yearSummary(debts, months, ceYear);
  const rows = [['เดือน', 'ยอดต้นเดือนรวม', 'ชำระรวม', 'คงเหลือปลายเดือน', 'เงินเดือน', 'งบชำระหนี้']];
  let salarySum = 0;
  let budgetSum = 0;
  for (const m of y.months) {
    if (!m.recorded) continue;
    const t = monthTotals(debts, months, m.key);
    const doc = months[m.key];
    const budget = debtBudget(doc);
    salarySum += doc.salarySatang ?? 0;
    budgetSum += budget;
    rows.push([monthLabel(m.key), money(t.monthOpening), money(t.monthPaid), money(t.monthRemaining),
      money(doc.salarySatang ?? 0), money(budget)]);
  }
  rows.push([`รวมปี ${toBE(ceYear)}`, '', money(y.totalPaid),
    y.endRemaining == null ? '' : money(y.endRemaining), money(salarySum), money(budgetSum)]);
  return toCsv(rows);
}

// ---------- สำรองทั้งหมด: debt-backup-<YYYYMMDD>.csv ----------

/** "debt-backup-20261125.csv" */
export function backupFilename(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `debt-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.csv`;
}

/**
 * แถวละ (เดือน × หนี้) ตั้งแต่ startMonth แรกสุดถึง max(เดือนปัจจุบัน, เดือนล่าสุดที่บันทึก)
 * หนี้ในแต่ละเดือนเรียงตามลำดับการจ่าย
 * คอลัมน์: เดือน(YYYY-MM), เจ้าหนี้, ชื่อบัญชี, ดอก %/ปี, ยอดตั้งต้น, ยอดต้นเดือน, ชำระ, คงเหลือหลังชำระ
 */
export function backupCsv(debts, months, currentKey) {
  const rows = [['เดือน(YYYY-MM)', 'เจ้าหนี้', 'ชื่อบัญชี', 'ดอก %/ปี', 'ยอดตั้งต้น', 'ยอดต้นเดือน', 'ชำระ', 'คงเหลือหลังชำระ']];
  if (debts.length) {
    const first = debts.reduce((min, d) => (d.startMonth < min ? d.startMonth : min), debts[0].startMonth);
    const last = Object.keys(months).reduce((max, k) => (k > max ? k : max), currentKey);
    const order = priorityOrder(debts, months).map((x) => x.debt);
    for (const key of monthRange(first, last)) {
      for (const d of order) {
        if (!isInMonth(d, key)) continue;
        const op = opening(d, months, key);
        const p = pay(d, months, key);
        rows.push([key, d.creditor, d.account, num(csvPct(d.rateBp)), money(d.initialSatang), money(op), money(p), money(op - p)]);
      }
    }
  }
  return toCsv(rows);
}
