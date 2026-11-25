// tests/calc.test.js — SPEC ข้อ 11.1 (ใช้ข้อมูลตัวอย่างข้อ 1 จาก js/sample-data.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  opening, paidBefore, clampPay, pay, remainingAfter, paidTotal, remaining, isClosed,
  priorityOrder, payStatus, STATUS, prevPaySuggestion, totals, monthTotals, monthView,
  allocAmount, bpFromAmount, canUseAmountMode, allocSummary, resolveMonth, monthOptions,
  yearSummary, debtPctTenths, nextCatColor, BUILTIN_CATS, CAT_PALETTE, DEFAULT_ALLOC_BP, roundDiv, toSafeInt,
} from '../js/calc.js';
import { formatMoney, formatPctOf, parseMoney } from '../js/format.js';
import { sampleData, SAMPLE_CURRENT_MONTH } from '../js/sample-data.js';

const NOV = SAMPLE_CURRENT_MONTH; // 2026-11
const OCT = '2026-10';

const byAccount = (debts, account) => debts.find((d) => d.account === account);

/** ทุกเดือนที่มีเอกสาร: ยอดชำระที่บันทึกไม่เกินยอดต้นเดือน (ข้อมูลตัวอย่างต้องสมเหตุสมผล) */
test('ข้อมูลตัวอย่าง: ยอดชำระทุกเดือนไม่เกินยอดต้นเดือน และยอดรวมตรง SPEC ข้อ 1', () => {
  const { debts, months } = sampleData();
  for (const M of Object.keys(months)) {
    for (const d of debts) {
      const stored = months[M].payments[d.id] ?? 0;
      assert.ok(stored <= opening(d, months, M), `${d.account} ${M}`);
    }
  }
  const nov = monthTotals(debts, months, NOV);
  assert.equal(nov.monthPaid, 550000);
  assert.equal(formatMoney(nov.monthRemaining), '182,009.26');
  // ตาราง SPEC: จ่ายแล้ว 46.3% ของใจป้ำ 2
  assert.equal(formatPctOf(paidTotal(debts[0], months), debts[0].initialSatang), '46.3%');
  assert.equal(debtPctTenths(debts[0], months), 463);
});

test('11.1 #1 opening ก้อน 1 เดือนแรก (2026-04) = 69,117.58', () => {
  const { debts, months } = sampleData();
  assert.equal(opening(debts[0], months, '2026-04'), 6911758);
  assert.equal(formatMoney(opening(debts[0], months, '2026-04')), '69,117.58');
});

test('11.1 #2 opening ก้อน 1 พ.ย. (จ่ายก่อนหน้ารวม 28,000) = 41,117.58', () => {
  const { debts, months } = sampleData();
  assert.equal(paidBefore(debts[0], months, NOV), 2800000);
  assert.equal(formatMoney(opening(debts[0], months, NOV)), '41,117.58');
});

test('11.1 #3 pay 50,000 บน opening 41,117.58 → clamp, remainingAfter 0, ป้าย "ปิดก้อนนี้"', () => {
  const { debts, months } = sampleData();
  const d = debts[0];
  const op = opening(d, months, NOV);
  const p = clampPay(5000000, op);
  assert.equal(p, 4111758);
  months[NOV].payments[d.id] = p;
  assert.equal(remainingAfter(d, months, NOV), 0);
  assert.equal(payStatus(op, p), STATUS.CLOSING);
  assert.equal(monthView(debts, months, NOV).active.find((r) => r.debt.id === d.id).status, STATUS.CLOSING);
});

test('11.1 #4 pay ติดลบ / ว่าง → 0', () => {
  const op = 4111758;
  assert.equal(clampPay(-100, op), 0);
  assert.equal(clampPay(null, op), 0);
  assert.equal(clampPay(undefined, op), 0);
  assert.equal(clampPay(NaN, op), 0);
  assert.equal(clampPay(parseMoney(''), op), 0);
  assert.equal(clampPay(parseMoney('-500'), op), 0);
  assert.equal(payStatus(op, 0), STATUS.UNPAID);
  assert.equal(payStatus(op, 100), STATUS.PAID);
});

