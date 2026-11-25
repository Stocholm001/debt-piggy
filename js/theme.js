// theme.js — ธีมสี (design/THEMES.md) เลือกได้ในหน้าตั้งค่า จำแยกตามเครื่อง (localStorage)
// ค่าสีอยู่ใน css/themes.css ที่นี่เก็บแค่ชื่อ, สีตัวอย่าง และสีแถบสถานะของมือถือ

import { t } from './i18n.js';

const THEME_KEY = 'debt-piggy:theme';

export const THEMES = Object.freeze([
  Object.freeze({ id: 'yellow', label: 'เหลืองกระปุก', bg: '#FFF8DC', card: '#FFFFFF', accent: '#B4441A', paid: '#2F6B45', meta: '#FFE89A' }),
  Object.freeze({ id: 'mint', label: 'มินต์สดชื่น', bg: '#EEF8F3', card: '#FFFFFF', accent: '#17785A', paid: '#1D5C9E', meta: '#EEF8F3' }),
  Object.freeze({ id: 'ocean', label: 'ฟ้าทะเล', bg: '#EEF5FC', card: '#FFFFFF', accent: '#1F5FA8', paid: '#2F6B45', meta: '#EEF5FC' }),
  Object.freeze({ id: 'peach', label: 'พีชแซลมอน', bg: '#FFF3EC', card: '#FFFFFF', accent: '#B93C0C', paid: '#2F6B45', meta: '#FFF3EC' }),
  Object.freeze({ id: 'sakura', label: 'ชมพูซากุระ', bg: '#FFF2F5', card: '#FFFFFF', accent: '#B12E5B', paid: '#2F6B45', meta: '#FFF2F5' }),
  Object.freeze({ id: 'latte', label: 'ลาเต้กาแฟ', bg: '#F7F1E8', card: '#FFFFFF', accent: '#87472A', paid: '#3B6A46', meta: '#F7F1E8' }),
  Object.freeze({ id: 'matcha', label: 'เขียวมัทฉะ', bg: '#F3F6EA', card: '#FFFFFF', accent: '#4B6A1D', paid: '#1D5C9E', meta: '#F3F6EA' }),
  Object.freeze({ id: 'navy-gold', label: 'กรมท่าทอง', bg: '#F5F3EE', card: '#FFFFFF', accent: '#1E2F5C', paid: '#2F6B45', meta: '#F5F3EE' }),
  Object.freeze({ id: 'teal-coral', label: 'เทอร์ควอยซ์ปะการัง', bg: '#EFF8F8', card: '#FFFFFF', accent: '#BF3F2A', paid: '#0F6E66', meta: '#EFF8F8' }),
  Object.freeze({ id: 'graphite', label: 'กราไฟต์มินิมอล', bg: '#F5F5F2', card: '#FFFFFF', accent: '#222222', paid: '#2F6B45', meta: '#F5F5F2' }),
  Object.freeze({ id: 'midnight', label: 'กลางคืน (มืด)', bg: '#12161F', card: '#1C2230', accent: '#F5B84C', paid: '#62CC92', meta: '#12161F' }),
]);

export const DEFAULT_THEME = 'yellow';

/** ชื่อธีมตามภาษา */
export const themeName = (id) => t(`theme.${id}`);

const find = (id) => THEMES.find((x) => x.id === id);

let current = DEFAULT_THEME;
export const getTheme = () => current;

/** ตั้งธีม (ค่าที่ไม่รู้จักใช้ค่าเริ่มต้น) ใส่ data-theme และสีแถบสถานะ แล้วจำไว้ในเครื่อง */
export function setTheme(id, storage = globalThis.localStorage) {
  current = find(id) ? id : DEFAULT_THEME;
  try { storage?.setItem(THEME_KEY, current); } catch { /* storage ใช้ไม่ได้ ก็ใช้แค่ในหน่วยความจำ */ }
  if (globalThis.document) {
    const root = document.documentElement;
    if (current === DEFAULT_THEME) delete root.dataset.theme; else root.dataset.theme = current;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', find(current).meta);
  }
  return current;
}

/** อ่านธีมที่เคยเลือกไว้ในเครื่อง */
export function initTheme(storage = globalThis.localStorage) {
  let saved = null;
  try { saved = storage?.getItem(THEME_KEY); } catch { /* ignore */ }
  return setTheme(saved ?? DEFAULT_THEME, storage);
}
