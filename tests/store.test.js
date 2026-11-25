// tests/store.test.js — sanitize.js, store/local.js และฟังก์ชันที่เพิ่มใน Phase 2
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLocalStore, createMemoryStorage } from '../js/store/local.js';
import { sanitizeDebt, sanitizeMonth, sanitizeAccount, DEFAULT_APP_TITLE } from '../js/sanitize.js';
import { sampleData } from '../js/sample-data.js';
import { totals, closedMonth, closedInYear, yearOptions } from '../js/calc.js';
import { formatMoneyTyping, encouragement, moneyFieldValue, pctFieldValue } from '../js/format.js';

test('sanitize: ข้อมูลเพี้ยนไม่ทำให้พัง', () => {
  assert.equal(sanitizeDebt(null), null);
  assert.equal(sanitizeDebt({ account: 'x' }), null); // ไม่มี id
  const d = sanitizeDebt({ account: '  บัตร  ', initialSatang: '1000', rateBp: -5, startMonth: 'bad', createdAt: 'x' }, 'dbt_a');
  assert.deepEqual(d, {
    id: 'dbt_a', creditor: '', account: 'บัตร', initialSatang: 1000, rateBp: 0, due: '',
    startMonth: '2000-01', createdAt: 0,
  });
  assert.equal(sanitizeDebt({ id: 'a', createdAt: { toMillis: () => 42 } }).createdAt, 42);

  assert.equal(sanitizeMonth('x'), null);
  const m = sanitizeMonth({ salarySatang: 'abc', allocBp: { debt: 5000 }, payments: { a: 100, b: 0, 'bad key': 5, c: -1 } });
  assert.equal(m.salarySatang, 0);
  assert.deepEqual(m.allocBp, { debt: 5000, saving: 1000, living: 4000, other: 1000 });
  assert.deepEqual(m.payments, { a: 100 });

  const a = sanitizeAccount({ appTitle: '', allocCats: [{ key: 'debt', label: 'แฮ็ก', builtIn: false }, { key: 'cat_1', label: 'ลงทุน', color: '#00b4d8' }] });
  assert.equal(a.appTitle, DEFAULT_APP_TITLE);
  assert.deepEqual(a.allocCats.map((c) => c.key), ['debt', 'saving', 'living', 'other', 'cat_1']);
  assert.equal(a.allocCats[0].label, 'ชำระหนี้');
  assert.equal(a.allocCats[4].color, '#00B4D8');
  assert.equal(a.settings.hideOnOpen, false);
});

test('local store: บัญชีใหม่ว่างเปล่า', async () => {
  const store = createLocalStore(createMemoryStorage());
  assert.deepEqual(await store.listDebts(), []);
  assert.deepEqual(await store.listMonths(), {});
  const acc = await store.getAccount();
  assert.equal(acc.appTitle, 'กระปุกปลดหนี้');
  assert.equal(acc.allocCats.length, 4);
});

test('local store: บันทึก/อ่าน และใส่ข้อมูลตัวอย่าง', async () => {
  const store = createLocalStore(createMemoryStorage());
  const { debts, months } = sampleData();
  await store.replaceAll({ debts, months });
  const d2 = await store.listDebts();
  const m2 = await store.listMonths();
  assert.equal(d2.length, 9);
  assert.equal(Object.keys(m2).length, 8);
  assert.equal(totals(d2, m2).totalRemaining, 18200926);
  const res = await store.saveMonth('2026-12', { salarySatang: 1, allocBp: {}, payments: {} });
  assert.deepEqual(res, { queued: false });
  assert.ok('2026-12' in (await store.listMonths()));
});

test('local store: ลบหนี้แล้วยอดชำระของก้อนนั้นหายทุกเดือน', async () => {
  const store = createLocalStore(createMemoryStorage());
  await store.replaceAll(sampleData());
  await store.deleteDebt('dbt_sample1');
  const debts = await store.listDebts();
  const months = await store.listMonths();
  assert.ok(!debts.some((d) => d.id === 'dbt_sample1'));
  assert.ok(Object.values(months).every((m) => !('dbt_sample1' in m.payments)));
  assert.ok(Object.values(months).some((m) => 'dbt_sample4' in m.payments));
});

