// app.js — เริ่มแอป, routing 4 แท็บ, ข้อมูลในหน่วยความจำ และการบันทึกอัตโนมัติ
//
// เส้นทาง (hash):
//   #/overview        ภาพรวม (D03)  ← ค่าเริ่มต้น
//   #/month/YYYY-MM   เดือนนี้ (D04)
//   #/year/YYYY       สรุปทั้งปี (D07)
//   #/settings        ตั้งค่า (D08)
// YYYY เป็น ค.ศ. เสมอ
//
// มีค่าใน firebase-config.js → ล็อกอินด้วยชื่อ + PIN แล้วใช้ store/firestore.js
// ไม่มีค่า → "โหมดทดสอบ" ใช้ store/local.js ไม่มีหน้าล็อกอิน

import { createLocalStore } from './store/local.js';
import { createFirestoreStore } from './store/firestore.js';
import { isConfigured, configProblem, initFirebase, currentUser, signOut } from './auth.js';
import { greetName } from './profile.js';
import { renderLogin } from './ui/login.js';
import { createAppLock } from './ui/lock-screen.js';
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

  // ---------- บัญชีผู้ใช้ (Firebase) ----------

  async saveProfile(value) {
    app.account = { ...app.account, ...value };
    await runSave(() => app.store.saveProfile(value));
  },

  async logout() {
    await flushSaves().catch(() => {});
    await signOut();
    location.hash = '';
    location.reload();
  },
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

let lastLoad = 0;

async function reload() {
  const [account, debts, months] = await Promise.all([
    app.store.getAccount(), app.store.listDebts(), app.store.listMonths(),
  ]);
  app.account = account;
  app.debts = debts;
  app.months = months;
  lastLoad = Date.now();
  document.title = account.appTitle;
  await route({ keepScroll: true });
}

let started = false;

/** เริ่มส่วนแอปหลังรู้แล้วว่าใช้ store ไหน */
async function startApp(store) {
  app.store = store;
  app.account = await store.getAccount();
  app.hidden = app.account.settings.hideOnOpen;
  if (!started) {
    started = true;
    window.addEventListener('hashchange', () => route());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushSaves().catch(() => {});
      } else if (!app.testMode && Date.now() - lastLoad > RELOAD_AFTER_MS && timers.size === 0
                 && !document.querySelector('dialog[open]')) {
        // กลับมาที่แอปหลังไปนานแล้ว: โหลดข้อมูลใหม่ (เผื่อแก้จากเครื่องอื่น)
        reload().catch((err) => console.error(err));
      }
    });
    window.addEventListener('pagehide', () => { flushSaves().catch(() => {}); });
  }
  await reload();
}

const RELOAD_AFTER_MS = 60 * 1000;

function showFatal(text) {
  mount($('#app'), html`
    <main class="login"><div class="login__hero"><h1 class="login__title">กระปุกปลดหนี้</h1>
    <p class="login__sub">${text}</p></div>
    <button type="button" class="btn btn--primary btn--block" id="retry">ลองใหม่</button></main>`);
  $('#retry').addEventListener('click', () => location.reload());
}

/** โหมดทดสอบ: ยังไม่ได้ใส่ค่าใน firebase-config.js หรือเปิด ?local=1 บนเครื่องตัวเอง (localhost เท่านั้น) */
function useLocalMode() {
  if (!isConfigured()) return true;
  const isDevHost = ['localhost', '127.0.0.1'].includes(location.hostname);
  return isDevHost && new URLSearchParams(location.search).get('local') === '1';
}

async function start() {
  if (useLocalMode()) {
    app.testMode = true;
    const store = createLocalStore(window.localStorage);
    // เปิด ?demo=1 ตอนยังไม่มีหนี้ จะใส่ข้อมูลตัวอย่างให้
    if (new URLSearchParams(location.search).get('demo') === '1' && (await store.listDebts()).length === 0) {
      await store.replaceAll(sampleData());
    }
    await startApp(store);
    return;
  }

  app.testMode = false;
  const problem = configProblem();
  if (problem) { showFatal(problem); return; }

  mount($('#app'), html`<p class="boot" role="status">กำลังโหลด…</p>`);
  let fb;
  let user;
  try {
    fb = await initFirebase();
    user = await currentUser();
  } catch (err) {
    console.error(err);
    showFatal('โหลดแอปไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่');
    return;
  }

  /** @param restored true = เปิดแอปด้วย session เดิม (ไม่ได้เพิ่งกรอก PIN) → ล็อกก่อนถ้าไม่ได้ใช้นานพอ */
  const enter = async (restored) => {
    const uid = fb.auth.currentUser.uid;
    try {
      const store = createFirestoreStore(fb, uid);
      const account = await store.getAccount();
      const lock = createAppLock({
        uid,
        username: account.username,
        name: greetName(account) || account.username,
        onLogout: () => app.logout(),
      });
      // ล็อกก่อนวาดหน้าแรก ข้อมูลจะได้ไม่โผล่ให้เห็นก่อนใส่ PIN
      if (restored && lock.needsLock()) {
        mount($('#app'), html``);
        await lock.lock();
      } else {
        lock.markActive();
      }
      lock.start();
      await startApp(store);
    } catch (err) {
      console.error(err);
      showFatal(err?.code === 'permission-denied'
        ? 'ไม่มีสิทธิ์อ่านข้อมูล (ตรวจ firestore.rules ใน Firebase console)'
        : 'โหลดข้อมูลไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่');
    }
  };

  if (user) await enter(true);
  else renderLogin($('#app'), { onSignedIn: () => enter(false) });
}

start().catch((err) => {
  console.error(err);
  showFatal('เปิดแอปไม่สำเร็จ');
});
