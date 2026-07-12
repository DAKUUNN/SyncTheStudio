import { useEffect, useState } from "react";
import { getPublicLinkToken } from "@/lib/publicLinkUrl";
import {
  getPublicCustomerUploadByToken,
  verifyPublicLinkPassword,
  type PublicCustomerUploadAccess,
} from "@/services/publicLinkService";
import { Spinner } from "@/components/ui";
import { IconLink, IconLock } from "@/components/Icons";
import { UploadPanel } from "./UploadPanel";

export function PublicCustomerUploadScreen() {
  const [linkData, setLinkData] = useState<PublicCustomerUploadAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);

  useEffect(() => {
    const token = getPublicLinkToken();
    if (!token) {
      setError("Dieser Link ist ungueltig.");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const nextLink = await getPublicCustomerUploadByToken(token);
        if (!nextLink) {
          setError("Dieser Link wurde nicht gefunden.");
          return;
        }
        if (!nextLink.isActive) {
          setError("Dieser Upload-Link ist deaktiviert.");
          return;
        }
        setLinkData(nextLink);
        if (!nextLink.hasPassword) {
          setAccessGranted(true);
        }
      } catch (e) {
        setError((e as Error).message || "Der Upload-Link konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onUnlock = async () => {
    if (!linkData) return;
    setVerifying(true);
    setError(null);
    try {
      const matches = await verifyPublicLinkPassword({
        password,
        passwordHash: linkData.passwordHash,
        passwordSalt: linkData.passwordSalt,
      });
      if (!matches) {
        setError("Das Passwort ist nicht korrekt.");
        return;
      }
      setAccessGranted(true);
      setPassword("");
    } finally {
      setVerifying(false);
    }
  };

  const heading = linkData
    ? `${linkData.customerName || "Kunde"} – ${linkData.projectName} STEMS Upload`
    : "STEMS Upload";

  return (
    <div className="public-link-page">
      <div className="public-link-wrap">
        <div className="public-link-shell">
          <section className="public-link-panel">
            <div className="public-link-brand-row">
              <img src="/logo.png" alt="" />
              <span>SyncTheStudio</span>
            </div>

            {loading ? (
              <div className="public-link-loading">
                <div>
                  <Spinner large />
                  <div style={{ marginTop: 14 }}>Wird geladen…</div>
                </div>
              </div>
            ) : error && !linkData ? (
              <div className="public-link-empty">
                <div>
                  <div className="public-link-empty-icon">
                    <IconLink />
                  </div>
                  <h2>Link nicht verfuegbar</h2>
                  <div className="public-link-panel-copy" style={{ marginTop: 10 }}>
                    {error}
                  </div>
                </div>
              </div>
            ) : linkData ? (
              <>
                <h1 className="public-link-title">{heading}</h1>

                <div className="public-link-stack" style={{ marginTop: 20 }}>
                  {linkData.hasPassword && !accessGranted && (
                    <div className="public-link-gate">
                      <div className="public-link-panel-title" style={{ fontSize: "1.05rem", marginBottom: 8 }}>
                        Passwort entsperren
                      </div>
                      <div className="public-link-panel-copy" style={{ marginBottom: 14 }}>
                        Dieser Upload-Link ist geschuetzt. Gib zuerst das vergebene Passwort ein.
                      </div>
                      <label className="public-link-label">Passwort</label>
                      <input
                        className="public-link-input"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void onUnlock();
                        }}
                      />
                      {error && <div className="public-link-alert" style={{ marginTop: 12 }}>{error}</div>}
                      <div style={{ marginTop: 14 }}>
                        <button
                          className="public-link-button"
                          disabled={verifying}
                          onClick={() => void onUnlock()}
                        >
                          {verifying ? <Spinner /> : <IconLock />}
                          Zugriff freischalten
                        </button>
                      </div>
                    </div>
                  )}

                  {accessGranted && (
                    <UploadPanel projectId={linkData.projectId} ownerId={linkData.ownerId} />
                  )}
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
