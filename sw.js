// sw.js — service worker สำหรับไฟล์ static โดเมนตัวเอง (ยกจาก salary-calc, SPEC ข้อ 9)
// คำขอข้ามโดเมน (Firebase, gstatic, Google Fonts) ปล่อยผ่าน ไม่แคช
//
// กลยุทธ์: network-first + timeout
//   ออนไลน์ → ได้ไฟล์ล่าสุดเสมอ (deploy ใหม่แล้วไม่ต้องล้างแคช) และอัปเดตแคชไปด้วย
//   ออฟไลน์/เน็ตช้าเกิน NETWORK_TIMEOUT_MS → ใช้ไฟล์จากแคช
// VERSION เปลี่ยนเฉพาะเมื่อต้องการล้างแคชเก่าทิ้งทั้งหมด (เช่น เปลี่ยนรายการ SHELL)
// เพิ่มไฟล์ใน js/ แล้วต้องเพิ่มใน SHELL ด้วย (tests/pwa.test.js ตรวจให้)

const VERSION = 'v1';
const CACHE = `debt-piggy-${VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './firebase-config.js',
  './css/style.css',
  './css/themes.css',
  './js/app.js',
  './js/applock.js',
  './js/auth.js',
  './js/calc.js',
  './js/csv.js',
  './js/dates.js',
  './js/format.js',
  './js/i18n.js',
  './js/lockout.js',
  './js/profile.js',
  './js/pwa.js',
  './js/sample-data.js',
  './js/sanitize.js',
  './js/store/firestore.js',
  './js/store/local.js',
  './js/theme.js',
  './js/ui/account-sheets.js',
  './js/ui/avatar.js',
  './js/ui/common.js',
  './js/ui/debt-sheet.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/image-load.js',
  './js/ui/lang-toggle.js',
  './js/ui/lock-screen.js',
  './js/ui/login.js',
  './js/ui/month.js',
  './js/ui/overview.js',
  './js/ui/pinpad.js',
  './js/ui/salary-sheet.js',
  './js/ui/settings.js',
  './js/ui/theme-sheet.js',
  './js/ui/year.js',
  './js/username.js',
  './js/version.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('debt-piggy-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('network timeout')), ms));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ข้ามโดเมน: ปล่อยให้เบราว์เซอร์จัดการเอง

  // หน้า HTML (รวม #/month/... ที่เป็น hash) ใช้ index.html ตัวเดียว
  const isNav = req.mode === 'navigate';
  const key = isNav ? './index.html' : req;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req), timeout(NETWORK_TIMEOUT_MS)]);
      // เก็บหน้า navigate เป็น index.html เฉพาะตอนเปิดหน้าแอปจริง (path ลงท้ายด้วย / หรือ index.html)
      const cacheable = res.ok && res.type === 'basic' && (!isNav || /\/(index\.html)?$/.test(url.pathname));
      if (cacheable) await cache.put(key, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(key, { ignoreSearch: isNav });
      if (hit) return hit;
      throw err;
    }
  })());
});
