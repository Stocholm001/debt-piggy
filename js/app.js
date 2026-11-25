// app.js — เริ่มแอป, routing 4 แท็บ, ข้อมูลในหน่วยความจำ และการบันทึกอัตโนมัติ
//
// เส้นทาง (hash):
//   #/overview        ภาพรวม (D03)  ← ค่าเริ่มต้น
//   #/month/YYYY-MM   เดือนนี้ (D04)
//   #/year/YYYY       สรุปทั้งปี (D07)
//   #/settings        ตั้งค่า (D08)
// YYYY เป็น ค.ศ. เสมอ
//
// Phase 2: ยังไม่มีล็อกอิน ใช้ store/local.js (โหมดทดสอบ) ทุกครั้ง

import { createLocalStore } from './store/local.js';
import { currentMonthKey, parseMonthKey } from './dates.js';
import { resolveMonth } from './calc.js';
import { sampleData } from './sample-data.js';
import { html, mount, $ } from './ui/dom.js';
import { icons } from './ui/icons.js';
import { renderOverview } from './ui/overview.js';
import { renderMonth } from './ui/month.js';
import { renderYear } from './ui/year.js';
import { renderSettings } from './ui/settings.js';

// โค้ดแอปโหลดครบแล้ว (index.html ใช้ตัดสินว่าจะแสดงหน้า "โหลดไม่สำเร็จ" หรือไม่)
window.__appStarted = true;

const SAVE_DEBOUNCE_MS = 600;

const app = {
  store: null,
  testMode: true,
  account: null,
  debts: [],
  months: {},
  hidden: false,
  currentKey: currentMonthKey(),
  lastMonth: currentMonthKey(),
  overviewTab: 'active',

  navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },

  /** วาดหน้าปัจจุบันใหม่ คงตำแหน่งเลื่อนไว้ */
  rerender() {
    return route({ keepScroll: true });
  },

  setHidden(v) {
    app.hidden = v;
    app.rerender();
  },

  // ---------- เดือน ----------

  /** ข้อมูลเดือนสำหรับแสดงผล (มีเอกสาร หรือร่างจากเดือนก่อนหน้า) */
  monthData(key) {
    return resolveMonth(app.months, key);
  },

  /** สร้างเอกสารเดือนในหน่วยความจำจากร่าง (ตอนผู้ใช้แก้อะไรสักอย่างในเดือนที่ยังไม่บันทึก) */
  ensureMonth(key) {
    if (!app.months[key]) {
      const d = resolveMonth(app.months, key);
      app.months[key] = { salarySatang: d.salarySatang, allocBp: d.allocBp, payments: {} };
    }
    return app.months[key];
  },

  /** ตั้งยอดชำระ (clamp แล้ว) แล้วบันทึกอัตโนมัติแบบ debounce */
  setPayment(key, debtId, satang) {
    const doc = app.ensureMonth(key);
    const prev = doc.payments[debtId] ?? 0;
    if (prev === satang) return;
    if (satang > 0) doc.payments[debtId] = satang;
    else delete doc.payments[debtId];
    scheduleMonthSave(key);
  },

  /**
   * บันทึกเงินเดือน + สัดส่วนงบ
   * scope "forward": allocBp ใช้กับเดือนถัดไปที่บันทึกแล้วด้วย (เงินเดือนเปลี่ยนเฉพาะเดือนนี้)
   */
  async saveSalary(key, { salarySatang, allocBp }, scope = 'this') {
    const doc = app.ensureMonth(key);
    doc.salarySatang = salarySatang;
    doc.allocBp = { ...allocBp };
    const keys = [key];
    if (scope === 'forward') {
      for (const k of Object.keys(app.months)) {
        if (k > key) { app.months[k].allocBp = { ...allocBp }; keys.push(k); }
      }
    }
    await runSave(() => Promise.all(keys.map((k) => app.store.saveMonth(k, app.months[k]))));
  },

  /** เดือนที่บันทึกแล้วหลังเดือนนี้ */
  savedMonthsAfter(key) {
    return Object.keys(app.months).filter((k) => k > key);
  },

  // ---------- หนี้ ----------

  async saveDebt(debt) {
    const i = app.debts.findIndex((d) => d.id === debt.id);
    if (i >= 0) app.debts[i] = debt;
    else app.debts.push(debt);
    await runSave(() => app.store.saveDebt(debt));
  },

  async deleteDebt(id) {
    await flushSaves();
    app.debts = app.debts.filter((d) => d.id !== id);
    for (const doc of Object.values(app.months)) delete doc.payments[id];
    await runSave(() => app.store.deleteDebt(id));
  },

  /** เปิดใช้ใหม่: ล้างยอดชำระทุกเดือนของก้อนนี้ (SPEC ข้อ 12 เรื่องที่ 5) */
  async reopenDebt(id) {
    await flushSaves();
    for (const doc of Object.values(app.months)) delete doc.payments[id];
    await runSave(() => app.store.clearDebtPayments(id));
  },

  // ---------- บัญชี ----------

  async saveAccount(patch) {
    app.account = { ...app.account, ...patch };
    await runSave(() => app.store.saveAccount(patch));
  },

  /** บันทึกรายการหมวดงบ และลบหมวดที่ถูกลบออกจากทุกเดือน */
  async saveCats(allocCats, removedKeys = []) {
    for (const key of removedKeys) {
      for (const doc of Object.values(app.months)) delete doc.allocBp[key];
    }
    app.account = { ...app.account, allocCats };
    await runSave(async () => {
      for (const key of removedKeys) await app.store.deleteCat(key);
      await app.store.saveAccount({ allocCats });
    });
  },

  // ---------- โหมดทดสอบ ----------

  async loadSample() {
    await flushSaves();
    await app.store.replaceAll(sampleData());
    await reload();
  },

  async clearAll() {
    await flushSaves();
    await app.store.clearAll();
    await reload();
  },

  flushSaves: () => flushSaves(),
};