test('11.1 #5 FINNIX หลังจ่ายครบ: opening เดือนถัดไป = 0, ปิดแล้ว, ไม่อยู่ในรายการกรอก', () => {
  const { debts, months } = sampleData();
  const finnix = byAccount(debts, 'FINNIX');
  assert.equal(opening(finnix, months, '2026-08'), 324016); // เดือนที่จ่ายงวดสุดท้าย
  assert.equal(remainingAfter(finnix, months, '2026-08'), 0);
  assert.equal(opening(finnix, months, '2026-09'), 0);
  assert.equal(isClosed(finnix, months), true);
  const view = monthView(debts, months, '2026-09');
  assert.ok(!view.active.some((r) => r.debt.id === finnix.id));
  const row = view.closed.find((r) => r.debt.id === finnix.id);
  assert.equal(row.status, STATUS.CLOSED);
});

test('11.1 #6 totals ตัวอย่าง', () => {
  const { debts, months } = sampleData();
  const t = totals(debts, months);
  assert.equal(formatMoney(t.totalInitial), '273,707.11');
  assert.equal(formatMoney(t.totalPaid), '91,697.85');
  assert.equal(formatMoney(t.totalRemaining), '182,009.26');
  assert.equal(formatPctOf(t.totalPaid, t.totalInitial), '33.5%');
  assert.equal(t.progressTenths, 335);
  assert.equal(t.closedCount, 2);
  assert.equal(t.debtCount, 9);
});

