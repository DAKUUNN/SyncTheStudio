import { useEffect, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n, LOCALE_OPTIONS, type LanguageCode } from "@/i18n";
import {
  useTheme,
  DEFAULT_LIGHT_PALETTE,
  DEFAULT_DARK_PALETTE,
  type ThemePalette,
  type ThemeMode,
} from "@/stores/themeStore";
import {
  colorValueToCss,
  cssToColorValue,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type CustomFieldsConfig,
  type CustomStatus,
  type NotificationPreferences,
  type ProjectTypeModel,
} from "@/models/types";
import {
  getStatuses,
  saveStatuses,
  createStatusId,
  getCustomFieldsConfig,
  saveCustomFieldsConfig,
  labelForStatusId,
  DEFAULT_STATUS_ID,
} from "@/services/customizationService";
import {
  getProjectTypes,
  createProjectType,
  updateProjectType,
  deleteProjectType,
} from "@/services/templateService";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from "@/services/notificationService";
import { replaceProjectStatusForUser } from "@/services/projectService";
import { updatePreferredLanguage } from "@/services/authService";
import { Modal, ConfirmDialog } from "@/components/ui";
import { ChangelogModal } from "@/components/WhatsNewModal";
import {
  IconPalette,
  IconGlobe,
  IconBell,
  IconTag,
  IconLayers,
  IconPlus,
  IconTrash,
  IconEdit,
  IconSun,
  IconMoon,
  IconSettings,
  IconRefresh,
  IconCheck,
} from "@/components/Icons";

function palettesMatch(a: ThemePalette, b: ThemePalette): boolean {
  return (Object.keys(a) as (keyof ThemePalette)[]).every(
    (key) => a[key].toUpperCase() === b[key].toUpperCase()
  );
}

type SettingsSection =
  | "appearance"
  | "language"
  | "statusWorkflow"
  | "projectTypes"
  | "customFields"
  | "notifications";

