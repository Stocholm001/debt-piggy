// ui/login.js — ล็อกอิน: กรอกชื่อ (D01) → PIN (D02) (ยกจาก salary-calc ตัดสวิตช์ภาษาออก)
//   ปุ่ม "เข้าสู่ระบบ" → ชื่อต้องมีบัญชีแล้ว → กรอก PIN (ผิดครบ 3 ครั้ง ล็อก 1 นาที)
//   ปุ่ม "สมัครใช้งาน" → ฟอร์มสมัคร (ชื่อผู้ใช้*, ชื่อ*, นามสกุล, วันเกิด) → ตั้ง PIN → ยืนยัน PIN

import {
  initFirebase, usernameExists, signIn, signUp, authErrorMessage, isWrongPin,
} from '../auth.js';
import {
  normalizeUsername, validateUsername, checkNewUsername, getRecentNames, addRecentName, removeRecentName,
  USERNAME_RULES,
} from '../username.js';
import { lockRemaining, recordFail, clearFails, formatWait } from '../lockout.js';
import { validateProfile, todayIso } from '../profile.js';
import { html, mount, $ } from './dom.js';
import { pig, icons } from './icons.js';
import { createPinPad } from './pinpad.js';

const APP_NAME = 'กระปุกปลดหนี้';

/**
 * @param root
 * @param onSignedIn() เรียกเมื่อล็อกอินสำเร็จ
 */
