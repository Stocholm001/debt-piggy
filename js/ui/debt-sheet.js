// ui/debt-sheet.js — หน้าต่างเพิ่ม/แก้หนี้ (D05, SPEC ข้อ 3.3) เป็น bottom sheet
// แสดงค่าจริงเสมอ (ไม่สนสถานะซ่อนตัวเลข) ไม่ใช้ alert/confirm ของเบราว์เซอร์

import { monthOptions, isClosed, storedPay } from '../calc.js';
import { monthLabel } from '../dates.js';
import { formatMoney, parseMoney, parsePercent, moneyFieldValue, pctFieldValue } from '../format.js';
import { html, $, openSheet, bindMoneyInputs, confirmDialog, toast } from './dom.js';
import { icons } from './icons.js';
import { newId } from './common.js';
import { t } from '../i18n.js';

/** ยอดที่บันทึกจ่ายไว้ทุกเดือน (ไม่ตัดด้วยยอดตั้งต้น ใช้เตือนตอนลดยอดตั้งต้น) */
function storedPaidAll(debt, months) {
  return Object.keys(months).reduce((s, k) => s + storedPay(debt, months, k), 0);
}

/**
 * @param opts.debt  หนี้ที่จะแก้ (ไม่มี = เพิ่มใหม่)
 */
