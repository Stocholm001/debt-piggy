// tests/auth-parts.test.js — ส่วนที่เทสต์ได้โดยไม่ต้องต่อ Firebase (Phase 3)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeUsername, validateUsername, usernameToEmail, isValidPin, checkNewUsername,
  getRecentNames, addRecentName, removeRecentName, MAX_RECENT,
} from '../js/username.js';
import { recordFail, lockRemaining, failCount, clearFails, formatWait, MAX_TRIES, LOCK_MS } from '../js/lockout.js';
import { markActive, shouldLock, LOCK_AFTER_MS } from '../js/applock.js';
import { validateProfile, fullName, greetName, formatBirthday } from '../js/profile.js';
import { monthDiff, DELETE, commitWithin } from '../js/store/firestore.js';
import { configProblem, withTimeout } from '../js/auth.js';
import { createMemoryStorage } from '../js/store/local.js';

test('username: normalize และอีเมลภายใน', () => {
  assert.equal(normalizeUsername('  Mali Ja '), 'mali_ja');
  assert.equal(normalizeUsername('มะลิ!'), 'มะลิ');
  assert.equal(validateUsername(''), 'กรอกชื่อผู้ใช้');
  assert.equal(validateUsername('mali'), null);
  assert.equal(usernameToEmail('ab', 'x.example.com'), 'u_6162@x.example.com');
  assert.equal(usernameToEmail('ก', 'x'), 'u_e0b881@x');
  assert.ok(isValidPin('123456'));
  assert.ok(!isValidPin('1234'));
  assert.ok(!isValidPin('12345a'));
});

test('username: กฎชื่อตอนสมัคร (ภาษาอังกฤษตาม salary-calc)', () => {
  assert.deepEqual(checkNewUsername('Mali_01'), { username: 'mali_01', error: null });
  assert.match(checkNewUsername('มะลิ').error, /ภาษาอังกฤษ/);
  assert.match(checkNewUsername('1mali').error, /ขึ้นต้น/);
  assert.match(checkNewUsername('ab').error, /3–20/);
  assert.match(checkNewUsername('ma__li').error, /_/);
  assert.match(checkNewUsername('mali_').error, /_/);
  assert.equal(checkNewUsername('').error, 'กรอกชื่อผู้ใช้');
});

test('username: ชื่อที่ใช้ล่าสุดในเครื่อง สูงสุด 5 ชื่อ ไม่ซ้ำ', () => {
  const s = createMemoryStorage();
  for (let i = 0; i < 7; i++) addRecentName(s, `user${i}`, `user${i}`);
  addRecentName(s, 'User3', 'user3');
  const list = getRecentNames(s);
  assert.equal(list.length, MAX_RECENT);
  assert.equal(list[0].username, 'user3');
  assert.equal(list.filter((r) => r.username === 'user3').length, 1);
  removeRecentName(s, 'user3');
  assert.ok(!getRecentNames(s).some((r) => r.username === 'user3'));
  s.setItem('debt-piggy:recent-names', 'garbage');
  assert.deepEqual(getRecentNames(s), []);
});

test('lockout: PIN ผิด 3 ครั้งล็อก 1 นาที', () => {
  const s = createMemoryStorage();
  const t0 = 1_000_000;
  assert.equal(MAX_TRIES, 3);
  assert.equal(LOCK_MS, 60_000);
  assert.deepEqual(recordFail(s, 'mali', t0), { left: 2, lockedMs: 0 });
  assert.deepEqual(recordFail(s, 'mali', t0), { left: 1, lockedMs: 0 });
  assert.deepEqual(recordFail(s, 'mali', t0), { left: 0, lockedMs: 60_000 });
  assert.equal(lockRemaining(s, 'mali', t0 + 1000), 59_000);
  assert.equal(lockRemaining(s, 'other', t0), 0);
  assert.equal(lockRemaining(s, 'mali', t0 + 60_000), 0);
  assert.equal(failCount(s, 'mali', t0 + 60_000), 0);
  recordFail(s, 'mali', t0 + 61_000);
  clearFails(s, 'mali');
  assert.equal(failCount(s, 'mali', t0 + 62_000), 0);
  assert.equal(formatWait(59_000), '0:59');
  assert.equal(formatWait(60_000), '1:00');
});

