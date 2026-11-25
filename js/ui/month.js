// ui/month.js — หน้า "เดือนนี้" (D04, SPEC ข้อ 3.2 / แบบ M01.dc.html)
// ช่องกรอกยอดชำระแสดงค่าจริงเสมอ, เงินเดือนซ่อนตลอดและดูได้เฉพาะตอนกดค้าง

import {
  monthView, monthOptions, opening, clampPay, allocSummary, STATUS,
} from '../calc.js';
import { monthLabel, monthShortLabel, prevMonth, nextMonth } from '../dates.js';
import { formatMoney, formatBp, parseMoney, moneyFieldValue, HIDDEN } from '../format.js';
import { html, mount, $, $$, bindMoneyInputs } from './dom.js';
import { icons } from './icons.js';
import { header, bindEye, rankBadge, debtSubline, money } from './common.js';
import { openSalarySheet } from './salary-sheet.js';

const STATUS_CHIP = {
  [STATUS.CLOSING]: { cls: 'chip--paid', text: 'ปิดก้อนนี้', check: true },
  [STATUS.PAID]: { cls: 'chip--paid', text: 'จ่ายแล้ว' },
  [STATUS.UNPAID]: { cls: 'chip--unpaid', text: 'ยังไม่จ่าย' },
};

function statusChip(status) {
  const s = STATUS_CHIP[status];
  if (!s) return '';
  return html`<span class="chip ${s.cls}">${s.check ? icons.check(14) : ''}${s.text}</span>`;
}

function salaryCard(app, key, month, cats) {
  const s = allocSummary(month.salarySatang, month.allocBp, cats);
  const noSalary = month.salarySatang === 0;
  return html`
    <section class="card salary-card" aria-label="เงินเดือนและแบ่งงบ">
      <div class="salary-card__top">
        <div class="salary-card__text">
          <p class="salary-card__label">เงินเดือน (บาท/เดือน)</p>
          ${noSalary
            ? html`<p class="salary-card__empty">ยังไม่ได้กรอกเงินเดือน</p>`
            : html`<p class="salary-card__value" id="salary-value" aria-live="polite">${HIDDEN}</p>`}
          ${month.draft && !noSalary ? html`<p class="salary-card__draft">ใช้ค่าจากเดือนก่อน · ยังไม่บันทึก</p>` : ''}
        </div>
        ${noSalary
          ? html`<button type="button" class="btn btn--primary btn--sm" id="salary-edit">กรอกเงินเดือน</button>`
          : html`
            <div class="salary-card__btns">
              <button type="button" class="pill-btn" id="salary-peek" aria-describedby="salary-value">
                ${icons.eye(20)} กดค้างดู</button>
              <button type="button" class="icon-btn icon-btn--hi" id="salary-edit" aria-label="แก้เงินเดือนและแบ่งงบ">
                ${icons.pencil()}</button>
            </div>`}
      </div>
      <div class="alloc-bar" aria-hidden="true">
        ${s.items.filter((x) => x.widthBp > 0).map((x) => html`<span style="width:${x.widthBp / 100}%;background:${x.color}"></span>`)}
      </div>
      <ul class="legend">
        ${s.items.map((x) => html`
          <li class="legend__item">
            <span class="dot" style="background:${x.color}" aria-hidden="true"></span>
            <span class="legend__name">${x.label}</span>
            <span class="legend__pct">${formatBp(x.bp)}</span>
          </li>`)}
      </ul>
      ${s.over ? html`<p class="warn-line">รวมเกิน 100% อยู่ ${formatBp(s.overBp)}</p>` : ''}
      <div class="row2">
        <button type="button" class="btn btn--ghost btn--sm" id="alloc-edit">ปรับสัดส่วน % / ฿</button>
        <button type="button" class="dashed-btn" id="cat-add">+ เพิ่มหมวด</button>
      </div>
    </section>`;
}

/** บรรทัดสรุปใต้การ์ดเงินเดือน (SPEC ข้อ 12 เรื่องที่ 6) */
function summaryLine(app, v) {
  return html`
    <p class="month-sum" id="month-sum">
      <span>ต้นเดือน <b>${money(app, v.monthOpening)}</b></span>
      <span>ชำระ <b class="is-green">${money(app, v.monthPaid)}</b></span>
      <span>คงเหลือ <b class="is-accent">${money(app, v.monthRemaining)}</b></span>
    </p>`;
}

