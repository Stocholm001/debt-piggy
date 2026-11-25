// tests/migrate.test.js — SPEC ข้อ 11.2
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateState, legacyMonthKey, legacyBahtToSatang, legacyPctToBp, debtIdFor,
  legacyRemainingTotal, DEFAULT_APP_TITLE,
} from '../js/migrate.js';
import { opening, totals, priorityOrder, BUILTIN_CATS } from '../js/calc.js';
import { sampleData } from '../js/sample-data.js';

const BASE = Date.UTC(2026, 10, 25);

/** state แอปเดิมสร้างจากข้อมูลตัวอย่างข้อ 1 (เงินเป็นบาท float, id 1–9, เดือน "04"–"12" แบบ defaultState เดิม) */
function legacyStateFromSample() {
  const { debts, months } = sampleData();
  const idOf = new Map(debts.map((d, i) => [d.id, i + 1]));
  const legacyMonths = {};
  for (const mm of ['04', '05', '06', '07', '08', '09', '10', '11', '12']) {
    const doc = months[`2026-${mm}`];
    const payments = {};
    for (const [id, satang] of Object.entries(doc?.payments ?? {})) payments[idOf.get(id)] = satang / 100;
    legacyMonths[mm] = {
      salary: doc ? doc.salarySatang / 100 : 0,
      alloc: { debt: 40, saving: 10, living: 40, other: 10 },
      payments,
    };
  }
  return {
    months: legacyMonths,
    debts: debts.map((d, i) => ({
      id: i + 1, creditor: d.creditor, account: d.account, initial: d.initialSatang / 100,
      rate: d.rateBp / 100, due: d.due, priority: i + 1,
    })),
    appTitle: 'แผนบริหารหนี้ชินจัง',
    nextId: 10,
  };
}

test('11.2 #1 months key "04" → 2026-04', () => {
  assert.equal(legacyMonthKey('04'), '2026-04');
  assert.equal(legacyMonthKey('12'), '2026-12');
  assert.equal(legacyMonthKey('13'), null);
  assert.equal(legacyMonthKey('4'), null);
  const out = migrateState({ months: { '04': { salary: 30000, alloc: {}, payments: {} } } });
  assert.deepEqual(Object.keys(out.months), ['2026-04']);
});

test('11.2 #2 initial 17040.16, rate 33 → 1704016 สตางค์, 3300 bp', () => {
  assert.equal(legacyBahtToSatang(17040.16), 1704016);
  assert.equal(legacyPctToBp(33), 3300);
  const out = migrateState({ debts: [{ id: 2, creditor: 'SCB', account: 'FINNIX', initial: 17040.16, rate: 33, due: '', priority: 2 }] }, { createdAtBase: BASE });
  assert.deepEqual(out.debts, [{
    id: 'dbt_l2', creditor: 'SCB', account: 'FINNIX', initialSatang: 1704016, rateBp: 3300,
    due: '', startMonth: '2026-04', createdAt: BASE, legacyId: 2,
  }]);
  assert.ok(!('priority' in out.debts[0]));
});

test('11.2 #3 alloc 40 / 12.5 → 4000 / 1250 bp', () => {
  assert.equal(legacyPctToBp(40), 4000);
  assert.equal(legacyPctToBp(12.5), 1250);
  assert.equal(legacyPctToBp(33.33), 3333);
  const out = migrateState({ months: { '05': { salary: 0, alloc: { debt: 40, saving: 12.5, living: 37.5, other: 10 }, payments: {} } } });
  assert.deepEqual(out.months['2026-05'].allocBp, { debt: 4000, saving: 1250, living: 3750, other: 1000 });
});

test('11.2 #4 payments { "8": 800 } → payments[<dbtId ของ legacyId 8>] = 80000', () => {
  const out = migrateState({
    debts: [{ id: 8, creditor: 'SCB', account: 'CardX SPEEDY CASH', initial: 40472.61, rate: 15, due: 'ทุกวันที่ 19' }],
    months: { '10': { salary: 30000, alloc: { debt: 40, saving: 10, living: 40, other: 10 }, payments: { 8: 800, 99: 500 } } },
  });
  const id = out.debts.find((d) => d.legacyId === 8).id;
  assert.equal(id, debtIdFor(8));
  assert.deepEqual(out.months['2026-10'].payments, { [id]: 80000 }); // id 99 ไม่มีหนี้แล้ว → ทิ้ง
});

