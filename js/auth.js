// auth.js — ล็อกอินชื่อ + PIN 6 หลัก ผ่าน Firebase Authentication (SPEC ข้อ 7.1, ยกจาก salary-calc)
// PIN ไม่ถูกเก็บใน Firestore หรือ localStorage เลย Firebase Auth ดูแลในฐานะรหัสผ่าน
// session ใช้ browserLocalPersistence ของ Firebase (แก้ localStorage แล้วสวมรอยคนอื่นไม่ได้)

import { firebaseConfig, AUTH_EMAIL_DOMAIN } from '../firebase-config.js';
import { usernameToEmail } from './username.js';
import { BUILTIN_CATS } from './calc.js';
import { DEFAULT_APP_TITLE, DEFAULT_SETTINGS } from './sanitize.js';

export const SDK_VERSION = '13.4.0'; // เวอร์ชันเดียวกับ salary-calc
const SDK = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

export const isConfigured = () => Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId);

/** ตรวจว่าค่าใน firebase-config.js ดูเป็นค่าจริง คืนข้อความปัญหา หรือ null ถ้าดูถูกต้อง */
export function configProblem(c = firebaseConfig ?? {}) {
  const bad = [];
  if (!/^AIza[\w-]{30,}$/.test(c.apiKey ?? '')) bad.push('apiKey');
  if (!/^[a-z0-9-]{4,}$/.test(c.projectId ?? '')) bad.push('projectId');
  if (!/^[\w.-]+$/.test(c.authDomain ?? '')) bad.push('authDomain');
  if (!/^\d+:\d+:web:[0-9a-f]+$/.test(c.appId ?? '')) bad.push('appId');
  return bad.length ? `ค่าใน firebase-config.js ไม่ถูกต้อง: ${bad.join(', ')}` : null;
}

let fb = null;

/** โหลด SDK จาก CDN แล้ว init (เรียกซ้ำได้ คืนตัวเดิม) */
export async function initFirebase() {
  if (fb) return fb;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.initializeAuth(app, { persistence: authMod.browserLocalPersistence });
  const db = initDb(fsMod, app);
  fb = { app, auth, db, A: authMod, F: fsMod };
  return fb;
}

/**
 * Firestore แบบ offline persistence (cache ใน IndexedDB): เปิดแอปตอนออฟไลน์ยังอ่านข้อมูลที่เคยโหลดได้
 * และงานเขียนที่ค้างอยู่จะไม่หายเมื่อปิดแอป ถ้าเบราว์เซอร์ไม่รองรับให้ใช้แบบปกติ
 */
function initDb(fsMod, app) {
  try {
    return fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn('Firestore offline cache ใช้ไม่ได้:', err);
    return fsMod.getFirestore(app);
  }
}

/** ผู้ใช้ปัจจุบันหลัง Firebase อ่าน session เสร็จ (null ถ้ายังไม่ล็อกอิน) */
export function currentUser() {
  const { auth, A } = fb;
  return new Promise((resolve) => {
    const off = A.onAuthStateChanged(auth, (user) => { off(); resolve(user); });
  });
}

export const LOOKUP_TIMEOUT_MS = 15000;

/** รอ promise ไม่เกิน ms ถ้าเกินให้ throw { code: "unavailable" } (กันหน้าค้าง "กำลังตรวจสอบ…" ตลอดไป) */
export function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'unavailable' })), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** ชื่อนี้มีบัญชีแล้วหรือยัง */
export async function usernameExists(username) {
  const { db, F } = fb;
  const snap = await withTimeout(F.getDoc(F.doc(db, 'usernames', username)), LOOKUP_TIMEOUT_MS);
  return snap.exists();
}

export async function signIn(username, pin) {
  const { auth, A } = fb;
  const cred = await A.signInWithEmailAndPassword(auth, usernameToEmail(username, AUTH_EMAIL_DOMAIN), pin);
  await ensureAccountDocs(cred.user.uid, username, { displayName: username });
  return cred.user;
}

/**
 * ผู้ใช้ใหม่: สร้างบัญชี แล้วสร้าง usernames/{username} และ accounts/{uid}
 * @param profile ผลจาก validateProfile(): { firstName, lastName, birthday, displayName }
 * ถ้าบัญชีมีอยู่แล้วแต่เอกสารยังไม่ครบ (เช่น เน็ตหลุดตอนสมัครครั้งก่อน) จะลองล็อกอินด้วย PIN นี้แล้วซ่อมเอกสารให้
 */
export async function signUp(username, profile, pin) {
  const { auth, A } = fb;
  const email = usernameToEmail(username, AUTH_EMAIL_DOMAIN);
  let user;
  try {
    user = (await A.createUserWithEmailAndPassword(auth, email, pin)).user;
  } catch (err) {
    if (err?.code !== 'auth/email-already-in-use') throw err;
    user = (await A.signInWithEmailAndPassword(auth, email, pin)).user;
  }
  await ensureAccountDocs(user.uid, username, profile);
  return user;
}

/** สร้าง usernames/{username} และ accounts/{uid} ถ้ายังไม่มี (SPEC ข้อ 6.2) */
async function ensureAccountDocs(uid, username, profile) {
  const { db, F } = fb;
  const nameRef = F.doc(db, 'usernames', username);
  const accRef = F.doc(db, 'accounts', uid);
  const [nameSnap, accSnap] = await Promise.all([F.getDoc(nameRef), F.getDoc(accRef)]);
  if (!nameSnap.exists()) await F.setDoc(nameRef, { uid });
  if (!accSnap.exists()) {
    await F.setDoc(accRef, {
      displayName: String(profile.displayName ?? '').trim() || username,
      username,
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      birthday: profile.birthday ?? null,
      appTitle: DEFAULT_APP_TITLE,
      createdAt: F.serverTimestamp(),
      settings: { ...DEFAULT_SETTINGS },
      allocCats: BUILTIN_CATS.map((c) => ({ ...c })),
    });
  }
}

/** ตรวจ PIN เดิม (reauthenticate) */
export async function verifyPin(pin) {
  const { auth, A } = fb;
  const user = auth.currentUser;
  await A.reauthenticateWithCredential(user, A.EmailAuthProvider.credential(user.email, pin));
}

/** เปลี่ยน PIN (ต้อง verifyPin ก่อน) */
export async function changePin(newPin) {
  const { auth, A } = fb;
  await A.updatePassword(auth.currentUser, newPin);
}

export async function signOut() {
  if (!fb) return;
  const { auth, A } = fb;
  await A.signOut(auth);
}

const WRONG_PIN = ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found'];

/** error นี้คือ PIN ผิดหรือไม่ (ให้จุดสั่นแล้วล้างค่า) */
export const isWrongPin = (err) => WRONG_PIN.includes(err?.code);

/** แปลง error ของ Firebase เป็นข้อความภาษาไทย */
export function authErrorMessage(err) {
  if (isWrongPin(err)) return 'PIN ไม่ถูกต้อง ลองใหม่';
  switch (err?.code) {
    case 'auth/too-many-requests':
      return 'ลองผิดหลายครั้ง รอสักครู่แล้วลองใหม่';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'ยังไม่ได้เปิด Email/Password ใน Firebase console';
    case 'auth/requires-recent-login':
      return 'กรุณากรอก PIN เดิมอีกครั้ง';
    case 'permission-denied':
      return 'ไม่มีสิทธิ์เข้าถึงข้อมูล (ตรวจ firestore.rules)';
    default:
      return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
  }
}
