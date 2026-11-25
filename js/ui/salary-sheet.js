// ui/salary-sheet.js — หน้าต่างเงินเดือน + แบ่งงบ (D06, SPEC ข้อ 3.4) เป็น bottom sheet
// ค่าที่เก็บคือ bp ของแต่ละหมวด ส่วนจำนวนเงินคำนวณจากเงินเดือนเสมอ (SPEC ข้อ 5.7)
// เพิ่ม/ลบหมวด และสัดส่วน มีผลเมื่อกดบันทึกเท่านั้น

import { allocSummary, allocAmount, bpFromAmount, canUseAmountMode, nextCatColor } from '../calc.js';
import { monthLabel } from '../dates.js';
import {
  formatMoney, formatBp, parseMoney, parsePercent, moneyFieldValue, pctFieldValue,
} from '../format.js';
import { html, mount, $, $$, openSheet, bindMoneyInputs, choose, confirmDialog } from './dom.js';
import { icons } from './icons.js';
import { newId, catColor, catLabel } from './common.js';
import { t } from '../i18n.js';

/**
 * @param key            เดือน YYYY-MM
 * @param opts.focusAdd  เปิดแล้วโฟกัสช่องเพิ่มหมวด
 */
export function openSalarySheet(app, key, { focusAdd = false } = {}) {
  const month = app.monthData(key);
  const draft = {
    salary: month.salarySatang,
    cats: app.account.allocCats.map((c) => ({ ...c })),
    bp: { ...month.allocBp },
    mode: {},        // key → "pct" | "baht" (UI เท่านั้น ไม่เก็บ)
    removed: [],     // key หมวดที่บันทึกไว้แล้วที่ถูกลบ
    added: new Set(), // key หมวดที่เพิ่งเพิ่มใน sheet นี้ (ยังไม่บันทึก)
  };
  for (const c of draft.cats) draft.bp[c.key] = draft.bp[c.key] ?? 0;
  const origBp = { ...draft.bp };
  const origCatsJson = JSON.stringify(draft.cats);

  const title = t('s.title', { month: monthLabel(key) });

  const dlg = openSheet(html`
    <form class="sheet__form" novalidate>
      <div class="sheet__grip" aria-hidden="true"></div>
      <div class="sheet__head">
        <h2 class="sheet__title" id="salary-title">${title}</h2>
        <button type="button" class="icon-btn" data-close aria-label="${t('common.close')}">${icons.close()}</button>
      </div>

      <label class="field">
        <span class="field__label">${t('m.salaryLabel')}</span>
        <input class="input input--big" name="salary" inputmode="decimal" autocomplete="off"
               aria-describedby="err-salary" value="${moneyFieldValue(draft.salary)}" placeholder="0.00">
        <span class="field__error" id="err-salary" aria-live="polite"></span>
      </label>

      <ul class="alloc-list" id="alloc-list"></ul>

      <div class="alloc-total">
        <div class="alloc-bar" id="alloc-bar" aria-hidden="true"></div>
        <p class="alloc-total__text" id="alloc-total" aria-live="polite"></p>
      </div>

      <div class="add-cat">
        <label class="visually-hidden" for="new-cat">${t('s.newCat')}</label>
        <input class="input input--dashed" id="new-cat" maxlength="30" autocomplete="off"
               placeholder="${t('s.newCatPh')}">
        <button type="button" class="btn btn--plain" id="add-cat">${icons.plus(20)} ${t('s.add')}</button>
      </div>
      <p class="field__error" id="err-cat" aria-live="polite"></p>

      <div class="sheet__actions">
        <button type="button" class="btn btn--ghost" data-close>${t('common.cancel')}</button>
        <button type="submit" class="btn btn--primary">${t('common.save')}</button>
      </div>
    </form>`, { labelledBy: 'salary-title' });

  const form = $('form', dlg);
  const salaryInput = form.elements.salary;
  bindMoneyInputs(form, '[name="salary"], .alloc-input[data-mode="baht"]');
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));

  const modeOf = (k) => (canUseAmountMode(draft.salary) ? draft.mode[k] ?? 'pct' : 'pct');
  const fieldValue = (k) => (modeOf(k) === 'baht'
    ? moneyFieldValue(allocAmount(draft.salary, draft.bp[k]))
    : pctFieldValue(draft.bp[k]));
  const otherText = (k) => (modeOf(k) === 'baht'
    ? `= ${formatBp(draft.bp[k])}`
    : t('s.amount', { amount: formatMoney(allocAmount(draft.salary, draft.bp[k])) }));

  function renderList() {
    const bahtOk = canUseAmountMode(draft.salary);
    mount($('#alloc-list', dlg), draft.cats.map((c) => {
      const mode = modeOf(c.key);
      return html`
        <li class="alloc-row" data-key="${c.key}">
          <span class="dot" style="background:${catColor(c)}" aria-hidden="true"></span>
          <span class="alloc-row__name">
            <span class="alloc-row__label-line">
              <span class="alloc-row__label" id="lbl-${c.key}">${catLabel(c)}</span>
              ${c.builtIn ? '' : html`
                <button type="button" class="alloc-row__del" data-del="${c.key}"
                        aria-label="${t('s.delCatAria', { name: catLabel(c) })}">${icons.close(16)}</button>`}
            </span>
            <span class="alloc-row__other" id="other-${c.key}">${otherText(c.key)}</span>
          </span>
          <span class="unit-seg" role="group" aria-label="${t('s.unitAria', { name: catLabel(c) })}">
            <button type="button" class="unit-seg__btn" data-unit="pct" aria-pressed="${String(mode === 'pct')}"
                    aria-label="${t('s.pctAria')}">%</button>
            <button type="button" class="unit-seg__btn" data-unit="baht" aria-pressed="${String(mode === 'baht')}"
                    aria-label="${t('s.bahtAria')}" ${bahtOk ? '' : html`disabled`}>฿</button>
          </span>
          <input class="input alloc-input" data-key="${c.key}" data-mode="${mode}" inputmode="decimal"
                 autocomplete="off" aria-labelledby="lbl-${c.key}" value="${fieldValue(c.key)}" placeholder="0">
        </li>`;
    }));
    renderTotal();
  }

  function renderTotal() {
    const s = allocSummary(draft.salary, draft.bp, draft.cats);
    mount($('#alloc-bar', dlg), s.items.filter((x) => x.widthBp > 0).map((x) => html`
      <span style="width:${x.widthBp / 100}%;background:${catColor(x)}"></span>`));
    const el = $('#alloc-total', dlg);
    el.textContent = s.over
      ? t('m.over', { pct: formatBp(s.overBp) })
      : t('s.total', { pct: formatBp(s.totalBp) });
    el.classList.toggle('is-over', s.over);
  }

  function refreshOthers() {
    for (const c of draft.cats) {
      const other = $(`#other-${c.key}`, dlg);
      if (other) other.textContent = otherText(c.key);
    }
  }

  // ---------- เงินเดือน ----------
  salaryInput.addEventListener('input', () => {
    $('#err-salary', dlg).textContent = '';
    const v = salaryInput.value.trim() === '' ? 0 : parseMoney(salaryInput.value);
    if (v == null) return;
    const wasBahtOk = canUseAmountMode(draft.salary);
    draft.salary = v;
    if (wasBahtOk !== canUseAmountMode(v)) { renderList(); return; }
    // ช่องโหมด ฿ แสดงเงินที่คำนวณจาก bp ใหม่ (bp คือค่าที่เก็บ)
    for (const input of $$('.alloc-input[data-mode="baht"]', dlg)) {
      if (document.activeElement !== input) input.value = fieldValue(input.dataset.key);
    }
    refreshOthers();
    renderTotal();
  });

  // ---------- ช่องสัดส่วน ----------
  $('#alloc-list', dlg).addEventListener('input', (e) => {
    const input = e.target.closest('.alloc-input');
    if (!input) return;
    const k = input.dataset.key;
    const text = input.value.trim();
    let bp;
    if (text === '') bp = 0;
    else if (input.dataset.mode === 'baht') bp = bpFromAmount(parseMoney(text) ?? NaN, draft.salary);
    else bp = parsePercent(text);
    const valid = bp != null && Number.isFinite(bp);
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    if (!valid) return;
    draft.bp[k] = bp;
    $(`#other-${k}`, dlg).textContent = otherText(k);
    renderTotal();
  });
  // ออกจากช่องแล้วจัดรูปแบบใหม่ (ค่าผิดกลับเป็นค่าล่าสุดที่ถูกต้อง)
  $('#alloc-list', dlg).addEventListener('change', (e) => {
    const input = e.target.closest('.alloc-input');
    if (!input) return;
    input.value = fieldValue(input.dataset.key);
    input.setAttribute('aria-invalid', 'false');
  });

  $('#alloc-list', dlg).addEventListener('click', async (e) => {
    const unit = e.target.closest('[data-unit]');
    if (unit) {
      const k = unit.closest('.alloc-row').dataset.key;
      draft.mode[k] = unit.dataset.unit;
      renderList();
      $(`.alloc-input[data-key="${k}"]`, dlg)?.focus();
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const k = del.dataset.del;
      const cat = draft.cats.find((c) => c.key === k);
      const ok = await confirmDialog({
        title: t('s.delCatTitle'),
        message: t('s.delCatMsg', { name: catLabel(cat) }),
        okLabel: t('s.delCatOk'),
        tone: 'danger',
      });
      if (!ok) return;
      draft.cats = draft.cats.filter((c) => c.key !== k);
      delete draft.bp[k];
      if (!draft.added.delete(k)) draft.removed.push(k);
      renderList();
    }
  });

  // ---------- เพิ่มหมวด ----------
  const newCat = $('#new-cat', dlg);
  const addCat = () => {
    const label = newCat.value.trim();
    const err = $('#err-cat', dlg);
    if (!label) { err.textContent = t('s.catNameReq'); newCat.focus(); return; }
    if (draft.cats.some((c) => c.label === label || catLabel(c) === label)) { err.textContent = t('s.catDup'); newCat.focus(); return; }
    err.textContent = '';
    const cat = { key: newId('cat'), label, color: nextCatColor(draft.cats), builtIn: false };
    draft.cats.push(cat);
    draft.added.add(cat.key);
    draft.bp[cat.key] = 0;
    newCat.value = '';
    renderList();
    $(`.alloc-input[data-key="${cat.key}"]`, dlg)?.focus();
  };
  $('#add-cat', dlg).addEventListener('click', addCat);
  newCat.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCat(); }
  });

  // ---------- บันทึก ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = salaryInput.value.trim();
    const salary = text === '' ? 0 : parseMoney(text);
    if (salary == null) {
      $('#err-salary', dlg).textContent = t('err.number');
      salaryInput.setAttribute('aria-invalid', 'true');
      salaryInput.focus();
      return;
    }
    const allocBp = {};
    for (const c of draft.cats) allocBp[c.key] = draft.bp[c.key] ?? 0;
    const allocChanged = draft.cats.some((c) => (origBp[c.key] ?? 0) !== allocBp[c.key]);

    // เปลี่ยนสัดส่วนแล้วถามว่าใช้กับเดือนถัดไปที่บันทึกแล้วด้วยไหม (SPEC ข้อ 6.3)
    let scope = 'this';
    const later = app.savedMonthsAfter(key);
    if (allocChanged && later.length) {
      scope = await choose({
        title: t('s.scopeTitle'),
        message: t('s.scopeMsg', { n: later.length }),
        options: [
          { label: t('s.scopeThis'), value: 'this', tone: 'plain' },
          { label: t('s.scopeForward'), value: 'forward', tone: 'primary' },
        ],
      });
      if (!scope) return;
    }

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (JSON.stringify(draft.cats) !== origCatsJson || draft.removed.length) {
        await app.saveCats(draft.cats, draft.removed);
      }
      await app.saveSalary(key, { salarySatang: salary, allocBp }, scope);
      dlg.close();
      app.rerender();
    } catch {
      submit.disabled = false;
    }
  });

  renderList();
  if (focusAdd) newCat.focus();
  else if (!draft.salary) salaryInput.focus();
  return dlg;
}
