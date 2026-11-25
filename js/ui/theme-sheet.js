// ui/theme-sheet.js — เลือกธีมสี (design/THEMES.md) แตะแล้วเปลี่ยนทั้งแอปทันที จำแยกตามเครื่อง

import { THEMES, getTheme, setTheme } from '../theme.js';
import { html, $, $$, openSheet } from './dom.js';
import { icons } from './icons.js';

/** เปิดแผ่นเลือกธีม → Promise ที่จบเมื่อปิด */
export function openThemeSheet() {
  return new Promise((resolve) => {
    const cur = getTheme();
    const dlg = openSheet(html`
      <div class="sheet__form">
        <div class="sheet__grip" aria-hidden="true"></div>
        <div class="sheet__head">
          <h2 class="sheet__title" id="theme-title">ธีมสี</h2>
          <button type="button" class="icon-btn" data-close aria-label="ปิด">${icons.close()}</button>
        </div>
        <div class="themes" role="radiogroup" aria-labelledby="theme-title">
          ${THEMES.map((th) => html`
            <button type="button" class="theme-opt" role="radio" data-theme-id="${th.id}" aria-checked="${String(th.id === cur)}">
              <span class="theme-opt__swatch" style="background:${th.bg}" aria-hidden="true">
                <span style="background:${th.card}"></span>
                <span style="background:${th.accent}"></span>
                <span style="background:${th.paid}"></span>
              </span>
              <span class="theme-opt__label">${th.label}</span>
              <span class="theme-opt__check" aria-hidden="true">${icons.check(16)}</span>
            </button>`)}
        </div>
        <p class="hint">จำธีมไว้ในเครื่องนี้ เครื่องอื่นเลือกแยกได้</p>
      </div>`, { labelledBy: 'theme-title' });

    $('[data-close]', dlg).addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-theme-id]');
      if (!opt) { if (e.target === dlg) dlg.close(); return; }
      setTheme(opt.dataset.themeId);
      for (const b of $$('[data-theme-id]', dlg)) b.setAttribute('aria-checked', String(b === opt));
    });
    dlg.addEventListener('close', () => resolve(getTheme()));
  });
}
