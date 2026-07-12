import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { uuid } from "@/lib/crypto";

/** Port of user_theme_provider.dart + theme_preset_service.dart.
 *  12 customizable colors per light/dark palette, layout scale, theme mode,
 *  named presets, localStorage persistence and cloud sync. */

export interface ThemePalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  cardBorder: string;
  text: string;
  appBarBackground: string;
  appBarForeground: string;
  navIndicator: string;
  navSelectedIcon: string;
  navUnselectedIcon: string;
}

export type ThemeMode = "system" | "light" | "dark";

export interface ThemeProfileSnapshot {
  lightPalette: ThemePalette;
  darkPalette: ThemePalette;
  layoutScale: number;
  themeMode: ThemeMode;
}

export interface ThemePreset {
  id: string;
  name: string;
  snapshot: ThemeProfileSnapshot;
  createdAt: number;
}

export const DEFAULT_LIGHT_PALETTE: ThemePalette = {
  primary: "#2563EB",
  secondary: "#0F766E",
  accent: "#0EA5A4",
  background: "#F7F8FC",
  surface: "#FFFFFF",
  cardBorder: "#E3E7F0",
  text: "#0F172A",
  appBarBackground: "#FFFFFF",
  appBarForeground: "#0F172A",
  navIndicator: "#DBEAFE",
  navSelectedIcon: "#2563EB",
  navUnselectedIcon: "#64748B",
};

// Neutral near-black dark theme — intentionally low on blue/navy tinting
// (backgrounds and borders are true grays; only the primary accent keeps a
// cool hue) so the UI reads as charcoal/graphite rather than "navy app".
export const DEFAULT_DARK_PALETTE: ThemePalette = {
  primary: "#5B8DEF",
  secondary: "#14B8A6",
  accent: "#34D399",
  background: "#0A0A0B",
  surface: "#141416",
  cardBorder: "#242428",
  text: "#EDEDEF",
  appBarBackground: "#0A0A0B",
  appBarForeground: "#EDEDEF",
  navIndicator: "#1A1D24",
  navSelectedIcon: "#9DB8F5",
  navUnselectedIcon: "#71717A",
};

export const DEFAULT_LAYOUT_SCALE = 1.0;
// The app ships in dark mode by default; users can switch in Settings.
export const DEFAULT_THEME_MODE: ThemeMode = "dark";

/** Curated, ready-made color presets shown in Settings → Appearance,
 *  selectable with a single click (distinct from user-saved custom presets). */
