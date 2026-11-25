// store/firestore.js — เก็บข้อมูลใน Firestore (interface เดียวกับ store/local.js ดูรายละเอียดที่นั่น)
//
// accounts/{uid}                   { displayName, username, firstName, lastName, birthday, appTitle, createdAt, settings, allocCats }
// accounts/{uid}/debts/{debtId}    หนี้ 1 ก้อน
// accounts/{uid}/months/{YYYY-MM}  { salarySatang, allocBp, payments, updatedAt }
//
// เขียนเฉพาะ field ที่เปลี่ยน (เช่น payments.dbt_x) ไม่เขียนทับทั้งเอกสาร
// เปิด 2 เครื่องแก้คนละก้อนในเดือนเดียวกัน ข้อมูลจึงไม่ทับกัน (SPEC ข้อ 2.1 เรื่องที่ 5, 11.3)
//
// รอเซิร์ฟเวอร์ยืนยันไม่เกิน writeWaitMs ถ้าเกิน (ออฟไลน์) ให้ถือว่าเข้าคิวในเครื่องแล้ว
// คืน { queued: true } → แอปขึ้น "บันทึกในเครื่องแล้ว" และ Firestore จะส่งให้เองเมื่อกลับมาออนไลน์

import { sanitizeAccount, sanitizeDebt, sanitizeMonth } from '../sanitize.js';
import { isMonthKey } from '../dates.js';

export const WRITE_WAIT_MS = 4000;

/** ค่าพิเศษใน monthDiff: ลบ field นี้ */
export const DELETE = Symbol('delete');

/**
 * รอการเขียนไม่เกิน ms
 * - สำเร็จทัน → { queued: false }
 * - error ทัน → throw (เช่น permission-denied)
 * - เกินเวลา → { queued: true } ถ้า error มาทีหลังจะเรียก onLateError
 */
export function commitWithin(promise, ms, onLateError = (err) => console.error('เขียน Firestore ไม่สำเร็จ', err)) {
  return new Promise((resolve, reject) => {
    let late = false;
    const timer = setTimeout(() => { late = true; resolve({ queued: true }); }, ms);
    promise.then(
      () => { clearTimeout(timer); if (!late) resolve({ queued: false }); },
      (err) => { clearTimeout(timer); if (late) onLateError(err); else reject(err); },
    );
  });
}

/**
 * field ที่ต่างกันระหว่างเอกสารเดือนเดิมกับใหม่ เป็น path แบบจุด
 * { salarySatang: 3000000, "payments.dbt_a": 400000, "payments.dbt_b": DELETE, "allocBp.living": 4115 }
 */
export function monthDiff(prev, next) {
  const out = {};
  if ((prev.salarySatang ?? 0) !== (next.salarySatang ?? 0)) out.salarySatang = next.salarySatang ?? 0;
  for (const map of ['payments', 'allocBp']) {
    const a = prev[map] ?? {};
    const b = next[map] ?? {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in b)) out[`${map}.${k}`] = DELETE;
      else if (a[k] !== b[k]) out[`${map}.${k}`] = b[k];
    }
  }
  return out;
}

const plainMonth = (doc) => ({
  salarySatang: doc.salarySatang ?? 0,
  allocBp: { ...(doc.allocBp ?? {}) },
  payments: { ...(doc.payments ?? {}) },
});

/**
 * @param fb ผลจาก initFirebase() ใน auth.js
 */
