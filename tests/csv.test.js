// tests/csv.test.js — csv.js (SPEC ข้อ 9)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOM, csvMoney, csvPct, csvCell, toCsv, yearCsv, yearCsvFilename, backupCsv, backupFilename,
} from '../js/csv.js';
import { sampleData } from '../js/sample-data.js';

const lines = (csv) => csv.replace(BOM, '').trimEnd().split('\r\n');

test('ตัวเลขใน CSV ไม่มี comma คั่นหลัก', () => {
  assert.equal(csvMoney(18200926), '182009.26');
  assert.equal(csvMoney(5), '0.05');
  assert.equal(csvMoney(-150), '-1.50');
  assert.equal(csvPct(3300), '33');
  assert.equal(csvPct(1250), '12.5');
});

test('csvCell: escape และกันสูตร Excel', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-บัตร'), "'-บัตร");
  assert.equal(csvCell({ num: '-1.50' }), '-1.50');
  assert.equal(csvCell(null), '');
});

test('toCsv: UTF-8 มี BOM คั่นด้วย comma ขึ้นบรรทัด CRLF', () => {
  const csv = toCsv([['ก', 'ข'], ['1', '2']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv, '\uFEFFก,ข\r\n1,2\r\n');
});

test('สรุปปี: debt-2569.csv เฉพาะเดือนที่บันทึก + แถวรวม', () => {
  const { debts, months } = sampleData();
  assert.equal(yearCsvFilename(2026), 'debt-2569.csv');
  const l = lines(yearCsv(debts, months, 2026));
  assert.equal(l[0], 'เดือน,ยอดต้นเดือนรวม,ชำระรวม,คงเหลือปลายเดือน,เงินเดือน,งบชำระหนี้');
  assert.equal(l.length, 1 + 8 + 1);
  assert.equal(l[1], 'เมษายน 2569,273707.11,11200.00,262507.11,30000.00,12000.00');
  assert.equal(l[8], 'พฤศจิกายน 2569,187509.26,5500.00,182009.26,30000.00,12000.00');
  assert.equal(l[9], 'รวมปี 2569,,91697.85,182009.26,240000.00,96000.00');
});

test('สำรองทั้งหมด: แถวละ (เดือน × หนี้) เรียงตามลำดับการจ่าย', () => {
  const { debts, months } = sampleData();
  assert.equal(backupFilename(new Date(2026, 10, 5)), 'debt-backup-20261105.csv');
  const l = lines(backupCsv(debts, months, '2026-11'));
  assert.equal(l[0], 'เดือน(YYYY-MM),เจ้าหนี้,ชื่อบัญชี,ดอก %/ปี,ยอดตั้งต้น,ยอดต้นเดือน,ชำระ,คงเหลือหลังชำระ');
  assert.equal(l.length, 1 + 8 * 9); // เม.ย.–พ.ย. × 9 ก้อน
  assert.equal(l[1], '2026-04,KTB,สินเชื่อ ใจป้ำ 2,40,69117.58,69117.58,4000.00,65117.58');
  const novFinnix = l.find((r) => r.startsWith('2026-11,SCB,FINNIX'));
  assert.equal(novFinnix, '2026-11,SCB,FINNIX,33,17040.16,0.00,0.00,0.00');
  const novKtb = l.find((r) => r.startsWith('2026-11,KTB,สินเชื่อ ใจป้ำ 2'));
  assert.equal(novKtb, '2026-11,KTB,สินเชื่อ ใจป้ำ 2,40,69117.58,41117.58,4000.00,37117.58');
  // ไม่มีหนี้ → มีแค่หัวตาราง
  assert.equal(lines(backupCsv([], {}, '2026-11')).length, 1);
  // เดือนปัจจุบันเลยเดือนที่บันทึก → มีแถวถึงเดือนปัจจุบัน
  assert.ok(lines(backupCsv(debts, months, '2027-01')).some((r) => r.startsWith('2027-01,')));
});