function payCard(app, key, row) {
  const { debt, rank, prev } = row;
  return html`
    <li class="card pay-card" data-id="${debt.id}">
      <div class="pay-card__top">
        ${rankBadge(rank, false)}
        <div class="pay-card__main">
          <p class="pay-card__name" id="name-${debt.id}">${debt.account}</p>
          <p class="pay-card__sub">${debtSubline(debt)}</p>
        </div>
        <span class="pay-card__status" data-status>${statusChip(row.status)}</span>
      </div>
      <div class="pay-grid">
        <div class="pay-grid__col">
          <span class="pay-grid__label">ต้นเดือน</span>
          <span class="pay-grid__val">${money(app, row.opening)}</span>
        </div>
        <label class="pay-grid__col pay-grid__col--input">
          <span class="pay-grid__label">ชำระเดือนนี้</span>
          <input class="input pay-input ${row.pay > 0 ? 'has-value' : ''}" data-id="${debt.id}" inputmode="decimal"
                 autocomplete="off" placeholder="0.00" value="${moneyFieldValue(row.pay)}"
                 aria-describedby="name-${debt.id}">
        </label>
        <div class="pay-grid__col pay-grid__col--end">
          <span class="pay-grid__label">เหลือหลังชำระ</span>
          <span class="pay-grid__val ${row.pay > 0 ? 'is-green' : ''}" data-remaining>${money(app, row.remainingAfter)}</span>
        </div>
      </div>
      ${prev.show ? html`
        <button type="button" class="pill-btn pill-btn--sm" data-prev="${debt.id}">
          ${icons.copy()} ใช้ยอด ${monthShortLabel(prevMonth(key))} ${money(app, prev.prevPay)}</button>` : ''}
    </li>`;
}

function closedCard(app, row) {
  return html`
    <li class="card closed-card">
      ${rankBadge(row.rank, true)}
      <span class="closed-card__name">${row.debt.account}</span>
      <span class="closed-card__text">ปิดหนี้นี้แล้ว</span>
    </li>`;
}

