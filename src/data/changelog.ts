import type { LanguageCode } from "@/i18n";

export interface ChangelogEntry {
  version: string;
  date: string;
  itemsDe: string[];
  itemsEn: string[];
}

/** Newest first. Add a new entry here with every release. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "5.2.0",
    date: "2026-07-12",
    itemsDe: [
      "Master-Upload-Fehler behoben (Storage-Berechtigung)",
      "Eigenes Kontextmenü statt Browser-Standard: Ausschneiden, Kopieren, Einfügen, Zurück/Vor",
      "Onboarding-Tour: Absturz am letzten Schritt behoben, neue Tour für die Projekt-Detailseite",
      "Premium-Kennzeichnung: Icon erscheint nur für Free-Nutzer, jetzt auch bei Datei- und Master-Uploads",
      "Kunde und Projekt-Typ lassen sich jetzt direkt beim Projekt-Anlegen erstellen",
      "Standardsprache für neue Nutzer ist jetzt Englisch",
      "Diverse Tippfehler und fehlende Umlaute in der deutschen Übersetzung korrigiert",
    ],
    itemsEn: [
      "Fixed a storage permission error on master uploads",
      "Custom context menu instead of the browser default: cut, copy, paste, back/forward",
      "Onboarding tour: fixed a crash on the last step, added a new tour for the project detail page",
      "Premium badge now only shows for free users, and also appears on file and master uploads",
      "Customers and project types can now be created directly while creating a project",
      "New accounts now default to English",
      "Fixed several typos and missing umlauts in the German translation",
    ],
  },
  {
    version: "5.1.1",
    date: "2026-07-12",
    itemsDe: [
      "Kunden-Portal: ein einziger Link für Master-Review und Datei-Upload",
      "Wellenform-Anzeige im Master-Review-Player",
      "Sprachnotizen als Alternative zu Text-Revisionen",
      "Projektübergreifender Aktivitäts-Feed",
      "Feinere Team-Rollen: Viewer- und Editor-Rechte pro Mitglied",
      "Spam-/Missbrauchsschutz für öffentliche Links",
      "Master-Review-Seite komplett neu gestaltet: Lautstärkeregler, klarere Versionsauswahl",
    ],
    itemsEn: [
      "Customer portal: a single link for both master review and file upload",
      "Waveform display in the master review player",
      "Voice notes as an alternative to text revisions",
      "Cross-project activity feed",
      "Finer team roles: viewer and editor permissions per member",
      "Spam/abuse protection on public links",
      "Redesigned master review page: volume control, clearer version picker",
    ],
  },
  {
    version: "5.0.0",
    date: "2026-04-20",
    itemsDe: [
      "SyncTheStudio als eigenständige Desktop-App (Tauri) mit neuem Design",
      "Sicheres Public-Link-System für Kunden-Uploads und Master-Freigaben",
      "Automatische Updates über GitHub Releases",
      "Team-Einladungen mit durchsuchbarer Nutzerliste",
      "Mix & Master A/B-Vergleich mit Revisionsliste",
    ],
    itemsEn: [
      "SyncTheStudio as a standalone desktop app (Tauri) with a new design",
      "Secure public-link system for customer uploads and master shares",
      "Automatic updates via GitHub Releases",
      "Team invitations with a searchable user list",
      "Mix & master A/B comparison with a revision list",
    ],
  },
];

export function changelogItems(entry: ChangelogEntry, lang: LanguageCode): string[] {
  return lang === "de" ? entry.itemsDe : entry.itemsEn;
}

export const LATEST_CHANGELOG_VERSION = CHANGELOG[0]?.version ?? "0.0.0";