test('11.2 #5 customCats 1 หมวด → อยู่ใน allocCats, builtIn false', () => {
  const out = migrateState({
    customCats: [{ key: 'cat_m1abc', label: 'ลงทุน', color: '#FF8C00', defaultPct: 0 }],
    months: { '06': { salary: 30000, alloc: { debt: 40, saving: 10, living: 30, other: 10, cat_m1abc: 10 }, payments: {} } },
  });
  assert.deepEqual(out.account.allocCats.map((c) => c.key), ['debt', 'saving', 'living', 'other', 'cat_m1abc']);
  assert.deepEqual(out.account.allocCats[4], { key: 'cat_m1abc', label: 'ลงทุน', color: '#FF8C00', builtIn: false });
  assert.ok(out.account.allocCats.slice(0, 4).every((c) => c.builtIn === true));
  assert.equal(out.months['2026-06'].allocBp.cat_m1abc, 1000);
  assert.ok(!('defaultPct' in out.account.allocCats[4]));
});

test('11.2 #6 เดือนที่ว่างทั้งหมด → ไม่สร้างเอกสาร', () => {
  const out = migrateState({
    debts: [{ id: 1, creditor: 'KTB', account: 'ใจป้ำ', initial: 1000, rate: 20 }],
    customCats: [{ key: 'cat_a', label: 'ท่องเที่ยว', color: '#00B4D8' }],
    months: {
      '04': { salary: 0, alloc: { debt: 40, saving: 10, living: 40, other: 10, cat_a: 0 }, payments: {} }, // ค่าเริ่มต้น
      '05': { salary: 0, alloc: {}, payments: {} },                                                 // alloc ว่าง = ค่าเริ่มต้นในแอปเดิม
      '06': { salary: 0, alloc: { debt: 40, saving: 10, living: 40, other: 10 }, payments: { 1: 0 } }, // จ่าย 0
      '07': { salary: 0, alloc: { debt: 50, saving: 10, living: 30, other: 10 }, payments: {} },       // แก้สัดส่วน → สร้าง
      '08': { salary: 0, alloc: {}, payments: { 1: 100 } },                                          // มีจ่าย → สร้าง
      '09': { salary: 25000, alloc: {}, payments: {} },                                              // มีเงินเดือน → สร้าง
    },
  });
  assert.deepEqual(Object.keys(out.months).sort(), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(out.months['2026-08'].allocBp, { debt: 4000, saving: 1000, living: 4000, other: 1000, cat_a: 0 });
});

test('11.2 #7 state ว่าง / ไม่มี debts → บัญชีว่าง ไม่ error', () => {
  for (const st of [undefined, null, {}, { debts: null, months: null }, { debts: [], months: {} }, 'garbage']) {
    const out = migrateState(st, { createdAtBase: BASE });
    assert.deepEqual(out.debts, [], String(st));
    assert.deepEqual(out.months, {});
    assert.equal(out.account.appTitle, DEFAULT_APP_TITLE);
    assert.deepEqual(out.account.allocCats.map((c) => c.key), BUILTIN_CATS.map((c) => c.key));
  }
  assert.equal(legacyRemainingTotal(null), 0);
});

test('11.2 #8 initialOverride → openingOverride และ opening ของเดือนนั้นตรงกับค่าเดิม', () => {
  const out = migrateState({
    debts: [{ id: 1, creditor: 'KTB', account: 'สินเชื่อ ใจป้ำ 2', initial: 69117.58, rate: 40 }],
    months: {
      '04': { salary: 30000, alloc: {}, payments: { 1: 4000 } },
      '05': { salary: 30000, alloc: {}, payments: { 1: 4000 }, initialOverride: { 1: 70500.25 } },
      '06': { salary: 30000, alloc: {}, payments: {} },
    },
  });
  const d = out.debts[0];
  assert.deepEqual(out.months['2026-05'].openingOverride, { [d.id]: 7050025 });
  assert.equal(opening(d, out.months, '2026-05'), 7050025);
  assert.equal(opening(d, out.months, '2026-06'), 6911758 - 800000); // เดือนถัดไปคิดตามปกติเหมือนแอปเดิม
  assert.ok(!('openingOverride' in out.months['2026-04']));
  // เดือนที่มีแค่ override (ไม่มีเงินเดือน/ยอดจ่าย) ยังต้องสร้าง เพื่อไม่ให้ยอดต้นเดือนเปลี่ยน
  const only = migrateState({
    debts: [{ id: 1, account: 'x', initial: 100, rate: 0 }],
    months: { '07': { salary: 0, alloc: {}, payments: {}, initialOverride: { 1: 0 } } },
  });
  assert.deepEqual(only.months['2026-07'].openingOverride, { dbt_l1: 0 });
});

// ---------- เพิ่มเติมนอก 11.2 ----------

test('แปลงข้อมูลตัวอย่างทั้งก้อน: ยอดรวมและลำดับตรงกับแอปใหม่ และตรงกับยอดที่แอปเดิมคำนวณ', () => {
  const legacy = legacyStateFromSample();
  const out = migrateState(legacy, { createdAtBase: BASE });
  const t = totals(out.debts, out.months);
  assert.equal(t.totalInitial, 27370711);
  assert.equal(t.totalPaid, 9169785);
  assert.equal(t.totalRemaining, 18200926);
  assert.equal(t.closedCount, 2);
  assert.equal(legacyRemainingTotal(legacy), t.totalRemaining);
  assert.deepEqual(Object.keys(out.months).sort(), [
    '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
  ]); // ธ.ค. ว่าง → ไม่สร้าง
  assert.deepEqual(priorityOrder(out.debts, out.months).map((x) => x.debt.legacyId), [1, 4, 5, 6, 7, 8, 9, 2, 3]);
  // ไม่มีฟิลด์เดิมที่ต้องทิ้งหลุดมา
  assert.ok(!('nextId' in out.account) && !('preAprOverride' in out.account));
  // บัญชีที่ย้ายมาใช้ appTitle เดิม (SPEC ข้อ 12 เรื่องที่ 3)
  assert.equal(out.account.appTitle, 'แผนบริหารหนี้ชินจัง');
});

test('แปลงซ้ำได้ผลเดิม (ลองใหม่หลังเขียนพังได้โดยไม่มีหนี้ซ้ำ)', () => {
  const legacy = legacyStateFromSample();
  assert.deepEqual(migrateState(legacy, { createdAtBase: BASE }), migrateState(legacy, { createdAtBase: BASE }));
  const ids = migrateState(legacy, { createdAtBase: BASE }).debts.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ค่าเพี้ยนจากแอปเดิม: string, float เพี้ยน, ติดลบ, ค่าว่าง', () => {
  assert.equal(legacyBahtToSatang(0.1 + 0.2), 30);
  assert.equal(legacyBahtToSatang('1,000.5'), 100050);
  assert.equal(legacyBahtToSatang(-5), 0);
  assert.equal(legacyBahtToSatang(''), 0);
  assert.equal(legacyBahtToSatang(undefined), 0);
  assert.equal(legacyBahtToSatang(NaN), 0);
  const out = migrateState({
    debts: [{ id: '3', creditor: ' Shopee ', account: '', initial: '10857.69', rate: '33' }, { creditor: 'no id' }, { id: 3, account: 'dup' }],
    customCats: [{ key: 'debt', label: 'ซ้ำหมวดหลัก' }, { key: 'bad key!', label: 'x' }, { key: 'cat_ok', label: 'ok' }],
  });
  assert.equal(out.debts.length, 1);
  assert.equal(out.debts[0].creditor, 'Shopee');
  assert.equal(out.debts[0].account, 'Shopee');
  assert.equal(out.debts[0].initialSatang, 1085769);
  assert.equal(out.debts[0].legacyId, 3);
  assert.deepEqual(out.account.allocCats.map((c) => c.key), ['debt', 'saving', 'living', 'other', 'cat_ok']);
  assert.match(out.account.allocCats[4].color, /^#[0-9A-F]{6}$/);
});
