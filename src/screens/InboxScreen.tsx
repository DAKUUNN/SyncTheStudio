import { useEffect, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import type { InvitationModel } from "@/models/types";
import {
  watchPendingInvitations,
  acceptInvitation,
  declineInvitation,
} from "@/services/invitationService";
import { validateSharedProjectAcceptance } from "@/services/planService";
import { Avatar, EmptyState, timeAgo } from "@/components/ui";
import { IconInbox, IconCheck, IconX } from "@/components/Icons";

export function InboxScreen() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t, lang } = useI18n();

  const [invitations, setInvitations] = useState<InvitationModel[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = watchPendingInvitations(currentUser.id, setInvitations);
    return unsubscribe;
  }, [currentUser?.id]);

  const onAccept = async (invitation: InvitationModel) => {
    if (!currentUser) return;
    setBusyId(invitation.id);
    try {
      const planError = await validateSharedProjectAcceptance(currentUser);
      if (planError) {
        showToast(planError, "warning");
        return;
      }
      await acceptInvitation(invitation.id);
      showToast(t("inbox.accepted", { name: invitation.projectName }), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const onDecline = async (invitation: InvitationModel) => {
    setBusyId(invitation.id);
    try {
      await declineInvitation(invitation.id);
      showToast(t("inbox.declined"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="content-narrow">
      <h1 style={{ marginBottom: 4 }}>{t("inbox.title")}</h1>
      <div className="text-small text-muted" style={{ marginBottom: 18 }}>
        {t("inbox.subtitle")}
      </div>

      <div className="card">
        {invitations.length === 0 ? (
          <EmptyState
            icon={<IconInbox />}
            title={t("inbox.emptyTitle")}
            subtitle={t("inbox.emptySubtitle")}
          />
        ) : (
          invitations.map((invitation) => (
            <div key={invitation.id} className="list-row">
              <Avatar name={invitation.inviterName ?? invitation.ownerName} size={38} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="text-small">
                  <strong>{invitation.inviterName ?? invitation.ownerName}</strong>{" "}
                  {t("inbox.invitedYou")}{" "}
                  <strong>„{invitation.projectName}“</strong>
                </div>
                <div className="text-xs text-muted">
                  {timeAgo(invitation.createdAt, lang)}
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                disabled={busyId === invitation.id}
                onClick={() => void onAccept(invitation)}
              >
                <IconCheck /> {t("inbox.accept")}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={busyId === invitation.id}
                onClick={() => void onDecline(invitation)}
              >
                <IconX /> {t("inbox.decline")}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
