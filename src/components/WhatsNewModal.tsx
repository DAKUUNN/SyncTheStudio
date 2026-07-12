import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { CHANGELOG, changelogItems } from "@/data/changelog";
import { Modal } from "./ui";
import { IconSparkles } from "./Icons";

const LAST_SEEN_KEY = "sts_last_seen_changelog_version";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function resolveAppVersion(): Promise<string> {
  if (!isTauriRuntime()) return CHANGELOG[0]?.version ?? "0.0.0";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return CHANGELOG[0]?.version ?? "0.0.0";
  }
}

/** Shows a "what's new" popup the first time the app is opened after an
 *  update — compares the running app version against the last version the
 *  user has seen this modal for (localStorage). Silently records the
 *  baseline on a brand-new install instead of popping up (the onboarding
 *  tour covers that case). No-ops outside Tauri only for version
 *  resolution — the modal itself can still render in a browser preview. */
export function WhatsNewModal() {
  const { t, lang } = useI18n();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const current = await resolveAppVersion();
      const lastSeen = window.localStorage.getItem(LAST_SEEN_KEY);
      if (lastSeen === null) {
        window.localStorage.setItem(LAST_SEEN_KEY, current);
        return;
      }
      if (lastSeen !== current) setVersion(current);
    })();
  }, []);

  if (!version) return null;
  const entry = CHANGELOG.find((e) => e.version === version) ?? CHANGELOG[0];
  if (!entry) return null;

  const onClose = () => {
    window.localStorage.setItem(LAST_SEEN_KEY, version);
    setVersion(null);
  };

  return (
    <Modal
      title={t("whatsNew.title", { version: entry.version })}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          {t("whatsNew.gotIt")}
        </button>
      }
    >
      <ChangelogEntryList entries={[entry]} lang={lang} />
    </Modal>
  );
}

function ChangelogEntryList({
  entries,
  lang,
}: {
  entries: typeof CHANGELOG;
  lang: Parameters<typeof changelogItems>[1];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {entries.map((entry) => (
        <div key={entry.version}>
          <div className="row" style={{ gap: 8, marginBottom: 10, color: "var(--accent)" }}>
            <IconSparkles style={{ width: 16, height: 16 }} />
            <span className="text-small" style={{ fontWeight: 600 }}>
              {entry.version}
            </span>
            <span className="text-xs text-muted">{entry.date}</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {changelogItems(entry, lang).map((item, i) => (
              <li key={i} className="text-small">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Full changelog, all versions — opened on demand from Settings. */
export function ChangelogModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  return (
    <Modal title={t("whatsNew.menuTitle")} onClose={onClose}>
      <ChangelogEntryList entries={CHANGELOG} lang={lang} />
    </Modal>
  );
}