test('11.1 #7 ลำดับการจ่าย', () => {
  const { debts, months } = sampleData();
  const order = priorityOrder(debts, months);
  assert.deepEqual(order.map((x) => x.debt.account), [
    'สินเชื่อ ใจป้ำ 2', 'บัตรกดเงินสด', 'SPayLater', 'สินเชื่อ ใจป้ำ', 'UCHOOSE',
    'CardX SPEEDY CASH', 'CardX UP2ME', 'FINNIX', 'SEasyCash',
  ]);
  assert.deepEqual(order.map((x) => x.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(order.map((x) => x.closed), [false, false, false, false, false, false, false, true, true]);
  // หน้าเดือนนี้ใช้ลำดับเดียวกัน
  const view = monthView(debts, months, NOV);
  assert.deepEqual(view.active.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(view.closed.map((r) => r.rank), [8, 9]);
});

test('11.1 #8 ดอกเท่ากัน 25% (CIMB 20,326.55 vs SPayLater 2,138.24) → CIMB มาก่อน', () => {
  const { debts, months } = sampleData();
  const cimb = byAccount(debts, 'บัตรกดเงินสด');
  const spay = byAccount(debts, 'SPayLater');
  assert.equal(formatMoney(remaining(cimb, months)), '20,326.55');
  assert.equal(formatMoney(remaining(spay, months)), '2,138.24');
  const order = priorityOrder([spay, cimb], months).map((x) => x.debt.account);
  assert.deepEqual(order, ['บัตรกดเงินสด', 'SPayLater']);
  // ดอกและยอดคงเหลือเท่ากัน → createdAt เก่าก่อน
  const a = { ...cimb, id: 'a', createdAt: 2000 };
  const b = { ...cimb, id: 'b', createdAt: 1000 };
  assert.deepEqual(priorityOrder([a, b], {}).map((x) => x.debt.id), ['b', 'a']);
});

test('11.1 #9 ใช้ยอดเดือนก่อน: ต.ค. 500 ก้อน SPayLater, opening พ.ย. 2,138.24 → 500.00', () => {
  const { debts, months } = sampleData();
  const spay = byAccount(debts, 'SPayLater');
  assert.equal(formatMoney(opening(spay, months, NOV)), '2,138.24');
  const s = prevPaySuggestion(spay, months, NOV);
  assert.equal(s.show, true);
  assert.equal(formatMoney(s.prevPay), '500.00');
  assert.equal(formatMoney(s.value), '500.00');
});

test('11.1 #10 ใช้ยอดเดือนก่อน: ต.ค. 4,000 แต่ opening 2,138.24 → 2,138.24', () => {
  // ก้อน SPayLater ที่จ่าย ต.ค. 4,000 แล้วเหลือต้นเดือน พ.ย. 2,138.24 (ยอดตั้งต้น 6,138.24)
  const spay = { ...byAccount(sampleData().debts, 'SPayLater'), initialSatang: 613824 };
  const months = { [OCT]: { payments: { [spay.id]: 400000 } } };
  assert.equal(formatMoney(opening(spay, months, NOV)), '2,138.24');
  const s = prevPaySuggestion(spay, months, NOV);
  assert.equal(s.show, true);
  assert.equal(formatMoney(s.prevPay), '4,000.00');
  assert.equal(formatMoney(s.value), '2,138.24');
  // เดือนก่อนไม่มียอด → ไม่แสดงปุ่ม
  assert.equal(prevPaySuggestion(spay, months, OCT).show, false);
});

test('11.1 #11 แก้ initial เหลือ 20,000 ทั้งที่จ่ายแล้ว 32,000 → paidTotal 20,000, remaining 0, ปิดแล้ว', () => {
  const { debts, months } = sampleData();
  const d = debts[0];
  d.initialSatang = 2000000;
  assert.equal(paidTotal(d, months), 2000000);
  assert.equal(remaining(d, months), 0);
  assert.equal(isClosed(d, months), true);
  for (const M of Object.keys(months)) {
    assert.ok(opening(d, months, M) >= 0);
    assert.ok(remainingAfter(d, months, M) >= 0, M);
  }
  assert.equal(opening(d, months, NOV), 0);
  const t = totals(debts, months);
  assert.equal(t.totalRemaining, t.totalInitial - t.totalPaid);
  assert.ok(t.totalRemaining >= 0);
});

test('11.1 #12 หนี้ startMonth 2026-11 → ไม่อยู่ในเดือน ต.ค., opening พ.ย. = initial', () => {
  const { debts, months } = sampleData();
  const fresh = {
    id: 'dbt_new', creditor: 'TTB', account: 'บัตรใหม่', initialSatang: 1000000,
    rateBp: 1800, due: '', startMonth: NOV, createdAt: Date.UTC(2026, 10, 1),
  };
  debts.push(fresh);
  months[OCT].payments[fresh.id] = 50000; // ข้อมูลหลงมาก่อน startMonth ต้องไม่นับ
  const oct = monthView(debts, months, OCT);
  assert.ok(![...oct.active, ...oct.closed].some((r) => r.debt.id === fresh.id));
  assert.equal(opening(fresh, months, OCT), 0);
  assert.equal(opening(fresh, months, NOV), 1000000);
  assert.equal(paidTotal(fresh, months), 0);
  assert.ok(monthView(debts, months, NOV).active.some((r) => r.debt.id === fresh.id));
  // ยอดรวม ต.ค. ไม่เปลี่ยนเพราะก้อนใหม่
  assert.equal(monthTotals(debts, months, OCT).monthOpening, monthTotals(debts.slice(0, 9), months, OCT).monthOpening);
});

test('11.1 #13 alloc 40% ของ 30,000 = 12,000.00', () => {
  assert.equal(formatMoney(allocAmount(3000000, 4000)), '12,000.00');
  const s = allocSummary(3000000, DEFAULT_ALLOC_BP, BUILTIN_CATS);
  assert.deepEqual(s.items.map((x) => x.amount), [1200000, 300000, 1200000, 300000]);
  assert.equal(s.totalBp, 10000);
  assert.equal(s.over, false);
});

test('11.1 #14 alloc โหมด ฿: 12,345 บน 30,000 → 4115 bp (41.15%)', () => {
  assert.equal(bpFromAmount(1234500, 3000000), 4115);
});

test('11.1 #15 alloc รวม 105% → over = true, แถบไม่ล้น', () => {
  const s = allocSummary(3000000, { debt: 4500, saving: 1000, living: 4000, other: 1000 }, BUILTIN_CATS);
  assert.equal(s.totalBp, 10500);
  assert.equal(s.over, true);
  assert.equal(s.overBp, 500);
  const width = s.items.reduce((sum, x) => sum + x.widthBp, 0);
  assert.ok(width <= 10000, `width ${width}`);
  // ปัดลงทุกช่องแล้วต้องไม่ล้น แม้หารไม่ลงตัว
  const odd = allocSummary(0, { debt: 3333, saving: 3333, living: 3334, other: 1 }, BUILTIN_CATS);
  assert.ok(odd.items.reduce((sum, x) => sum + x.widthBp, 0) <= 10000);
});

test('11.1 #16 salary 0 → alloc amount 0, โหมด ฿ ใช้ไม่ได้, % ความคืบหน้าไม่ error', () => {
  const s = allocSummary(0, DEFAULT_ALLOC_BP, BUILTIN_CATS);
  assert.ok(s.items.every((x) => x.amount === 0));
  assert.equal(bpFromAmount(100000, 0), null);
  assert.equal(canUseAmountMode(0), false);
  assert.equal(canUseAmountMode(3000000), true);
  const { debts, months } = sampleData();
  for (const m of Object.values(months)) m.salarySatang = 0;
  assert.doesNotThrow(() => totals(debts, months));
  assert.equal(totals(debts, months).progressTenths, 335);
});

test('11.1 #17 ปัดเศษ: จ่าย 0.10 + 0.20 → paidTotal = 0.30 พอดี (30 สตางค์)', () => {
  const d = { id: 'x', initialSatang: 10000, rateBp: 0, startMonth: '2026-01', createdAt: 0 };
  const months = {
    '2026-01': { payments: { x: parseMoney('0.10') } },
    '2026-02': { payments: { x: parseMoney('0.20') } },
  };
  assert.equal(paidTotal(d, months), 30);
  assert.equal(formatMoney(paidTotal(d, months)), '0.30');
  assert.equal(opening(d, months, '2026-03'), 9970);
});

test('11.1 #18 progress 33.50218% → แสดง 33.5%', () => {
  assert.equal(formatPctOf(3350218, 10000000), '33.5%');
  assert.equal(formatPctOf(9169785, 27370711), '33.5%'); // = 33.50218…%
});

test('11.1 #19 ไม่มีหนี้เลย → progress —, totals 0 ไม่ error', () => {
  const t = totals([], {});
  assert.deepEqual(t, {
    totalInitial: 0, totalPaid: 0, totalRemaining: 0, progressTenths: null, closedCount: 0, debtCount: 0,
  });
  assert.equal(formatPctOf(t.totalPaid, t.totalInitial), '—');
  assert.deepEqual(priorityOrder([], {}), []);
  const v = monthView([], {}, NOV);
  assert.deepEqual([v.active, v.closed, v.monthOpening, v.monthPaid], [[], [], 0, 0]);
  assert.equal(yearSummary([], {}, 2026).recordedCount, 0);
});

test('11.1 #20 สรุปปี 2569 → จ่ายทั้งปี 91,697.85, บันทึก 8 จาก 12 เดือน', () => {
  const { debts, months } = sampleData();
  const y = yearSummary(debts, months, 2026);
  assert.equal(formatMoney(y.totalPaid), '91,697.85');
  assert.equal(y.recordedCount, 8);
  assert.equal(y.months.length, 12);
  assert.equal(formatMoney(y.endRemaining), '182,009.26'); // ณ พ.ย. เดือนล่าสุดที่บันทึก
  assert.equal(y.months[0].recorded, false); // ม.ค.
  assert.equal(y.months[0].remaining, null);
  assert.deepEqual(y.months.slice(3, 11).map((m) => m.paid / 100),
    [11200, 11600, 12000, 12000, 13397.85, 17900, 8100, 5500]);
  // จ่ายตามก้อน: มาก → น้อย
  assert.deepEqual(y.byDebt.map((x) => x.debt.account), [
    'สินเชื่อ ใจป้ำ 2', 'FINNIX', 'SEasyCash', 'บัตรกดเงินสด', 'สินเชื่อ ใจป้ำ', 'CardX SPEEDY CASH',
    'UCHOOSE', 'CardX UP2ME', 'SPayLater',
  ]);
  assert.equal(y.byDebt.reduce((s, x) => s + x.paid, 0), y.totalPaid);
  assert.equal(yearSummary(debts, months, 2027).recordedCount, 0);
});

// ---------- เพิ่มเติมนอก 11.1 ----------

test('เดือนที่ยังไม่บันทึกใช้เงินเดือน/สัดส่วนจากเดือนล่าสุดก่อนหน้า (ข้อ 6.3)', () => {
  const { months } = sampleData();
  months[NOV].salarySatang = 3500000;
  months[NOV].allocBp = { debt: 5000, saving: 1000, living: 3000, other: 1000, cat_x: 0 };
  const jan = resolveMonth(months, '2027-01');
  assert.equal(jan.draft, true);
  assert.equal(jan.salarySatang, 3500000);
  assert.equal(jan.allocBp.debt, 5000);
  assert.deepEqual(jan.payments, {});
  const none = resolveMonth({}, '2027-01');
  assert.equal(none.salarySatang, 0);
  assert.deepEqual(none.allocBp, { debt: 4000, saving: 1000, living: 4000, other: 1000 });
  const saved = resolveMonth(months, NOV);
  assert.equal(saved.draft, false);
  // เดือนก่อนหน้าข้อมูลทั้งหมดไม่มี → ใช้ค่าเริ่มต้น แม้มีเดือนหลังจากนั้น
  assert.equal(resolveMonth(months, '2026-01').salarySatang, 0);
});

test('ช่วงเดือนใน select: min(startMonth, เดือนปัจจุบัน) … เดือนปัจจุบัน + 12', () => {
  const { debts } = sampleData();
  const opts = monthOptions(debts, NOV);
  assert.equal(opts[0], '2026-04');
  assert.equal(opts[opts.length - 1], '2027-11');
  assert.equal(opts.length, 20);
  assert.deepEqual(monthOptions([], NOV).slice(0, 2), ['2026-11', '2026-12']);
});

test('สีหมวดที่เพิ่มเอง: สีถัดไปที่ยังไม่ใช้', () => {
  assert.equal(nextCatColor([...BUILTIN_CATS]), CAT_PALETTE[0]);
  assert.equal(nextCatColor([...BUILTIN_CATS, { key: 'c1', color: '#ff8c00' }]), CAT_PALETTE[1]);
  const all = CAT_PALETTE.map((color, i) => ({ key: `c${i}`, color }));
  assert.ok(CAT_PALETTE.includes(nextCatColor(all)));
});

test('roundDiv / toSafeInt', () => {
  assert.equal(roundDiv(5, 2), 3);
  assert.equal(roundDiv(-5, 2), -3);
  assert.equal(roundDiv(4, 3), 1);
  assert.throws(() => roundDiv(1, 0));
  assert.equal(toSafeInt('900'), 900);
  assert.equal(toSafeInt(-1), 0);
  assert.equal(toSafeInt('abc', 7), 7);
  assert.equal(toSafeInt(null), 0);
});

test('pay ที่บันทึกเกินยอดต้นเดือน (ข้อมูลเก่า) ถูกตัดตอนคำนวณ', () => {
  const d = { id: 'x', initialSatang: 1000, rateBp: 0, startMonth: '2026-01', createdAt: 0 };
  const months = { '2026-01': { payments: { x: 1500 } } };
  assert.equal(pay(d, months, '2026-01'), 1000);
  assert.equal(remainingAfter(d, months, '2026-01'), 0);
  assert.equal(monthTotals([d], months, '2026-01').monthRemaining, 0);
});
