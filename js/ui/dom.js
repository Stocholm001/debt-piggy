// ui/dom.js — helper เล็ก ๆ สำหรับสร้าง DOM (ยกจาก salary-calc ตัด i18n ออก)

import { formatMoneyTyping } from '../format.js';
import { t } from '../i18n.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** escape ข้อความก่อนใส่ใน template string */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** tagged template: ค่าที่แทรกจะถูก escape ยกเว้นห่อด้วย raw() */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return { __html: out };
}

function render(v) {
  if (v == null || v === false) return '';
  if (v === true) return 'true';
  if (Array.isArray(v)) return v.map(render).join('');
  if (typeof v === 'object' && '__html' in v) return v.__html;
  return esc(v);
}

export const raw = (s) => ({ __html: String(s) });

/** ใส่ html() ลงใน element */
export function mount(el, tpl) {
  el.innerHTML = render(tpl);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * กล่องให้เลือก (<dialog>) คืน Promise ของ value ที่เลือก หรือ null ถ้ายกเลิก
 * options: [{ label, value, tone?: "primary"|"danger"|"plain"|"ghost" }]
 */
export function choose({ title, message = '', options, cancelLabel = t('common.cancel') }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'choice';
    mount(dlg, html`
      <form method="dialog" class="choice__body">
        <h2 class="choice__title">${title}</h2>
        ${message ? html`<p class="choice__msg">${message}</p>` : ''}
        <div class="choice__actions">
          ${options.map((o) => html`
            <button class="btn btn--${o.tone ?? 'plain'}" value="${o.value}">${o.label}</button>`)}
          <button class="btn btn--ghost" value="">${cancelLabel}</button>
        </div>
      </form>`);
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      const v = dlg.returnValue;
      dlg.remove();
      resolve(v === '' ? null : v);
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(''); });
    dlg.showModal();
  });
}

/** ยืนยันแบบ ใช่/ไม่ → Promise<boolean> */
export async function confirmDialog({ title, message = '', okLabel, tone = 'primary' }) {
  return (await choose({ title, message, options: [{ label: okLabel, value: 'ok', tone }] })) === 'ok';
}

/**
 * ช่องกรอกข้อความใน dialog (แทน prompt()) → Promise<string|null>
 * validate(value) คืนข้อความ error หรือ '' ถ้าผ่าน
 */
export function askText({ title, label, value = '', maxLength = 40, okLabel = t('common.save'), validate = () => '' }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'choice';
    mount(dlg, html`
      <form method="dialog" class="choice__body" novalidate>
        <h2 class="choice__title">${title}</h2>
        <label class="field">
          <span class="field__label">${label}</span>
          <input class="input" name="v" maxlength="${maxLength}" value="${value}" autocomplete="off">
          <span class="field__error" aria-live="polite"></span>
        </label>
        <div class="choice__actions">
          <button class="btn btn--primary" value="ok">${okLabel}</button>
          <button class="btn btn--ghost" value="" formnovalidate>${t('common.cancel')}</button>
        </div>
      </form>`);
    document.body.append(dlg);
    const input = $('input', dlg);
    const err = $('.field__error', dlg);
    $('form', dlg).addEventListener('submit', (e) => {
      if (e.submitter?.value !== 'ok') return;
      const msg = validate(input.value.trim());
      if (msg) {
        e.preventDefault();
        err.textContent = msg;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
      }
    });
    dlg.addEventListener('close', () => {
      const ok = dlg.returnValue === 'ok';
      const v = input.value.trim();
      dlg.remove();
      resolve(ok ? v : null);
    });
    dlg.showModal();
    input.select();
  });
}

/** ข้อความแจ้งสั้น ๆ ด้านล่างจอ */
export function toast(text, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('toast--show'));
  setTimeout(() => { el.classList.remove('toast--show'); setTimeout(() => el.remove(), 300); }, ms);
}

/** ให้เบราว์เซอร์ดาวน์โหลดข้อความเป็นไฟล์ (ยกจาก salary-calc) */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // iOS Safari ต้องให้ URL อยู่สักพักก่อนเริ่มดาวน์โหลด
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** ใส่ comma ในช่องเงินตามที่พิมพ์อยู่ โดยคงตำแหน่งเคอร์เซอร์ */
export function applyMoneyTyping(el) {
  if (el.readOnly) return;
  const caret = el.selectionStart ?? el.value.length;
  const r = formatMoneyTyping(el.value, caret);
  if (r.value === el.value) return;
  el.value = r.value;
  if (document.activeElement === el) el.setSelectionRange(r.caret, r.caret);
}

/**
 * ช่องกรอกเงินที่ตรงกับ selector ใน root: กรองตัวอักษรและใส่ comma ทันทีระหว่างพิมพ์
 * ใช้ capture เพื่อให้ทำก่อน listener อื่น ๆ และใช้ได้กับช่องที่วาดใหม่ทีหลัง
 */
export function bindMoneyInputs(root, selector) {
  root.addEventListener('input', (e) => {
    if (e.target.matches?.(selector)) applyMoneyTyping(e.target);
  }, true);
}

/** เปิด bottom sheet (<dialog class="sheet">) คืน dialog ที่ต่อ DOM แล้ว ปิดแล้วลบทิ้งเอง */
export function openSheet(tpl, { labelledBy } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  if (labelledBy) dlg.setAttribute('aria-labelledby', labelledBy);
  mount(dlg, tpl);
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return dlg;
}