export interface BuiltInPreset {
  id: string;
  name: string;
  lightPalette: ThemePalette;
  darkPalette: ThemePalette;
}

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  {
    id: "midnight",
    name: "Midnight",
    lightPalette: DEFAULT_LIGHT_PALETTE,
    darkPalette: DEFAULT_DARK_PALETTE,
  },
  {
    id: "slate",
    name: "Slate",
    lightPalette: {
      primary: "#475569",
      secondary: "#0EA5A4",
      accent: "#6366F1",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      cardBorder: "#E2E8F0",
      text: "#1E293B",
      appBarBackground: "#FFFFFF",
      appBarForeground: "#1E293B",
      navIndicator: "#E2E8F0",
      navSelectedIcon: "#475569",
      navUnselectedIcon: "#94A3B8",
    },
    darkPalette: {
      primary: "#94A3B8",
      secondary: "#2DD4BF",
      accent: "#818CF8",
      background: "#0C0C0D",
      surface: "#161618",
      cardBorder: "#27272A",
      text: "#E4E4E7",
      appBarBackground: "#0C0C0D",
      appBarForeground: "#E4E4E7",
      navIndicator: "#1F1F22",
      navSelectedIcon: "#C0CCDA",
      navUnselectedIcon: "#71717A",
    },
  },
  {
    id: "studio-violet",
    name: "Studio Violet",
    lightPalette: {
      primary: "#7C3AED",
      secondary: "#A855F7",
      accent: "#C026D3",
      background: "#FAF8FF",
      surface: "#FFFFFF",
      cardBorder: "#E9E1FB",
      text: "#1E1033",
      appBarBackground: "#FFFFFF",
      appBarForeground: "#1E1033",
      navIndicator: "#EDE4FF",
      navSelectedIcon: "#7C3AED",
      navUnselectedIcon: "#8A7BA6",
    },
    darkPalette: {
      primary: "#A78BFA",
      secondary: "#C084FC",
      accent: "#E879F9",
      background: "#0B0910",
      surface: "#16121F",
      cardBorder: "#2A2138",
      text: "#EDE9F7",
      appBarBackground: "#0B0910",
      appBarForeground: "#EDE9F7",
      navIndicator: "#241A35",
      navSelectedIcon: "#C4B5FD",
      navUnselectedIcon: "#786E92",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    lightPalette: {
      primary: "#059669",
      secondary: "#0D9488",
      accent: "#16A34A",
      background: "#F5FBF8",
      surface: "#FFFFFF",
      cardBorder: "#D8EFE3",
      text: "#0F2A20",
      appBarBackground: "#FFFFFF",
      appBarForeground: "#0F2A20",
      navIndicator: "#D1FAE5",
      navSelectedIcon: "#059669",
      navUnselectedIcon: "#6B9080",
    },
    darkPalette: {
      primary: "#34D399",
      secondary: "#2DD4BF",
      accent: "#4ADE80",
      background: "#08100D",
      surface: "#101A16",
      cardBorder: "#1F2E27",
      text: "#E3F5EC",
      appBarBackground: "#08100D",
      appBarForeground: "#E3F5EC",
      navIndicator: "#16261F",
      navSelectedIcon: "#6EE7B7",
      navUnselectedIcon: "#62786F",
    },
  },
  {
    id: "amber-ember",
    name: "Amber Ember",
    lightPalette: {
      primary: "#D97706",
      secondary: "#EA580C",
      accent: "#DC2626",
      background: "#FFFAF3",
      surface: "#FFFFFF",
      cardBorder: "#F5E3C8",
      text: "#2B1B08",
      appBarBackground: "#FFFFFF",
      appBarForeground: "#2B1B08",
      navIndicator: "#FEF0D8",
      navSelectedIcon: "#D97706",
      navUnselectedIcon: "#A98E6C",
    },
    darkPalette: {
      primary: "#FBBF24",
      secondary: "#FB923C",
      accent: "#F87171",
      background: "#100C08",
      surface: "#1B140D",
      cardBorder: "#2E2417",
      text: "#F5E9D8",
      appBarBackground: "#100C08",
      appBarForeground: "#F5E9D8",
      navIndicator: "#271D10",
      navSelectedIcon: "#FCD34D",
      navUnselectedIcon: "#8A7C68",
    },
  },
  {
    id: "crimson",
    name: "Crimson",
    lightPalette: {
      primary: "#DC2626",
      secondary: "#E11D48",
      accent: "#EC4899",
      background: "#FFF8F8",
      surface: "#FFFFFF",
      cardBorder: "#F6DADA",
      text: "#2A0E0E",
      appBarBackground: "#FFFFFF",
      appBarForeground: "#2A0E0E",
      navIndicator: "#FEE2E2",
      navSelectedIcon: "#DC2626",
      navUnselectedIcon: "#B08787",
    },
    darkPalette: {
      primary: "#F87171",
      secondary: "#FB7185",
      accent: "#F472B6",
      background: "#100809",
      surface: "#1C1113",
      cardBorder: "#2E1B1E",
      text: "#F6E4E4",
      appBarBackground: "#100809",
      appBarForeground: "#F6E4E4",
      navIndicator: "#2A161A",
      navSelectedIcon: "#FCA5A5",
      navUnselectedIcon: "#8A6B6E",
    },
  },
];

const STORAGE_KEY = "user_theme_profile_v1";
const PRESETS_KEY = "user_theme_presets_v1";

function sanitizePalette(
  raw: Partial<ThemePalette> | undefined,
  fallback: ThemePalette
): ThemePalette {
  const result = { ...fallback };
  if (!raw) return result;
  for (const key of Object.keys(fallback) as (keyof ThemePalette)[]) {
    const value = raw[key];
    if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
      result[key] = value.toUpperCase();
    }
  }
  return result;
}

// The dark palette shipped before the "too blue" fix — used only to detect
// snapshots that still carry the old, untouched default so we can migrate
// them forward automatically without clobbering anyone's custom colors.
const LEGACY_NAVY_DARK_PALETTE: ThemePalette = {
  primary: "#60A5FA",
  secondary: "#2DD4BF",
  accent: "#34D399",
  background: "#0B1220",
  surface: "#111A2E",
  cardBorder: "#233250",
  text: "#E2E8F0",
  appBarBackground: "#0B1220",
  appBarForeground: "#E2E8F0",
  navIndicator: "#1E3A8A",
  navSelectedIcon: "#93C5FD",
  navUnselectedIcon: "#64748B",
};

