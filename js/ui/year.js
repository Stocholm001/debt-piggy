// ui/year.js — หน้า "สรุปทั้งปี" (D07, SPEC ข้อ 3.5) แนวเดียวกับ salary-calc F06
// ปุ่ม "ส่งออก CSV" ทำใน Phase 4

import { yearSummary, yearOptions, closedInYear, isClosed } from '../calc.js';
import { toBE, monthShortLabel } from '../dates.js';
import { html, mount, $ } from './dom.js';
import { pig } from './icons.js';
import { money } from './common.js';

export function renderYear(view, app, year) {
  const y = yearSummary(app.debts, app.months, year);
  const years = yearOptions(app.debts, app.months, Number(app.currentKey.slice(0, 4)));
  if (!years.includes(year)) { years.push(year); years.sort((a, b) => a - b); }
  const be = toBE(year);
  const maxPaid = Math.max(1, ...y.months.map((m) => m.paid));
  const lastRecorded = [...y.months].reverse().find((m) => m.recorded);
  const closedCount = closedInYear(app.debts, app.months, year);

  mount(view, html`
    <header class="head head--row">
      <h1 class="head__title">สรุปทั้งปี</h1>
      <label class="visually-hidden" for="y-select">เลือกปี</label>
      <select class="select select--sm" id="y-select">
        ${years.map((yr) => html`<option value="${yr}" ${yr === year ? html`selected` : ''}>พ.ศ. ${toBE(yr)}</option>`)}
      </select>
    </header>

    <section class="year-card">
      <div class="year-card__top">
        ${pig(84)}
        <div class="year-card__text">
          <p class="year-card__eyebrow">จ่ายหนี้ทั้งปี ${be}</p>
          <p class="year-card__total">฿${money(app, y.totalPaid)}</p>
          <p class="year-card__sub">บันทึกแล้ว ${y.recordedCount} จาก 12 เดือน</p>
        </div>
      </div>
      <div class="row2">
        <div class="mini-stat">
          <span class="mini-stat__label">คงเหลือ ณ ${lastRecorded ? monthShortLabel(lastRecorded.key) : 'สิ้นปี'}</span>
          <span class="mini-stat__val is-accent">${y.endRemaining == null ? '—' : money(app, y.endRemaining)}</span>
        </div>
        <div class="mini-stat">
          <span class="mini-stat__label">ปิดหนี้ปีนี้</span>
          <span class="mini-stat__val is-green">${closedCount} ก้อน</span>
        </div>
      </div>
    </section>

    <section class="card">
      <h2 class="card__title">ยอดชำระรายเดือน</h2>
      <div class="bars" role="list">
        ${y.months.map((m) => html`
          <a class="bars__col ${m.key === app.currentKey ? 'is-current' : ''}" href="#/month/${m.key}" role="listitem"
             aria-label="${monthShortLabel(m.key)} ${m.recorded ? `ชำระ ${money(app, m.paid)} บาท` : 'ยังไม่บันทึก'}">
            <span class="bars__track"><span class="bars__bar" style="height:${Math.max(3, (m.paid / maxPaid) * 100)}%"></span></span>
            <span class="bars__label">${monthShortLabel(m.key)}</span>
          </a>`)}
      </div>
    </section>

    <section class="card card--list">
      <div class="year-table__head" aria-hidden="true">
        <span>เดือน</span><span>ชำระ</span><span>คงเหลือปลายเดือน</span>
      </div>
      <ul class="year-table">
        ${y.months.map((m) => html`
          <li><a class="year-table__row" href="#/month/${m.key}">
            <span class="year-table__month ${m.recorded ? 'is-bold' : ''}">${monthShortLabel(m.key)}</span>
            <span class="year-table__paid ${m.paid > 0 ? 'is-green' : ''}">${m.recorded ? money(app, m.paid) : '—'}</span>
            <span class="year-table__rem">${m.recorded ? money(app, m.remaining) : 'ยังไม่บันทึก'}</span>
          </a></li>`)}
      </ul>
    </section>

    <h2 class="section-head__title">จ่ายตามก้อน (ปี ${be})</h2>
    ${y.byDebt.length ? html`
      <ul class="card card--list by-debt">
        ${y.byDebt.map(({ debt, paid }) => html`
          <li>
            <span class="by-debt__name">${debt.account}
              <span class="by-debt__sub">${[debt.creditor, isClosed(debt, app.months) ? 'ปิดแล้ว' : ''].filter(Boolean).join(' · ')}</span>
            </span>
            <span class="by-debt__amt">${money(app, paid)}</span>
          </li>`)}
      </ul>` : html`<p class="empty">ยังไม่มียอดชำระในปีนี้</p>`}`);

  $('#y-select', view).addEventListener('change', (e) => app.navigate(`#/year/${e.target.value}`));
  return undefined;
}
