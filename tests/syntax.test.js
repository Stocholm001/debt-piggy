// tests/syntax.test.js — ทุกไฟล์ js ต้อง parse ผ่าน (กันไฟล์ UI ที่เทสต์อื่นไม่ได้ import พังทั้งแอป)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function jsFiles(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(ROOT, p)).isDirectory() ? jsFiles(p) : (f.endsWith('.js') ? [p] : []);
  });
}

test('ทุกไฟล์ใน js/ และ sw.js, firebase-config.js parse ผ่าน', () => {
  const files = [...jsFiles('js'), 'sw.js', 'firebase-config.js'];
  assert.ok(files.length > 30);
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--check', join(ROOT, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}\n${r.stderr}`);
  }
});
