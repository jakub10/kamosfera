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

// Kamosféra je celá česky. Menu se dřív řídilo jazykem prohlížeče, takže
// kamarádi ze Slovenska měli menu slovensky a zbytek česky.
i18n
  .use(initReactI18next)
  .init({
    lng: 'cs',
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
