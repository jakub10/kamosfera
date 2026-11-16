import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import cs from './locales/cs.json';
import sk from './locales/sk.json';
import en from './locales/en.json';

export const SUPPORTED_LANGS = ['cs', 'sk', 'en'] as const;
export type Lang = typeof SUPPORTED_LANGS[number];

export const LANG_LABELS: Record<Lang, string> = {
  cs: '🇨🇿 Čeština',
  sk: '🇸🇰 Slovenčina',
  en: '🇬🇧 English',
};

const STORAGE_KEY = 'kamosfera-lang';

// Výchozí je čeština. Jazyk se NEŘÍDÍ prohlížečem (kamarádi ze Slovenska
// pak měli menu slovensky a zbytek česky, aniž by si to vybrali) — platí
// jen to, co si člověk sám zvolí v Nastavení.
function savedLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if ((SUPPORTED_LANGS as readonly string[]).includes(saved ?? '')) return saved as Lang;
  } catch {
    // bez úložiště (soukromé okno, předrenderování) zůstane čeština
  }
  return 'cs';
}

i18n.on('languageChanged', (lng) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, lng);
    document.documentElement.lang = lng;
  } catch {
    // nejde uložit — jazyk platí aspoň do zavření stránky
  }
});

i18n
  .use(initReactI18next)
  .init({
    lng: savedLang(),
    resources: {
      cs: { translation: cs },
      sk: { translation: sk },
      en: { translation: en },
    },
    fallbackLng: 'cs',
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    interpolation: { escapeValue: false },
  });

export default i18n;
