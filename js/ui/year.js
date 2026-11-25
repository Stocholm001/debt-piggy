// ui/year.js — หน้า "สรุปทั้งปี" (D07, SPEC ข้อ 3.5) แนวเดียวกับ salary-calc F06

import { yearSummary, yearOptions, closedInYear, isClosed } from '../calc.js';
import { yearNumber, yearLabel, monthShortLabel } from '../dates.js';
import { t } from '../i18n.js';
import { yearCsv, yearCsvFilename } from '../csv.js';
import { html, mount, $, downloadText, toast } from './dom.js';
import { pig, icons } from './icons.js';
import { money } from './common.js';

export function renderYear(view, app, year) {
  const y = yearSummary(app.debts, app.months, year);
  const years = yearOptions(app.debts, app.months, Number(app.currentKey.slice(0, 4)));
  if (!years.includes(year)) { years.push(year); years.sort((a, b) => a - b); }
  const be = yearNumber(year);
  const maxPaid = Math.max(1, ...y.months.map((m) => m.paid));
  const lastRecorded = [...y.months].reverse().find((m) => m.recorded);
  const closedCount = closedInYear(app.debts, app.months, year);

  mount(view, html`
    <header class="head head--row">
      <h1 class="head__title">${t('y.title')}</h1>
      <label class="visually-hidden" for="y-select">${t('y.pick')}</label>
      <select class="select select--sm" id="y-select">
        ${years.map((yr) => html`<option value="${yr}" ${yr === year ? html`selected` : ''}>${yearLabel(yr)}</option>`)}
      </select>
    </header>

    <section class="year-card">
      <div class="year-card__top">
        ${pig(84)}
        <div class="year-card__text">
          <p class="year-card__eyebrow">${t('y.eyebrow', { year: be })}</p>
          <p class="year-card__total">฿${money(app, y.totalPaid)}</p>
          <p class="year-card__sub">${t('y.recorded', { n: y.recordedCount })}</p>
        </div>
      </div>
      <div class="row2">
        <div class="mini-stat">
          <span class="mini-stat__label">${t('y.remainAt', { month: lastRecorded ? monthShortLabel(lastRecorded.key) : t('y.yearEnd') })}</span>
          <span class="mini-stat__val is-accent">${y.endRemaining == null ? '—' : money(app, y.endRemaining)}</span>
        </div>
        <div class="mini-stat">
          <span class="mini-stat__label">${t('y.closedYear')}</span>
          <span class="mini-stat__val is-green">${t('unit.debts', { n: closedCount })}</span>
        </div>
      </div>
    </section>

    <section class="card">
      <h2 class="card__title">${t('y.chart')}</h2>
      <div class="bars" role="list">
        ${y.months.map((m) => html`
          <a class="bars__col ${m.key === app.currentKey ? 'is-current' : ''}" href="#/month/${m.key}" role="listitem"
             aria-label="${m.recorded ? t('y.barPaid', { month: monthShortLabel(m.key), amount: money(app, m.paid) }) : `${monthShortLabel(m.key)} ${t('y.notRecorded')}`}">
            <span class="bars__track"><span class="bars__bar" style="height:${Math.max(3, (m.paid / maxPaid) * 100)}%"></span></span>
            <span class="bars__label">${monthShortLabel(m.key)}</span>
          </a>`)}
      </div>
    </section>

    <section class="card card--list">
      <div class="year-table__head" aria-hidden="true">
        <span>${t('y.colMonth')}</span><span>${t('y.colPaid')}</span><span>${t('y.colRem')}</span>
      </div>
      <ul class="year-table">
        ${y.months.map((m) => html`
          <li><a class="year-table__row" href="#/month/${m.key}">
            <span class="year-table__month ${m.recorded ? 'is-bold' : ''}">${monthShortLabel(m.key)}</span>
            <span class="year-table__paid ${m.paid > 0 ? 'is-green' : ''}">${m.recorded ? money(app, m.paid) : '—'}</span>
            <span class="year-table__rem">${m.recorded ? money(app, m.remaining) : t('y.notRecorded')}</span>
          </a></li>`)}
      </ul>
    </section>

    <h2 class="section-head__title">${t('y.byDebt', { year: be })}</h2>
    ${y.byDebt.length ? html`
      <ul class="card card--list by-debt">
        ${y.byDebt.map(({ debt, paid }) => html`
          <li>
            <span class="by-debt__name">${debt.account}
              <span class="by-debt__sub">${[debt.creditor, isClosed(debt, app.months) ? t('ov.closed') : ''].filter(Boolean).join(' · ')}</span>
            </span>
            <span class="by-debt__amt">${money(app, paid)}</span>
          </li>`)}
      </ul>` : html`<p class="empty">${t('y.noPay')}</p>`}

    <button type="button" class="btn btn--dark btn--block" id="csv"
            ${y.recordedCount ? '' : html`disabled aria-describedby="csv-note"`}>
      ${icons.download()} ${t('y.csv', { year: be })}</button>
    ${y.recordedCount ? '' : html`<p class="hint" id="csv-note">${t('y.csvNote')}</p>`}`);

  $('#csv', view).addEventListener('click', () => {
    try {
      const file = yearCsvFilename(year);
      downloadText(file, yearCsv(app.debts, app.months, year));
      toast(t('file.saved', { file }));
    } catch (err) {
      console.error(err);
      toast(t('file.failed'));
    }
  });

  $('#y-select', view).addEventListener('change', (e) => app.navigate(`#/year/${e.target.value}`));
  return undefined;
}
