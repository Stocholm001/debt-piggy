// ui/settings.js — หน้า "ตั้งค่า" (D08, SPEC ข้อ 3.6) แบบเดียวกับ salary-calc F07
// ติดตั้งลงหน้าจอ และสำรองข้อมูล (CSV) ทำใน Phase 4

import { fullName, formatBirthday } from '../profile.js';
import { LOCK_AFTER_MS } from '../applock.js';
import { html, mount, $, askText, confirmDialog, toast } from './dom.js';
import { icons } from './icons.js';
import { openProfileSheet, openChangePin } from './account-sheets.js';

export function renderSettings(view, app) {
  const acc = app.account;
  const hide = acc.settings.hideOnOpen;
  const online = !app.testMode;
  const name = online ? fullName(acc) : 'โหมดทดสอบ';
  const initial = [...(online ? (acc.firstName || acc.displayName || acc.username || '?') : 'ท')][0];

  const row = (id, title, sub, { cls = '', end = icons.chevronRight(22) } = {}) => html`
    <button type="button" class="set-row ${cls}" id="${id}">
      <span class="set-row__text">
        <span class="set-row__title">${title}</span>
        ${sub ? html`<span class="set-row__sub">${sub}</span>` : ''}
      </span>
      ${end}
    </button>`;

  mount(view, html`
    <header class="head"><h1 class="head__title">ตั้งค่า</h1></header>

    ${online ? html`
      <button type="button" class="profile profile--btn" id="profile">
        <span class="profile__avatar" aria-hidden="true">${initial}</span>
        <span class="profile__text">
          <span class="profile__name">${name}</span>
          <span class="profile__sub">@${acc.username}${acc.birthday ? ` · วันเกิด ${formatBirthday(acc.birthday)}` : ''}</span>
          <span class="profile__sub">ล็อกอินอยู่ในเครื่องนี้ · แตะเพื่อดูโปรไฟล์</span>
        </span>
        ${icons.chevronRight(22)}
      </button>` : html`
      <section class="profile">
        <span class="profile__avatar" aria-hidden="true">${initial}</span>
        <span class="profile__text">
          <span class="profile__name">${name}</span>
          <span class="profile__sub">ยังไม่ได้เชื่อม Firebase · ข้อมูลอยู่ในเครื่องนี้เท่านั้น</span>
        </span>
      </section>`}

    <section class="card card--list">
      ${row('app-title', 'ชื่อแอป', acc.appTitle)}
      <div class="set-row">
        <span class="set-row__text" id="hide-label">
          <span class="set-row__title">ซ่อนตัวเลขตอนเปิดแอป</span>
          <span class="set-row__sub">แสดงยอดเงินเป็น •••••• จนกว่าจะกดปุ่มรูปตา</span>
        </span>
        <button type="button" class="switch" role="switch" id="hide-switch" aria-checked="${String(hide)}"
                aria-labelledby="hide-label"></button>
      </div>
      ${online ? html`
        <div class="set-row">
          <span class="set-row__text">
            <span class="set-row__title">ล็อกแอปอัตโนมัติ</span>
            <span class="set-row__sub">ต้องกรอก PIN เมื่อไม่ได้ใช้เกิน ${LOCK_AFTER_MS / 60000} นาที</span>
          </span>
          <span class="set-row__badge">เปิดอยู่</span>
        </div>` : ''}
    </section>

    ${online ? html`
      <section class="card card--list">
        ${row('change-pin', 'เปลี่ยน PIN', 'ต้องกรอก PIN เดิมก่อน')}
      </section>
      <section class="card card--list">
        ${row('logout', 'ออกจากระบบ', '', { cls: 'set-row--danger', end: icons.chevronRight(22) })}
      </section>
      <p class="hint">ลืม PIN: ให้เจ้าของแอปรีเซ็ตใน Firebase console</p>` : html`
      <section class="card card--list">
        <h2 class="card__title card__title--pad">โหมดทดสอบ</h2>
        ${row('load-sample', 'ใส่ข้อมูลตัวอย่าง', 'หนี้ 9 ก้อน ยอดจ่าย เม.ย.–พ.ย. 2569 (แทนข้อมูลเดิมในเครื่องนี้)')}
        ${row('clear-all', 'ล้างข้อมูลทั้งหมด', 'ลบหนี้ ยอดชำระ เงินเดือน และการตั้งค่าในเครื่องนี้', { cls: 'set-row--danger', end: icons.trash() })}
      </section>`}`);

  $('#app-title', view).addEventListener('click', async () => {
    const v = await askText({
      title: 'ชื่อแอป',
      label: 'ชื่อที่แสดงบนหน้าภาพรวม',
      value: acc.appTitle,
      maxLength: 40,
      validate: (s) => (s ? '' : 'ตั้งชื่อแอปก่อน'),
    });
    if (v == null || v === acc.appTitle) return;
    await app.saveAccount({ appTitle: v }).catch(() => {});
    document.title = v;
    app.rerender();
  });

  $('#hide-switch', view).addEventListener('click', async (e) => {
    const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
    e.currentTarget.setAttribute('aria-checked', String(on));
    await app.saveAccount({ settings: { ...app.account.settings, hideOnOpen: on } }).catch(() => {});
  });

  $('#profile', view)?.addEventListener('click', async () => {
    const value = await openProfileSheet(app.account, (v) => app.saveProfile(v));
    if (value) { toast('บันทึกข้อมูลแล้ว'); app.rerender(); }
  });

  $('#change-pin', view)?.addEventListener('click', () => openChangePin(acc.username));

  $('#logout', view)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'ออกจากระบบ?',
      message: 'ข้อมูลอยู่บนเซิร์ฟเวอร์ ล็อกอินใหม่ด้วยชื่อและ PIN เดิมได้ทุกเมื่อ',
      okLabel: 'ออกจากระบบ',
      tone: 'danger',
    });
    if (!ok) return;
    $('#logout', view).disabled = true;
    await app.logout();
  });

  $('#load-sample', view)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'ใส่ข้อมูลตัวอย่าง?',
      message: 'หนี้และยอดชำระที่มีอยู่ในเครื่องนี้จะถูกแทนด้วยข้อมูลตัวอย่าง',
      okLabel: 'ใส่ข้อมูลตัวอย่าง',
    });
    if (!ok) return;
    await app.loadSample();
    toast('ใส่ข้อมูลตัวอย่างแล้ว');
  });

  $('#clear-all', view)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'ล้างข้อมูลทั้งหมด?',
      message: 'ลบหนี้ ยอดชำระ เงินเดือน และการตั้งค่าในเครื่องนี้ทั้งหมด ลบแล้วเอาคืนไม่ได้',
      okLabel: 'ล้างข้อมูลทั้งหมด',
      tone: 'danger',
    });
    if (!ok) return;
    await app.clearAll();
    toast('ล้างข้อมูลแล้ว');
  });

  return undefined;
}
