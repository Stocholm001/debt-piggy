// ui/overview.js — หน้า "ภาพรวม" (D03, SPEC ข้อ 3.1 / แบบ Main.dc.html)

import { totals, priorityOrder, paidTotal, debtPctTenths } from '../calc.js';
import { monthLabel } from '../dates.js';
import { formatPctOf, encouragement } from '../format.js';
import { html, mount, $, $$ } from './dom.js';
import { icons, pig } from './icons.js';
import { header, bindEye, rankBadge, debtSubline, money, baht } from './common.js';
import { openDebtSheet } from './debt-sheet.js';

const RING = 210;
const STROKE = 22;

/** วงแหวนความคืบหน้า: ราง --line, ส่วนที่จ่ายแล้ว --accent ปลายมน เริ่มที่ 12 นาฬิกา */
function ring(paid, initial) {
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const frac = initial > 0 ? Math.min(1, paid / initial) : 0; // ใช้วาดรูปเท่านั้น ไม่ใช่ตัวเลขเงิน
  return html`
    <svg class="ring__svg" viewBox="0 0 ${RING} ${RING}" aria-hidden="true" focusable="false">
      <circle cx="${RING / 2}" cy="${RING / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${STROKE}"/>
      ${frac > 0 ? html`
        <circle cx="${RING / 2}" cy="${RING / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${STROKE}"
                stroke-linecap="round" stroke-dasharray="${(c * frac).toFixed(2)} ${c.toFixed(2)}"
                transform="rotate(-90 ${RING / 2} ${RING / 2})"/>` : ''}
    </svg>`;
}

function debtCard(app, { debt, rank, remaining, closed }) {
  const pct = debtPctTenths(debt, app.months);
  const pctText = formatPctOf(paidTotal(debt, app.months), debt.initialSatang);
  const width = pct == null ? 0 : Math.min(100, pct / 10);
  return html`
    <li>
      <button type="button" class="debt-card" data-id="${debt.id}" aria-label="แก้ไข ${debt.account}">
        <span class="debt-card__top">
          ${rankBadge(rank, closed)}
          <span class="debt-card__main">
            <span class="debt-card__name">${debt.account}</span>
            <span class="debt-card__sub">${debtSubline(debt)}</span>
          </span>
          <span class="debt-card__side">
            ${closed
              ? html`<span class="debt-card__closed">ปิดแล้ว</span>`
              : html`<span class="debt-card__amt">${money(app, remaining)}</span>
                     <span class="debt-card__pct">จ่ายแล้ว ${pctText}</span>`}
          </span>
        </span>
        <span class="progress ${closed ? 'progress--done' : ''}" aria-hidden="true">
          <span class="progress__fill" style="width:${width}%"></span>
        </span>
      </button>
    </li>`;
}

export function renderOverview(view, app) {
  const t = totals(app.debts, app.months);
  const order = priorityOrder(app.debts, app.months);
  const active = order.filter((x) => !x.closed);
  const closed = order.filter((x) => x.closed);
  if (app.overviewTab === 'closed' && closed.length === 0) app.overviewTab = 'active';
  const tab = app.overviewTab;
  const list = tab === 'closed' ? closed : active;

  const head = header(app, { eyebrow: monthLabel(app.currentKey), title: app.account.appTitle });

  if (app.debts.length === 0) {
    mount(view, html`
      ${head}
      <section class="empty-state">
        ${pig(140)}
        <p class="empty-state__title">ยังไม่มีรายการหนี้</p>
        <p class="empty-state__sub">เพิ่มหนี้แต่ละก้อนแล้วแอปจะเรียงให้ว่าควรจ่ายก้อนไหนก่อน</p>
        <button type="button" class="btn btn--primary" id="add-first">${icons.plus(20)} เพิ่มหนี้ก้อนแรก</button>
        ${app.testMode ? html`
          <button type="button" class="btn btn--ghost" id="load-sample">ใส่ข้อมูลตัวอย่าง (โหมดทดสอบ)</button>` : ''}
      </section>`);
    bindEye(view, app);
    $('#add-first', view).addEventListener('click', () => openDebtSheet(app, {}));
    $('#load-sample', view)?.addEventListener('click', () => app.loadSample());
    return undefined;
  }

  const cheer = encouragement(t.progressTenths);

  mount(view, html`
    ${head}
    <section class="ring-card" aria-label="ความคืบหน้าการปลดหนี้">
      <div class="ring">
        ${ring(t.totalPaid, t.totalInitial)}
        <div class="ring__center">
          <span class="ring__label">ปลดไปแล้ว</span>
          <span class="ring__pct">${formatPctOf(t.totalPaid, t.totalInitial)}</span>
          <span class="ring__count">${t.closedCount} จาก ${t.debtCount} ก้อน</span>
        </div>
      </div>
      ${cheer ? html`<p class="ring-card__cheer">${cheer}</p>` : ''}
      <dl class="stats3">
        <div><dt>ตั้งต้น</dt><dd>${baht(app, t.totalInitial)}</dd></div>
        <div><dt>จ่ายแล้ว</dt><dd class="is-green">${baht(app, t.totalPaid)}</dd></div>
        <div><dt>คงเหลือ</dt><dd class="is-accent">${baht(app, t.totalRemaining)}</dd></div>
      </dl>
    </section>

    <div class="tabs" role="tablist" aria-label="สถานะหนี้">
      <button type="button" class="tabs__btn" role="tab" data-tab="active" aria-selected="${String(tab === 'active')}">ยังผ่อนอยู่ ${active.length}</button>
      <button type="button" class="tabs__btn" role="tab" data-tab="closed" aria-selected="${String(tab === 'closed')}"
              ${closed.length === 0 ? html`disabled` : ''}>ปิดแล้ว ${closed.length}</button>
    </div>

    ${list.length
      ? html`<ul class="debt-list">${list.map((x) => debtCard(app, x))}</ul>`
      : html`<p class="empty">ปิดหนี้ครบทุกก้อนแล้ว</p>`}

    <button type="button" class="fab" id="fab" aria-label="เพิ่มหนี้">${icons.plus(30)}</button>`);

  bindEye(view, app);
  $$('.tabs__btn', view).forEach((b) => b.addEventListener('click', () => {
    app.overviewTab = b.dataset.tab;
    app.rerender();
  }));
  $$('.debt-card', view).forEach((b) => b.addEventListener('click', () => {
    const debt = app.debts.find((d) => d.id === b.dataset.id);
    if (debt) openDebtSheet(app, { debt });
  }));
  $('#fab', view).addEventListener('click', () => openDebtSheet(app, {}));
  return undefined;
}