test('local store: เปิดใช้ใหม่ล้างยอดชำระทุกเดือนของก้อนนั้น แต่หนี้ยังอยู่', async () => {
  const store = createLocalStore(createMemoryStorage());
  await store.replaceAll(sampleData());
  await store.clearDebtPayments('dbt_sample2');
  const debts = await store.listDebts();
  const months = await store.listMonths();
  assert.ok(debts.some((d) => d.id === 'dbt_sample2'));
  assert.ok(Object.values(months).every((m) => !('dbt_sample2' in m.payments)));
  assert.equal(totals(debts, months).closedCount, 1);
});

test('local store: ลบหมวดเองแล้ว key หายจากทุกเดือน', async () => {
  const store = createLocalStore(createMemoryStorage());
  const { debts, months } = sampleData();
  for (const m of Object.values(months)) m.allocBp.cat_x = 500;
  await store.replaceAll({ debts, months });
  await store.saveAccount({ allocCats: [{ key: 'cat_x', label: 'ลงทุน', color: '#FF8C00', builtIn: false }] });
  assert.equal((await store.getAccount()).allocCats.length, 5);
  await store.deleteCat('cat_x');
  assert.equal((await store.getAccount()).allocCats.length, 4);
  assert.ok(Object.values(await store.listMonths()).every((m) => !('cat_x' in m.allocBp)));
});

test('local store: ล้างข้อมูลทั้งหมด ไม่แตะคีย์ของแอปอื่น', async () => {
  const storage = createMemoryStorage();
  storage.setItem('salary-calc:x', '1');
  const store = createLocalStore(storage);
  await store.replaceAll(sampleData());
  await store.saveAccount({ appTitle: 'ของฉัน' });
  await store.clearAll();
  assert.deepEqual(await store.listDebts(), []);
  assert.equal((await store.getAccount()).appTitle, 'กระปุกปลดหนี้');
  assert.equal(storage.getItem('salary-calc:x'), '1');
});

test('closedMonth / closedInYear / yearOptions', () => {
  const { debts, months } = sampleData();
  assert.equal(closedMonth(debts[1], months), '2026-08'); // FINNIX
  assert.equal(closedMonth(debts[0], months), null);
  assert.equal(closedInYear(debts, months, 2026), 2);
  assert.equal(closedInYear(debts, months, 2027), 0);
  assert.deepEqual(yearOptions(debts, months, 2026), [2026, 2027]);
  assert.deepEqual(yearOptions([], { '2024-05': {} }, 2026), [2024, 2025, 2026, 2027]);
});

test('formatMoneyTyping: ใส่ comma ระหว่างพิมพ์ ทศนิยมไม่เกิน 2', () => {
  assert.deepEqual(formatMoneyTyping('12345.6'), { value: '12,345.6', caret: 8 });
  assert.equal(formatMoneyTyping('1,000.567').value, '1,000.56');
  assert.equal(formatMoneyTyping('007').value, '7');
  assert.equal(formatMoneyTyping('abc').value, '');
  assert.equal(formatMoneyTyping('1234', 2).caret, 3); // "1,2|34"
  assert.equal(moneyFieldValue(400000), '4,000.00');
  assert.equal(moneyFieldValue(0), '');
  assert.equal(pctFieldValue(1250), '12.5');
  assert.equal(pctFieldValue(null), '');
});

test('ข้อความให้กำลังใจตาม %', () => {
  assert.equal(encouragement(null), '');
  assert.equal(encouragement(0), 'เริ่มจากก้อนดอกแพงที่สุดก่อน');
  assert.equal(encouragement(335), 'มาได้ดี หยอดกระปุกต่อทุกเดือน');
  assert.equal(encouragement(1000), 'ปลดหนี้ครบทุกก้อนแล้ว เก่งมาก');
});