// ---------- บันทึกอัตโนมัติ ----------

const timers = new Map(); // monthKey → timeout id

function scheduleMonthSave(key) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    runSave(() => app.store.saveMonth(key, app.months[key])).catch(() => {}); // แสดงสถานะ error แล้ว
  }, SAVE_DEBOUNCE_MS));
}

/** บันทึกงานที่ค้างทั้งหมดทันที (ก่อนเปลี่ยนหน้า / ซ่อนแท็บ) */
async function flushSaves() {
  const keys = [...timers.keys()];
  for (const key of keys) clearTimeout(timers.get(key));
  timers.clear();
  if (keys.length) await runSave(() => Promise.all(keys.map((k) => app.store.saveMonth(k, app.months[k]))));
}

/** เรียกงานบันทึก แล้วแสดงสถานะหลังบันทึกเสร็จจริงเท่านั้น (SPEC ข้อ 2.1 เรื่องที่ 6) */
async function runSave(fn) {
  try {
    const res = await fn();
    const list = Array.isArray(res) ? res : [res];
    const queued = list.some((r) => r?.queued);
    showStatus(queued ? 'บันทึกในเครื่องแล้ว' : 'บันทึกแล้ว');
  } catch (err) {
    console.error(err);
    showStatus('บันทึกไม่สำเร็จ ลองอีกครั้ง', { error: true });
    throw err;
  }
}

let statusTimer = null;
function showStatus(text, { error = false } = {}) {
  let el = $('#save-status');
  if (!el) {
    el = document.createElement('p');
    el.id = 'save-status';
    el.className = 'save-status';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.toggle('is-error', error);
  el.classList.add('is-visible');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove('is-visible'), error ? 4000 : 1600);
}

