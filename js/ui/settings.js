// ui/settings.js — หน้า "ตั้งค่า" (D08, SPEC ข้อ 3.6) แบบเดียวกับ salary-calc F07
// Phase 2: ชื่อแอป, ซ่อนตัวเลขตอนเปิดแอป และเครื่องมือโหมดทดสอบ
// โปรไฟล์ / เปลี่ยน PIN / ล็อกแอป / ออกจากระบบ ทำใน Phase 3, ติดตั้งลงหน้าจอ / สำรองข้อมูล CSV ทำใน Phase 4

import { html, mount, $, askText, confirmDialog, toast } from './dom.js';
import { icons } from './icons.js';

export function renderSettings(view, app) {
  const hide = app.account.settings.hideOnOpen;

  mount(view, html`
    <header class="head"><h1 class="head__title">ตั้งค่า</h1></header>

    <section class="profile">
      <span class="profile__avatar" aria-hidden="true">${app.testMode ? 'ท' : (app.account.displayName || '?').slice(0, 1)}</span>
      <span class="profile__text">
        <span class="profile__name">${app.testMode ? 'โหมดทดสอบ' : app.account.displayName}</span>
        <span class="profile__sub">${app.testMode ? 'ยังไม่ได้เชื่อม Firebase · ข้อมูลอยู่ในเครื่องนี้เท่านั้น' : 'ล็อกอินอยู่ในเครื่องนี้'}</span>
      </span>
    </section>

    <section class="card card--list">
      <button type="button" class="set-row" id="app-title">
        <span class="set-row__text">
          <span class="set-row__title">ชื่อแอป</span>
          <span class="set-row__sub">${app.account.appTitle}</span>
        </span>
        ${icons.chevronRight(22)}
      </button>
      <div class="set-row">
        <span class="set-row__text" id="hide-label">
          <span class="set-row__title">ซ่อนตัวเลขตอนเปิดแอป</span>
          <span class="set-row__sub">แสดงยอดเงินเป็น •••••• จนกว่าจะกดปุ่มรูปตา</span>
        </span>
        <button type="button" class="switch" role="switch" id="hide-switch" aria-checked="${String(hide)}"
                aria-labelledby="hide-label"></button>
      </div>
    </section>

    ${app.testMode ? html`
      <section class="card card--list">
        <h2 class="card__title card__title--pad">โหมดทดสอบ</h2>
        <button type="button" class="set-row" id="load-sample">
          <span class="set-row__text">
            <span class="set-row__title">ใส่ข้อมูลตัวอย่าง</span>
            <span class="set-row__sub">หนี้ 9 ก้อน ยอดจ่าย เม.ย.–พ.ย. 2569 (แทนข้อมูลเดิมในเครื่องนี้)</span>
          </span>
          ${icons.chevronRight(22)}
        </button>
        <button type="button" class="set-row set-row--danger" id="clear-all">
          <span class="set-row__text">
            <span class="set-row__title">ล้างข้อมูลทั้งหมด</span>
            <span class="set-row__sub">ลบหนี้ ยอดชำระ เงินเดือน และการตั้งค่าในเครื่องนี้</span>
          </span>
          ${icons.trash()}
        </button>
      </section>` : ''}

    ${app.testMode ? '' : html`<p class="hint">ลืม PIN: ให้เจ้าของแอปรีเซ็ตใน Firebase console</p>`}`);

  $('#app-title', view).addEventListener('click', async () => {
    const v = await askText({
      title: 'ชื่อแอป',
      label: 'ชื่อที่แสดงบนหน้าภาพรวม',
      value: app.account.appTitle,
      maxLength: 40,
      validate: (s) => (s ? '' : 'ตั้งชื่อแอปก่อน'),
    });
    if (v == null || v === app.account.appTitle) return;
    await app.saveAccount({ appTitle: v }).catch(() => {});
    document.title = v;
    app.rerender();
  });

  $('#hide-switch', view).addEventListener('click', async (e) => {
    const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
    e.currentTarget.setAttribute('aria-checked', String(on));
    await app.saveAccount({ settings: { ...app.account.settings, hideOnOpen: on } }).catch(() => {});
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