test('applock: ไม่ได้ใช้ 5 นาทีต้องล็อก', () => {
  const s = createMemoryStorage();
  assert.equal(LOCK_AFTER_MS, 5 * 60_000);
  assert.equal(shouldLock(s, 'uid1', 1000), true); // ไม่เคยบันทึก
  markActive(s, 'uid1', 1000);
  assert.equal(shouldLock(s, 'uid1', 1000 + 4 * 60_000), false);
  assert.equal(shouldLock(s, 'uid1', 1000 + 5 * 60_000), true);
  assert.equal(shouldLock(s, 'uid1', 1000 - 2 * 60_000), true); // นาฬิกาถอยหลัง
});

test('profile: ตรวจข้อมูลสมัคร', () => {
  const ok = validateProfile({ firstName: ' มะลิ ', lastName: 'ใจดี', birthday: '1997-03-05' }, '2026-11-25');
  assert.deepEqual(ok, { ok: true, value: { firstName: 'มะลิ', lastName: 'ใจดี', birthday: '1997-03-05', displayName: 'มะลิ ใจดี' } });
  const bad = validateProfile({ firstName: '', birthday: '2030-01-01' }, '2026-11-25');
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.firstName, 'กรอกชื่อ');
  assert.equal(bad.errors.birthday, 'วันเกิดต้องไม่เกินวันนี้');
  assert.equal(validateProfile({ firstName: 'a', birthday: '2026-02-30' }).errors.birthday, 'วันเกิดไม่ถูกต้อง');
  assert.equal(fullName({ username: 'mali' }), 'mali');
  assert.equal(greetName({ firstName: 'มะลิ', lastName: 'ใจดี' }), 'มะลิ');
  assert.equal(formatBirthday('1997-03-05'), '5 มีนาคม 2540');
});

test('monthDiff: เขียนเฉพาะ field ที่เปลี่ยน (2 เครื่องแก้คนละก้อนไม่ทับกัน)', () => {
  const prev = { salarySatang: 3000000, allocBp: { debt: 4000, living: 4000 }, payments: { a: 100, b: 200 } };
  assert.deepEqual(monthDiff(prev, structuredClone(prev)), {});
  const next = { salarySatang: 3000000, allocBp: { debt: 4000, living: 4115 }, payments: { a: 150, c: 50 } };
  assert.deepEqual(monthDiff(prev, next), {
    'payments.a': 150, 'payments.b': DELETE, 'payments.c': 50, 'allocBp.living': 4115,
  });
  assert.deepEqual(monthDiff(prev, { ...prev, salarySatang: 0 }), { salarySatang: 0 });
  // ไม่มี key ของก้อนที่ไม่ได้แตะ → เครื่องอื่นแก้ก้อนนั้นได้โดยไม่ถูกทับ
  assert.ok(!('payments.a' in monthDiff(prev, { ...prev, payments: { ...prev.payments, b: 300 } })));
});

test('commitWithin: เกินเวลา = เข้าคิวในเครื่อง (ออฟไลน์)', async () => {
  assert.deepEqual(await commitWithin(Promise.resolve(), 50), { queued: false });
  assert.deepEqual(await commitWithin(new Promise(() => {}), 10), { queued: true });
  await assert.rejects(commitWithin(Promise.reject(new Error('denied')), 50), /denied/);
  let late = null;
  let rejectLate;
  const p = new Promise((_, r) => { rejectLate = r; });
  assert.deepEqual(await commitWithin(p, 10, (e) => { late = e; }), { queued: true });
  rejectLate(new Error('late'));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(late?.message, 'late');
});

test('configProblem: ตรวจค่า firebase-config.js', () => {
  assert.equal(configProblem({
    apiKey: 'AIzaSyDZ7m9pju42XYEw_rrp5LJShADvgJU7-V8', projectId: 'debt-piggy',
    authDomain: 'debt-piggy.firebaseapp.com', appId: '1:786351892620:web:9bbeb7cd9b30887bfb73a9',
  }), null);
  assert.match(configProblem({ apiKey: 'x', projectId: 'debt-piggy', authDomain: 'a', appId: '1:2:web:ab' }), /apiKey/);
});

test('withTimeout: Firestore ค้างนานเกินไป → error "unavailable" (ไม่ค้างหน้าตรวจสอบ)', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
  await assert.rejects(withTimeout(new Promise(() => {}), 10), (e) => e.code === 'unavailable');
  await assert.rejects(withTimeout(Promise.reject(new Error('x')), 50), /x/);
});
