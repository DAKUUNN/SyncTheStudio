import { useEffect, useRef, useState, type DragEvent } from "react";
import { open as openFileDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fetchBytes } from "@/lib/download";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import {
  formatFileSize,
  isProjectViewer,
  isShareExpired,
  type MasterVersionModel,
  type MasterShareFeedback,
  type ProjectModel,
  type PublicMasterShare,
  type PublicCustomerUploadLink,
} from "@/models/types";
import { addAttachment, removeAttachment, addHistoryEntry } from "@/services/projectService";
import { uploadAttachment, deleteAttachmentByUrl } from "@/services/storageService";
import {
  watchMasters,
  watchMasterFeedback,
  uploadMasterVersion,
  deleteMasterVersion,
  getCurrentPublicShare,
  createOrUpdatePublicShare,
  setPublicSharePassword,
  disablePublicShare,
  getCurrentPublicUploadLink,
  createOrUpdatePublicUploadLink,
  setPublicUploadPassword,
  clearPublicUploadPassword,
  disablePublicUploadLink,
} from "@/services/masterService";
import { hasPremiumStorage, premiumStorageMessage } from "@/services/planService";
import {
  getOrCreateProjectFileKey,
  backfillMemberFileKeys,
  resolveMasterFileKey,
  appendKeyFragment,
} from "@/services/fileKeyService";
import { decryptBytes } from "@/lib/crypto";
import { copyText } from "@/lib/clipboard";
import { useIsIOS } from "@/lib/platform";
import { Modal, ProgressBar, formatDateTime } from "@/components/ui";
import {
  IconUpload,
  IconDownload,
  IconTrash,
  IconFile,
  IconMusic,
  IconLink,
  IconCopy,
  IconLock,
  IconUnlock,
  IconMessage,
  IconPlay,
  IconPause,
} from "@/components/Icons";

const AUDIO_EXTENSIONS = ["mp3", "wav", "aiff", "aif", "flac", "m4a", "ogg"];

function isAudioFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.includes(ext);
}

