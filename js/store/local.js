// store/local.js — เก็บข้อมูลใน localStorage (โหมดทดสอบ Phase 2 / ตอน firebase-config.js ยังว่าง)
//
// Interface เดียวกับ store/firestore.js (Phase 3) ทุกเมธอดเป็น async:
//   kind                          "local" | "firestore"
//   getAccount()                  → { displayName, username, appTitle, settings: { hideOnOpen }, allocCats }
//   saveAccount(patch)            ← patch ของ { appTitle, settings, allocCats }
//   listDebts()                   → debt[]  (ผ่าน sanitizeDebt แล้ว)
//   saveDebt(debt)                ← สร้าง/แก้ทั้งก้อน
//   deleteDebt(id)                ← ลบหนี้ และลบ key ของก้อนนั้นออกจาก payments ทุกเดือน (SPEC ข้อ 6.3)
//   clearDebtPayments(id)         ← "เปิดใช้ใหม่": ลบยอดชำระทุกเดือนของก้อนนั้น (SPEC ข้อ 12 เรื่องที่ 5)
//   listMonths()                  → { "YYYY-MM": monthDoc }  (ผ่าน sanitizeMonth แล้ว)
//   saveMonth(key, doc)           → { queued }  queued = true: บันทึกในเครื่องแล้วแต่ยังไม่ขึ้นเซิร์ฟเวอร์ (ออฟไลน์)
//   deleteCat(key)                ← ลบหมวดจาก allocCats และ key ออกจาก allocBp ทุกเดือน
// เฉพาะโหมดทดสอบ:
//   replaceAll({ debts, months }) ← แทนข้อมูลทั้งหมด (ปุ่มใส่ข้อมูลตัวอย่าง)
//   clearAll()                    ← ล้างข้อมูลทั้งหมด

import { sanitizeAccount, sanitizeDebt, sanitizeMonth } from '../sanitize.js';
import { isMonthKey } from '../dates.js';

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * @param storage อ็อบเจกต์แบบ localStorage (getItem/setItem/removeItem/key/length)
 * @param ns      prefix ของคีย์
 */
export function createLocalStore(storage = globalThis.localStorage, ns = 'debt-piggy') {
  const k = (...parts) => [ns, ...parts].join(':');

  const read = (key, fallback = null) => {
    const raw = storage.getItem(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  };
  const write = (key, value) => storage.setItem(key, JSON.stringify(value));

  const keysWithPrefix = (prefix) => {
    const out = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) out.push(key);
    }
    return out;
  };

  const monthPrefix = k('months', '');
  const debtPrefix = k('debts', '');

  /** แก้ทุกเอกสารเดือนด้วย fn(doc) → true ถ้ามีการเปลี่ยน */
  const updateAllMonths = (fn) => {
    for (const key of keysWithPrefix(monthPrefix)) {
      const doc = read(key);
      if (doc && typeof doc === 'object' && fn(doc)) write(key, { ...doc, updatedAt: Date.now() });
    }
  };

  return {
    kind: 'local',

    async getAccount() {
      return {
        ...sanitizeAccount(read(k('account'))),
        displayName: 'โหมดทดสอบ',
        username: 'local',
      };
    },

    async saveAccount(patch) {
      const cur = read(k('account'), {}) ?? {};
      write(k('account'), { ...cur, ...clone(patch) });
    },

    async listDebts() {
      return keysWithPrefix(debtPrefix)
        .map((key) => sanitizeDebt(read(key), key.slice(debtPrefix.length)))
        .filter(Boolean);
    },

    async saveDebt(debt) {
      write(k('debts', debt.id), clone(debt));
    },

    async deleteDebt(id) {
      storage.removeItem(k('debts', id));
      updateAllMonths((doc) => {
        if (!doc.payments || !(id in doc.payments)) return false;
        delete doc.payments[id];
        return true;
      });
    },

    async clearDebtPayments(id) {
      updateAllMonths((doc) => {
        if (!doc.payments || !(id in doc.payments)) return false;
        delete doc.payments[id];
        return true;
      });
    },

    async listMonths() {
      const out = {};
      for (const key of keysWithPrefix(monthPrefix)) {
        const mk = key.slice(monthPrefix.length);
        const doc = isMonthKey(mk) ? sanitizeMonth(read(key)) : null;
        if (doc) out[mk] = doc;
      }
      return out;
    },

    async saveMonth(key, doc) {
      write(k('months', key), { ...clone(doc), updatedAt: Date.now() });
      return { queued: false };
    },

    async deleteCat(key) {
      const cur = read(k('account'), {}) ?? {};
      const cats = Array.isArray(cur.allocCats) ? cur.allocCats.filter((c) => c?.key !== key) : [];
      write(k('account'), { ...cur, allocCats: cats });
      updateAllMonths((doc) => {
        if (!doc.allocBp || !(key in doc.allocBp)) return false;
        delete doc.allocBp[key];
        return true;
      });
    },

    async replaceAll({ debts, months }) {
      for (const key of [...keysWithPrefix(debtPrefix), ...keysWithPrefix(monthPrefix)]) storage.removeItem(key);
      for (const d of debts) write(k('debts', d.id), clone(d));
      for (const [key, doc] of Object.entries(months)) write(k('months', key), { ...clone(doc), updatedAt: Date.now() });
    },

    async clearAll() {
      for (const key of keysWithPrefix(k(''))) storage.removeItem(key);
    },
  };
}

/** storage ในหน่วยความจำ ใช้ในเทสต์ */
export function createMemoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    clear: () => map.clear(),
  };
}
