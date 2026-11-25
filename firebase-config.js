// firebase-config.js — ค่า config ของ Firebase project ใหม่ของกระปุกปลดหนี้ (SPEC ข้อ 12 เรื่องที่ 1)
// ค่าพวกนี้เปิดเผยได้ ความปลอดภัยอยู่ที่ firestore.rules
//
// ยังว่างไว้จนถึง Phase 3 (ห้ามแตะ Firebase ก่อนหน้านั้น)
// วิธีเอาค่า: Firebase console → Project settings → General → Your apps → Web app → SDK setup and configuration → Config
// ถ้า apiKey ยังว่าง แอปจะเปิดใน "โหมดทดสอบ" เก็บข้อมูลใน localStorage และไม่มีหน้าล็อกอิน

export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// โดเมนสมมติสำหรับอีเมลภายใน (ไม่มีการส่งอีเมลจริง)
// ห้ามเปลี่ยนหลังมีผู้ใช้แล้ว ไม่งั้นทุกคนจะล็อกอินไม่ได้
export const AUTH_EMAIL_DOMAIN = 'debt-piggy.example.com'; // ค่าชั่วคราว ยืนยันอีกครั้งใน Phase 3