function palettesEqual(a: ThemePalette, b: ThemePalette): boolean {
  return (Object.keys(a) as (keyof ThemePalette)[]).every(
    (key) => a[key].toUpperCase() === b[key].toUpperCase()
  );
}

function sanitizeSnapshot(raw: Partial<ThemeProfileSnapshot> | undefined): ThemeProfileSnapshot {
  const layoutScale =
    typeof raw?.layoutScale === "number"
      ? Math.min(1.3, Math.max(0.8, raw.layoutScale))
      : DEFAULT_LAYOUT_SCALE;
  const themeMode: ThemeMode =
    raw?.themeMode === "light" || raw?.themeMode === "dark" || raw?.themeMode === "system"
      ? raw.themeMode
      : DEFAULT_THEME_MODE;
  const sanitizedDark = sanitizePalette(raw?.darkPalette, DEFAULT_DARK_PALETTE);
  const darkPalette = palettesEqual(sanitizedDark, LEGACY_NAVY_DARK_PALETTE)
    ? DEFAULT_DARK_PALETTE
    : sanitizedDark;
  return {
    lightPalette: sanitizePalette(raw?.lightPalette, DEFAULT_LIGHT_PALETTE),
    darkPalette,
    layoutScale,
    themeMode,
  };
}

function loadLocalSnapshot(userId: string | null): ThemeProfileSnapshot {
  try {
    const key = userId ? `${userId}_${STORAGE_KEY}` : STORAGE_KEY;
    const raw = localStorage.getItem(key) ?? localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeSnapshot(JSON.parse(raw) as Partial<ThemeProfileSnapshot>);
  } catch {
    // fall through
  }
  return sanitizeSnapshot(undefined);
}

function saveLocalSnapshot(userId: string | null, snapshot: ThemeProfileSnapshot): void {
  const json = JSON.stringify(snapshot);
  localStorage.setItem(STORAGE_KEY, json);
  if (userId) localStorage.setItem(`${userId}_${STORAGE_KEY}`, json);
}

function loadPresets(): ThemePreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ThemePreset[];
      return parsed.map((p) => ({ ...p, snapshot: sanitizeSnapshot(p.snapshot) }));
    }
  } catch {
    // fall through
  }
  return [];
}