export function renderMonth(view, app, key) {
  let closedOpen = false;

  function draw({ focusId = null, caret = null } = {}) {
    const month = app.monthData(key);
    const cats = app.account.allocCats;
    const v = monthView(app.debts, app.months, key);
    const opts = monthOptions(app.debts, app.currentKey);
    if (!opts.includes(key)) { opts.push(key); opts.sort(); }
    const idx = opts.indexOf(key);

    mount(view, html`
      ${header(app, { eyebrow: 'กรอกยอดชำระ', title: 'เดือนนี้' })}

      <div class="month-pick">
        <button type="button" class="icon-btn" id="m-prev" aria-label="เดือนก่อน" ${idx <= 0 ? html`disabled` : ''}>
          ${icons.chevronLeft()}</button>
        <label class="visually-hidden" for="m-select">เลือกเดือน</label>
        <select class="select select--center" id="m-select">
          ${opts.map((k) => html`<option value="${k}" ${k === key ? html`selected` : ''}>${monthLabel(k)}</option>`)}
        </select>
        <button type="button" class="icon-btn" id="m-next" aria-label="เดือนถัดไป" ${idx >= opts.length - 1 ? html`disabled` : ''}>
          ${icons.chevronRight()}</button>
      </div>

      ${salaryCard(app, key, month, cats)}
      ${v.active.length || v.closed.length ? summaryLine(app, v) : ''}

      ${app.debts.length === 0 ? html`
        <div class="empty">
          <p>ยังไม่มีรายการหนี้</p>
          <a class="btn btn--primary" href="#/overview">ไปเพิ่มหนี้ที่หน้าภาพรวม</a>
        </div>` : html`
        <div class="section-head">
          <h2 class="section-head__title">เรียงตามดอกแพงก่อน</h2>
          <span class="section-head__count">${v.active.length} ก้อน</span>
        </div>
        ${v.active.length
          ? html`<ul class="pay-list">${v.active.map((r) => payCard(app, key, r))}</ul>`
          : html`<p class="empty">${v.closed.length ? 'ทุกก้อนปิดแล้วในเดือนนี้' : 'ยังไม่มีหนี้ที่เริ่มนับในเดือนนี้'}</p>`}
        ${v.closed.length ? html`
          <button type="button" class="closed-toggle" id="closed-toggle" aria-expanded="${String(closedOpen)}"
                  aria-controls="closed-list">
            ปิดแล้ว ${v.closed.length} ก้อน ${icons.chevronDown()}</button>
          <ul class="closed-list" id="closed-list" ${closedOpen ? '' : html`hidden`}>
            ${v.closed.map((r) => closedCard(app, r))}
          </ul>` : ''}`}`);

    bind();
    if (focusId) {
      const el = $(`.pay-input[data-id="${focusId}"]`, view);
      if (el) {
        el.focus();
        if (caret != null) el.setSelectionRange(caret, caret);
      }
    }
  }

  /** อัปเดตเฉพาะการ์ดที่แก้ (ระหว่างพิมพ์ ไม่วาดใหม่ทั้งหน้าเพื่อไม่ให้เสียโฟกัส) */
  function updateCardLive(debtId) {
    const v = monthView(app.debts, app.months, key);
    const row = v.active.find((r) => r.debt.id === debtId);
    const card = $(`.pay-card[data-id="${debtId}"]`, view);
    if (!row || !card) return;
    const rem = $('[data-remaining]', card);
    rem.textContent = money(app, row.remainingAfter);
    rem.classList.toggle('is-green', row.pay > 0);
    mount($('[data-status]', card), statusChip(row.status));
    $('.pay-input', card).classList.toggle('has-value', row.pay > 0);
    const sum = $('#month-sum', view);
    if (sum) sum.outerHTML = summaryLine(app, v).__html;
  }

  function bind() {
    bindEye(view, app);
    $('#m-prev', view).addEventListener('click', () => app.navigate(`#/month/${prevMonth(key)}`));
    $('#m-next', view).addEventListener('click', () => app.navigate(`#/month/${nextMonth(key)}`));
    $('#m-select', view).addEventListener('change', (e) => app.navigate(`#/month/${e.target.value}`));

    $('#salary-edit', view)?.addEventListener('click', () => openSalarySheet(app, key));
    $('#alloc-edit', view).addEventListener('click', () => openSalarySheet(app, key));
    $('#cat-add', view).addEventListener('click', () => openSalarySheet(app, key, { focusAdd: true }));

    // กดค้างดูเงินเดือน: pointer events (นิ้วและเมาส์) + คีย์บอร์ด (Space/Enter ค้าง)
    const peek = $('#salary-peek', view);
    if (peek) {
      const out = $('#salary-value', view);
      const show = () => { out.textContent = formatMoney(app.monthData(key).salarySatang); peek.classList.add('is-held'); };
      const hide = () => { out.textContent = HIDDEN; peek.classList.remove('is-held'); };
      peek.addEventListener('pointerdown', (e) => { e.preventDefault(); peek.setPointerCapture?.(e.pointerId); show(); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) peek.addEventListener(ev, hide);
      peek.addEventListener('contextmenu', (e) => e.preventDefault());
      peek.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show(); } });
      peek.addEventListener('keyup', hide);
    }

    $('#closed-toggle', view)?.addEventListener('click', () => {
      closedOpen = !closedOpen;
      $('#closed-toggle', view).setAttribute('aria-expanded', String(closedOpen));
      $('#closed-list', view).hidden = !closedOpen;
    });

    $$('[data-prev]', view).forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.prev;
      const row = monthView(app.debts, app.months, key).active.find((r) => r.debt.id === id);
      if (!row) return;
      app.setPayment(key, id, row.prev.value);
      draw();
    }));
  }

  bindMoneyInputs(view, '.pay-input');

  // พิมพ์ยอด: clamp 0 ≤ pay ≤ ยอดต้นเดือน แล้วบันทึกอัตโนมัติ
  view.addEventListener('input', (e) => {
    const input = e.target.closest?.('.pay-input');
    if (!input) return;
    const debt = app.debts.find((d) => d.id === input.dataset.id);
    if (!debt) return;
    const op = opening(debt, app.months, key);
    app.setPayment(key, debt.id, clampPay(parseMoney(input.value), op));
    updateCardLive(debt.id);
  });

  // ออกจากช่อง: แสดงค่าที่ clamp แล้ว และวาดใหม่ (ลำดับอาจเปลี่ยน) โดยคงโฟกัสช่องที่ผู้ใช้แตะต่อ
  view.addEventListener('change', (e) => {
    const input = e.target.closest?.('.pay-input');
    if (!input) return;
    setTimeout(() => {
      const next = document.activeElement?.closest?.('.pay-input');
      const caret = next ? next.selectionStart : null;
      draw({ focusId: next?.dataset.id ?? null, caret });
    }, 0);
  });

  draw();
  return () => app.flushSaves();
}
