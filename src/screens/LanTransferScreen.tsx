import { useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import { useIsIOS } from "@/lib/platform";
import {
  defaultPort,
  generatePin,
  getLocalIp,
  startSend,
  startReceive,
  cancelTransfer,
  onWaitingForConnection,
  onConnected,
  onProgress,
  type LanTransferProgress,
} from "@/services/lanTransferService";
import { ProgressBar } from "@/components/ui";
import { formatFileSize } from "@/models/types";
import {
  IconWifi,
  IconFolder,
  IconFile,
  IconKey,
  IconDownload,
  IconArrowRight,
  IconX,
  IconRefresh,
} from "@/components/Icons";

type Mode = "send" | "receive";
type SendStatus = "idle" | "waiting" | "connected" | "transferring" | "done" | "error";
type ReceiveStatus = "idle" | "connecting" | "transferring" | "done" | "error";

export function LanTransferScreen() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const isIOS = useIsIOS();

  const [mode, setMode] = useState<Mode>("send");
  const [localIp, setLocalIp] = useState<string | null>(null);
  const [port] = useState(defaultPort());

  // Send
  const [sourcePath, setSourcePath] = useState<{ path: string; isDirectory: boolean } | null>(null);
  const [pin, setPin] = useState(() => generatePin());
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [sendProgress, setSendProgress] = useState<LanTransferProgress | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Receive
  const [receiveHost, setReceiveHost] = useState("");
  const [receivePort, setReceivePort] = useState(String(defaultPort()));
  const [receivePin, setReceivePin] = useState("");
  const [saveDir, setSaveDir] = useState<string | null>(null);
  const [receiveStatus, setReceiveStatus] = useState<ReceiveStatus>("idle");
  const [receiveProgress, setReceiveProgress] = useState<LanTransferProgress | null>(null);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const unlistenRefs = useRef<Array<() => void>>([]);

  useEffect(() => {
    void getLocalIp().then(setLocalIp);
  }, []);

  useEffect(() => {
    void Promise.all([
      onWaitingForConnection(() => setSendStatus("waiting")),
      onConnected(() => {
        setSendStatus((prev) => (prev === "waiting" ? "connected" : prev));
        setReceiveStatus((prev) => (prev === "connecting" ? "transferring" : prev));
      }),
      onProgress((p) => {
        // Only one transfer (send or receive) runs at a time, driven by
        // whichever status is currently non-idle — safe to update both
        // and let the idle one just sit unused.
        setSendProgress(p);
        setReceiveProgress(p);
        setSendStatus((prev) => (prev === "waiting" || prev === "connected" ? "transferring" : prev));
        setReceiveStatus((prev) => (prev === "connecting" ? "transferring" : prev));
      }),
    ]).then((unlisteners) => {
      unlistenRefs.current = unlisteners;
    });
    return () => {
      unlistenRefs.current.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickSource = async (directory: boolean) => {
    const selected = await openDialog({ directory, multiple: false, recursive: directory });
    if (!selected || typeof selected !== "string") return;
    setSourcePath({ path: selected, isDirectory: directory });
  };

  const onStartSend = async () => {
    if (!sourcePath) return;
    setSendError(null);
    setSendProgress(null);
    setSendStatus("waiting");
    try {
      await startSend(sourcePath.path, pin, port);
      setSendStatus("done");
      showToast(t("lanTransfer.sendDone"), "success");
    } catch (e) {
      const message = (e as Error).message ?? String(e);
      if (message !== "Abgebrochen") {
        setSendError(message);
        setSendStatus("error");
      } else {
        setSendStatus("idle");
      }
    }
  };

  const onStartReceive = async () => {
    const portNum = parseInt(receivePort, 10);
    if (!receiveHost.trim() || !receivePin.trim() || !saveDir || Number.isNaN(portNum)) return;
    setReceiveError(null);
    setReceiveProgress(null);
    setReceiveStatus("connecting");
    try {
      await startReceive(receiveHost.trim(), portNum, receivePin.trim(), saveDir);
      setReceiveStatus("done");
      showToast(t("lanTransfer.receiveDone"), "success");
    } catch (e) {
      const message = (e as Error).message ?? String(e);
      if (message !== "Abgebrochen") {
        setReceiveError(message);
        setReceiveStatus("error");
      } else {
        setReceiveStatus("idle");
      }
    }
  };

  const onCancel = async () => {
    await cancelTransfer();
    setSendStatus("idle");
    setReceiveStatus("idle");
  };

  if (isIOS) return null;

  const sendBusy = sendStatus === "waiting" || sendStatus === "connected" || sendStatus === "transferring";
  const receiveBusy = receiveStatus === "connecting" || receiveStatus === "transferring";

  return (
    <div className="content-narrow">
      <h1 style={{ marginBottom: 4 }}>{t("lanTransfer.title")}</h1>
      <div className="text-small text-muted" style={{ marginBottom: 18 }}>
        {t("lanTransfer.subtitle")}
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="section-title">{t("lanTransfer.howItWorks")}</div>
        <div
          className="row row-wrap"
          style={{ gap: 6, alignItems: "stretch", justifyContent: "center", marginTop: 8 }}
        >
          {(
            [
              [IconFolder, t("lanTransfer.step1Title"), t("lanTransfer.step1Body")],
              [IconKey, t("lanTransfer.step2Title"), t("lanTransfer.step2Body")],
              [IconWifi, t("lanTransfer.step3Title"), t("lanTransfer.step3Body")],
              [IconDownload, t("lanTransfer.step4Title"), t("lanTransfer.step4Body")],
            ] as const
          ).map(([Icon, title, body], i, arr) => (
            <div key={title} className="row" style={{ gap: 6, alignItems: "center" }}>
              <div
                style={{
                  width: 150,
                  padding: "14px 10px",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius)",
                  textAlign: "center",
                }}
              >
                <div
                  className="stat-icon"
                  style={{
                    background: "var(--primary-soft)",
                    color: "var(--primary)",
                    margin: "0 auto 8px",
                  }}
                >
                  <Icon />
                </div>
                <div className="text-xs" style={{ fontWeight: 700, marginBottom: 3 }}>
                  {i + 1}. {title}
                </div>
                <div className="text-xs text-muted">{body}</div>
              </div>
              {i < arr.length - 1 && (
                <IconArrowRight
                  style={{ width: 16, height: 16, color: "var(--text-faint)", flexShrink: 0 }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="row row-wrap" style={{ gap: 8, marginBottom: 16 }}>
        <button
          className={`chip${mode === "send" ? " active" : ""}`}
          onClick={() => setMode("send")}
        >
          {t("lanTransfer.tabSend")}
        </button>
        <button
          className={`chip${mode === "receive" ? " active" : ""}`}
          onClick={() => setMode("receive")}
        >
          {t("lanTransfer.tabReceive")}
        </button>
      </div>

      {mode === "send" ? (
        <div className="card card-pad">
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">{t("lanTransfer.pickSourceLabel")}</label>
            {sourcePath ? (
              <div className="row" style={{ gap: 8 }}>
                <div
                  className="mono text-xs grow truncate"
                  style={{
                    padding: "8px 10px",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                  }}
                  title={sourcePath.path}
                >
                  {sourcePath.path}
                </div>
                <button className="btn btn-secondary btn-sm" disabled={sendBusy} onClick={() => setSourcePath(null)}>
                  <IconX style={{ width: 13, height: 13 }} />
                </button>
              </div>
            ) : (
              <div className="row row-wrap" style={{ gap: 8 }}>
                <button className="btn btn-secondary btn-sm" disabled={sendBusy} onClick={() => void pickSource(false)}>
                  <IconFile /> {t("lanTransfer.pickFile")}
                </button>
                <button className="btn btn-secondary btn-sm" disabled={sendBusy} onClick={() => void pickSource(true)}>
                  <IconFolder /> {t("lanTransfer.pickFolder")}
                </button>
              </div>
            )}
          </div>

          {sourcePath && (
            <>
              <div className="grid-2" style={{ marginBottom: 14 }}>
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>
                    {t("lanTransfer.yourAddress")}
                  </div>
                  <div className="mono text-small" style={{ fontWeight: 700 }}>
                    {localIp ?? "…"}:{port}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>
                    {t("lanTransfer.pin")}
                  </div>
                  <div className="row" style={{ gap: 6, alignItems: "center" }}>
                    <div className="mono" style={{ fontWeight: 700, fontSize: "1.15rem", letterSpacing: 2 }}>
                      {pin}
                    </div>
                    {!sendBusy && (
                      <button
                        className="icon-btn"
                        title={t("lanTransfer.newPin")}
                        onClick={() => setPin(generatePin())}
                      >
                        <IconRefresh style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {!sendBusy && sendStatus !== "done" && (
                <button className="btn btn-primary" onClick={() => void onStartSend()}>
                  <IconWifi /> {t("lanTransfer.startSending")}
                </button>
              )}

              {sendStatus === "waiting" && (
                <div className="text-small text-muted">{t("lanTransfer.waitingForPeer")}</div>
              )}
              {(sendStatus === "connected" || sendStatus === "transferring") && (
                <div>
                  <div className="text-small" style={{ marginBottom: 6 }}>
                    {sendProgress
                      ? `${sendProgress.currentFile} — ${formatFileSize(sendProgress.bytesDone)} / ${formatFileSize(sendProgress.bytesTotal)}`
                      : t("lanTransfer.connectedWaitingData")}
                  </div>
                  <ProgressBar
                    value={sendProgress && sendProgress.bytesTotal > 0 ? sendProgress.bytesDone / sendProgress.bytesTotal : 0}
                  />
                </div>
              )}
              {sendBusy && (
                <button className="btn btn-danger-soft btn-sm" style={{ marginTop: 10 }} onClick={() => void onCancel()}>
                  {t("common.cancel")}
                </button>
              )}
              {sendStatus === "done" && (
                <div className="text-small" style={{ color: "var(--success)" }}>
                  {t("lanTransfer.sendDone")}
                </div>
              )}
              {sendStatus === "error" && sendError && (
                <div className="text-small" style={{ color: "var(--danger)" }}>
                  {sendError}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="card card-pad">
          <div className="field">
            <label className="field-label">{t("lanTransfer.hostLabel")}</label>
            <input
              className="input"
              disabled={receiveBusy}
              placeholder="192.168.1.23"
              value={receiveHost}
              onChange={(e) => setReceiveHost(e.target.value)}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">{t("lanTransfer.portLabel")}</label>
              <input
                className="input"
                disabled={receiveBusy}
                value={receivePort}
                onChange={(e) => setReceivePort(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">{t("lanTransfer.pin")}</label>
              <input
                className="input mono"
                disabled={receiveBusy}
                style={{ textTransform: "uppercase" }}
                maxLength={6}
                value={receivePin}
                onChange={(e) => setReceivePin(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">{t("lanTransfer.saveToLabel")}</label>
            {saveDir ? (
              <div className="row" style={{ gap: 8 }}>
                <div
                  className="mono text-xs grow truncate"
                  style={{ padding: "8px 10px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}
                  title={saveDir}
                >
                  {saveDir}
                </div>
                <button className="btn btn-secondary btn-sm" disabled={receiveBusy} onClick={() => setSaveDir(null)}>
                  <IconX style={{ width: 13, height: 13 }} />
                </button>
              </div>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                disabled={receiveBusy}
                onClick={() =>
                  void openDialog({ directory: true, multiple: false, recursive: true }).then((selected) => {
                    if (selected && typeof selected === "string") setSaveDir(selected);
                  })
                }
              >
                <IconFolder /> {t("lanTransfer.pickSaveFolder")}
              </button>
            )}
          </div>

          {!receiveBusy && receiveStatus !== "done" && (
            <button
              className="btn btn-primary"
              disabled={!receiveHost.trim() || !receivePin.trim() || !saveDir}
              onClick={() => void onStartReceive()}
            >
              <IconDownload /> {t("lanTransfer.startReceiving")}
            </button>
          )}

          {receiveStatus === "connecting" && (
            <div className="text-small text-muted">{t("lanTransfer.connecting")}</div>
          )}
          {receiveStatus === "transferring" && (
            <div>
              <div className="text-small" style={{ marginBottom: 6 }}>
                {receiveProgress
                  ? `${receiveProgress.currentFile} — ${formatFileSize(receiveProgress.bytesDone)} / ${formatFileSize(receiveProgress.bytesTotal)}`
                  : t("lanTransfer.connectedWaitingData")}
              </div>
              <ProgressBar
                value={
                  receiveProgress && receiveProgress.bytesTotal > 0
                    ? receiveProgress.bytesDone / receiveProgress.bytesTotal
                    : 0
                }
              />
            </div>
          )}
          {receiveBusy && (
            <button className="btn btn-danger-soft btn-sm" style={{ marginTop: 10 }} onClick={() => void onCancel()}>
              {t("common.cancel")}
            </button>
          )}
          {receiveStatus === "done" && saveDir && (
            <div className="text-small" style={{ color: "var(--success)" }}>
              {t("lanTransfer.receiveDoneAt", { path: saveDir })}
            </div>
          )}
          {receiveStatus === "error" && receiveError && (
            <div className="text-small" style={{ color: "var(--danger)" }}>
              {receiveError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
