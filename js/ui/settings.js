// ui/settings.js — หน้า "ตั้งค่า" (D08, SPEC ข้อ 3.6) แบบเดียวกับ salary-calc F07

import { fullName, formatBirthday } from '../profile.js';
import { LOCK_AFTER_MS } from '../applock.js';
import { backupCsv, backupFilename } from '../csv.js';
import { installState, promptInstall, onInstallChange } from '../pwa.js';
import { appVersion } from '../version.js';
import { html, mount, $, askText, confirmDialog, toast, downloadText } from './dom.js';
import { avatarInner, squarePhoto } from './avatar.js';
import { IMAGE_ACCEPT, DecoderLoadError } from './image-load.js';
import { icons } from './icons.js';
import { openProfileSheet, openChangePin } from './account-sheets.js';
import { openThemeSheet } from './theme-sheet.js';
import { THEMES, getTheme } from '../theme.js';

const themeLabel = () => THEMES.find((x) => x.id === getTheme())?.label ?? '';

export function renderSettings(view, app) {
  const acc = app.account;
  const hide = acc.settings.hideOnOpen;
  const online = !app.testMode;
  const name = online ? fullName(acc) : 'โหมดทดสอบ';

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

    <section class="profile">
      <button type="button" class="profile__avatar" id="avatar" aria-label="เปลี่ยนรูปโปรไฟล์">
        <span id="avatar-img">${avatarInner(acc)}</span>
        <span class="profile__cam" aria-hidden="true">${icons.camera()}</span>
      </button>
      <input type="file" accept="${IMAGE_ACCEPT}" id="photo-file" hidden>
      ${online ? html`
        <button type="button" class="profile__text profile__text--btn" id="profile">
          <span class="profile__name">${name}</span>
          <span class="profile__sub">@${acc.username}${acc.birthday ? ` · วันเกิด ${formatBirthday(acc.birthday)}` : ''}</span>
          <span class="profile__sub">ล็อกอินอยู่ในเครื่องนี้ · แตะเพื่อดูโปรไฟล์</span>
        </button>` : html`
        <span class="profile__text">
          <span class="profile__name">${name}</span>
          <span class="profile__sub">ยังไม่ได้เชื่อม Firebase · ข้อมูลอยู่ในเครื่องนี้เท่านั้น</span>
        </span>`}
    </section>
    <button type="button" class="profile__remove" id="photo-remove" ${acc.photo ? '' : html`hidden`}>ลบรูปโปรไฟล์</button>

    <section class="card card--list">
      ${row('app-title', 'ชื่อแอป', acc.appTitle)}
      ${row('theme', 'ธีมสี', themeLabel())}
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

    <section class="card card--list">
      ${online ? row('change-pin', 'เปลี่ยน PIN', 'ต้องกรอก PIN เดิมก่อน') : ''}
      <button type="button" class="set-row" id="install">
        <span class="set-row__text">
          <span class="set-row__title">ติดตั้งลงหน้าจอ</span>
          <span class="set-row__sub" id="install-sub">ใช้เหมือนแอปบนมือถือ</span>
        </span>
        ${icons.chevronRight(22)}
      </button>
      ${row('backup', 'สำรองข้อมูล (CSV)', 'หนี้และยอดชำระทุกเดือน')}
    </section>

    ${online ? html`
      <section class="card card--list">
        ${row('logout', 'ออกจากระบบ', '', { cls: 'set-row--danger', end: icons.chevronRight(22) })}
      </section>
      <p class="hint">ลืม PIN: ให้เจ้าของแอปรีเซ็ตใน Firebase console</p>` : html`
      <section class="card card--list">
        <h2 class="card__title card__title--pad">โหมดทดสอบ</h2>
        ${row('load-sample', 'ใส่ข้อมูลตัวอย่าง', 'หนี้ 9 ก้อน ยอดจ่าย เม.ย.–พ.ย. 2569 (แทนข้อมูลเดิมในเครื่องนี้)')}
        ${row('clear-all', 'ล้างข้อมูลทั้งหมด', 'ลบหนี้ ยอดชำระ เงินเดือน และการตั้งค่าในเครื่องนี้', { cls: 'set-row--danger', end: icons.trash() })}
      </section>`}
    <p class="app-version">เวอร์ชัน ${appVersion()}</p>`);

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

  $('#theme', view).addEventListener('click', async () => {
    await openThemeSheet();
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

  // รูปโปรไฟล์: กดวงกลม → เลือกรูป ย่อเหลือ 256×256 แล้วเก็บในเอกสารบัญชี
  const fileEl = $('#photo-file', view);
  const setPhoto = async (dataUrl) => {
    await app.savePhoto(dataUrl);
    mount($('#avatar-img', view), avatarInner(app.account));
    $('#photo-remove', view).hidden = !dataUrl;
  };
  // ต้องเปิดตัวเลือกไฟล์ใน handler ของการกดโดยตรง (Safari ไม่ยอมเปิดถ้ามี await คั่น)
  $('#avatar', view).addEventListener('click', () => {
    fileEl.value = '';
    fileEl.click();
  });
  $('#photo-remove', view).addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'ลบรูปโปรไฟล์?', okLabel: 'ลบรูป', tone: 'danger' });
    if (!ok) return;
    try { await setPhoto(null); toast('ลบรูปแล้ว'); } catch (err) { console.error(err); toast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'); }
  });
  fileEl.addEventListener('change', async () => {
    const file = fileEl.files?.[0];
    if (!file) return;
    const avatar = $('#avatar', view);
    avatar.setAttribute('aria-busy', 'true');
    toast('กำลังเปิดรูป…', 1500);
    let dataUrl;
    try {
      dataUrl = await squarePhoto(file, 256);
    } catch (err) {
      console.error(err);
      toast(err instanceof DecoderLoadError
        ? 'รูปแบบนี้ต้องต่ออินเทอร์เน็ตเพื่อแปลงไฟล์ ลองใหม่อีกครั้ง'
        : 'เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่น', 3500);
      return;
    } finally {
      avatar.removeAttribute('aria-busy');
    }
    try { await setPhoto(dataUrl); toast('บันทึกรูปแล้ว'); } catch (err) { console.error(err); toast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'); }
  });

  $('#change-pin', view)?.addEventListener('click', () => openChangePin(acc.username));

  // ติดตั้งลงหน้าจอ: สถานะเปลี่ยนได้ทีหลัง (beforeinstallprompt มาช้า / ติดตั้งเสร็จ)
  const installBtn = $('#install', view);
  const installSub = $('#install-sub', view);
  const syncInstall = () => {
    const st = installState();
    installBtn.disabled = st === 'installed';
    installSub.textContent = {
      installed: 'ติดตั้งแล้ว',
      ios: 'iPhone/iPad: กดเพื่อดูวิธีเพิ่มไปยังหน้าจอโฮม',
      unsupported: 'เปิดด้วย Chrome หรือ Safari บนมือถือเพื่อติดตั้ง',
    }[st] ?? 'ใช้เหมือนแอปบนมือถือ';
  };
  syncInstall();
  const offInstall = onInstallChange(syncInstall);
  installBtn.addEventListener('click', async () => {
    const st = installState();
    if (st === 'prompt') {
      if (await promptInstall()) toast('ติดตั้งแล้ว');
      syncInstall();
    } else if (st === 'ios') {
      await confirmDialog({
        title: 'ติดตั้งบน iPhone/iPad',
        message: [
          '1. เปิดหน้านี้ใน Safari',
          '2. กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบด้านล่าง',
          '3. เลือก "เพิ่มไปยังหน้าจอโฮม" แล้วกด "เพิ่ม"',
        ].join('\n'),
        okLabel: 'เข้าใจแล้ว',
      });
    } else if (st === 'unsupported') {
      toast('เบราว์เซอร์นี้ติดตั้งไม่ได้ ลองเปิดด้วย Chrome หรือ Safari');
    }
  });

  $('#backup', view).addEventListener('click', () => {
    try {
      const file = backupFilename();
      downloadText(file, backupCsv(app.debts, app.months, app.currentKey));
      toast(`บันทึกไฟล์ ${file} แล้ว`);
    } catch (err) {
      console.error(err);
      toast('ส่งออกไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  });

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

  return () => offInstall();
}
