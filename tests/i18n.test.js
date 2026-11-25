// tests/i18n.test.js — ข้อความไทย/อังกฤษครบทุกคีย์ และทุกคีย์ที่โค้ดเรียกมีอยู่จริง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { t, setLang, getLang, initLang, missingKeys, allKeys } from '../js/i18n.js';
import { monthLabel, monthShortLabel, yearLabel } from '../js/dates.js';
import { formatRate, encouragement } from '../js/format.js';
import { yearCsv } from '../js/csv.js';
import { sampleData } from '../js/sample-data.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const jsFiles = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
});

test('i18n: ไทยและอังกฤษมีคีย์ตรงกัน', () => {
  assert.deepEqual(missingKeys(), { en: [], th: [] });
});

test('i18n: ทุก t("คีย์") ในโค้ดมีในพจนานุกรม', () => {
  const keys = new Set(allKeys());
  const missing = [];
  for (const file of jsFiles(join(ROOT, 'js'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.-]+)'/g)) if (!keys.has(m[1])) missing.push(`${file}: ${m[1]}`);
    // คีย์ที่เก็บเป็นข้อความแล้วค่อยแปล (เช่น สถานะในหน้าเดือนนี้, หัว CSV)
    for (const m of src.matchAll(/'((?:st|csv)\.[\w-]+)'/g)) if (!keys.has(m[1])) missing.push(`${file}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('i18n: สลับภาษาแล้วเดือน/ปี/ดอกเบี้ย/CSV เปลี่ยนตาม', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(initLang(storage), 'th');
  assert.equal(monthLabel('2026-11'), 'พฤศจิกายน 2569');
  assert.equal(yearLabel(2026), 'พ.ศ. 2569');
  setLang('en', storage);
  assert.equal(getLang(), 'en');
  assert.equal(initLang(storage), 'en');
  assert.equal(monthLabel('2026-11'), 'November 2026');
  assert.equal(monthShortLabel('2026-10'), 'Oct');
  assert.equal(yearLabel(2026), '2026');
  assert.equal(formatRate(1250), '12.5%/yr');
  assert.equal(encouragement(0), t('cheer.zero'));
  assert.equal(t('ov.ringCount', { closed: 2, total: 9 }), '2 of 9 debts');
  const { debts, months } = sampleData();
  const csv = yearCsv(debts, months, 2026);
  assert.ok(csv.includes('Month,Total at month start'));
  assert.ok(csv.includes('Total 2026'));
  setLang('xx', storage);
  assert.equal(getLang(), 'th');
});