export function openDebtSheet(app, { debt = null } = {}) {
  const editing = !!debt;
  const startDefault = debt?.startMonth ?? app.lastMonth;
  const opts = monthOptions(app.debts, app.currentKey);
  if (!opts.includes(startDefault)) opts.push(startDefault);
  opts.sort();
  const paidAll = editing ? storedPaidAll(debt, app.months) : 0;
  const closed = editing && isClosed(debt, app.months);

  const dlg = openSheet(html`
    <form class="sheet__form" novalidate>
      <div class="sheet__grip" aria-hidden="true"></div>
      <div class="sheet__head">
        <h2 class="sheet__title" id="debt-title">${editing ? t('d.edit') : t('d.add')}</h2>
        <button type="button" class="icon-btn" data-close aria-label="${t('common.close')}">${icons.close()}</button>
      </div>

      <div class="row-debt">
        <label class="field">
          <span class="field__label">${t('d.creditor')}</span>
          <input class="input" name="creditor" maxlength="60" autocomplete="off" placeholder="${t('d.creditorPh')}"
                 value="${debt?.creditor ?? ''}">
        </label>
        <label class="field">
          <span class="field__label">${t('d.account')}</span>
          <input class="input" name="account" maxlength="60" autocomplete="off" required
                 aria-describedby="err-account" value="${debt?.account ?? ''}">
          <span class="field__error" id="err-account" aria-live="polite"></span>
        </label>
      </div>

      <label class="field">
        <span class="field__label">${t('d.initial')}</span>
        <input class="input input--big" name="initial" inputmode="decimal" autocomplete="off" required
               aria-describedby="err-initial hint-initial" value="${moneyFieldValue(debt?.initialSatang ?? 0)}">
        <span class="field__error" id="err-initial" aria-live="polite"></span>
        ${editing ? html`
          <span class="field__hint" id="hint-initial">${t('d.paidHint', { amount: formatMoney(paidAll) })}</span>
          <span class="field__warn" id="warn-initial" aria-live="polite"></span>` : ''}
      </label>

      <div class="row2">
        <label class="field">
          <span class="field__label">${t('d.rate')}</span>
          <input class="input" name="rate" inputmode="decimal" autocomplete="off" aria-describedby="err-rate"
                 value="${editing ? pctFieldValue(debt.rateBp) : ''}">
          <span class="field__error" id="err-rate" aria-live="polite"></span>
        </label>
        <label class="field">
          <span class="field__label">${t('d.due')}</span>
          <input class="input" name="due" maxlength="40" autocomplete="off" placeholder="${t('d.duePh')}"
                 value="${debt?.due ?? ''}">
        </label>
      </div>

      <label class="field">
        <span class="field__label">${t('d.start')}</span>
        <select class="select" name="startMonth">
          ${opts.map((k) => html`<option value="${k}" ${k === startDefault ? html`selected` : ''}>${monthLabel(k)}</option>`)}
        </select>
      </label>

      ${closed ? html`
        <button type="button" class="btn btn--plain btn--block" id="reopen">${icons.refresh()} ${t('d.reopen')}</button>` : ''}
      ${editing ? html`
        <button type="button" class="btn btn--danger btn--block" id="delete">${icons.trash()} ${t('d.delete')}</button>` : ''}

      <div class="sheet__actions">
        <button type="button" class="btn btn--ghost" data-close>${t('common.cancel')}</button>
        <button type="submit" class="btn btn--primary">${t('common.save')}</button>
      </div>
    </form>`, { labelledBy: 'debt-title' });

  const form = $('form', dlg);
  const f = form.elements;
  bindMoneyInputs(form, '[name="initial"]');
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));

  const setError = (name, msg) => {
    $(`#err-${name}`, dlg).textContent = msg;
    f[name].setAttribute('aria-invalid', msg ? 'true' : 'false');
  };

  // เตือนเมื่อยอดตั้งต้นน้อยกว่ายอดที่จ่ายแล้ว (ยังบันทึกได้)
  const warnEl = $('#warn-initial', dlg);
  const updateWarn = () => {
    if (!warnEl) return;
    const v = parseMoney(f.initial.value);
    warnEl.textContent = v != null && v < paidAll ? t('d.warnLow') : '';
  };
  f.initial.addEventListener('input', () => { setError('initial', ''); updateWarn(); });
  f.account.addEventListener('input', () => setError('account', ''));
  f.rate.addEventListener('input', () => setError('rate', ''));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const account = f.account.value.trim();
    const initial = parseMoney(f.initial.value);
    const rateText = f.rate.value.trim();
    const rate = rateText === '' ? 0 : parsePercent(rateText);

    let firstBad = null;
    const bad = (name, msg) => { setError(name, msg); firstBad ??= name; };
    if (!account) bad('account', t('d.errAccount'));
    if (initial == null) bad('initial', f.initial.value.trim() ? t('err.number') : t('d.errInitial'));
    else if (initial <= 0) bad('initial', t('d.errInitialPos'));
    if (rate == null) bad('rate', t('d.errRate'));
    else if (rate > 99999) bad('rate', t('d.errRateHigh'));
    if (firstBad) { f[firstBad].focus(); return; }

    const next = {
      id: debt?.id ?? newId('dbt'),
      creditor: f.creditor.value.trim(),
      account,
      initialSatang: initial,
      rateBp: rate,
      due: f.due.value.trim(),
      startMonth: f.startMonth.value,
      createdAt: debt?.createdAt ?? Date.now(),
    };
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await app.saveDebt(next);
      dlg.close();
      app.rerender();
    } catch {
      submit.disabled = false;
    }
  });

  $('#delete', dlg)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: t('d.delTitle'),
      message: t('d.delMsg', { name: debt.account }),
      okLabel: t('d.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await app.deleteDebt(debt.id);
      dlg.close();
      toast(t('d.deleted', { name: debt.account }));
      app.rerender();
    } catch { /* แสดงสถานะบันทึกไม่สำเร็จแล้ว */ }
  });

  $('#reopen', dlg)?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: t('d.reopenTitle'),
      message: t('d.reopenMsg', { name: debt.account }),
      okLabel: t('d.reopenOk'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await app.reopenDebt(debt.id);
      dlg.close();
      toast(t('d.reopened', { name: debt.account }));
      app.rerender();
    } catch { /* แสดงสถานะบันทึกไม่สำเร็จแล้ว */ }
  });

  if (!editing) f.creditor.focus();
  return dlg;
}
