import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import heMessages from './locales/he.json';
import enMessages from './locales/en.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      he: {
        translation: heMessages.Reporting
      },
      en: {
        translation: enMessages.Reporting
      }
    },
    lng: 'he',
    fallbackLng: 'he',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
