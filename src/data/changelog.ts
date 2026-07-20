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
    version: "5.5.0",
    date: "2026-07-20",
    itemsDe: [
      "Push-Benachrichtigungen (Chat, Feedback, Kunden-Upload) springen beim Antippen/Klicken direkt zum richtigen Projekt-Tab",
      "Dashboard: Schnellaktionen durch Projekt-Statistik ersetzt (Projekte diese Woche/diesen Monat erstellt)",
      "Master-Review- und Kunden-Upload-Links sind jetzt standardmäßig maskiert, erst nach Klick sichtbar",
    ],
    itemsEn: [
      "Tapping/clicking a push notification (chat, feedback, customer upload) jumps straight to the right project tab",
      "Dashboard: quick actions replaced with a project stats card (projects created this week/month)",
      "Master review and customer upload links are now masked by default, only shown after a click",
    ],
  },
  {
    version: "5.4.0",
    date: "2026-07-20",
    itemsDe: [
      "Automatische Zeiterfassung gekoppelt an die DAW: Timer startet/stoppt von selbst, sobald Pro Tools/Logic/Ableton & Co. im Vordergrund sind (Desktop)",
      "Neuer Kalender-Tab: alle Projekt-Deadlines und offenen Aufgaben-Fälligkeiten auf einen Blick",
      "DAW-Projektpfad-Feld nicht mehr bei der Neuanlage, nur noch beim Bearbeiten eines Projekts",
      "Team-Mitglieder mit Bearbeitungsrechten können jetzt auch ohne Premium weitere Personen einladen",
    ],
    itemsEn: [
      "Automatic DAW-linked time tracking: the timer starts/stops on its own once Pro Tools/Logic/Ableton & co. are in focus (desktop)",
      "New calendar tab: all project deadlines and open task due dates at a glance",
      "DAW project path field no longer shown when creating a project, only when editing one",
      "Team members with edit access can now invite others without needing Premium",
    ],
  },
  {
    version: "5.3.0",
    date: "2026-07-18",
    itemsDe: [
      "Ende-zu-Ende-Verschlüsselung für Dateien & Master: nicht einmal SyncTheStudio kann sie öffnen — Recovery-Code sicher aufbewahren!",
      "iOS: Scrollen repariert — Listen und Seiten lassen sich endlich durchscrollen",
      "„Alle herunterladen“-Button für Dateien und Master mit Ordnerauswahl und Fortschrittsbalken",
      "Audio-Anhänge direkt in der Dateiliste anhören",
      "Projekt abschließen & archivieren: Komplett-Export, Status auf Abgeschlossen, optional Cloud-Speicher freigeben",
      "Export: DAW-Projekt (ZIP oder Ordner) beilegen, sauber nummerierte Ordnerstruktur",
      "Backup-Import: Vollbackup (JSON) wiederherstellen",
      "Push-Benachrichtigung, wenn Kunden Feedback geben oder Dateien hochladen",
    ],
    itemsEn: [
      "End-to-end encryption for files & masters: not even SyncTheStudio can open them — keep your recovery code safe!",
      "iOS: scrolling fixed — lists and pages finally scroll",
      "\"Download all\" button for files and masters with folder picker and progress bar",
      "Listen to audio attachments right in the file list",
      "Complete & archive a project: full export, status set to completed, optionally free up cloud storage",
      "Export: attach your DAW project (ZIP or folder), cleanly numbered folder structure",
      "Backup import: restore a full backup (JSON)",
      "Push notification when customers leave feedback or upload files",
    ],
  },
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
