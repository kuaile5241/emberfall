import campEnglish from './locales/camp-en.js';
import gameEnglish from './locales/game-en.js';
import uiEnglish from './locales/ui-en.js';
import campV6English from './locales/camp-v6-en.js';
import inventoryEnglish from './locales/inventory-en.js';

export const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en']);
const english = Object.freeze({ ...gameEnglish, ...campEnglish, ...uiEnglish, ...campV6English, ...inventoryEnglish });
const listeners = new Set();
let locale = 'zh-CN';
let storage = null;
let storageKey = 'emberfall.locale.v1';

export const getLocale = () => locale;

/** Language is a display preference, kept separate from camp and run saves. */
export function initLocale(options = {}) {
  storage = options.storage ?? null;
  storageKey = options.key ?? 'emberfall.locale.v1';
  let saved;
  try { saved = storage?.getItem(storageKey); } catch { /* Play without persistence. */ }
  const next = SUPPORTED_LOCALES.includes(saved) ? saved : 'zh-CN';
  if (locale !== next) {
    locale = next;
    for (const listener of listeners) listener(locale);
  }
  return locale;
}

export function setLocale(next) {
  if (!SUPPORTED_LOCALES.includes(next) || next === locale) return false;
  locale = next;
  try { storage?.setItem(storageKey, locale); } catch { /* Switching still works. */ }
  for (const listener of listeners) listener(locale);
  return true;
}

export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Translate at render time so language switches never mutate game content. */
export function t(source, params = {}) {
  const original = String(source ?? '');
  const text = locale === 'en' && Object.hasOwn(english, original) ? english[original] : original;
  return text.replace(/\{(\w+)\}/g, (placeholder, key) => Object.hasOwn(params, key) ? String(params[key]) : placeholder);
}
