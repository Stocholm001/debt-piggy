// tests/dates-format.test.js — เทสต์ dates.js และ format.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toBE, toCE, monthKey, parseMonthKey, addMonths, prevMonth, nextMonth,
  monthRange, monthsOfYear, monthLabel, monthShortLabel, monthShortYearLabel, currentMonthKey,
} from '../js/dates.js';
import {
  formatMoney, formatBaht, formatPctOf, formatBp, formatRate, maskMoney, HIDDEN, NO_PCT,
  parseMoney, parsePercent, cleanMoneyTyping, moneyInputValue,
} from '../js/format.js';

test('dates: พ.ศ./ค.ศ. และคีย์เดือน', () => {
  assert.equal(toBE(2026), 2569);
  assert.equal(toCE(2569), 2026);
  assert.equal(monthKey(2026, 4), '2026-04');
  assert.deepEqual(parseMonthKey('2026-11'), { year: 2026, month: 11 });
  for (const bad of ['2026-13', '2026-00', '26-01', '2026-1', '', null, 202604]) {
    assert.equal(parseMonthKey(bad), null, String(bad));
  }
});

test('dates: เลื่อนเดือนข้ามปี (แอปเดิมมีแค่ เม.ย.–ธ.ค. 2026)', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2027-01', -1), '2026-12');
  assert.equal(addMonths('2026-11', 12), '2027-11');
  assert.equal(addMonths('2026-04', -16), '2024-12');
  assert.equal(prevMonth('2026-11'), '2026-10');
  assert.equal(nextMonth('2026-11'), '2026-12');
  assert.throws(() => addMonths('bad', 1));
});

test('dates: ช่วงเดือนและเดือนของปี', () => {
  assert.deepEqual(monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(monthRange('2026-05', '2026-04'), []);
  const y = monthsOfYear(2026);
  assert.equal(y.length, 12);
  assert.equal(y[0], '2026-01');
  assert.equal(y[11], '2026-12');
});

test('dates: ชื่อเดือนไทย', () => {
  assert.equal(monthLabel('2026-11'), 'พฤศจิกายน 2569');
  assert.equal(monthLabel('2027-01'), 'มกราคม 2570');
  assert.equal(monthShortLabel('2026-10'), 'ต.ค.');
  assert.equal(monthShortYearLabel('2026-10'), 'ต.ค. 69');
  assert.equal(currentMonthKey(new Date(2026, 10, 25)), '2026-11');
});

test('format: เงิน 2 ตำแหน่งและบาทเต็ม', () => {
  assert.equal(formatMoney(18200926), '182,009.26');
  assert.equal(formatMoney(0), '0.00');
  assert.equal(formatMoney(5), '0.05');
  assert.equal(formatMoney(-150), '−1.50');
  assert.equal(formatBaht(27370711), '273,707');
  assert.equal(formatBaht(9169785), '91,698'); // ปัดครึ่งขึ้น
  assert.equal(formatBaht(18200926), '182,009');
  assert.equal(formatBaht(50), '1');
  assert.equal(formatBaht(49), '0');
});

test('format: % ความคืบหน้า 1 ตำแหน่ง ปัดครึ่งขึ้น', () => {
  assert.equal(formatPctOf(9169785, 27370711), '33.5%');
  assert.equal(formatPctOf(3200000, 6911758), '46.3%');
  assert.equal(formatPctOf(1, 1), '100.0%');
  assert.equal(formatPctOf(0, 100), '0.0%');
  assert.equal(formatPctOf(3350218, 10000000), '33.5%');
  assert.equal(formatPctOf(3345, 10000), '33.5%'); // 33.45 → 33.5 (ปัดครึ่งขึ้น)
  assert.equal(formatPctOf(0, 0), NO_PCT);
});

test('format: bp และดอกเบี้ย', () => {
  assert.equal(formatBp(4000), '40%');
  assert.equal(formatBp(1250), '12.5%');
  assert.equal(formatBp(4115), '41.15%');
  assert.equal(formatBp(0), '0%');
  assert.equal(formatRate(4000), 'ดอก 40%/ปี');
  assert.equal(formatRate(1250), 'ดอก 12.5%/ปี');
});

test('format: ซ่อนตัวเลข', () => {
  assert.equal(maskMoney('1,000.00', true), HIDDEN);
  assert.equal(maskMoney('1,000.00', false), '1,000.00');
  assert.equal(HIDDEN, '••••••');
});

test('format: แปลงข้อความเป็นสตางค์ (ไม่ผ่าน parseFloat × 100)', () => {
  assert.equal(parseMoney('1,000'), 100000);
  assert.equal(parseMoney('1000.5'), 100050);
  assert.equal(parseMoney(' 12,345.67 '), 1234567);
  assert.equal(parseMoney('17040.16'), 1704016); // 17040.16 * 100 = 1704015.9999999998 ใน float
  assert.equal(parseMoney('0.10'), 10);
  assert.equal(parseMoney('.5'), 50);
  assert.equal(parseMoney('1 000'), 100000);
  assert.equal(parseMoney('1.'), 100);
  for (const bad of ['', ' ', '-5', 'abc', '1.234', '1..2', '.', null, undefined]) {
    assert.equal(parseMoney(bad), null, String(bad));
  }
});

test('format: แปลงข้อความ % เป็น bp', () => {
  assert.equal(parsePercent('12.5'), 1250);
  assert.equal(parsePercent('33'), 3300);
  assert.equal(parsePercent('41.15'), 4115);
  assert.equal(parsePercent('1,5'), null);
  assert.equal(parsePercent('1.234'), null);
});

test('format: กรองข้อความระหว่างพิมพ์', () => {
  assert.equal(cleanMoneyTyping('1,000.567'), '1000.56');
  assert.equal(cleanMoneyTyping('007'), '7');
  assert.equal(cleanMoneyTyping('0'), '0');
  assert.equal(cleanMoneyTyping('.5'), '0.5');
  assert.equal(cleanMoneyTyping('1.2.3'), '1.23');
  assert.equal(cleanMoneyTyping('abc'), '');
  assert.equal(moneyInputValue(100050), '1000.50');
  assert.equal(moneyInputValue(0), '');
});