interface ThemeContextValue {
  lightPalette: ThemePalette;
  darkPalette: ThemePalette;
  layoutScale: number;
  themeMode: ThemeMode;
  effectiveDark: boolean;
  presets: ThemePreset[];
  builtInPresets: BuiltInPreset[];
  setThemeMode: (mode: ThemeMode) => void;
  setLayoutScale: (scale: number) => void;
  updatePaletteColor: (
    mode: "light" | "dark",
    key: keyof ThemePalette,
    color: string
  ) => void;
  resetPalettes: () => void;
  savePreset: (name: string) => void;
  applyPreset: (presetId: string) => void;
  applyBuiltInPreset: (presetId: string) => void;
  deletePreset: (presetId: string) => void;
  bindUser: (userId: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyCssVariables(palette: ThemePalette, dark: boolean, scale: number): void {
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.setProperty("--user-primary", palette.primary);
  root.style.setProperty("--user-secondary", palette.secondary);
  root.style.setProperty("--user-accent", palette.accent);
  root.style.setProperty("--user-background", palette.background);
  root.style.setProperty("--user-surface", palette.surface);
  root.style.setProperty("--user-card-border", palette.cardBorder);
  root.style.setProperty("--user-text", palette.text);
  root.style.setProperty("--user-appbar-bg", palette.appBarBackground);
  root.style.setProperty("--user-appbar-fg", palette.appBarForeground);
  root.style.setProperty("--user-nav-indicator", palette.navIndicator);
  root.style.setProperty("--user-nav-selected", palette.navSelectedIcon);
  root.style.setProperty("--user-nav-unselected", palette.navUnselectedIcon);
  root.style.setProperty("--layout-scale", String(scale));
  root.style.fontSize = `${16 * scale}px`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ThemeProfileSnapshot>(() =>
    loadLocalSnapshot(null)
  );
  const [presets, setPresets] = useState<ThemePreset[]>(loadPresets);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [boundUserId, setBoundUserId] = useState<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const effectiveDark =
    snapshot.themeMode === "dark" || (snapshot.themeMode === "system" && systemDark);

  useEffect(() => {
    applyCssVariables(
      effectiveDark ? snapshot.darkPalette : snapshot.lightPalette,
      effectiveDark,
      snapshot.layoutScale
    );
  }, [snapshot, effectiveDark]);

  const persist = useCallback(
    (next: ThemeProfileSnapshot) => {
      setSnapshot(next);
      saveLocalSnapshot(boundUserId, next);
      if (boundUserId) {
        void setDoc(
          doc(db, "users", boundUserId, "private", "themePrefs"),
          { profile: JSON.stringify(next), updatedAt: serverTimestamp() },
          { merge: true }
        ).catch(() => undefined);
      }
    },
    [boundUserId]
  );

  const bindUser = useCallback((userId: string | null) => {
    setBoundUserId(userId);
    if (!userId) return;
    setSnapshot(loadLocalSnapshot(userId));
    void getDoc(doc(db, "users", userId, "private", "themePrefs"))
      .then((cloudDoc) => {
        const raw = cloudDoc.data()?.profile;
        if (typeof raw === "string" && raw.trim()) {
          const parsed = sanitizeSnapshot(
            JSON.parse(raw) as Partial<ThemeProfileSnapshot>
          );
          setSnapshot(parsed);
          saveLocalSnapshot(userId, parsed);
        }
      })
      .catch(() => undefined);
  }, []);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => persist({ ...snapshot, themeMode: mode }),
    [persist, snapshot]
  );

  const setLayoutScale = useCallback(
    (scale: number) =>
      persist({ ...snapshot, layoutScale: Math.min(1.3, Math.max(0.8, scale)) }),
    [persist, snapshot]
  );

  const updatePaletteColor = useCallback(
    (mode: "light" | "dark", key: keyof ThemePalette, color: string) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
      const paletteKey = mode === "light" ? "lightPalette" : "darkPalette";
      persist({
        ...snapshot,
        [paletteKey]: { ...snapshot[paletteKey], [key]: color.toUpperCase() },
      });
    },
    [persist, snapshot]
  );

  const resetPalettes = useCallback(() => {
    persist({
      ...snapshot,
      lightPalette: { ...DEFAULT_LIGHT_PALETTE },
      darkPalette: { ...DEFAULT_DARK_PALETTE },
      layoutScale: DEFAULT_LAYOUT_SCALE,
    });
  }, [persist, snapshot]);

  const savePreset = useCallback(
    (name: string) => {
      const preset: ThemePreset = {
        id: uuid(),
        name: name.trim() || "Preset",
        snapshot: { ...snapshot },
        createdAt: Date.now(),
      };
      const next = [...presets, preset];
      setPresets(next);
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    },
    [presets, snapshot]
  );

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = presets.find((p) => p.id === presetId);
      if (preset) persist(sanitizeSnapshot(preset.snapshot));
    },
    [presets, persist]
  );

  const deletePreset = useCallback(
    (presetId: string) => {
      const next = presets.filter((p) => p.id !== presetId);
      setPresets(next);
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    },
    [presets]
  );

  const applyBuiltInPreset = useCallback(
    (presetId: string) => {
      const preset = BUILT_IN_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      persist({
        ...snapshot,
        lightPalette: { ...preset.lightPalette },
        darkPalette: { ...preset.darkPalette },
      });
    },
    [persist, snapshot]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      lightPalette: snapshot.lightPalette,
      darkPalette: snapshot.darkPalette,
      layoutScale: snapshot.layoutScale,
      themeMode: snapshot.themeMode,
      effectiveDark,
      presets,
      builtInPresets: BUILT_IN_PRESETS,
      setThemeMode,
      setLayoutScale,
      updatePaletteColor,
      resetPalettes,
      savePreset,
      applyPreset,
      applyBuiltInPreset,
      deletePreset,
      bindUser,
    }),
    [
      snapshot,
      effectiveDark,
      presets,
      setThemeMode,
      setLayoutScale,
      updatePaletteColor,
      resetPalettes,
      savePreset,
      applyPreset,
      applyBuiltInPreset,
      deletePreset,
      bindUser,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