// ---------- routing ----------

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'month' && parseMonthKey(parts[1] ?? '')) return { name: 'month', key: parts[1] };
  if (parts[0] === 'month') return { name: 'month', key: app.lastMonth };
  if (parts[0] === 'year' && /^\d{4}$/.test(parts[1] ?? '')) return { name: 'year', year: Number(parts[1]) };
  if (parts[0] === 'year') return { name: 'year', year: Number(app.lastMonth.slice(0, 4)) };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'overview' };
}

function tabbar(active) {
  const year = app.lastMonth.slice(0, 4);
  const tab = (name, href, icon, label) => html`
    <a class="tabbar__item ${active === name ? 'is-active' : ''}" href="${href}"
       ${active === name ? html`aria-current="page"` : ''}>${icon}<span>${label}</span></a>`;
  return html`
    <nav class="tabbar" aria-label="เมนูหลัก">
      ${tab('overview', '#/overview', icons.home(), 'ภาพรวม')}
      ${tab('month', `#/month/${app.lastMonth}`, icons.calendar(), 'เดือนนี้')}
      ${tab('year', `#/year/${year}`, icons.chart(), 'สรุปปี')}
      ${tab('settings', '#/settings', icons.gear(), 'ตั้งค่า')}
    </nav>`;
}

let cleanup = null;
let routeSeq = 0;

/** วาดหน้าตาม hash ปัจจุบัน ไม่ throw: ถ้าพังแสดงข้อความพร้อมปุ่มลองใหม่ */
async function route({ keepScroll = false } = {}) {
  const seq = ++routeSeq;
  const scrollY = window.scrollY;
  if (cleanup) {
    const done = cleanup;
    cleanup = null;
    try { await done(); } catch (err) { console.error(err); }
  }
  await flushSaves().catch(() => {});
  if (seq !== routeSeq) return;

  const r = parseRoute();
  if (r.name === 'month') app.lastMonth = r.key;

  const root = $('#app');
  mount(root, html`<main class="view" id="view"></main>${tabbar(r.name)}`);
  const view = $('#view', root);

  try {
    if (r.name === 'overview') cleanup = renderOverview(view, app);
    else if (r.name === 'month') cleanup = renderMonth(view, app, r.key);
    else if (r.name === 'year') cleanup = renderYear(view, app, r.year);
    else cleanup = renderSettings(view, app);
  } catch (err) {
    console.error(err);
    mount(view, html`
      <div class="empty" role="alert">
        <p>แสดงหน้านี้ไม่สำเร็จ</p>
        <button type="button" class="btn btn--primary" id="route-retry">ลองใหม่</button>
      </div>`);
    $('#route-retry', view).addEventListener('click', () => route());
  }

  window.scrollTo(0, keepScroll ? scrollY : 0);
}

// ---------- เริ่มแอป ----------

async function reload() {
  const [account, debts, months] = await Promise.all([
    app.store.getAccount(), app.store.listDebts(), app.store.listMonths(),
  ]);
  app.account = account;
  app.debts = debts;
  app.months = months;
  document.title = account.appTitle;
  await route({ keepScroll: true });
}

async function start() {
  app.store = createLocalStore(window.localStorage);
  app.account = await app.store.getAccount();
  app.hidden = app.account.settings.hideOnOpen;

  // โหมดทดสอบ: เปิด ?demo=1 ตอนยังไม่มีหนี้ จะใส่ข้อมูลตัวอย่างให้
  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1' && (await app.store.listDebts()).length === 0) {
    await app.store.replaceAll(sampleData());
  }

  window.addEventListener('hashchange', () => route());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSaves().catch(() => {});
  });
  window.addEventListener('pagehide', () => { flushSaves().catch(() => {}); });
  await reload();
}

start().catch((err) => {
  console.error(err);
  mount($('#app'), html`
    <main class="login"><div class="login__hero"><h1 class="login__title">กระปุกปลดหนี้</h1>
    <p class="login__sub">เปิดแอปไม่สำเร็จ</p></div>
    <button type="button" class="btn btn--primary btn--block" id="retry">ลองใหม่</button></main>`);
  $('#retry').addEventListener('click', () => location.reload());
});
