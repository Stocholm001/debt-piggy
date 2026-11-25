// ui/account-sheets.js — หน้าต่างโปรไฟล์ และเปลี่ยน PIN (ยกจาก salary-calc)

import { verifyPin, changePin, authErrorMessage, isWrongPin } from '../auth.js';
import { lockRemaining, recordFail, clearFails, formatWait } from '../lockout.js';
import { validateProfile, todayIso } from '../profile.js';
import { html, mount, $, openSheet, toast } from './dom.js';
import { icons } from './icons.js';
import { createPinPad } from './pinpad.js';

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
          <h2 class="sheet__title" id="pf-title">โปรไฟล์</h2>
          <button type="button" class="icon-btn" data-close aria-label="ปิด">${icons.close()}</button>
        </div>
        <div class="field">
          <span class="field__label">ชื่อผู้ใช้ (ไว้ล็อกอิน)</span>
          <p class="readonly-value">@${account.username}</p>
          <span class="field__hint">เปลี่ยนภายหลังไม่ได้</span>
        </div>
        ${field('pf-first', 'ชื่อ', html`<input class="input" id="pf-first" type="text" autocomplete="given-name"
              maxlength="40" value="${account.firstName || account.displayName || ''}" aria-describedby="pf-first-err" required>`)}
        ${field('pf-last', 'นามสกุล · ไม่บังคับ', html`<input class="input" id="pf-last" type="text" autocomplete="family-name"
              maxlength="40" value="${account.lastName ?? ''}" aria-describedby="pf-last-err">`)}
        ${field('pf-birth', 'วันเกิด · ไม่บังคับ', html`<input class="input" id="pf-birth" type="date" autocomplete="bday"
              min="1900-01-01" max="${todayIso()}" value="${account.birthday ?? ''}" aria-describedby="pf-birth-err">`)}
        <div class="sheet__actions">
          <button type="button" class="btn btn--ghost" data-close>ยกเลิก</button>
          <button type="submit" class="btn btn--primary" id="pf-save">บันทึก</button>
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
      <button type="button" class="btn btn--ghost" id="cp-cancel">ยกเลิก</button>
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
      msg.textContent = `ใส่ PIN ผิด 3 ครั้ง รออีก ${formatWait(ms)} นาทีแล้วลองใหม่`;
    };
    tick();
    lockTimer = setInterval(tick, 1000);
  };

  const TITLES = { old: 'กรอก PIN เดิม', next: 'ตั้ง PIN ใหม่ 6 หลัก', confirm: 'กรอก PIN ใหม่อีกครั้ง' };

  function step(stage, firstPin = '', message = '') {
    pad?.destroy();
    $('#cp-title', dlg).textContent = TITLES[stage];
    msg.textContent = message;
    pad = createPinPad($('#cp-pad', dlg), {
      async onComplete(pin) {
        msg.textContent = '';
        if (stage === 'old') {
          if (lockRemaining(localStorage, username)) { showLock(); return; }
          msg.textContent = 'กำลังตรวจสอบ…';
          try {
            await verifyPin(pin);
            clearFails(localStorage, username);
            step('next');
          } catch (e) {
            msg.textContent = authErrorMessage(e);
            if (isWrongPin(e)) {
              const r = recordFail(localStorage, username);
              pad.shake();
              if (r.lockedMs) showLock(); else msg.textContent = `PIN ไม่ถูกต้อง เหลืออีก ${r.left} ครั้ง`;
            } else if (e?.code === 'auth/too-many-requests') pad.shake(); else pad.reset();
          }
        } else if (stage === 'next') {
          step('confirm', pin);
        } else if (pin !== firstPin) {
          pad.shake();
          setTimeout(() => step('next', '', 'PIN ไม่ตรงกัน ตั้งใหม่อีกครั้ง'), 450);
        } else {
          msg.textContent = 'กำลังบันทึก…';
          try {
            await changePin(pin);
            dlg.close();
            toast('เปลี่ยน PIN แล้ว');
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
