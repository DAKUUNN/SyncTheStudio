import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import type { CustomerModel } from "@/models/types";
import {
  watchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/services/customerService";
import { Avatar, ConfirmDialog, EmptyState, Modal, formatDate } from "@/components/ui";
import {
  IconPlus,
  IconUsers,
  IconEdit,
  IconTrash,
  IconMail,
  IconMusic,
} from "@/components/Icons";

export function CustomersScreen() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t, lang } = useI18n();

  const [customers, setCustomers] = useState<CustomerModel[]>([]);
  const [searchText, setSearchText] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerModel | null>(null);
  const [deleting, setDeleting] = useState<CustomerModel | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = watchCustomers(currentUser.id, setCustomers);
    return unsubscribe;
  }, [currentUser?.id]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(q) ||
        (customer.email?.toLowerCase().includes(q) ?? false) ||
        (customer.discord?.toLowerCase().includes(q) ?? false) ||
        (customer.instagram?.toLowerCase().includes(q) ?? false)
    );
  }, [customers, searchText]);

  const onDelete = async () => {
    if (!currentUser || !deleting) return;
    try {
      await deleteCustomer(currentUser.id, deleting.id);
      showToast(t("customers.deleted"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setDeleting(null);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="content-wide">
      <div className="row row-between" style={{ marginBottom: 16 }}>
        <div>
          <h1>{t("nav.customers")}</h1>
          <div className="text-small text-muted">
            {t("customers.countLabel", { count: customers.length })}
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <IconPlus /> {t("customers.add")}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ paddingBottom: 14 }}>
          <input
            className="input"
            style={{ maxWidth: 320 }}
            placeholder={`${t("search.title")}…`}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconUsers />}
            title={t("customers.emptyTitle")}
            subtitle={t("customers.emptySubtitle")}
          />
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("customers.colName")}</th>
                <th>{t("customers.colContact")}</th>
                <th>{t("customers.colSocials")}</th>
                <th>{t("customers.colCreated")}</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div className="row">
                      <Avatar name={customer.name} size={30} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{customer.name}</div>
                        {customer.notes && (
                          <div className="text-xs text-muted truncate" style={{ maxWidth: 260 }}>
                            {customer.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="text-small">
                      {customer.email && (
                        <div className="row" style={{ gap: 5 }}>
                          <IconMail style={{ width: 12, height: 12, color: "var(--text-faint)" }} />
                          {customer.email}
                        </div>
                      )}
                      {customer.phone && (
                        <div className="text-xs text-muted">{customer.phone}</div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="row row-wrap" style={{ gap: 4 }}>
                      {customer.discord && (
                        <span className="chip" style={{ pointerEvents: "none" }}>
                          Discord: {customer.discord}
                        </span>
                      )}
                      {customer.instagram && (
                        <span className="chip" style={{ pointerEvents: "none" }}>
                          IG: {customer.instagram}
                        </span>
                      )}
                      {customer.spotify && (
                        <span className="chip" style={{ pointerEvents: "none" }}>
                          Spotify
                        </span>
                      )}
                      {customer.appleMusic && (
                        <span className="chip" style={{ pointerEvents: "none" }}>
                          Apple Music
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-small text-muted">
                    {formatDate(customer.createdAt, lang)}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
                      <button
                        className="icon-btn"
                        onClick={() => {
                          setEditing(customer);
                          setFormOpen(true);
                        }}
                      >
                        <IconEdit />
                      </button>
                      <button className="icon-btn" onClick={() => setDeleting(customer)}>
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <CustomerFormModal
          customer={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            showToast(
              editing ? t("customers.updated") : t("customers.created"),
              "success"
            );
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t("customers.deleteTitle")}
          message={t("customers.deleteConfirm", { name: deleting.name })}
          confirmLabel={t("common.delete")}
          danger
          onConfirm={() => void onDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function CustomerFormModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerModel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [discord, setDiscord] = useState(customer?.discord ?? "");
  const [instagram, setInstagram] = useState(customer?.instagram ?? "");
  const [spotify, setSpotify] = useState(customer?.spotify ?? "");
  const [appleMusic, setAppleMusic] = useState(customer?.appleMusic ?? "");
  const [memory, setMemory] = useState<{ key: string; value: string }[]>(
    Object.entries(customer?.clientMemory ?? {}).map(([key, value]) => ({ key, value }))
  );
  const [referenceTracks, setReferenceTracks] = useState<string[]>(
    customer?.referenceTracks ?? []
  );
  const [newTrack, setNewTrack] = useState("");
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!currentUser) return;
    if (!name.trim()) {
      showToast(t("customers.nameRequired"), "error");
      return;
    }
    setSaving(true);
    try {
      const clientMemory: Record<string, string> = {};
      for (const entry of memory) {
        if (entry.key.trim() && entry.value.trim()) {
          clientMemory[entry.key.trim()] = entry.value.trim();
        }
      }
      const payload = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        notes: notes,
        discord: discord.trim(),
        instagram: instagram.trim(),
        spotify: spotify.trim(),
        appleMusic: appleMusic.trim(),
        clientMemory,
        referenceTracks: referenceTracks.filter((track) => track.trim()),
      };
      if (customer) {
        await updateCustomer(currentUser.id, customer.id, payload);
      } else {
        await createCustomer(currentUser.id, payload);
      }
      onSaved();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      title={customer ? t("customers.editTitle") : t("customers.add")}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={() => void onSave()}>
            {t("common.save")}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <div className="field">
          <label className="field-label">{t("customers.colName")} *</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">E-Mail</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">{t("customers.phone")}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Discord</label>
          <input className="input" value={discord} onChange={(e) => setDiscord(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Instagram</label>
          <input className="input" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Spotify</label>
          <input className="input" value={spotify} onChange={(e) => setSpotify(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Apple Music</label>
          <input className="input" value={appleMusic} onChange={(e) => setAppleMusic(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label className="field-label">{t("customers.notes")}</label>
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="field-hint">{t("customers.notesEncrypted")}</div>
      </div>

      <div className="divider" />
      <div className="section-title">{t("customers.clientMemory")}</div>
      {memory.map((entry, index) => (
        <div className="row" key={index} style={{ marginBottom: 8 }}>
          <input
            className="input"
            style={{ maxWidth: 180 }}
            placeholder={t("customers.memoryKey")}
            value={entry.key}
            onChange={(e) =>
              setMemory((prev) =>
                prev.map((item, i) => (i === index ? { ...item, key: e.target.value } : item))
              )
            }
          />
          <input
            className="input grow"
            placeholder={t("customers.memoryValue")}
            value={entry.value}
            onChange={(e) =>
              setMemory((prev) =>
                prev.map((item, i) => (i === index ? { ...item, value: e.target.value } : item))
              )
            }
          />
          <button
            className="icon-btn"
            onClick={() => setMemory((prev) => prev.filter((_, i) => i !== index))}
          >
            <IconTrash />
          </button>
        </div>
      ))}
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => setMemory((prev) => [...prev, { key: "", value: "" }])}
      >
        <IconPlus /> {t("customers.addMemory")}
      </button>

      <div className="divider" />
      <div className="section-title">
        <IconMusic style={{ width: 13, height: 13, verticalAlign: -2 }} />{" "}
        {t("customers.referenceTracks")}
      </div>
      {referenceTracks.map((track, index) => (
        <div className="row" key={index} style={{ marginBottom: 8 }}>
          <input
            className="input grow"
            value={track}
            onChange={(e) =>
              setReferenceTracks((prev) =>
                prev.map((item, i) => (i === index ? e.target.value : item))
              )
            }
          />
          <button
            className="icon-btn"
            onClick={() => setReferenceTracks((prev) => prev.filter((_, i) => i !== index))}
          >
            <IconTrash />
          </button>
        </div>
      ))}
      <div className="row">
        <input
          className="input grow"
          placeholder={t("customers.addTrackHint")}
          value={newTrack}
          onChange={(e) => setNewTrack(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTrack.trim()) {
              setReferenceTracks((prev) => [...prev, newTrack.trim()]);
              setNewTrack("");
            }
          }}
        />
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            if (newTrack.trim()) {
              setReferenceTracks((prev) => [...prev, newTrack.trim()]);
              setNewTrack("");
            }
          }}
        >
          <IconPlus />
        </button>
      </div>
    </Modal>
  );
}