export function SettingsScreen() {
  const { t } = useI18n();
  const [section, setSection] = useState<SettingsSection>("appearance");

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: "appearance", label: t("settings.appearance"), icon: <IconPalette className="nav-icon" /> },
    { id: "language", label: t("settings.language"), icon: <IconGlobe className="nav-icon" /> },
    { id: "statusWorkflow", label: t("settings.statusWorkflow"), icon: <IconLayers className="nav-icon" /> },
    { id: "projectTypes", label: t("settings.projectTypes"), icon: <IconTag className="nav-icon" /> },
    { id: "customFields", label: t("settings.customFields"), icon: <IconSettings className="nav-icon" /> },
    { id: "notifications", label: t("notifications.title"), icon: <IconBell className="nav-icon" /> },
  ];

  return (
    <div className="content-wide">
      <h1 style={{ marginBottom: 18 }}>{t("settings.title")}</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "210px minmax(0, 1fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div className="card" style={{ padding: 8 }}>
          {sections.map((item) => (
            <button
              key={item.id}
              className={`nav-item${section === item.id ? " active" : ""}`}
              onClick={() => setSection(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        <div>
          {section === "appearance" && <AppearanceSettings />}
          {section === "language" && <LanguageSettings />}
          {section === "statusWorkflow" && <StatusWorkflowSettings />}
          {section === "projectTypes" && <ProjectTypeSettings />}
          {section === "customFields" && <CustomFieldsSettings />}
          {section === "notifications" && <NotificationSettings />}
        </div>
      </div>
    </div>
  );
}

// ── Appearance ───────────────────────────────────────────────────

const PALETTE_FIELDS: { key: keyof ThemePalette; labelKey: string }[] = [
  { key: "primary", labelKey: "theme.colorPrimary" },
  { key: "secondary", labelKey: "theme.colorSecondary" },
  { key: "accent", labelKey: "theme.colorAccent" },
  { key: "background", labelKey: "theme.colorBackground" },
  { key: "surface", labelKey: "theme.colorSurface" },
  { key: "cardBorder", labelKey: "theme.colorCardBorder" },
  { key: "text", labelKey: "theme.colorText" },
  { key: "appBarBackground", labelKey: "theme.colorAppBarBg" },
  { key: "appBarForeground", labelKey: "theme.colorAppBarFg" },
  { key: "navIndicator", labelKey: "theme.colorNavIndicator" },
  { key: "navSelectedIcon", labelKey: "theme.colorNavSelected" },
  { key: "navUnselectedIcon", labelKey: "theme.colorNavUnselected" },
];

function AppearanceSettings() {
  const { t } = useI18n();
  const theme = useTheme();
  const { showToast } = useToast();
  const [editMode, setEditMode] = useState<"light" | "dark">(
    theme.effectiveDark ? "dark" : "light"
  );
  const [presetName, setPresetName] = useState("");
  const [presetModalOpen, setPresetModalOpen] = useState(false);

  const palette = editMode === "light" ? theme.lightPalette : theme.darkPalette;
  const defaults = editMode === "light" ? DEFAULT_LIGHT_PALETTE : DEFAULT_DARK_PALETTE;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card card-pad">
        <div className="section-title">{t("theme.modeTitle")}</div>
        <div className="row">
          {(["system", "light", "dark"] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              className={`chip${theme.themeMode === mode ? " active" : ""}`}
              onClick={() => theme.setThemeMode(mode)}
            >
              {mode === "light" && <IconSun style={{ width: 13, height: 13 }} />}
              {mode === "dark" && <IconMoon style={{ width: 13, height: 13 }} />}
              {t(`theme.mode_${mode}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-title">{t("theme.layoutScale")}</div>
        <div className="row">
          <input
            type="range"
            min={0.8}
            max={1.3}
            step={0.05}
            value={theme.layoutScale}
            onChange={(e) => theme.setLayoutScale(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span className="text-small mono" style={{ width: 48, textAlign: "right" }}>
            {Math.round(theme.layoutScale * 100)}%
          </span>
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-title">{t("theme.presetDesigns")}</div>
        <div className="text-small text-muted" style={{ marginBottom: 12 }}>
          {t("theme.presetDesignsHint")}
        </div>
        <div className="preset-gallery">
          {theme.builtInPresets.map((preset) => {
            const previewPalette = theme.effectiveDark
              ? preset.darkPalette
              : preset.lightPalette;
            const isActive =
              palettesMatch(theme.lightPalette, preset.lightPalette) &&
              palettesMatch(theme.darkPalette, preset.darkPalette);
            return (
              <button
                key={preset.id}
                className={`preset-card${isActive ? " active" : ""}`}
                onClick={() => {
                  theme.applyBuiltInPreset(preset.id);
                  showToast(t("theme.presetApplied"), "success");
                }}
                style={{
                  background: previewPalette.surface,
                  borderColor: isActive ? previewPalette.primary : undefined,
                }}
              >
                <div className="preset-card-swatches">
                  <span style={{ background: previewPalette.primary }} />
                  <span style={{ background: previewPalette.secondary }} />
                  <span style={{ background: previewPalette.accent }} />
                  <span style={{ background: previewPalette.background }} />
                </div>
                <div
                  className="preset-card-name"
                  style={{ color: previewPalette.text }}
                >
                  {preset.name}
                  {isActive && <IconCheck style={{ width: 13, height: 13 }} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">{t("theme.customColors")}</div>
          <div className="row">
            <button
              className={`chip${editMode === "light" ? " active" : ""}`}
              onClick={() => setEditMode("light")}
            >
              <IconSun style={{ width: 13, height: 13 }} /> {t("theme.mode_light")}
            </button>
            <button
              className={`chip${editMode === "dark" ? " active" : ""}`}
              onClick={() => setEditMode("dark")}
            >
              <IconMoon style={{ width: 13, height: 13 }} /> {t("theme.mode_dark")}
            </button>
          </div>
        </div>
        <div className="card-pad" style={{ paddingTop: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 18px" }}>
            {PALETTE_FIELDS.map((field) => (
              <div key={field.key} className="row row-between" style={{ padding: "6px 0" }}>
                <span className="text-small">{t(field.labelKey)}</span>
                <div className="row" style={{ gap: 6 }}>
                  <span className="text-xs mono text-faint">{palette[field.key]}</span>
                  <input
                    type="color"
                    className="color-swatch"
                    value={palette[field.key]}
                    onChange={(e) =>
                      theme.updatePaletteColor(editMode, field.key, e.target.value)
                    }
                  />
                  {palette[field.key] !== defaults[field.key] && (
                    <button
                      className="icon-btn"
                      style={{ width: 24, height: 24 }}
                      title={t("common.reset")}
                      onClick={() =>
                        theme.updatePaletteColor(editMode, field.key, defaults[field.key])
                      }
                    >
                      <IconRefresh style={{ width: 12, height: 12 }} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="row row-wrap">
            <button className="btn btn-secondary btn-sm" onClick={() => theme.resetPalettes()}>
              <IconRefresh /> {t("theme.resetAll")}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPresetModalOpen(true)}>
              <IconPlus /> {t("theme.savePreset")}
            </button>
          </div>
        </div>
      </div>

      {theme.presets.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t("theme.presetsTitle")}</div>
          </div>
          {theme.presets.map((preset) => (
            <div key={preset.id} className="list-row">
              <div className="row" style={{ gap: 4 }}>
                {[
                  preset.snapshot.lightPalette.primary,
                  preset.snapshot.lightPalette.accent,
                  preset.snapshot.darkPalette.primary,
                  preset.snapshot.darkPalette.background,
                ].map((color, index) => (
                  <span
                    key={index}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 5,
                      background: color,
                      border: "1px solid var(--border-strong)",
                    }}
                  />
                ))}
              </div>
              <div className="grow text-small" style={{ fontWeight: 600 }}>
                {preset.name}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  theme.applyPreset(preset.id);
                  showToast(t("theme.presetApplied"), "success");
                }}
              >
                {t("templates.apply")}
              </button>
              <button className="icon-btn" onClick={() => theme.deletePreset(preset.id)}>
                <IconTrash />
              </button>
            </div>
          ))}
        </div>
      )}

      {presetModalOpen && (
        <Modal
          title={t("theme.savePreset")}
          onClose={() => setPresetModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setPresetModalOpen(false)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  theme.savePreset(presetName);
                  setPresetModalOpen(false);
                  setPresetName("");
                  showToast(t("theme.presetSaved"), "success");
                }}
              >
                {t("common.save")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t("templates.nameLabel")}</label>
            <input
              className="input"
              autoFocus
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Language ─────────────────────────────────────────────────────

function LanguageSettings() {
  const { t, lang, setLanguage } = useI18n();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [changelogOpen, setChangelogOpen] = useState(false);

  const onSelect = async (code: LanguageCode) => {
    setLanguage(code, currentUser?.id);
    if (currentUser) {
      await updatePreferredLanguage(currentUser.id, code);
    }
    showToast(t("settings.languageChanged"), "success");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">{t("settings.language")}</div>
        </div>
        {LOCALE_OPTIONS.map((option) => (
          <div
            key={option.code}
            className="list-row clickable"
            onClick={() => void onSelect(option.code)}
          >
            <div className="grow">
              <div className="text-small" style={{ fontWeight: 600 }}>
                {option.nativeName}
              </div>
              <div className="text-xs text-muted">{option.englishName}</div>
            </div>
            {lang === option.code && (
              <span className="badge" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
                ✓
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="card card-pad">
        <div
          className="row"
          style={{ justifyContent: "space-between", cursor: "pointer" }}
          onClick={() => setChangelogOpen(true)}
        >
          <div>
            <div className="text-small" style={{ fontWeight: 600 }}>
              {t("whatsNew.menuTitle")}
            </div>
            <div className="text-xs text-muted">{t("whatsNew.viewAll")}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setChangelogOpen(true)}>
            {t("whatsNew.viewAll")}
          </button>
        </div>
      </div>

      {changelogOpen && <ChangelogModal onClose={() => setChangelogOpen(false)} />}
    </div>
  );
}

// ── Status workflow ──────────────────────────────────────────────

function StatusWorkflowSettings() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [statuses, setStatuses] = useState<CustomStatus[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#8B5CF6");
  const [editStatus, setEditStatus] = useState<CustomStatus | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#8B5CF6");
  const [deleteTarget, setDeleteTarget] = useState<CustomStatus | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    void getStatuses(currentUser.id).then(setStatuses);
  }, [currentUser?.id]);

  const persist = async (next: CustomStatus[]) => {
    if (!currentUser) return;
    await saveStatuses(currentUser.id, next);
    setStatuses(await getStatuses(currentUser.id));
  };

  const onAdd = async () => {
    if (!currentUser || !newName.trim()) return;
    const status: CustomStatus = {
      id: createStatusId(newName, statuses),
      name: newName.trim(),
      colorValue: cssToColorValue(newColor),
      iconName: null,
      sortOrder: statuses.length,
      isDefault: false,
      createdAt: Date.now(),
    };
    await persist([...statuses, status]);
    setNewName("");
    showToast(t("statusWorkflow.added"), "success");
  };

  const onSaveEdit = async () => {
    if (!editStatus) return;
    await persist(
      statuses.map((status) =>
        status.id === editStatus.id
          ? { ...status, name: editName.trim() || status.name, colorValue: cssToColorValue(editColor) }
          : status
      )
    );
    setEditStatus(null);
    showToast(t("statusWorkflow.updated"), "success");
  };

  const onDelete = async () => {
    if (!currentUser || !deleteTarget) return;
    await replaceProjectStatusForUser({
      userId: currentUser.id,
      fromStatusId: deleteTarget.id,
      toStatusId: DEFAULT_STATUS_ID,
    });
    await persist(statuses.filter((status) => status.id !== deleteTarget.id));
    setDeleteTarget(null);
    showToast(t("statusWorkflow.deleted"), "success");
  };

  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= statuses.length) return;
    const next = [...statuses];
    [next[index], next[target]] = [next[target], next[index]];
    await persist(next.map((status, i) => ({ ...status, sortOrder: i })));
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">{t("settings.statusWorkflow")}</div>
      </div>
      {statuses.map((status, index) => (
        <div key={status.id} className="list-row">
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: colorValueToCss(status.colorValue),
              flexShrink: 0,
            }}
          />
          <div className="grow">
            <div className="text-small" style={{ fontWeight: 600 }}>
              {labelForStatusId(status.id, statuses)}
            </div>
            <div className="text-xs text-faint mono">{status.id}</div>
          </div>
          <button className="icon-btn" disabled={index === 0} onClick={() => void move(index, -1)}>
            ↑
          </button>
          <button
            className="icon-btn"
            disabled={index === statuses.length - 1}
            onClick={() => void move(index, 1)}
          >
            ↓
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              setEditStatus(status);
              setEditName(status.name);
              setEditColor(colorValueToCss(status.colorValue));
            }}
          >
            <IconEdit />
          </button>
          {!status.isDefault && (
            <button className="icon-btn" onClick={() => setDeleteTarget(status)}>
              <IconTrash />
            </button>
          )}
        </div>
      ))}
      <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="row">
          <input
            className="input grow"
            placeholder={t("statusWorkflow.newHint")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onAdd();
            }}
          />
          <input
            type="color"
            className="color-swatch"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={() => void onAdd()}>
            <IconPlus /> {t("common.add")}
          </button>
        </div>
      </div>

      {editStatus && (
        <Modal
          title={t("statusWorkflow.editTitle")}
          onClose={() => setEditStatus(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setEditStatus(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void onSaveEdit()}>
                {t("common.save")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t("templates.nameLabel")}</label>
            <input
              className="input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={editStatus.isDefault}
            />
            {editStatus.isDefault && (
              <div className="field-hint">{t("statusWorkflow.defaultNote")}</div>
            )}
          </div>
          <div className="field">
            <label className="field-label">{t("statusWorkflow.colorLabel")}</label>
            <input
              type="color"
              className="color-swatch"
              value={editColor}
              onChange={(e) => setEditColor(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t("statusWorkflow.deleteTitle")}
          message={t("statusWorkflow.deleteConfirm", { name: deleteTarget.name })}
          confirmLabel={t("common.delete")}
          danger
          onConfirm={() => void onDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Project types ────────────────────────────────────────────────

function ProjectTypeSettings() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [types, setTypes] = useState<ProjectTypeModel[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366F1");

  const reload = async () => {
    if (!currentUser) return;
    setTypes(await getProjectTypes(currentUser.id));
  };

  useEffect(() => {
    void reload();
  }, [currentUser?.id]);

  const onAdd = async () => {
    if (!currentUser || !newName.trim()) return;
    await createProjectType({ userId: currentUser.id, name: newName.trim(), color: newColor });
    setNewName("");
    await reload();
    showToast(t("projectTypes.added"), "success");
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">{t("settings.projectTypes")}</div>
      </div>
      {types.map((type) => (
        <div key={type.id} className="list-row">
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: type.color,
              flexShrink: 0,
            }}
          />
          <div className="grow text-small" style={{ fontWeight: 600 }}>
            {type.name}
            {type.isDefault && (
              <span className="text-xs text-faint" style={{ fontWeight: 400 }}>
                {" "}
                · {t("projectTypes.default")}
              </span>
            )}
          </div>
          {!type.isDefault && currentUser && (
            <>
              <input
                type="color"
                className="color-swatch"
                value={type.color}
                onChange={(e) =>
                  void updateProjectType({
                    userId: currentUser.id,
                    typeId: type.id,
                    color: e.target.value,
                  }).then(reload)
                }
              />
              <button
                className="icon-btn"
                onClick={() =>
                  void deleteProjectType(currentUser.id, type.id).then(reload)
                }
              >
                <IconTrash />
              </button>
            </>
          )}
        </div>
      ))}
      <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="row">
          <input
            className="input grow"
            placeholder={t("projectTypes.newHint")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onAdd();
            }}
          />
          <input
            type="color"
            className="color-swatch"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={() => void onAdd()}>
            <IconPlus /> {t("common.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Custom fields ────────────────────────────────────────────────

function CustomFieldsSettings() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [config, setConfig] = useState<CustomFieldsConfig | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setConfig(getCustomFieldsConfig(currentUser.id));
  }, [currentUser?.id]);

  if (!config || !currentUser) return null;

  const update = (next: CustomFieldsConfig) => {
    setConfig(next);
    saveCustomFieldsConfig(currentUser.id, next);
  };

  const fields = [
    { nameKey: "field1Name", enabledKey: "field1Enabled" },
    { nameKey: "field2Name", enabledKey: "field2Enabled" },
    { nameKey: "field3Name", enabledKey: "field3Enabled" },
    { nameKey: "field4Name", enabledKey: "field4Enabled" },
    { nameKey: "field5Name", enabledKey: "field5Enabled" },
  ] as const;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">{t("settings.customFields")}</div>
      </div>
      <div className="card-pad">
        <p className="text-small text-muted" style={{ marginBottom: 12 }}>
          {t("customFields.description")}
        </p>
        {fields.map((field, index) => (
          <div key={field.nameKey} className="row" style={{ marginBottom: 10 }}>
            <label className="checkbox-row" style={{ padding: 0 }}>
              <input
                type="checkbox"
                checked={config[field.enabledKey]}
                onChange={(e) => update({ ...config, [field.enabledKey]: e.target.checked })}
              />
            </label>
            <input
              className="input grow"
              value={config[field.nameKey]}
              disabled={!config[field.enabledKey]}
              placeholder={`Custom ${index + 1}`}
              onChange={(e) => update({ ...config, [field.nameKey]: e.target.value })}
            />
          </div>
        ))}
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => showToast(t("customFields.saved"), "success")}
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

// ── Notifications ────────────────────────────────────────────────

function NotificationSettings() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );

  useEffect(() => {
    if (!currentUser) return;
    void loadNotificationPreferences(currentUser.id).then(setPrefs);
  }, [currentUser?.id]);

  const update = async (next: NotificationPreferences) => {
    setPrefs(next);
    if (currentUser) {
      await saveNotificationPreferences(currentUser.id, next);
    }
  };

  const toggles: { key: keyof NotificationPreferences; labelKey: string }[] = [
    { key: "enabled", labelKey: "notificationPrefs.enabled" },
    { key: "projectUpdatesEnabled", labelKey: "notificationPrefs.projectUpdates" },
    { key: "invitationsEnabled", labelKey: "notificationPrefs.invitations" },
    { key: "deadlinesEnabled", labelKey: "notificationPrefs.deadlines" },
    { key: "systemEnabled", labelKey: "notificationPrefs.system" },
    { key: "chatEnabled", labelKey: "notificationPrefs.chat" },
    { key: "intelligentSortingEnabled", labelKey: "notificationPrefs.intelligentSorting" },
    { key: "quietHoursEnabled", labelKey: "notificationPrefs.quietHours" },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">{t("notifications.title")}</div>
      </div>
      <div className="card-pad">
        {toggles.map((toggle) => (
          <label key={toggle.key} className="checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(prefs[toggle.key])}
              onChange={(e) =>
                void update({ ...prefs, [toggle.key]: e.target.checked })
              }
            />
            <span className="text-small">{t(toggle.labelKey)}</span>
          </label>
        ))}

        {prefs.quietHoursEnabled && (
          <div className="row" style={{ marginTop: 10, marginLeft: 25 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">{t("notificationPrefs.quietStart")}</label>
              <select
                className="select"
                value={prefs.quietHoursStartHour}
                onChange={(e) =>
                  void update({ ...prefs, quietHoursStartHour: Number(e.target.value) })
                }
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">{t("notificationPrefs.quietEnd")}</label>
              <select
                className="select"
                value={prefs.quietHoursEndHour}
                onChange={(e) =>
                  void update({ ...prefs, quietHoursEndHour: Number(e.target.value) })
                }
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="divider" />
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => showToast(t("notificationPrefs.saved"), "success")}
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
