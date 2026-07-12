# SyncTheStudio — Desktop (Tauri)

Mix & Master Projektmanagement für Studios — Desktop-App für **Windows & macOS**,
portiert 1:1 aus der Flutter/SwiftUI-App `SyncTheStudio-macOS` mit komplett neuem,
cleanem Enterprise-Design.

## Stack

- **Tauri 2** (Rust) — native Shell für Windows (WebView2) & macOS (WKWebView)
- **React 19 + TypeScript + Vite** — Frontend
- **Firebase** (gleiches Projekt wie die Original-App): Auth, Firestore, Storage, Cloud Functions
- **Web Crypto AES-256-GCM** — byte-kompatibel zum Verschlüsselungsformat der Original-App
  (`{"v":1,"iv":…,"ct":…}`-Envelope, Projekt-/User-Content-Keys aus Firestore)

## Funktionen (vollständig übernommen)

- Login (E-Mail **oder** Username) · Registrierung · Passwort-Reset · Login-Lockout (5 Versuche/15 min)
- Rollen (User/Admin) & Pläne (Free/VIP) inkl. Free-Limits (10 eigene / 10 geteilte Projekte)
- Projekte: Status-Workflow (anpassbar, Cloud-Sync), Prioritäten, Deadlines mit
  Desktop-Erinnerungen, BPM/Tonart/DAW-Pfad/Kategorie, 5 benennbare Custom-Felder,
  Favoriten, Grid-/Listen-/Board-Ansicht (Drag & Drop), Bulk-Löschen, Verlauf
- Geteilte Projekte: Einladungen (Inbox), Mitglieder-Rollen mit Presets, Verlassen,
  Owner-Sync über `shared_projects`
- Dateien: Anhänge (Drag & Drop Upload), Referenz-Song, verschlüsselte **Master-Versionen**
  mit Entschlüsselung beim Download
- Öffentliche Links: **Master-Review-Link** (Passwort, Ablauf, Download-Schalter, Kunden-Feedback
  mit Zeitmarken) & **Kunden-Upload-Link** (Passwort)
- Projekt-Chat (AES-verschlüsselt) mit **KI-Task-Erkennung** (Cloud Function + lokale Heuristik)
- Aufgaben mit Subtasks, Kommentaren, Fälligkeiten, Drag-&-Drop-Sortierung
- Zeiterfassung: Live-Timer + manuelle Einträge + Summen
- Benachrichtigungs-Feed: Filter, intelligente Sortierung, Ruhezeiten, Präferenzen, readBy
- Globale Suche (Projekte/Kunden/Aufgaben) + Command-Palette (⌘K / Ctrl+K)
- Kunden-CRM: Kontakte, Socials, verschlüsselte Notizen, Client-Memory, Referenz-Tracks
- Vorlagen & eigene Projekt-Typen
- Themes: Hell/Dunkel/System, **12 anpassbare Farben je Modus**, Layout-Skalierung, Presets
- 6 Sprachen: Deutsch, English, Русский, Türkçe, Français, Español
- Export: CSV (Projekte/Kunden/Zeiten), JSON-Komplettbackup, Projektordner-Export
- Admin-Panel: Benutzerverwaltung (Rolle/Plan/Sperren/Passwort-Reset), Statistiken mit
  Charts, System-Broadcasts

Bewusst nicht portiert (plattformbedingt): Apple Sign-In, FCM-Push (ersetzt durch lokale
Desktop-Benachrichtigungen), Touch-ID, macOS-Widget.

## Entwicklung

```bash
npm install
npm run tauri dev
```

## Build

```bash
# macOS (dmg + app)
npm run tauri build

# Windows (msi + nsis) — auf einem Windows-Rechner ausführen:
npm run tauri build
```

Die Bundle-Ziele sind in `src-tauri/tauri.conf.json` konfiguriert
(`dmg`, `app`, `msi`, `nsis`). Cross-Compiling ist nicht nötig — auf jeder Plattform
das jeweilige Bundle bauen.

## Releases & Auto-Update

Die App prüft ca. 2,5 Sekunden nach dem Start automatisch, ob ein Update
verfügbar ist (`src/services/updateService.ts`), und zeigt bei Bedarf ein
Popup mit "Jetzt installieren" (`src/components/UpdateNotifier.tsx`). Die
Installation lädt das signierte Update herunter, prüft die Signatur und
startet die App neu — komplett ohne manuellen Download.

**Ein neues Release veröffentlichen:**

```bash
git tag v5.0.1
git push origin v5.0.1
```

Das startet `.github/workflows/release.yml`, baut signierte Installer für
macOS (universal) und Windows, und legt sie als **Draft-Release** auf GitHub
ab, inkl. `latest.json` (das Update-Manifest, das die App abfragt). Der
Draft muss einmal manuell auf GitHub veröffentlicht werden ("Publish
release") — das ist absichtlich ein manueller Schritt als Sicherheitsnetz,
damit nie automatisch ein kaputter Build an alle Nutzer ausgerollt wird.

**Bereits eingerichtet** (GitHub-Secrets `TAURI_SIGNING_PRIVATE_KEY` /
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`): Updates werden mit einem eigenen
Schlüsselpaar signiert: Der öffentliche Schlüssel steckt in
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`), die App verifiziert
damit jedes heruntergeladene Update, bevor es installiert wird.

**Optional für macOS** (Apple Notarization — ohne diese Secrets funktionieren
Build und Auto-Update trotzdem, nur zeigt macOS bei einer frischen
Installation eine Gatekeeper-Warnung "unbekannter Entwickler"): in GitHub →
Settings → Secrets sechs weitere Werte hinterlegen: `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, `APPLE_TEAM_ID` (aus dem Apple Developer Account).

## Struktur

```
src/
  firebase.ts          Firebase-Init (Long-Polling für WebViews)
  i18n/                6 Sprachen + Provider (Fallback: lang → en → de → key)
  lib/crypto.ts        AES-GCM (kompatibel zur Original-App)
  models/types.ts      Alle Datenmodelle (1:1 Firestore-Layout)
  services/            Auth, Projekte, Kunden, Tasks, Chat, Zeit, Master, …
  stores/              Auth / Theme / Toast (React Context)
  components/          Icons, UI-Kit, AppLayout (Sidebar + ⌘K-Palette)
  screens/             Alle Views
src-tauri/             Rust-Shell, Plugins: dialog, fs, notification, opener
```
