import { useEffect, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import type { ProjectModel, UserModel } from "@/models/types";
import {
  getUsersByIds,
  getUserByUsernameOrEmail,
} from "@/services/authService";
import {
  updateProjectMemberRole,
  getProjectRolePresets,
  saveProjectRolePreset,
  leaveSharedProject,
  addHistoryEntry,
  ROLE_OWNER,
} from "@/services/projectService";
import { createInvitation, hasPendingInvitation } from "@/services/invitationService";
import { Avatar, Modal } from "@/components/ui";
import { IconPlus, IconUsers, IconEdit, IconTrash } from "@/components/Icons";

export function TeamTab({
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
  const { t } = useI18n();

  const [members, setMembers] = useState<UserModel[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [roleEditMember, setRoleEditMember] = useState<UserModel | null>(null);
  const [roleValue, setRoleValue] = useState("");
  const [rolePresets, setRolePresets] = useState<string[]>([]);

  useEffect(() => {
    const memberIds = new Set<string>([
      ...(project.ownerId ? [project.ownerId] : []),
      ...project.sharedWith,
    ]);
    void getUsersByIds([...memberIds]).then(setMembers);
    if (currentUser) {
      void getProjectRolePresets(currentUser.id).then(setRolePresets);
    }
  }, [project.id, project.sharedWith.join(","), project.ownerId, currentUser?.id]);

  const onInvite = async () => {
    if (!currentUser || !inviteQuery.trim()) return;
    setInviting(true);
    try {
      const user = await getUserByUsernameOrEmail(inviteQuery.trim());
      if (!user) {
        showToast(t("team.userNotFound"), "error");
        return;
      }
      if (user.id === currentUser.id) {
        showToast(t("team.cannotInviteSelf"), "warning");
        return;
      }
      if (project.sharedWith.includes(user.id) || project.ownerId === user.id) {
        showToast(t("team.alreadyMember"), "warning");
        return;
      }
      if (await hasPendingInvitation(project.id, user.id)) {
        showToast(t("team.alreadyInvited"), "warning");
        return;
      }
      await createInvitation({
        projectId: project.id,
        projectName: project.name,
        ownerId: project.ownerId || currentUser.id,
        ownerName: project.ownerName ?? currentUser.username,
        inviterId: currentUser.id,
        inviterName: currentUser.username,
        invitedUserId: user.id,
        invitedUserName: user.username,
      });
      await addHistoryEntry(
        project.id,
        currentUser.id,
        currentUser.username,
        `Einladung gesendet an ${user.username}`
      );
      setInviteOpen(false);
      setInviteQuery("");
      showToast(t("team.invitationSent", { username: user.username }), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setInviting(false);
    }
  };

  const onSaveRole = async () => {
    if (!currentUser || !roleEditMember) return;
    try {
      await updateProjectMemberRole({
        projectId: project.id,
        ownerId: project.ownerId || currentUser.id,
        memberId: roleEditMember.id,
        role: roleValue,
      });
      await saveProjectRolePreset(currentUser.id, roleValue);
      setRolePresets(await getProjectRolePresets(currentUser.id));
      setRoleEditMember(null);
      await onChanged();
      showToast(t("team.roleUpdated"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const onRemoveMember = async (member: UserModel) => {
    if (!currentUser) return;
    try {
      await leaveSharedProject(project.id, member.id);
      await addHistoryEntry(
        project.id,
        currentUser.id,
        currentUser.username,
        `Mitglied entfernt: ${member.username}`
      );
      await onChanged();
      showToast(t("team.memberRemoved"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  return (
    <div className="content-narrow" style={{ margin: 0, maxWidth: 720 }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            {t("projectDetail.tabTeam")} ({members.length})
          </div>
          {isOwner && (
            <button className="btn btn-primary btn-sm" onClick={() => setInviteOpen(true)}>
              <IconPlus /> {t("team.invite")}
            </button>
          )}
        </div>
        {members.length === 0 ? (
          <div className="empty-state">
            <IconUsers />
            <h3>{t("team.emptyTitle")}</h3>
          </div>
        ) : (
          members.map((member) => {
            const role =
              project.memberRoles[member.id] ??
              (member.id === project.ownerId ? ROLE_OWNER : "member");
            const isProjectOwner = member.id === project.ownerId;
            return (
              <div key={member.id} className="list-row">
                <Avatar
                  name={member.username}
                  url={member.avatarUrl}
                  size={36}
                  online={member.isOnline}
                />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="text-small truncate" style={{ fontWeight: 600 }}>
                      {member.username}
                    </span>
                    {isProjectOwner && (
                      <span
                        className="badge"
                        style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
                      >
                        {t("team.owner")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {role !== ROLE_OWNER ? role : member.email}
                  </div>
                </div>
                {isOwner && !isProjectOwner && (
                  <>
                    <button
                      className="icon-btn"
                      title={t("team.editRole")}
                      onClick={() => {
                        setRoleEditMember(member);
                        setRoleValue(
                          project.memberRoles[member.id] &&
                            project.memberRoles[member.id] !== ROLE_OWNER
                            ? project.memberRoles[member.id]
                            : ""
                        );
                      }}
                    >
                      <IconEdit />
                    </button>
                    <button
                      className="icon-btn"
                      title={t("team.remove")}
                      onClick={() => void onRemoveMember(member)}
                    >
                      <IconTrash />
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {inviteOpen && (
        <Modal
          title={t("team.invite")}
          onClose={() => setInviteOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setInviteOpen(false)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                disabled={inviting}
                onClick={() => void onInvite()}
              >
                {t("team.sendInvitation")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t("team.inviteLabel")}</label>
            <input
              className="input"
              autoFocus
              value={inviteQuery}
              onChange={(e) => setInviteQuery(e.target.value)}
              placeholder={t("team.inviteHint")}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onInvite();
              }}
            />
            <div className="field-hint">{t("team.inviteNote")}</div>
          </div>
        </Modal>
      )}

      {roleEditMember && (
        <Modal
          title={t("team.editRole")}
          onClose={() => setRoleEditMember(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setRoleEditMember(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void onSaveRole()}>
                {t("common.save")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">
              {t("team.roleFor", { username: roleEditMember.username })}
            </label>
            <input
              className="input"
              autoFocus
              maxLength={48}
              value={roleValue}
              onChange={(e) => setRoleValue(e.target.value)}
              placeholder={t("team.roleHint")}
            />
          </div>
          {rolePresets.length > 0 && (
            <div className="row row-wrap">
              {rolePresets.map((preset) => (
                <button key={preset} className="chip" onClick={() => setRoleValue(preset)}>
                  {preset}
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
