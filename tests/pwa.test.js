// tests/pwa.test.js — sw.js / manifest.json / ไอคอน (SPEC ข้อ 9 PWA)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function jsFiles(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(join(ROOT, p)).isDirectory() ? jsFiles(p) : (f.endsWith('.js') ? [p] : []);
  });
}

const shell = () => [...read('sw.js').matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]);

test('sw.js: SHELL มีไฟล์ js ครบทุกไฟล์ (ออฟไลน์ไม่ขาดโมดูล)', () => {
  const list = shell();
  for (const f of jsFiles('js')) assert.ok(list.includes(f), `ขาด ${f} ใน SHELL`);
  for (const f of ['index.html', 'manifest.json', 'firebase-config.js', 'css/style.css']) assert.ok(list.includes(f), f);
});

test('sw.js: ทุกไฟล์ใน SHELL มีอยู่จริง (ไม่งั้น install ล้มทั้งก้อน)', () => {
  for (const f of shell()) if (f) assert.ok(existsSync(join(ROOT, f)), `ไม่มีไฟล์ ${f}`);
});

test('sw.js: network-first ≤ 3 วินาที และไม่แคชคำขอข้ามโดเมน', () => {
  const sw = read('sw.js');
  assert.match(sw, /NETWORK_TIMEOUT_MS = 3000/);
  assert.match(sw, /url\.origin !== self\.location\.origin\) return/);
  assert.match(sw, /debt-piggy-/);
});

test('manifest.json ตาม SPEC', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.name, 'กระปุกปลดหนี้');
  assert.equal(m.short_name, 'ปลดหนี้');
  assert.equal(m.theme_color, '#FFE89A');
  assert.equal(m.background_color, '#FFF8DC');
  assert.equal(m.display, 'standalone');
  for (const i of m.icons) assert.ok(existsSync(join(ROOT, i.src)), i.src);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('ไอคอนเป็น PNG ขนาดตรงตามชื่อ', () => {
  const size = (p) => { const b = readFileSync(join(ROOT, p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(size('icons/icon-512.png'), [512, 512]);
  assert.deepEqual(size('icons/icon-maskable-512.png'), [512, 512]);
  assert.deepEqual(size('icons/icon-192.png'), [192, 192]);
  assert.deepEqual(size('icons/apple-touch-icon.png'), [180, 180]);
  assert.deepEqual(size('icons/favicon-32.png'), [32, 32]);
});