function sanitizeFileName(name: string): string {
  const sanitized = name.trim().replace(/[\\/:*?"<>|]/g, "_");
  return sanitized || "datei.bin";
}

/** "name.wav" → "name (2).wav" etc. until the name is unused in this batch. */
function uniqueFileName(name: string, used: Set<string>): string {
  let candidate = name;
  for (let i = 2; used.has(candidate); i++) {
    const dot = name.lastIndexOf(".");
    candidate = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
  }
  used.add(candidate);
  return candidate;
}

export function FilesTab({
  project,
  isOwner,
  onChanged,
}: {
  project: ProjectModel;
  isOwner: boolean;
  onChanged: () => Promise<void>;
}) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t, lang } = useI18n();
  const isIOS = useIsIOS();

  const [section, setSection] = useState<"files" | "masters">("files");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
    label: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [masters, setMasters] = useState<MasterVersionModel[]>([]);
  const [feedback, setFeedback] = useState<MasterShareFeedback[]>([]);
  const [share, setShare] = useState<PublicMasterShare | null>(null);
  const [uploadLink, setUploadLink] = useState<PublicCustomerUploadLink | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [shareAllowDownload, setShareAllowDownload] = useState(false);
  const [uploadPasswordModalOpen, setUploadPasswordModalOpen] = useState(false);
  const [uploadPassword, setUploadPassword] = useState("");
  const [masterUploading, setMasterUploading] = useState(false);
  const [pendingMasterFile, setPendingMasterFile] = useState<string | null>(null);
  const [masterVersionName, setMasterVersionName] = useState("");

  const isViewer = currentUser ? isProjectViewer(project, currentUser.id) : false;

  // ── Zero-knowledge project file key ──────────────────────────
  // null → files are handled with the legacy unencrypted behavior
  // (locked keys, member without backfilled entry, old accounts).
  const [projectFileKey, setProjectFileKey] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    void getOrCreateProjectFileKey(project, currentUser.id).then((key) => {
      if (!cancelled) setProjectFileKey(key);
    });
    if (project.ownerId === currentUser.id) {
      void backfillMemberFileKeys(project, currentUser.id);
    }
    return () => {
      cancelled = true;
    };
  }, [project.id, currentUser?.id]);

  // ── Inline audio preview for attachments ─────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const blobUrlRef = useRef<string | null>(null);

  const releaseBlobUrl = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  };

  const togglePreview = async (url: string) => {
    if (playingUrl === url) {
      audioRef.current?.pause();
      audioRef.current = null;
      releaseBlobUrl();
      setPlayingUrl(null);
      return;
    }
    audioRef.current?.pause();
    releaseBlobUrl();
    try {
      // encrypted attachments can't stream directly — decrypt to a blob URL
      let source = url;
      const meta = project.attachmentMeta[url];
      if (meta) {
        if (!projectFileKey) throw new Error(t("e2e.keyLocked"));
        const plain = await decryptBytes(await fetchBytes(url), meta.iv, projectFileKey);
        const buffer = plain.buffer.slice(
          plain.byteOffset,
          plain.byteOffset + plain.byteLength
        ) as ArrayBuffer;
        source = URL.createObjectURL(new Blob([buffer]));
        blobUrlRef.current = source;
      }
      const audio = new Audio(source);
      audio.onended = () => {
        releaseBlobUrl();
        setPlayingUrl(null);
      };
      audio.onerror = () => {
        releaseBlobUrl();
        setPlayingUrl(null);
        showToast(t("attachments.previewFailed"), "error");
      };
      audioRef.current = audio;
      setPlayingUrl(url);
      void audio.play();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      releaseBlobUrl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubMasters = watchMasters(project.id, setMasters);
    const unsubFeedback = watchMasterFeedback(project.id, setFeedback);
    void getCurrentPublicShare(project.id).then(setShare);
    void getCurrentPublicUploadLink(project.id).then(setUploadLink);
    return () => {
      unsubMasters();
      unsubFeedback();
    };
  }, [project.id]);

  // ── Attachments ──────────────────────────────────────────────

  const uploadFiles = async (files: { bytes: Uint8Array; name: string }[]) => {
    if (!currentUser) return;
    if (isViewer) {
      showToast(t("team.viewerActionBlocked"), "warning");
      return;
    }
    if (!hasPremiumStorage(currentUser)) {
      showToast(premiumStorageMessage(), "warning");
      return;
    }
    for (const file of files) {
      try {
        setUploadProgress(0);
        const result = await uploadAttachment({
          fileBytes: file.bytes,
          fileName: file.name,
          projectId: project.id,
          encryptKey: projectFileKey,
          onProgress: setUploadProgress,
        });
        await addAttachment(currentUser.id, project.id, result.url, result.fileName, result.iv);
        await addHistoryEntry(
          project.id,
          currentUser.id,
          currentUser.username,
          `Anhang hinzugefügt: ${result.fileName}`
        );
      } catch (e) {
        showToast((e as Error).message, "error");
      }
    }
    setUploadProgress(null);
    await onChanged();
    showToast(t("attachments.uploaded"), "success");
  };

  const pickAndUpload = async () => {
    const selected = await openFileDialog({ multiple: true });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const files = [];
    for (const path of paths) {
      const bytes = await readFile(path);
      files.push({ bytes, name: path.split(/[\\/]/).pop() ?? "file" });
    }
    await uploadFiles(files);
  };

  const onDropFiles = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files: { bytes: Uint8Array; name: string }[] = [];
    for (const file of Array.from(e.dataTransfer.files)) {
      const buffer = await file.arrayBuffer();
      files.push({ bytes: new Uint8Array(buffer), name: file.name });
    }
    if (files.length > 0) await uploadFiles(files);
  };

  /** Legacy attachments open in the browser; encrypted ones have to be
   *  fetched, decrypted locally and saved via dialog. */
  const onOpenAttachment = async (url: string) => {
    const meta = project.attachmentMeta[url];
    if (!meta) {
      await openUrl(url);
      return;
    }
    try {
      if (!projectFileKey) throw new Error(t("e2e.keyLocked"));
      const plain = await decryptBytes(await fetchBytes(url), meta.iv, projectFileKey);
      const target = await saveDialog({
        defaultPath: project.attachmentNames[url] ?? url.split("/").pop() ?? "datei",
      });
      if (!target) return;
      await writeFile(target, plain);
      showToast(t("masters.downloaded"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const onRemoveAttachment = async (url: string) => {
    if (!currentUser) return;
    if (isViewer) {
      showToast(t("team.viewerActionBlocked"), "warning");
      return;
    }
    try {
      await removeAttachment(currentUser.id, project.id, url);
      await deleteAttachmentByUrl(url);
      await addHistoryEntry(
        project.id,
        currentUser.id,
        currentUser.username,
        `Anhang entfernt: ${project.attachmentNames[url] ?? url}`
      );
      await onChanged();
      showToast(t("attachments.removed"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  // ── Masters ──────────────────────────────────────────────────

  const onPickMaster = async () => {
    if (!currentUser) return;
    if (isViewer) {
      showToast(t("team.viewerActionBlocked"), "warning");
      return;
    }
    if (!hasPremiumStorage(currentUser)) {
      showToast(premiumStorageMessage(), "warning");
      return;
    }
    const selected = await openFileDialog({
      multiple: false,
      filters: [
        { name: "Audio", extensions: ["mp3", "wav", "aiff", "aif", "flac", "m4a", "ogg"] },
      ],
    });
    if (!selected || typeof selected !== "string") return;
    // window.prompt is not supported in Tauri WebViews — use a modal instead.
    setMasterVersionName(`Master v${masters.length + 1}`);
    setPendingMasterFile(selected);
  };

  const onUploadMaster = async () => {
    if (!currentUser || !pendingMasterFile) return;
    const selected = pendingMasterFile;
    const versionName = masterVersionName;
    setPendingMasterFile(null);
    setMasterUploading(true);
    try {
      const bytes = await readFile(selected);
      const fileName = selected.split(/[\\/]/).pop() ?? "master";
      await uploadMasterVersion({
        project,
        userId: currentUser.id,
        fileBytes: bytes,
        fileName,
        versionName,
        projectFileKey,
      });
      showToast(t("masters.uploaded"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setMasterUploading(false);
    }
  };

  const onDownloadMaster = async (master: MasterVersionModel) => {
    try {
      const encrypted = await fetchBytes(master.fileUrl);
      const masterKey = await resolveMasterFileKey(master, projectFileKey);
      if (master.encrypted && !masterKey) throw new Error(t("e2e.keyLocked"));
      const plain = master.encrypted
        ? await decryptBytes(encrypted, master.iv, masterKey!)
        : encrypted;
      const target = await saveDialog({ defaultPath: master.originalFileName });
      if (!target) return;
      await writeFile(target, plain);
      showToast(t("masters.downloaded"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  // ── Bulk download (desktop only) ─────────────────────────────

  const bulkDownload = async (
    items: { name: string; getBytes: () => Promise<Uint8Array> }[]
  ) => {
    if (items.length === 0) return;
    // recursive: without it the dialog only scopes the folder itself, and
    // every write to a file *inside* it is rejected by the fs plugin.
    const destination = await openFileDialog({
      directory: true,
      recursive: true,
      multiple: false,
      title: t("downloadAll.pickFolder"),
    });
    if (!destination || typeof destination !== "string") return;

    const usedNames = new Set<string>();
    let succeeded = 0;
    let firstError: Error | null = null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setBulkProgress({ done: i, total: items.length, label: item.name });
      try {
        const bytes = await item.getBytes();
        await writeFile(`${destination}/${uniqueFileName(item.name, usedNames)}`, bytes);
        succeeded++;
      } catch (e) {
        // best-effort — skip files that fail, report the count at the end
        firstError ??= e as Error;
        console.error("bulk download failed:", item.name, e);
      }
    }
    setBulkProgress(null);
    if (succeeded === 0 && firstError) {
      showToast(firstError.message, "error");
    } else {
      showToast(
        t("downloadAll.done", { count: succeeded, total: items.length }),
        succeeded === items.length ? "success" : "warning"
      );
    }
  };

  const downloadAllAttachments = () =>
    bulkDownload(
      project.attachments.map((url, i) => ({
        name: sanitizeFileName(
          project.attachmentNames[url] ?? url.split("/").pop() ?? `datei_${i + 1}`
        ),
        getBytes: async () => {
          const bytes = await fetchBytes(url);
          const meta = project.attachmentMeta[url];
          if (!meta) return bytes;
          if (!projectFileKey) throw new Error(t("e2e.keyLocked"));
          return decryptBytes(bytes, meta.iv, projectFileKey);
        },
      }))
    );

  const downloadAllMasters = () =>
    bulkDownload(
      masters.map((master) => ({
        name: sanitizeFileName(master.originalFileName || `${master.versionName}.bin`),
        getBytes: async () => {
          const encrypted = await fetchBytes(master.fileUrl);
          const masterKey = await resolveMasterFileKey(master, projectFileKey);
          if (master.encrypted && !masterKey) throw new Error(t("e2e.keyLocked"));
          return master.encrypted
            ? await decryptBytes(encrypted, master.iv, masterKey!)
            : encrypted;
        },
      }))
    );

  const copyToClipboard = async (text: string) => {
    const ok = await copyText(text);
    showToast(ok ? t("common.copied") : t("common.error"), ok ? "success" : "error");
  };

  const onCreateShare = async () => {
    if (!currentUser || !hasPremiumStorage(currentUser)) {
      showToast(premiumStorageMessage(), "warning");
      setShareModalOpen(false);
      return;
    }
    try {
      const next = sharePassword.trim()
        ? await setPublicSharePassword({
            project,
            allowDownload: shareAllowDownload,
            password: sharePassword.trim(),
          })
        : await createOrUpdatePublicShare({
            project,
            allowDownload: shareAllowDownload,
          });
      setShare(next);
      setShareModalOpen(false);
      setSharePassword("");
      showToast(t("masters.shareCreated"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const onCreateUploadLink = async () => {
    if (!currentUser || !hasPremiumStorage(currentUser)) {
      showToast(premiumStorageMessage(), "warning");
      return;
    }
    try {
      const next = await createOrUpdatePublicUploadLink({ project });
      setUploadLink(next);
      showToast(t("customerUpload.created"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 16 }}>
        <button
          className={`chip${section === "files" ? " active" : ""}`}
          onClick={() => setSection("files")}
        >
          <IconFile style={{ width: 13, height: 13 }} /> {t("projectDetail.filesSection")}
        </button>
        <button
          className={`chip${section === "masters" ? " active" : ""}`}
          onClick={() => setSection("masters")}
        >
          <IconMusic style={{ width: 13, height: 13 }} /> {t("projectDetail.mastersSection")}
        </button>
      </div>

      {section === "files" ? (
        <div
          className="detail-2col-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                {t("attachments.title")} ({project.attachments.length})
              </div>
              <div className="row" style={{ gap: 8 }}>
                {currentUser && !hasPremiumStorage(currentUser) && (
                  <span className="tour-premium-badge" title={t("plan.premium")}>
                    ★ {t("plan.premium")}
                  </span>
                )}
                {!isIOS && project.attachments.length > 0 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={bulkProgress !== null}
                    onClick={() => void downloadAllAttachments()}
                  >
                    <IconDownload /> {t("downloadAll.action")}
                  </button>
                )}
                <button className="btn btn-primary btn-sm" onClick={() => void pickAndUpload()}>
                  <IconUpload /> {t("attachments.uploadAction")}
                </button>
              </div>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => void onDropFiles(e)}
              style={
                dragOver
                  ? {
                      outline: "2px dashed var(--primary)",
                      outlineOffset: -6,
                      borderRadius: "var(--radius)",
                      background: "var(--primary-soft)",
                    }
                  : undefined
              }
            >
              {uploadProgress !== null && (
                <div style={{ padding: "12px 16px" }}>
                  <ProgressBar value={uploadProgress} />
                </div>
              )}
              {bulkProgress !== null && (
                <div style={{ padding: "12px 16px" }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>
                    {bulkProgress.label} ({bulkProgress.done + 1}/{bulkProgress.total})
                  </div>
                  <ProgressBar value={bulkProgress.done / bulkProgress.total} />
                </div>
              )}
              {project.attachments.length === 0 ? (
                <div className="empty-state">
                  <IconFile />
                  <h3>{t("attachments.empty")}</h3>
                  <div className="text-small text-muted">{t("attachments.dropHint")}</div>
                </div>
              ) : (
                project.attachments.map((url) => (
                  <div key={url} className="list-row">
                    <IconFile style={{ width: 17, height: 17, color: "var(--text-faint)" }} />
                    <div className="grow truncate text-small" style={{ fontWeight: 500 }}>
                      {project.attachmentNames[url] ?? url.split("/").pop()}
                    </div>
                    {isAudioFile(project.attachmentNames[url] ?? url) && (
                      <button
                        className="icon-btn"
                        title={t("attachments.preview")}
                        style={playingUrl === url ? { color: "var(--primary)" } : undefined}
                        onClick={() => void togglePreview(url)}
                      >
                        {playingUrl === url ? <IconPause /> : <IconPlay />}
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      title={t("common.open")}
                      onClick={() => void onOpenAttachment(url)}
                    >
                      <IconDownload />
                    </button>
                    <button
                      className="icon-btn"
                      title={t("common.delete")}
                      onClick={() => void onRemoveAttachment(url)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card card-pad">
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                {t("customerUpload.title")}
              </div>
              {currentUser && !hasPremiumStorage(currentUser) && (
                <span className="tour-premium-badge" title={t("plan.premium")}>
                  ★ {t("plan.premium")}
                </span>
              )}
            </div>
            {uploadLink ? (
              <>
                <div className="row row-wrap" style={{ marginBottom: 10 }}>
                  <span
                    className="badge"
                    style={{
                      background: uploadLink.isActive
                        ? "var(--success-soft)"
                        : "var(--danger-soft)",
                      color: uploadLink.isActive ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    {uploadLink.isActive
                      ? t("customerUpload.active")
                      : t("customerUpload.inactive")}
                  </span>
                  {uploadLink.hasPassword && (
                    <span className="badge" style={{ background: "var(--warning-soft)", color: "var(--warning)" }}>
                      <IconLock style={{ width: 11, height: 11 }} /> {t("customerUpload.passwordActive")}
                    </span>
                  )}
                </div>
                <div
                  className="mono text-xs"
                  style={{
                    padding: "8px 10px",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    wordBreak: "break-all",
                    marginBottom: 10,
                  }}
                >
                  {appendKeyFragment(uploadLink.url, projectFileKey)}
                </div>
                <div className="row row-wrap">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => void copyToClipboard(appendKeyFragment(uploadLink.url, projectFileKey))}
                  >
                    <IconCopy /> {t("common.copyLink")}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setUploadPasswordModalOpen(true)}
                  >
                    <IconLock /> {t("customerUpload.setPassword")}
                  </button>
                  {uploadLink.hasPassword && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        void clearPublicUploadPassword(project).then((next) => {
                          setUploadLink(next);
                          showToast(t("customerUpload.passwordRemoved"), "success");
                        })
                      }
                    >
                      <IconUnlock /> {t("customerUpload.removePassword")}
                    </button>
                  )}
                  {uploadLink.isActive && (
                    <button
                      className="btn btn-danger-soft btn-sm"
                      onClick={() =>
                        void disablePublicUploadLink(project.id).then(() => {
                          setUploadLink({ ...uploadLink, isActive: false });
                          showToast(t("customerUpload.disabled"), "success");
                        })
                      }
                    >
                      {t("customerUpload.disable")}
                    </button>
                  )}
                  {!uploadLink.isActive && (
                    <button className="btn btn-primary btn-sm" onClick={() => void onCreateUploadLink()}>
                      {t("customerUpload.reactivate")}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-small text-muted" style={{ marginBottom: 10 }}>
                  {t("customerUpload.description")}
                </p>
                <button className="btn btn-primary btn-sm" onClick={() => void onCreateUploadLink()}>
                  <IconLink /> {t("customerUpload.create")}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div
          className="detail-2col-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">
                  {t("masters.title")} ({masters.length})
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {currentUser && !hasPremiumStorage(currentUser) && (
                    <span className="tour-premium-badge" title={t("plan.premium")}>
                      ★ {t("plan.premium")}
                    </span>
                  )}
                  {!isIOS && masters.length > 0 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={bulkProgress !== null}
                      onClick={() => void downloadAllMasters()}
                    >
                      <IconDownload /> {t("downloadAll.action")}
                    </button>
                  )}
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={masterUploading}
                    onClick={() => void onPickMaster()}
                  >
                    <IconUpload />
                    {masterUploading ? t("common.uploading") : t("masters.upload")}
                  </button>
                </div>
              </div>
              {bulkProgress !== null && (
                <div style={{ padding: "12px 16px" }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>
                    {bulkProgress.label} ({bulkProgress.done + 1}/{bulkProgress.total})
                  </div>
                  <ProgressBar value={bulkProgress.done / bulkProgress.total} />
                </div>
              )}
              {masters.length === 0 ? (
                <div className="empty-state">
                  <IconMusic />
                  <h3>{t("masters.empty")}</h3>
                  <div className="text-small text-muted">{t("masters.emptyHint")}</div>
                </div>
              ) : (
                masters.map((master) => (
                  <div key={master.id} className="list-row">
                    <IconMusic style={{ width: 17, height: 17, color: "var(--primary)" }} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="truncate text-small" style={{ fontWeight: 600 }}>
                        {master.versionName}
                      </div>
                      <div className="text-xs text-muted">
                        {formatFileSize(master.fileSize)} ·{" "}
                        {formatDateTime(master.createdAt, lang)}
                        {master.encrypted && (
                          <>
                            {" "}
                            · <IconLock style={{ width: 10, height: 10, verticalAlign: -1 }} />
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      className="icon-btn"
                      title={t("masters.download")}
                      onClick={() => void onDownloadMaster(master)}
                    >
                      <IconDownload />
                    </button>
                    {isOwner && (
                      <button
                        className="icon-btn"
                        title={t("common.delete")}
                        onClick={() =>
                          void deleteMasterVersion(project.id, master.id).then(() =>
                            showToast(t("masters.deleted"), "success")
                          )
                        }
                      >
                        <IconTrash />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <IconMessage style={{ width: 15, height: 15, verticalAlign: -2 }} />{" "}
                  {t("masters.feedbackTitle")} ({feedback.length})
                </div>
              </div>
              {feedback.length === 0 ? (
                <div className="card-pad text-small text-muted">
                  {t("masters.noFeedback")}
                </div>
              ) : (
                feedback.map((item) => (
                  <div key={item.id} className="list-row" style={{ alignItems: "flex-start" }}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="text-small" style={{ fontWeight: 700 }}>
                          {item.authorName}
                        </span>
                        {item.timeLabel && (
                          <span className="badge" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
                            {item.timeLabel}
                          </span>
                        )}
                        <span className="text-xs text-faint">{item.versionName}</span>
                      </div>
                      <div className="text-small" style={{ marginTop: 3, whiteSpace: "pre-wrap" }}>
                        {item.message}
                      </div>
                      {item.taskTitles.length > 0 && (
                        <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                          → {item.taskTitles.join(", ")}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-faint" style={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(item.createdAt, lang)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card card-pad">
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                {t("masters.shareTitle")}
              </div>
              {currentUser && !hasPremiumStorage(currentUser) && (
                <span className="tour-premium-badge" title={t("plan.premium")}>
                  ★ {t("plan.premium")}
                </span>
              )}
            </div>
            {share && share.token ? (
              <>
                <div className="row row-wrap" style={{ marginBottom: 10 }}>
                  <span
                    className="badge"
                    style={{
                      background:
                        share.isActive && !isShareExpired(share)
                          ? "var(--success-soft)"
                          : "var(--danger-soft)",
                      color:
                        share.isActive && !isShareExpired(share)
                          ? "var(--success)"
                          : "var(--danger)",
                    }}
                  >
                    {isShareExpired(share)
                      ? t("masters.shareExpired")
                      : share.isActive
                        ? t("customerUpload.active")
                        : t("customerUpload.inactive")}
                  </span>
                  {share.hasPassword && (
                    <span className="badge" style={{ background: "var(--warning-soft)", color: "var(--warning)" }}>
                      <IconLock style={{ width: 11, height: 11 }} /> {t("customerUpload.passwordActive")}
                    </span>
                  )}
                  {share.allowDownload && (
                    <span className="badge" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
                      <IconDownload style={{ width: 11, height: 11 }} /> {t("masters.downloadAllowed")}
                    </span>
                  )}
                </div>
                <div
                  className="mono text-xs"
                  style={{
                    padding: "8px 10px",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    wordBreak: "break-all",
                    marginBottom: 10,
                  }}
                >
                  {appendKeyFragment(share.url, projectFileKey)}
                </div>
                <div className="row row-wrap">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => void copyToClipboard(appendKeyFragment(share.url, projectFileKey))}
                  >
                    <IconCopy /> {t("common.copyLink")}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShareModalOpen(true)}
                  >
                    <IconLock /> {t("masters.shareSettings")}
                  </button>
                  {share.isActive && (
                    <button
                      className="btn btn-danger-soft btn-sm"
                      onClick={() =>
                        void disablePublicShare(project.id).then(() => {
                          setShare({ ...share, isActive: false });
                          showToast(t("masters.shareDisabled"), "success");
                        })
                      }
                    >
                      {t("customerUpload.disable")}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-small text-muted" style={{ marginBottom: 10 }}>
                  {t("masters.shareDescription")}
                </p>
                <button className="btn btn-primary btn-sm" onClick={() => setShareModalOpen(true)}>
                  <IconLink /> {t("masters.createShare")}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {pendingMasterFile && (
        <Modal
          title={t("masters.upload")}
          onClose={() => setPendingMasterFile(null)}
          footer={
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setPendingMasterFile(null)}
              >
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void onUploadMaster()}>
                <IconUpload /> {t("masters.upload")}
              </button>
            </>
          }
        >
          <div className="text-small text-muted" style={{ marginBottom: 10 }}>
            {pendingMasterFile.split(/[\\/]/).pop()}
          </div>
          <div className="field">
            <label className="field-label">{t("masters.versionNamePrompt")}</label>
            <input
              className="input"
              autoFocus
              value={masterVersionName}
              onChange={(e) => setMasterVersionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onUploadMaster();
              }}
            />
          </div>
        </Modal>
      )}

      {shareModalOpen && (
        <Modal
          title={t("masters.shareSettings")}
          onClose={() => setShareModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShareModalOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void onCreateShare()}>
                {t("common.save")}
              </button>
            </>
          }
        >
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={shareAllowDownload}
              onChange={(e) => setShareAllowDownload(e.target.checked)}
            />
            <span className="text-small">{t("masters.allowDownload")}</span>
          </label>
          <div className="field" style={{ marginTop: 8 }}>
            <label className="field-label">{t("masters.sharePassword")}</label>
            <input
              className="input"
              type="password"
              value={sharePassword}
              onChange={(e) => setSharePassword(e.target.value)}
              placeholder={t("masters.sharePasswordHint")}
            />
            <div className="field-hint">{t("masters.sharePasswordNote")}</div>
          </div>
        </Modal>
      )}

      {uploadPasswordModalOpen && (
        <Modal
          title={t("customerUpload.setPassword")}
          onClose={() => setUploadPasswordModalOpen(false)}
          footer={
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setUploadPasswordModalOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  void setPublicUploadPassword({
                    project,
                    password: uploadPassword,
                  })
                    .then((next) => {
                      setUploadLink(next);
                      setUploadPasswordModalOpen(false);
                      setUploadPassword("");
                      showToast(t("customerUpload.passwordSet"), "success");
                    })
                    .catch((e: Error) => showToast(e.message, "error"))
                }
              >
                {t("common.save")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t("masters.sharePassword")}</label>
            <input
              className="input"
              type="password"
              value={uploadPassword}
              onChange={(e) => setUploadPassword(e.target.value)}
              placeholder={t("masters.sharePasswordHint")}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