export function renderLogin(root, { onSignedIn }) {
  let pad = null;
  let typedName = '';
  let leavePin = () => {}; // หยุดนับถอยหลังของหน้า PIN
  let regValues = null;    // ค่าที่กรอกในฟอร์มสมัคร (กลับมาแก้ได้จากหน้า PIN)
  let regProfile = null;   // ข้อมูลส่วนตัวที่ตรวจแล้ว ใช้ตอนสร้างบัญชี

  // ---------- D01: กรอกชื่อ ----------
  function showName(prefill = '', error = '') {
    leavePin();
    pad?.destroy(); pad = null;
    const recent = getRecentNames(localStorage);
    mount(root, html`
      <main class="login">
        <div class="login__hero">
          ${pig(150)}
          <h1 class="login__title">${APP_NAME}</h1>
          <p class="login__sub">กรอกชื่อของคุณเพื่อเข้าใช้งาน</p>
        </div>
        <form class="login__form" id="name-form" novalidate>
          <label class="field">
            <span class="field__label">ชื่อผู้ใช้</span>
            <input class="input" id="name" type="text" autocomplete="username" autocapitalize="none"
                   spellcheck="false" maxlength="40" value="${prefill}" aria-describedby="name-err" required>
            <span class="field__error" id="name-err" role="alert">${error}</span>
          </label>
          <button type="submit" class="btn btn--primary btn--block btn--rect" id="go">เข้าสู่ระบบ</button>
          <button type="button" class="btn btn--ghost btn--block btn--rect" id="register">สมัครใช้งาน</button>
        </form>
        ${recent.length ? html`
          <section class="login__recent" aria-labelledby="recent-lbl">
            <h2 class="field__label" id="recent-lbl">ใช้ล่าสุดในเครื่องนี้</h2>
            <div class="login__chips">
              ${recent.map((r) => html`
                <span class="name-chip">
                  <button type="button" class="name-chip__name" data-name="${r.name}">${r.name}</button>
                  <button type="button" class="name-chip__x" data-remove="${r.username}"
                          aria-label="เอา ${r.name} ออกจากเครื่องนี้">${icons.close(16)}</button>
                </span>`)}
            </div>
          </section>` : ''}
        <p class="login__foot">ยังไม่มีบัญชี กด "สมัครใช้งาน" เพื่อตั้งชื่อและ PIN 6 หลัก</p>
      </main>`);

    const input = $('#name', root);
    if (!prefill) input.focus();

    $('#name-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      submitName(input.value);
    });
    $('#register', root).addEventListener('click', () => showRegister({ username: input.value }));
    root.querySelector('.login__chips')?.addEventListener('click', (e) => {
      const x = e.target.closest('[data-remove]');
      if (x) {
        removeRecentName(localStorage, x.dataset.remove);
        showName($('#name', root)?.value ?? '');
        return;
      }
      const b = e.target.closest('[data-name]');
      if (b) submitName(b.dataset.name);
    });
  }

  /** เข้าสู่ระบบ: ชื่อต้องมีบัญชีแล้ว */
  async function submitName(name) {
    const username = normalizeUsername(name);
    const err = validateUsername(username);
    const errEl = $('#name-err', root);
    if (err) {
      errEl.textContent = err;
      $('#name', root).setAttribute('aria-invalid', 'true');
      return;
    }
    typedName = name.trim();
    const btn = $('#go', root);
    const buttons = [$('#go', root), $('#register', root)];
    buttons.forEach((b) => { b.disabled = true; });
    btn.textContent = 'กำลังตรวจสอบ…';
    const restore = () => { buttons.forEach((b) => { b.disabled = false; }); btn.textContent = 'เข้าสู่ระบบ'; };
    try {
      await initFirebase();
      const exists = await usernameExists(username);
      if (!exists) { restore(); errEl.textContent = 'ไม่พบชื่อนี้ ถ้ายังไม่มีบัญชี กด "สมัครใช้งาน"'; return; }
      showPin(username, 'enter');
    } catch (e) {
      console.error(e);
      restore();
      errEl.textContent = authErrorMessage(e);
    }
  }

  // ---------- สมัครใช้งาน: ข้อมูลส่วนตัว ----------
  function showRegister(values = {}, errors = {}) {
    leavePin();
    pad?.destroy(); pad = null;
    const v = { username: '', firstName: '', lastName: '', birthday: '', ...values };
    const read = () => ({
      username: $('#r-username', root).value,
      firstName: $('#r-first', root).value,
      lastName: $('#r-last', root).value,
      birthday: $('#r-birth', root).value,
    });
    const field = (id, key, label, input, hint = '', hintId = '') => html`
      <label class="field">
        <span class="field__label">${label}</span>
        ${input}
        ${hint ? html`<span class="field__hint" id="${hintId}">${hint}</span>` : ''}
        <span class="field__error" id="${id}-err" role="alert">${errors[key] ?? ''}</span>
      </label>`;
    mount(root, html`
      <main class="login">
        <div class="login__hero login__hero--small">
          ${pig(96)}
          <h1 class="login__title">สมัครใช้งาน</h1>
          <p class="login__sub">กรอกข้อมูลแล้วตั้ง PIN 6 หลัก</p>
        </div>
        <form class="login__form" id="reg-form" novalidate>
          ${field('r-username', 'username', 'ชื่อผู้ใช้ (ไว้ล็อกอิน)', html`
            <input class="input" id="r-username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off"
                   spellcheck="false" maxlength="20" lang="en"
                   value="${v.username}" aria-describedby="r-username-hint r-username-err" required>`, USERNAME_RULES, 'r-username-hint')}
          ${field('r-first', 'firstName', 'ชื่อ', html`
            <input class="input" id="r-first" type="text" autocomplete="given-name" maxlength="40"
                   value="${v.firstName}" aria-describedby="r-first-err" required>`)}
          ${field('r-last', 'lastName', 'นามสกุล · ไม่บังคับ', html`
            <input class="input" id="r-last" type="text" autocomplete="family-name" maxlength="40"
                   value="${v.lastName}" aria-describedby="r-last-err">`)}
          ${field('r-birth', 'birthday', 'วันเกิด · ไม่บังคับ', html`
            <input class="input" id="r-birth" type="date" autocomplete="bday" min="1900-01-01" max="${todayIso()}"
                   value="${v.birthday}" aria-describedby="r-birth-err">`)}
          <button type="submit" class="btn btn--primary btn--block btn--rect" id="r-next">ถัดไป: ตั้ง PIN</button>
        </form>
        <button type="button" class="link-back" id="r-back">← มีบัญชีแล้ว เข้าสู่ระบบ</button>
      </main>`);

    const idOf = { username: '#r-username', firstName: '#r-first', lastName: '#r-last', birthday: '#r-birth' };
    const firstBad = Object.keys(idOf).find((k) => errors[k]);
    for (const [k, sel] of Object.entries(idOf)) if (errors[k]) $(sel, root).setAttribute('aria-invalid', 'true');
    $(firstBad ? idOf[firstBad] : (v.username ? '#r-first' : '#r-username'), root).focus();

    $('#r-back', root).addEventListener('click', () => showName(read().username));
    // บอกทันทีระหว่างพิมพ์ ถ้าพิมพ์อักขระที่ใช้ไม่ได้ (เช่น ลืมเปลี่ยนแป้นเป็นภาษาอังกฤษ)
    $('#r-username', root).addEventListener('input', (e) => {
      const val = e.target.value;
      const { error } = checkNewUsername(val);
      const live = val && !/^[A-Za-z0-9_]*$/.test(val) ? error : '';
      $('#r-username-err', root).textContent = live;
      if (live) e.target.setAttribute('aria-invalid', 'true'); else e.target.removeAttribute('aria-invalid');
    });
    $('#reg-form', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const vals = read();
      const { username, error: uErr } = checkNewUsername(vals.username);
      const errs = {};
      if (uErr) errs.username = uErr;
      const prof = validateProfile(vals);
      if (!prof.ok) Object.assign(errs, prof.errors);
      if (Object.keys(errs).length) { showRegister(vals, errs); return; }

      const btn = $('#r-next', root);
      btn.disabled = true;
      btn.textContent = 'กำลังตรวจสอบ…';
      try {
        await initFirebase();
        if (await usernameExists(username)) {
          showRegister(vals, { username: 'ชื่อนี้มีคนใช้แล้ว ถ้าเป็นบัญชีของคุณ กด "เข้าสู่ระบบ"' });
          return;
        }
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = 'ถัดไป: ตั้ง PIN';
        $('#r-username-err', root).textContent = authErrorMessage(err);
        return;
      }
      regValues = vals;
      regProfile = prof.value;
      typedName = vals.username.trim();
      showPin(username, 'create');
    });
  }

  // ---------- D02: PIN ----------
  /** mode: "enter" | "create" | "confirm" */
  function showPin(username, mode, firstPin = '', message = '') {
    leavePin();
    pad?.destroy();
    const title = {
      enter: `กรอก PIN 6 หลักของ ${typedName}`,
      create: `ตั้ง PIN 6 หลักสำหรับ ${regProfile?.firstName || typedName}`,
      confirm: 'กรอก PIN อีกครั้งเพื่อยืนยัน',
    }[mode];

    mount(root, html`
      <main class="login login--pin">
        <div class="login__hero">
          ${pig(110)}
          <h1 class="login__pin-title">${title}</h1>
        </div>
        <div id="pad"></div>
        <p class="login__msg" id="pin-msg" role="alert">${message}</p>
        <button type="button" class="link-back" id="back">${mode === 'enter' ? '← เปลี่ยนชื่อ' : '← แก้ข้อมูลที่กรอก'}</button>
        <p class="login__foot">${mode === 'enter' ? 'PIN ผิด 3 ครั้ง ระบบจะล็อก 1 นาที' : 'ตั้ง PIN แล้วกรอกยืนยันอีกครั้ง'}</p>
      </main>`);

    $('#back', root).addEventListener('click', () => (mode === 'enter' ? showName(typedName) : showRegister(regValues ?? {})));
    const msg = $('#pin-msg', root);

    // ใส่ PIN ผิดครบ 3 ครั้ง: ล็อกปุ่มแล้วนับถอยหลัง
    let lockTimer = null;
    const stopLock = () => { clearInterval(lockTimer); lockTimer = null; };
    const applyLock = () => {
      const tick = () => {
        const ms = lockRemaining(localStorage, username);
        if (!ms) { stopLock(); pad?.lock(false); msg.textContent = ''; return; }
        msg.textContent = `ใส่ PIN ผิด 3 ครั้ง รออีก ${formatWait(ms)} นาทีแล้วลองใหม่`;
      };
      pad.lock(true);
      stopLock();
      tick();
      lockTimer = setInterval(tick, 1000);
    };
    leavePin = stopLock;

    pad = createPinPad($('#pad', root), {
      async onComplete(pin) {
        msg.textContent = '';
        if (mode === 'enter' && lockRemaining(localStorage, username)) { applyLock(); return; }
        if (mode === 'create') {
          showPin(username, 'confirm', pin);
          return;
        }
        if (mode === 'confirm' && pin !== firstPin) {
          pad.shake();
          setTimeout(() => showPin(username, 'create', '', 'PIN ไม่ตรงกัน ตั้งใหม่อีกครั้ง'), 450);
          return;
        }
        msg.textContent = mode === 'enter' ? 'กำลังเข้าสู่ระบบ…' : 'กำลังสร้างบัญชี…';
        try {
          if (mode === 'enter') await signIn(username, pin);
          else await signUp(username, regProfile, pin);
          addRecentName(localStorage, typedName, username);
          clearFails(localStorage, username);
          stopLock();
          pad.destroy();
          await onSignedIn();
        } catch (e) {
          console.error(e);
          msg.textContent = authErrorMessage(e);
          if (mode === 'enter' && isWrongPin(e)) {
            const r = recordFail(localStorage, username);
            pad.shake();
            if (r.lockedMs) applyLock();
            else msg.textContent = `PIN ไม่ถูกต้อง เหลืออีก ${r.left} ครั้ง`;
            return;
          }
          if (isWrongPin(e) || e?.code === 'auth/too-many-requests') pad.shake();
          else pad.reset();
          if (mode === 'confirm' && !isWrongPin(e)) {
            // สร้างบัญชีไม่สำเร็จ (เช่น เน็ตหลุด) ให้เริ่มตั้ง PIN ใหม่
            setTimeout(() => showPin(username, 'create', '', authErrorMessage(e)), 450);
          }
        }
      },
    });
    if (mode === 'enter' && lockRemaining(localStorage, username)) applyLock();
  }

  showName();
  return () => { leavePin(); pad?.destroy(); };
}
