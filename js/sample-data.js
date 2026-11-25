// sample-data.js — ข้อมูลตัวอย่างตาม SPEC ข้อ 1 (ใช้ในเทสต์ และปุ่ม "ใส่ข้อมูลตัวอย่าง" ในโหมดทดสอบ Phase 2)
// หนี้ 9 ก้อนจาก DEFAULT_DEBTS ของแอปเดิม ยอดจ่ายเป็นตัวเลขสมมติ เม.ย.–พ.ย. 2569 (2026-04 … 2026-11)
//
// ยอดจ่ายรายก้อนรายเดือนแบ่งเองให้ตรงกับตาราง SPEC ข้อ 1 ทุกช่อง (จ่ายสะสม, จ่าย พ.ย., จ่าย ต.ค.)
// และยอดรวมรายเดือนตรงกับ SPEC ทุกเดือน ยกเว้น ต.ค. / ก.ย.:
//   ตาราง "จ่าย ต.ค." รวมได้ 8,100 แต่บรรทัดยอดรวมรายเดือนเขียน ต.ค. 13,000 ซึ่งขัดกันเอง
//   จึงยึดตารางรายก้อน (ต.ค. = 8,100) แล้วย้ายส่วนต่าง 4,900 ไปไว้ ก.ย. (17,900 แทน 13,000)
//   ยอดรวมทั้งปียังเป็น 91,697.85 ตาม SPEC

export const SAMPLE_CURRENT_MONTH = '2026-11';

const BASE_CREATED = Date.UTC(2026, 3, 1); // 1 เม.ย. 2026 — ใช้เรียงตอนดอก/ยอดเท่ากัน

const debt = (n, creditor, account, initialSatang, rateBp, due = '') => ({
  id: `dbt_sample${n}`,
  creditor,
  account,
  initialSatang,
  rateBp,
  due,
  startMonth: '2026-04',
  createdAt: BASE_CREATED + n * 1000,
});

export const SAMPLE_DEBTS = [
  debt(1, 'KTB', 'สินเชื่อ ใจป้ำ 2', 6911758, 4000),
  debt(2, 'SCB', 'FINNIX', 1704016, 3300),
  debt(3, 'Shopee', 'SEasyCash', 1085769, 3300),
  debt(4, 'CIMB', 'บัตรกดเงินสด', 2832655, 2500),
  debt(5, 'Shopee', 'SPayLater', 513824, 2500),
  debt(6, 'KTB', 'สินเชื่อ ใจป้ำ', 5042171, 2000),
  debt(7, 'KRUNGSRI', 'UCHOOSE', 2634478, 1600),
  debt(8, 'SCB', 'CardX SPEEDY CASH', 4047261, 1500, 'ทุกวันที่ 19'),
  debt(9, 'SCB', 'CardX UP2ME', 2598779, 1500, 'ทุกวันที่ 13'),
];

// ยอดจ่าย (บาท) ต่อเดือน: [ก้อน1, ก้อน2, …, ก้อน9]
const PAY_BAHT = {
  //           1     2         3        4     5    6     7     8     9      รวม
  '2026-04': [4000, 3200,    2000,    1000, 500, 0,    0,    0,    500], // 11,200
  '2026-05': [4000, 3600,    2000,    1000, 500, 0,    0,    0,    500], // 11,600
  '2026-06': [4000, 3500,    2000,    1000, 500, 0,    500,  0,    500], // 12,000
  '2026-07': [4000, 3500,    2000,    1000, 500, 0,    500,  0,    500], // 12,000
  '2026-08': [4000, 3240.16, 2857.69, 1000, 500, 800,  500,  0,    500], // 13,397.85 (ปิด FINNIX, SEasyCash)
  '2026-09': [4000, 0,       0,       1000, 0,   4800, 2000, 5600, 500], // 17,900
  '2026-10': [4000, 0,       0,       1000, 500, 800,  500,  800,  500], //  8,100
  '2026-11': [4000, 0,       0,       1000, 0,   0,    0,    0,    500], //  5,500
};

// แปลงบาทในตารางด้านบนเป็นสตางค์ด้วยข้อความ ไม่คูณ float
const toSatang = (baht) => {
  const [i, f = ''] = String(baht).split('.');
  return Number(i) * 100 + Number(f.padEnd(2, '0'));
};

export const SAMPLE_ALLOC_BP = Object.freeze({ debt: 4000, saving: 1000, living: 4000, other: 1000 });

export function sampleMonths() {
  const months = {};
  for (const [key, row] of Object.entries(PAY_BAHT)) {
    const payments = {};
    row.forEach((baht, i) => {
      if (baht > 0) payments[SAMPLE_DEBTS[i].id] = toSatang(baht);
    });
    months[key] = { salarySatang: 3000000, allocBp: { ...SAMPLE_ALLOC_BP }, payments };
  }
  return months;
}

/** สำเนาใหม่ทุกครั้ง แก้ในเทสต์ได้โดยไม่กระทบกัน */
export function sampleData() {
  return { debts: SAMPLE_DEBTS.map((d) => ({ ...d })), months: sampleMonths() };
}
