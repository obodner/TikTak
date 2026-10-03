import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import heMessages from './locales/he.json';
import enMessages from './locales/en.json';

/**
 * Merge all section dictionaries (Reporting, Analytics, Quota, Notifications, etc.)
 * into a single flat translation map so every t('key') resolves seamlessly.
 */
function flattenLocaleMessages(localeObj: Record<string, any>): Record<string, any> {
  let combined: Record<string, any> = {};
  for (const [_, val] of Object.entries(localeObj)) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      combined = { ...combined, ...val };
    }
  }
  return { ...combined, ...localeObj };
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      he: {
        translation: flattenLocaleMessages(heMessages)
      },
      en: {
        translation: flattenLocaleMessages(enMessages)
      }
    },
    lng: 'he',
    fallbackLng: 'he',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
