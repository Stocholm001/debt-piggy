// firebase-config.js — ค่า config ของ Firebase project ใหม่ของกระปุกปลดหนี้ (debt-piggy, SPEC ข้อ 12 เรื่องที่ 1)
// ค่าพวกนี้เปิดเผยได้ ความปลอดภัยอยู่ที่ firestore.rules
//
// วิธีเอาค่า: Firebase console → Project settings → General → Your apps → Web app → SDK setup and configuration → Config
// ถ้า apiKey ว่าง แอปจะเปิดใน "โหมดทดสอบ" เก็บข้อมูลใน localStorage และไม่มีหน้าล็อกอิน

export const firebaseConfig = {
  apiKey: 'AIzaSyDZ7m9pju42XYEw_rrp5LJShADvgJU7-V8',
  authDomain: 'debt-piggy.firebaseapp.com',
  projectId: 'debt-piggy',
  storageBucket: 'debt-piggy.firebasestorage.app',
  messagingSenderId: '786351892620',
  appId: '1:786351892620:web:9bbeb7cd9b30887bfb73a9',
};

// โดเมนสมมติสำหรับอีเมลภายใน (ไม่มีการส่งอีเมลจริง) ชื่อ → u_<hex>@<โดเมนนี้>
// ห้ามเปลี่ยนหลังมีผู้ใช้แล้ว ไม่งั้นทุกคนจะล็อกอินไม่ได้
export const AUTH_EMAIL_DOMAIN = 'debt-piggy.example.com';
