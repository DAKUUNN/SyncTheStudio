import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import type { ProjectModel, UserModel } from "@/models/types";
import { getUsersByIds, getAllUsers } from "@/services/authService";
import {
  updateProjectMemberRole,
  updateProjectMemberPermission,
  getProjectRolePresets,
  saveProjectRolePreset,
  leaveSharedProject,
  addHistoryEntry,
  ROLE_OWNER,
} from "@/services/projectService";
import {
  createInvitation,
  hasPendingInvitation,
  finalizeAcceptedInvitationsForOwner,
} from "@/services/invitationService";
import { Avatar, Modal, Spinner } from "@/components/ui";
import {
  IconPlus,
  IconUsers,
  IconEdit,
  IconTrash,
  IconSearch,
  IconCheck,
  IconLock,
  IconUnlock,
} from "@/components/Icons";

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

  // Owners can always invite; non-owner members can too as long as they're
  // not viewer-only (matches the relaxed firestore.rules check — invites no
  // longer require a Premium plan, just non-viewer project access).
  const myPermission =
    project.memberPermissions[currentUser?.id ?? ""] === "viewer" ? "viewer" : "editor";
  const canInvite = isOwner || myPermission === "editor";

  const [members, setMembers] = useState<UserModel[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [allUsers, setAllUsers] = useState<UserModel[] | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    if (!isOwner || !currentUser) return;
    void finalizeAcceptedInvitationsForOwner(currentUser.id, currentUser.username).then(() =>
      onChanged()
    );
  }, [isOwner, currentUser?.id, project.id]);

  useEffect(() => {
    if (!inviteOpen || allUsers !== null) return;
    void getAllUsers().then(setAllUsers);
  }, [inviteOpen, allUsers]);

  const invitableUsers = useMemo(() => {
    if (!allUsers || !currentUser) return [];
    const excluded = new Set<string>([
      currentUser.id,
      ...(project.ownerId ? [project.ownerId] : []),
      ...project.sharedWith,
    ]);
    const query = inviteSearch.trim().toLowerCase();
    return allUsers
      .filter((user) => !excluded.has(user.id))
      .filter(
        (user) =>
          !query ||
          user.username.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)
      )
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, 60);
  }, [allUsers, currentUser, project.ownerId, project.sharedWith, inviteSearch]);

  const onInviteUser = async (user: UserModel) => {
    if (!currentUser) return;
    setInvitingId(user.id);
    try {
      if (await hasPendingInvitation(project.id, user.id)) {
        showToast(t("team.alreadyInvited"), "warning");
        setInvitedIds((prev) => new Set(prev).add(user.id));
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
      setInvitedIds((prev) => new Set(prev).add(user.id));
      showToast(t("team.invitationSent", { username: user.username }), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setInvitingId(null);
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

  const onTogglePermission = async (member: UserModel, current: "viewer" | "editor") => {
    if (!currentUser) return;
    const next = current === "viewer" ? "editor" : "viewer";
    try {
      await updateProjectMemberPermission({
        projectId: project.id,
        ownerId: project.ownerId || currentUser.id,
        memberId: member.id,
        permission: next,
      });
      await onChanged();
      showToast(
        next === "viewer" ? t("team.permissionSetViewer") : t("team.permissionSetEditor"),
        "success"
      );
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
          {canInvite && (
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
            const permission =
              project.memberPermissions[member.id] === "viewer" ? "viewer" : "editor";
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
                    {!isProjectOwner && permission === "viewer" && (
                      <span
                        className="badge"
                        style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
                      >
                        {t("team.viewerOnly")}
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
                      title={
                        permission === "viewer" ? t("team.makeEditor") : t("team.makeViewer")
                      }
                      onClick={() => void onTogglePermission(member, permission)}
                    >
                      {permission === "viewer" ? <IconUnlock /> : <IconLock />}
                    </button>
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
          onClose={() => {
            setInviteOpen(false);
            setInviteSearch("");
            setInvitedIds(new Set());
          }}
          footer={
            <button
              className="btn btn-secondary"
              onClick={() => {
                setInviteOpen(false);
                setInviteSearch("");
                setInvitedIds(new Set());
              }}
            >
              {t("common.close")}
            </button>
          }
        >
          <div className="field" style={{ marginBottom: 10 }}>
            <div style={{ position: "relative" }}>
              <IconSearch
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 15,
                  height: 15,
                  color: "var(--text-faint)",
                }}
              />
              <input
                className="input"
                autoFocus
                style={{ paddingLeft: 34 }}
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                placeholder={t("team.inviteHint")}
              />
            </div>
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto", margin: "0 -20px" }}>
            {allUsers === null ? (
              <div className="loading-center" style={{ padding: "30px 0" }}>
                <Spinner />
              </div>
            ) : invitableUsers.length === 0 ? (
              <div className="text-small text-muted" style={{ padding: "16px 20px" }}>
                {t("team.userNotFound")}
              </div>
            ) : (
              invitableUsers.map((user) => {
                const alreadyInvited = invitedIds.has(user.id);
                return (
                  <div key={user.id} className="list-row" style={{ padding: "9px 20px" }}>
                    <Avatar name={user.username} url={user.avatarUrl} size={32} online={user.isOnline} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="text-small truncate" style={{ fontWeight: 600 }}>
                        {user.username}
                      </div>
                      <div className="text-xs text-muted truncate">{user.email}</div>
                    </div>
                    <button
                      className={`btn btn-sm ${alreadyInvited ? "btn-secondary" : "btn-primary"}`}
                      disabled={invitingId === user.id || alreadyInvited}
                      onClick={() => void onInviteUser(user)}
                    >
                      {invitingId === user.id ? (
                        <Spinner />
                      ) : alreadyInvited ? (
                        <>
                          <IconCheck style={{ width: 13, height: 13 }} /> {t("team.invited")}
                        </>
                      ) : (
                        t("team.invite")
                      )}
                    </button>
                  </div>
                );
              })
            )}
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
