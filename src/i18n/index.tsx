import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import de from "./locales/de.json";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import tr from "./locales/tr.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";

export type LanguageCode = "de" | "en" | "ru" | "tr" | "fr" | "es";

export const SUPPORTED_LANGUAGES: LanguageCode[] = [
  "de",
  "en",
  "ru",
  "tr",
  "fr",
  "es",
];

export interface LocaleOption {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  { code: "de", nativeName: "Deutsch", englishName: "German" },
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "ru", nativeName: "Русский", englishName: "Russian" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish" },
  { code: "fr", nativeName: "Français", englishName: "French" },
  { code: "es", nativeName: "Español", englishName: "Spanish" },
];

const TABLES: Record<LanguageCode, Record<string, string>> = {
  de: de as Record<string, string>,
  en: en as Record<string, string>,
  ru: ru as Record<string, string>,
  tr: tr as Record<string, string>,
  fr: fr as Record<string, string>,
  es: es as Record<string, string>,
};

const LOCALE_STORAGE_KEY = "app_locale";
const USER_LOCALE_PREFIX = "app_locale_user_";

let currentLanguageCodeGlobal: LanguageCode = "en";

/** Mirrors LocaleProvider.currentLanguageCode from the Flutter app (used outside React). */
export function getCurrentLanguageCode(): LanguageCode {
  return currentLanguageCodeGlobal;
}

export function normalizeLanguageCode(value: string | null | undefined): LanguageCode | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return (SUPPORTED_LANGUAGES as string[]).includes(normalized)
    ? (normalized as LanguageCode)
    : null;
}

/** Translation lookup with the same fallback chain as the Flutter app: lang -> en -> de -> key. */
export function translate(
  lang: LanguageCode,
  key: string,
  params?: Record<string, string | number>
): string {
  const raw = TABLES[lang][key] ?? TABLES.en[key] ?? TABLES.de[key] ?? key;
  if (!params) return raw;
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
    raw
  );
}

interface I18nContextValue {
  lang: LanguageCode;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLanguage: (lang: LanguageCode, userId?: string | null) => void;
  syncWithUser: (
    userId: string | null,
    preferredLanguageCode: string | null | undefined
  ) => LanguageCode;
  languageName: (code?: LanguageCode) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<LanguageCode>(() => {
    // First-time users default to English regardless of system/browser
    // locale — the app targets an international audience. Users can switch
    // to their preferred language in Settings; that choice is what's read
    // from LOCALE_STORAGE_KEY on every load after the first.
    const stored = normalizeLanguageCode(localStorage.getItem(LOCALE_STORAGE_KEY));
    const initial = stored ?? "en";
    currentLanguageCodeGlobal = initial;
    return initial;
  });

  useEffect(() => {
    currentLanguageCodeGlobal = lang;
    document.documentElement.lang = lang;
  }, [lang]);

  const setLanguage = useCallback((next: LanguageCode, userId?: string | null) => {
    setLang(next);
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
    if (userId && userId.trim()) {
      localStorage.setItem(`${USER_LOCALE_PREFIX}${userId}`, next);
    }
  }, []);

  const syncWithUser = useCallback(
    (userId: string | null, preferredLanguageCode: string | null | undefined) => {
      if (!userId || !userId.trim()) return lang;
      const storedUser = normalizeLanguageCode(
        localStorage.getItem(`${USER_LOCALE_PREFIX}${userId}`)
      );
      const storedGlobal = normalizeLanguageCode(
        localStorage.getItem(LOCALE_STORAGE_KEY)
      );
      const cloud = normalizeLanguageCode(preferredLanguageCode);
      const resolved = storedUser ?? storedGlobal ?? cloud ?? "en";
      if (resolved !== lang) {
        setLang(resolved);
      }
      localStorage.setItem(LOCALE_STORAGE_KEY, resolved);
      localStorage.setItem(`${USER_LOCALE_PREFIX}${userId}`, resolved);
      return resolved;
    },
    [lang]
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(lang, key, params),
    [lang]
  );

  const languageName = useCallback(
    (code?: LanguageCode) => {
      const target = code ?? lang;
      return (
        LOCALE_OPTIONS.find((option) => option.code === target)?.nativeName ??
        "English"
      );
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, t, setLanguage, syncWithUser, languageName }),
    [lang, t, setLanguage, syncWithUser, languageName]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
