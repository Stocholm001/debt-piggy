// ui/common.js — ชิ้นส่วนที่ใช้หลายหน้า: หัวหน้า + ปุ่มตา, ป้ายลำดับ, บรรทัดรองของหนี้, เงินแบบซ่อนได้

import { formatMoney, formatBaht, formatRate, HIDDEN } from '../format.js';
import { html, $ } from './dom.js';
import { icons } from './icons.js';

/** เงิน 2 ตำแหน่ง ซ่อนเป็น •••••• เมื่อเปิดซ่อนตัวเลข */
export const money = (app, satang) => (app.hidden ? HIDDEN : formatMoney(satang));
/** เงินบาทเต็ม ซ่อนได้ */
export const baht = (app, satang) => (app.hidden ? HIDDEN : formatBaht(satang));

/** หัวหน้า: บรรทัดเล็ก + ชื่อหน้า + ปุ่มตา (ซ่อน/แสดงตัวเลข) */
export function header(app, { eyebrow, title, eye = true }) {
  return html`
    <header class="head">
      <div class="head__text">
        <p class="head__eyebrow">${eyebrow}</p>
        <h1 class="head__title">${title}</h1>
      </div>
      ${eye ? html`
        <button type="button" class="icon-btn" id="eye-btn" aria-pressed="${String(app.hidden)}"
                aria-label="${app.hidden ? 'แสดงตัวเลข' : 'ซ่อนตัวเลข'}">
          ${app.hidden ? icons.eyeOff() : icons.eye()}
        </button>` : ''}
    </header>`;
}

/** ผูกปุ่มตาในหัวหน้า */
export function bindEye(root, app) {
  $('#eye-btn', root)?.addEventListener('click', () => app.setHidden(!app.hidden));
}

/** ป้ายลำดับวงกลม: อันดับ 1 สี accent, ก้อนที่ปิดแล้วสีเขียว + เครื่องหมายถูก */
export function rankBadge(rank, closed) {
  if (closed) {
    return html`<span class="rank rank--closed" aria-label="ปิดแล้ว">${icons.check(18)}</span>`;
  }
  return html`<span class="rank ${rank === 1 ? 'rank--first' : ''}" aria-label="ลำดับที่ ${rank}">${rank}</span>`;
}

/** บรรทัดรอง: "KTB · ดอก 40%/ปี · ทุกวันที่ 19" (ไม่มีข้อมูลส่วนไหนก็ไม่แสดงส่วนนั้น) */
export function debtSubline(debt) {
  return [debt.creditor, formatRate(debt.rateBp), debt.due].filter(Boolean).join(' · ');
}

/** id ใหม่แบบสุ่ม (prefix_xxxxxxxxxx) */
export function newId(prefix) {
  const rand = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12)
    ?? Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

/** สีของหมวดงบ: หมวดในตัวใช้สีของธีม (design/THEMES.md) หมวดที่เพิ่มเองใช้สีที่เก็บไว้ */
const BUILTIN_CAT_VAR = { debt: 'var(--accent)', saving: 'var(--paid)', living: 'var(--bar)', other: 'var(--pig-dark)' };
export const catColor = (c) => BUILTIN_CAT_VAR[c.key] ?? c.color;