export function createFirestoreStore(fb, uid, { writeWaitMs = WRITE_WAIT_MS } = {}) {
  const { db, F } = fb;
  const accRef = F.doc(db, 'accounts', uid);
  const debtsCol = F.collection(db, 'accounts', uid, 'debts');
  const monthsCol = F.collection(db, 'accounts', uid, 'months');

  /** เอกสารเดือนที่รู้ว่าอยู่บนเซิร์ฟเวอร์ (จากการอ่าน/เขียนล่าสุด) ใช้หา field ที่เปลี่ยน */
  const known = new Map();

  const commit = (promise, onFail = () => {}) => commitWithin(promise, writeWaitMs, (err) => {
    console.error('เขียน Firestore ไม่สำเร็จ', err);
    onFail();
  }).catch((err) => { onFail(); throw err; });

  const toUpdate = (diff) => {
    const data = {};
    for (const [k, v] of Object.entries(diff)) data[k] = v === DELETE ? F.deleteField() : v;
    return data;
  };

  /** ลบ key ออกจาก map ของทุกเดือน (ใน batch เดียวกับงานอื่น) */
  const stripFromMonths = async (batch, map, key) => {
    const snap = await F.getDocs(monthsCol);
    for (const d of snap.docs) {
      if (d.data()?.[map] && key in d.data()[map]) {
        batch.update(d.ref, { [`${map}.${key}`]: F.deleteField(), updatedAt: F.serverTimestamp() });
        const k = known.get(d.id);
        if (k?.[map]) delete k[map][key];
      }
    }
  };

  return {
    kind: 'firestore',

    async getAccount() {
      const raw = (await F.getDoc(accRef)).data() ?? {};
      return {
        ...sanitizeAccount(raw),
        displayName: String(raw.displayName ?? raw.username ?? ''),
        username: String(raw.username ?? ''),
        firstName: String(raw.firstName ?? ''),
        lastName: String(raw.lastName ?? ''),
        birthday: raw.birthday ?? null,
      };
    },

    async saveAccount(patch) {
      return commit(F.setDoc(accRef, JSON.parse(JSON.stringify(patch)), { merge: true }));
    },

    async listDebts() {
      const snap = await F.getDocs(debtsCol);
      return snap.docs.map((d) => sanitizeDebt(d.data(), d.id)).filter(Boolean);
    },

    async saveDebt(debt) {
      const { id, createdAt, ...rest } = debt;
      return commit(F.setDoc(F.doc(debtsCol, id), {
        ...rest,
        createdAt: F.Timestamp.fromMillis(createdAt || Date.now()),
      }));
    },

    async deleteDebt(id) {
      const batch = F.writeBatch(db);
      batch.delete(F.doc(debtsCol, id));
      await stripFromMonths(batch, 'payments', id);
      return commit(batch.commit());
    },

    async clearDebtPayments(id) {
      const batch = F.writeBatch(db);
      await stripFromMonths(batch, 'payments', id);
      return commit(batch.commit());
    },

    async listMonths() {
      const snap = await F.getDocs(monthsCol);
      const out = {};
      known.clear();
      for (const d of snap.docs) {
        if (!isMonthKey(d.id)) continue;
        const doc = sanitizeMonth(d.data());
        if (!doc) continue;
        out[d.id] = doc;
        known.set(d.id, plainMonth(d.data()));
      }
      return out;
    },

    async saveMonth(key, doc) {
      const next = plainMonth(doc);
      const prev = known.get(key);
      const ref = F.doc(monthsCol, key);
      let write;
      if (!prev) {
        // เอกสารใหม่ (หรือยังไม่รู้จัก): merge เพื่อไม่ลบ payments ที่เครื่องอื่นเพิ่งเขียน
        write = F.setDoc(ref, { ...next, updatedAt: F.serverTimestamp() }, { merge: true });
      } else {
        const diff = monthDiff(prev, next);
        if (!Object.keys(diff).length) return { queued: false };
        write = F.updateDoc(ref, { ...toUpdate(diff), updatedAt: F.serverTimestamp() });
      }
      known.set(key, next);
      return commit(write, () => known.delete(key));
    },

    async deleteCat(key) {
      const batch = F.writeBatch(db);
      const acc = (await F.getDoc(accRef)).data() ?? {};
      const cats = Array.isArray(acc.allocCats) ? acc.allocCats.filter((c) => c?.key !== key) : [];
      batch.set(accRef, { allocCats: cats }, { merge: true });
      await stripFromMonths(batch, 'allocBp', key);
      return commit(batch.commit());
    },

    async saveProfile({ firstName, lastName, birthday, displayName }) {
      return commit(F.setDoc(accRef, { firstName, lastName, birthday: birthday ?? null, displayName }, { merge: true }));
    },
  };
}
