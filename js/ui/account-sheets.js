// ui/account-sheets.js — หน้าต่างโปรไฟล์ และเปลี่ยน PIN (ยกจาก salary-calc)

import { verifyPin, changePin, authErrorMessage, isWrongPin } from '../auth.js';
import { lockRemaining, recordFail, clearFails, formatWait } from '../lockout.js';
import { validateProfile, todayIso } from '../profile.js';
import { html, mount, $, openSheet, toast } from './dom.js';
import { icons } from './icons.js';
import { createPinPad } from './pinpad.js';
import { t } from '../i18n.js';

/**
 * โปรไฟล์: ดูชื่อผู้ใช้ และแก้ ชื่อ / นามสกุล / วันเกิด
 * @param save async (value) => void
 * @returns Promise ของค่าที่บันทึกแล้ว หรือ null ถ้ายกเลิก
 */
export function openProfileSheet(account, save) {
  return new Promise((resolve) => {
    let result = null;
    const field = (id, label, input) => html`
      <label class="field">
        <span class="field__label">${label}</span>
        ${input}
        <span class="field__error" id="${id}-err" role="alert"></span>
      </label>`;
    const dlg = openSheet(html`
      <form class="sheet__form" id="pf-form" novalidate>
        <div class="sheet__grip" aria-hidden="true"></div>
        <div class="sheet__head">
          <h2 class="sheet__title" id="pf-title">${t('prof.title')}</h2>
          <button type="button" class="icon-btn" data-close aria-label="${t('common.close')}">${icons.close()}</button>
        </div>
        <div class="field">
          <span class="field__label">${t('prof.username')}</span>
          <p class="readonly-value">@${account.username}</p>
          <span class="field__hint">${t('prof.usernameFixed')}</span>
        </div>
        ${field('pf-first', t('prof.first'), html`<input class="input" id="pf-first" type="text" autocomplete="given-name"
              maxlength="40" value="${account.firstName || account.displayName || ''}" aria-describedby="pf-first-err" required>`)}
        ${field('pf-last', t('prof.last'), html`<input class="input" id="pf-last" type="text" autocomplete="family-name"
              maxlength="40" value="${account.lastName ?? ''}" aria-describedby="pf-last-err">`)}
        ${field('pf-birth', t('prof.birth'), html`<input class="input" id="pf-birth" type="date" autocomplete="bday"
              min="1900-01-01" max="${todayIso()}" value="${account.birthday ?? ''}" aria-describedby="pf-birth-err">`)}
        <div class="sheet__actions">
          <button type="button" class="btn btn--ghost" data-close>${t('common.cancel')}</button>
          <button type="submit" class="btn btn--primary" id="pf-save">${t('common.save')}</button>
        </div>
      </form>`, { labelledBy: 'pf-title' });

    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    const ids = { firstName: '#pf-first', lastName: '#pf-last', birthday: '#pf-birth' };
    $('#pf-form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = validateProfile({
        firstName: $('#pf-first', dlg).value, lastName: $('#pf-last', dlg).value, birthday: $('#pf-birth', dlg).value,
      });
      for (const [k, sel] of Object.entries(ids)) {
        $(`${sel}-err`, dlg).textContent = r.ok ? '' : (r.errors[k] ?? '');
        if (!r.ok && r.errors[k]) $(sel, dlg).setAttribute('aria-invalid', 'true'); else $(sel, dlg).removeAttribute('aria-invalid');
      }
      if (!r.ok) { $(ids[Object.keys(r.errors)[0]], dlg).focus(); return; }
      const btn = $('#pf-save', dlg);
      btn.disabled = true;
      try {
        await save(r.value);
        result = r.value;
        dlg.close();
      } catch (err) {
        console.error(err);
        btn.disabled = false;
      }
    });
    dlg.addEventListener('close', () => resolve(result));
  });
}

/** เปลี่ยน PIN: PIN เดิม (reauthenticate) → PIN ใหม่ → ยืนยัน PIN ใหม่ → updatePassword */
export function openChangePin(username) {
  const dlg = openSheet(html`
    <div class="sheet__form">
      <div class="sheet__grip" aria-hidden="true"></div>
      <h2 class="sheet__title sheet__title--center" id="cp-title"></h2>
      <div id="cp-pad"></div>
      <p class="login__msg" id="cp-msg" role="alert"></p>
      <button type="button" class="btn btn--ghost" id="cp-cancel">${t('common.cancel')}</button>
    </div>`, { labelledBy: 'cp-title' });

  let pad = null;
  const msg = $('#cp-msg', dlg);
  let lockTimer = null;
  const showLock = () => {
    pad.lock(true);
    clearInterval(lockTimer);
    const tick = () => {
      const ms = lockRemaining(localStorage, username);
      if (!ms) { clearInterval(lockTimer); pad.lock(false); msg.textContent = ''; return; }
      msg.textContent = t('pin.locked', { wait: formatWait(ms) });
    };
    tick();
    lockTimer = setInterval(tick, 1000);
  };

  const TITLES = { old: t('pin.old'), next: t('pin.new'), confirm: t('pin.newConfirm') };

  function step(stage, firstPin = '', message = '') {
    pad?.destroy();
    $('#cp-title', dlg).textContent = TITLES[stage];
    msg.textContent = message;
    pad = createPinPad($('#cp-pad', dlg), {
      async onComplete(pin) {
        msg.textContent = '';
        if (stage === 'old') {
          if (lockRemaining(localStorage, username)) { showLock(); return; }
          msg.textContent = t('common.checking');
          try {
            await verifyPin(pin);
            clearFails(localStorage, username);
            step('next');
          } catch (e) {
            msg.textContent = authErrorMessage(e);
            if (isWrongPin(e)) {
              const r = recordFail(localStorage, username);
              pad.shake();
              if (r.lockedMs) showLock(); else msg.textContent = t('pin.wrongLeft', { n: r.left });
            } else if (e?.code === 'auth/too-many-requests') pad.shake(); else pad.reset();
          }
        } else if (stage === 'next') {
          step('confirm', pin);
        } else if (pin !== firstPin) {
          pad.shake();
          setTimeout(() => step('next', '', t('pin.mismatch')), 450);
        } else {
          msg.textContent = t('common.saving');
          try {
            await changePin(pin);
            dlg.close();
            toast(t('pin.changed'));
          } catch (e) {
            console.error(e);
            step(e?.code === 'auth/requires-recent-login' ? 'old' : 'next', '', authErrorMessage(e));
          }
        }
      },
    });
  }

  $('#cp-cancel', dlg).addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { clearInterval(lockTimer); pad?.destroy(); });
  step('old');
  if (lockRemaining(localStorage, username)) showLock();
}
