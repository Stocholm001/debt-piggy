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
import { getTheme, themeName } from '../theme.js';
import { langToggle, bindLangToggle } from './lang-toggle.js';
import { appTitleOf } from './common.js';
import { t } from '../i18n.js';

export function renderSettings(view, app) {
  const acc = app.account;
  const hide = acc.settings.hideOnOpen;
  const online = !app.testMode;
  const name = online ? fullName(acc) : t('set.localName');

  const row = (id, title, sub, { cls = '', end = icons.chevronRight(22) } = {}) => html`
    <button type="button" class="set-row ${cls}" id="${id}">
      <span class="set-row__text">
        <span class="set-row__title">${title}</span>
        ${sub ? html`<span class="set-row__sub">${sub}</span>` : ''}
      </span>
      ${end}
    </button>`;

  mount(view, html`
    <header class="head"><h1 class="head__title">${t('set.title')}</h1></header>

    <section class="profile">
      <button type="button" class="profile__avatar" id="avatar" aria-label="${t('set.photoChange')}">
        <span id="avatar-img">${avatarInner(acc)}</span>
        <span class="profile__cam" aria-hidden="true">${icons.camera()}</span>
      </button>
      <input type="file" accept="${IMAGE_ACCEPT}" id="photo-file" hidden>
      ${online ? html`
        <button type="button" class="profile__text profile__text--btn" id="profile">
          <span class="profile__name">${name}</span>
          <span class="profile__sub">@${acc.username}${acc.birthday ? ` · ${t('set.birthLine', { date: formatBirthday(acc.birthday) })}` : ''}</span>
          <span class="profile__sub">${t('set.loggedIn')}</span>
        </button>` : html`
        <span class="profile__text">
          <span class="profile__name">${name}</span>
          <span class="profile__sub">${t('set.localSub')}</span>
        </span>`}
    </section>
    <button type="button" class="profile__remove" id="photo-remove" ${acc.photo ? '' : html`hidden`}>${t('set.photoRemove')}</button>

    <section class="card card--list">
      ${row('app-title', t('set.appTitle'), appTitleOf(acc))}
      <div class="set-row">
        <span class="set-row__text"><span class="set-row__title">${t('lang.label')}</span></span>
        <span id="lang-slot">${langToggle()}</span>
      </div>
      ${row('theme', t('set.theme'), themeName(getTheme()))}
      <div class="set-row">
        <span class="set-row__text" id="hide-label">
          <span class="set-row__title">${t('set.hide')}</span>
          <span class="set-row__sub">${t('set.hideSub')}</span>
        </span>
        <button type="button" class="switch" role="switch" id="hide-switch" aria-checked="${String(hide)}"
                aria-labelledby="hide-label"></button>
      </div>
      ${online ? html`
        <div class="set-row">
          <span class="set-row__text">
            <span class="set-row__title">${t('set.lock')}</span>
            <span class="set-row__sub">${t('set.lockSub', { min: LOCK_AFTER_MS / 60000 })}</span>
          </span>
          <span class="set-row__badge">${t('set.on')}</span>
        </div>` : ''}
    </section>

    <section class="card card--list">
      ${online ? row('change-pin', t('set.changePin'), t('set.changePinSub')) : ''}
      <button type="button" class="set-row" id="install">
        <span class="set-row__text">
          <span class="set-row__title">${t('set.install')}</span>
          <span class="set-row__sub" id="install-sub">${t('set.installSub')}</span>
        </span>
        ${icons.chevronRight(22)}
      </button>
      ${row('backup', t('set.backup'), t('set.backupSub'))}
    </section>

    ${online ? html`
      <section class="card card--list">
        ${row('logout', t('set.logout'), '', { cls: 'set-row--danger', end: icons.chevronRight(22) })}
      </section>
      <p class="hint">${t('set.forgotPin')}</p>` : html`
      <section class="card card--list">
        <h2 class="card__title card__title--pad">${t('set.testMode')}</h2>
        ${row('load-sample', t('set.sample'), t('set.sampleSub'))}
        ${row('clear-all', t('set.clear'), t('set.clearSub'), { cls: 'set-row--danger', end: icons.trash() })}
      </section>`}
    <p class="app-version">${t('set.version', { v: appVersion() })}</p>`);

  $('#app-title', view).addEventListener('click', async () => {
    const v = await askText({
      title: t('set.appTitle'),
      label: t('set.appTitleLabel'),
      value: appTitleOf(acc),
      maxLength: 40,
      validate: (s) => (s ? '' : t('set.appTitleReq')),
    });
    if (v == null || v === appTitleOf(acc)) return;
    await app.saveAccount({ appTitle: v }).catch(() => {});
    document.title = v;
    app.rerender();
  });

  // เปลี่ยนภาษา: วาดทั้งแอปใหม่ (เมนูล่างด้วย) และชื่อแท็บเบราว์เซอร์
  bindLangToggle($('#lang-slot', view), () => {
    document.title = appTitleOf(app.account);
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
    if (value) { toast(t('set.profileSaved')); app.rerender(); }
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
    const ok = await confirmDialog({ title: t('photo.removeTitle'), okLabel: t('photo.remove'), tone: 'danger' });
    if (!ok) return;
    try { await setPhoto(null); toast(t('photo.removed')); } catch (err) { console.error(err); toast(t('err.saveFailed')); }
  });
  fileEl.addEventListener('change', async () => {
    const file = fileEl.files?.[0];
    if (!file) return;
    const avatar = $('#avatar', view);
    avatar.setAttribute('aria-busy', 'true');
    toast(t('photo.opening'), 1500);
    let dataUrl;
    try {
      dataUrl = await squarePhoto(file, 256);
    } catch (err) {
      console.error(err);
      toast(err instanceof DecoderLoadError
        ? t('photo.needNet')
        : t('photo.bad'), 3500);
      return;
    } finally {
      avatar.removeAttribute('aria-busy');
    }
    try { await setPhoto(dataUrl); toast(t('photo.saved')); } catch (err) { console.error(err); toast(t('err.saveFailed')); }
  });

  $('#change-pin', view)?.addEventListener('click', () => openChangePin(acc.username));

  // ติดตั้งลงหน้าจอ: สถานะเปลี่ยนได้ทีหลัง (beforeinstallprompt มาช้า / ติดตั้งเสร็จ)
  const installBtn = $('#install', view);
  const installSub = $('#install-sub', view);
  const syncInstall = () => {
    const st = installState();
    installBtn.disabled = st === 'installed';
    installSub.textContent = {
      installed: t('set.installed'),
      ios: t('set.installIos'),
      unsupported: t('set.installNo'),
    }[st] ?? t('set.installSub');
  };
  syncInstall();
  const offInstall = onInstallChange(syncInstall);
  installBtn.addEventListener('click', async () => {
    const st = installState();
    if (st === 'prompt') {
      if (await promptInstall()) toast(t('set.installed'));
      syncInstall();
    } else if (st === 'ios') {
      await confirmDialog({
        title: t('set.iosTitle'),
        message: t('set.iosSteps'),
        okLabel: t('set.gotIt'),
      });
    } else if (st === 'unsupported') {
      toast(t('set.installNoToast'));
    }
  });

  $('#backup', view).addEventListener('click', () => {
    try {
      const file = backupFilename();
      downloadText(file, backupCsv(app.debts, app.months, app.currentKey));
      toast(t('file.saved', { file }));
    } catch (err) {
      console.error(err);
      toast(t('file.failed'));
    }
  });

  $('#logout', view)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: t('set.logoutTitle'),
      message: t('set.logoutMsg'),
      okLabel: t('set.logout'),
      tone: 'danger',
    });
    if (!ok) return;
    $('#logout', view).disabled = true;
    await app.logout();
  });

  $('#load-sample', view)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: t('set.sampleTitle'),
      message: t('set.sampleMsg'),
      okLabel: t('set.sample'),
    });
    if (!ok) return;
    await app.loadSample();
    toast(t('set.sampleDone'));
  });

  $('#clear-all', view)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: t('set.clearTitle'),
      message: t('set.clearMsg'),
      okLabel: t('set.clear'),
      tone: 'danger',
    });
    if (!ok) return;
    await app.clearAll();
    toast(t('set.clearDone'));
  });

  return () => offInstall();
}
