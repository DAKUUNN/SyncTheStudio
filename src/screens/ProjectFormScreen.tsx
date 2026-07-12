import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import {
  PROJECT_PRIORITIES,
  priorityLabel,
  type ProjectModel,
  type ProjectPriority,
  type ProjectTypeModel,
  type ProjectTemplateModel,
  type CustomerModel,
  type CustomStatus,
  type CustomFieldsConfig,
} from "@/models/types";
import {
  createProject,
  updateProject,
  getProject,
  getSharedProject,
  addHistoryEntry,
} from "@/services/projectService";
import { getCustomers } from "@/services/customerService";
import {
  getProjectTypes,
  getTemplates,
  createTemplate,
  deleteTemplate,
} from "@/services/templateService";
import {
  getStatuses,
  labelForStatusId,
  getCustomFieldsConfig,
} from "@/services/customizationService";
import { validateProjectCreation } from "@/services/planService";
import { uploadReferenceSong } from "@/services/storageService";
import { LoadingCenter, Modal } from "@/components/ui";
import { IconArrowLeft, IconFile, IconTrash, IconLayers } from "@/components/Icons";

const MUSICAL_KEYS = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
  "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm",
];

export function ProjectFormScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const isEdit = !!projectId;
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [projectType, setProjectType] = useState("Mix & Master");
  const [priority, setPriority] = useState<ProjectPriority>("mittel");
  const [statusId, setStatusId] = useState("neu");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("");
  const [notifyBeforeMinutes, setNotifyBeforeMinutes] = useState(60);
  const [workspaceLink, setWorkspaceLink] = useState("");
  const [referenceLink, setReferenceLink] = useState("");
  const [referenceFileName, setReferenceFileName] = useState("");
  const [referenceFileUrl, setReferenceFileUrl] = useState("");
  const [referenceFileLocal, setReferenceFileLocal] = useState<{
    bytes: Uint8Array;
    name: string;
  } | null>(null);
  const [bpm, setBpm] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [dawProjectPath, setDawProjectPath] = useState("");
  const [customFields, setCustomFields] = useState<string[]>(["", "", "", "", ""]);

  const [customers, setCustomers] = useState<CustomerModel[]>([]);
  const [types, setTypes] = useState<ProjectTypeModel[]>([]);
  const [statuses, setStatuses] = useState<CustomStatus[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplateModel[]>([]);
  const [fieldsConfig, setFieldsConfig] = useState<CustomFieldsConfig | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    void Promise.all([
      getCustomers(currentUser.id),
      getProjectTypes(currentUser.id),
      getStatuses(currentUser.id),
      getTemplates(currentUser.id),
    ]).then(([customerList, typeList, statusList, templateList]) => {
      setCustomers(customerList);
      setTypes(typeList);
      setStatuses(statusList);
      setTemplates(templateList);
    });
    setFieldsConfig(getCustomFieldsConfig(currentUser.id));
  }, [currentUser?.id]);

  useEffect(() => {
    if (!isEdit || !currentUser || !projectId) return;
    void (async () => {
      let project: ProjectModel | null = await getProject(currentUser.id, projectId);
      if (!project) project = await getSharedProject(projectId);
      if (!project) {
        showToast(t("projectDetail.notFound"), "error");
        navigate("/projects");
        return;
      }
      setName(project.name);
      setCustomerId(project.customerId ?? "");
      setProjectType(project.projectType);
      setPriority(project.priority);
      setStatusId(project.statusValue);
      if (project.deadline) {
        const d = project.deadline;
        setDeadlineDate(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
            d.getDate()
          ).padStart(2, "0")}`
        );
        setDeadlineTime(
          `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        );
      }
      setNotifyBeforeMinutes(project.notifyBeforeMinutes);
      setWorkspaceLink(project.workspaceLink ?? "");
      setReferenceLink(project.referenceLink ?? "");
      setReferenceFileName(project.referenceFileName ?? "");
      setReferenceFileUrl(project.referenceFileUrl ?? "");
      setBpm(project.bpm != null ? String(project.bpm) : "");
      setMusicalKey(project.musicalKey ?? "");
      setDawProjectPath(project.dawProjectPath ?? "");
      setCustomFields([
        project.customField1 ?? "",
        project.customField2 ?? "",
        project.customField3 ?? "",
        project.customField4 ?? "",
        project.customField5 ?? "",
      ]);
      setLoading(false);
    })();
  }, [isEdit, projectId, currentUser?.id]);

  const deadline = useMemo(() => {
    if (!deadlineDate) return null;
    const time = deadlineTime || "12:00";
    const parsed = new Date(`${deadlineDate}T${time}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [deadlineDate, deadlineTime]);

  const applyTemplate = (template: ProjectTemplateModel) => {
    if (template.name && !name) setName(template.name);
    if (template.projectType) setProjectType(template.projectType);
    if (template.priority) setPriority(template.priority as ProjectPriority);
    setTemplatesOpen(false);
    showToast(t("templates.applied"), "success");
  };

  const pickReferenceFile = async () => {
    const selected = await openFileDialog({
      multiple: false,
      filters: [
        { name: "Audio", extensions: ["mp3", "wav", "aiff", "aif", "flac", "m4a", "ogg"] },
      ],
    });
    if (!selected || typeof selected !== "string") return;
    const bytes = await readFile(selected);
    const fileName = selected.split(/[\\/]/).pop() ?? "reference";
    setReferenceFileLocal({ bytes, name: fileName });
    setReferenceFileName(fileName);
  };

  const onSubmit = async () => {
    if (!currentUser) return;
    if (!name.trim()) {
      showToast(t("createProject.nameRequired"), "error");
      return;
    }

    setSaving(true);
    try {
      const customer = customers.find((c) => c.id === customerId);
      const parsedBpm = bpm.trim() ? parseInt(bpm.trim(), 10) : null;

      if (!isEdit) {
        const planError = await validateProjectCreation(currentUser);
        if (planError) {
          showToast(planError, "warning");
          setSaving(false);
          return;
        }

        const newProjectId = await createProject({
          userId: currentUser.id,
          name: name.trim(),
          customerId: customerId || null,
          customerName: customer?.name ?? null,
          projectType,
          priority,
          statusId,
          deadline,
          notifyBeforeMinutes,
          workspaceLink: workspaceLink.trim() || null,
          referenceLink: referenceLink.trim() || null,
          bpm: parsedBpm !== null && !Number.isNaN(parsedBpm) ? parsedBpm : null,
          musicalKey: musicalKey || null,
          dawProjectPath: dawProjectPath.trim() || null,
          customField1: customFields[0].trim() || null,
          customField2: customFields[1].trim() || null,
          customField3: customFields[2].trim() || null,
          customField4: customFields[3].trim() || null,
          customField5: customFields[4].trim() || null,
        });

        if (referenceFileLocal) {
          try {
            const uploaded = await uploadReferenceSong({
              fileBytes: referenceFileLocal.bytes,
              fileName: referenceFileLocal.name,
              userId: currentUser.id,
              projectId: newProjectId,
            });
            await updateProject({
              userId: currentUser.id,
              projectId: newProjectId,
              referenceFileUrl: uploaded.url,
              referenceFileName: uploaded.fileName,
            });
          } catch {
            showToast(t("createProject.referenceUploadFailed"), "warning");
          }
        }

        await addHistoryEntry(
          newProjectId,
          currentUser.id,
          currentUser.username,
          "Projekt erstellt"
        );
        showToast(t("createProject.created"), "success");
        navigate(`/projects/${newProjectId}`);
      } else if (projectId) {
        let refUrl: string | undefined;
        let refName: string | undefined;
        if (referenceFileLocal) {
          const uploaded = await uploadReferenceSong({
            fileBytes: referenceFileLocal.bytes,
            fileName: referenceFileLocal.name,
            userId: currentUser.id,
            projectId,
          });
          refUrl = uploaded.url;
          refName = uploaded.fileName;
        }

        await updateProject({
          userId: currentUser.id,
          projectId,
          name: name.trim(),
          customerId: customerId || "",
          customerName: customer?.name ?? "",
          projectType,
          priority,
          statusId,
          ...(deadline ? { deadline } : {}),
          notifyBeforeMinutes,
          workspaceLink: workspaceLink.trim(),
          referenceLink: referenceLink.trim(),
          ...(refUrl ? { referenceFileUrl: refUrl, referenceFileName: refName } : {}),
          bpm:
            bpm.trim() && parsedBpm !== null && !Number.isNaN(parsedBpm)
              ? parsedBpm
              : null,
          musicalKey,
          dawProjectPath: dawProjectPath.trim(),
          customField1: customFields[0].trim(),
          customField2: customFields[1].trim(),
          customField3: customFields[2].trim(),
          customField4: customFields[3].trim(),
          customField5: customFields[4].trim(),
        });
        await addHistoryEntry(
          projectId,
          currentUser.id,
          currentUser.username,
          "Projekt bearbeitet"
        );
        showToast(t("editProject.saved"), "success");
        navigate(`/projects/${projectId}`);
      }
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const onSaveTemplate = async () => {
    if (!currentUser || !templateName.trim()) return;
    try {
      await createTemplate({
        userId: currentUser.id,
        name: templateName.trim(),
        projectType,
        priority,
      });
      setTemplates(await getTemplates(currentUser.id));
      setSaveTemplateOpen(false);
      setTemplateName("");
      showToast(t("templates.saved"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  if (!currentUser) return null;
  if (loading) return <LoadingCenter />;

  const enabledCustomFields = fieldsConfig
    ? [
        { index: 0, name: fieldsConfig.field1Name, enabled: fieldsConfig.field1Enabled },
        { index: 1, name: fieldsConfig.field2Name, enabled: fieldsConfig.field2Enabled },
        { index: 2, name: fieldsConfig.field3Name, enabled: fieldsConfig.field3Enabled },
        { index: 3, name: fieldsConfig.field4Name, enabled: fieldsConfig.field4Enabled },
        { index: 4, name: fieldsConfig.field5Name, enabled: fieldsConfig.field5Enabled },
      ].filter((f) => f.enabled)
    : [];

  return (
    <div className="content-narrow">
      <div className="row row-between" style={{ marginBottom: 18 }}>
        <div className="row">
          <button className="icon-btn" onClick={() => navigate(-1)}>
            <IconArrowLeft />
          </button>
          <h1>{isEdit ? t("editProject.title") : t("createProject.title")}</h1>
        </div>
        {!isEdit && (
          <div className="row">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setTemplatesOpen(true)}
            >
              <IconLayers /> {t("templates.title")}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSaveTemplateOpen(true)}
            >
              {t("templates.saveAs")}
            </button>
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-title">{t("createProject.sectionBasics")}</div>
        <div className="field">
          <label className="field-label">{t("createProject.nameLabel")} *</label>
          <input
            className="input"
            autoFocus={!isEdit}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("createProject.nameHint")}
          />
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="field-label">{t("createProject.customerLabel")}</label>
            <select
              className="select"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">{t("createProject.noCustomer")}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">{t("createProject.typeLabel")}</label>
            <select
              className="select"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
            >
              {types.map((type) => (
                <option key={type.id} value={type.name}>
                  {type.name}
                </option>
              ))}
              {!types.some((type) => type.name === projectType) && (
                <option value={projectType}>{projectType}</option>
              )}
            </select>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="field-label">{t("createProject.priorityLabel")}</label>
            <select
              className="select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as ProjectPriority)}
            >
              {PROJECT_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">{t("createProject.statusLabel")}</label>
            <select
              className="select"
              value={statusId}
              onChange={(e) => setStatusId(e.target.value)}
            >
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {labelForStatusId(status.id, statuses)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-title">{t("createProject.sectionDeadline")}</div>
        <div className="grid-2">
          <div className="field">
            <label className="field-label">{t("createProject.deadlineLabel")}</label>
            <input
              className="input"
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">{t("createProject.timeLabel")}</label>
            <input
              className="input"
              type="time"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label className="field-label">{t("createProject.notifyBefore")}</label>
          <select
            className="select"
            value={notifyBeforeMinutes}
            onChange={(e) => setNotifyBeforeMinutes(Number(e.target.value))}
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>1 h</option>
            <option value={180}>3 h</option>
            <option value={720}>12 h</option>
            <option value={1440}>24 h</option>
            <option value={2880}>48 h</option>
          </select>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-title">{t("createProject.sectionAudio")}</div>
        <div className="grid-2">
          <div className="field">
            <label className="field-label">BPM</label>
            <input
              className="input"
              type="number"
              min={20}
              max={999}
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              placeholder="140"
            />
          </div>
          <div className="field">
            <label className="field-label">{t("createProject.keyLabel")}</label>
            <select
              className="select"
              value={musicalKey}
              onChange={(e) => setMusicalKey(e.target.value)}
            >
              <option value="">—</option>
              {MUSICAL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field-label">{t("createProject.dawPathLabel")}</label>
          <input
            className="input"
            value={dawProjectPath}
            onChange={(e) => setDawProjectPath(e.target.value)}
            placeholder="/Users/…/Projekt.als"
          />
          <div className="field-hint">{t("createProject.dawPathHint")}</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-title">{t("createProject.sectionLinks")}</div>
        <div className="field">
          <label className="field-label">{t("createProject.workspaceLabel")}</label>
          <input
            className="input"
            value={workspaceLink}
            onChange={(e) => setWorkspaceLink(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="field">
          <label className="field-label">{t("createProject.referenceLinkLabel")}</label>
          <input
            className="input"
            value={referenceLink}
            onChange={(e) => setReferenceLink(e.target.value)}
            placeholder="https://open.spotify.com/…"
          />
        </div>
        <div className="field">
          <label className="field-label">{t("createProject.referenceFileLabel")}</label>
          <div className="row">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void pickReferenceFile()}
            >
              <IconFile /> {t("createProject.chooseFile")}
            </button>
            {(referenceFileLocal || referenceFileUrl) && (
              <span className="text-small text-muted truncate">
                {referenceFileLocal?.name ?? referenceFileName}
              </span>
            )}
          </div>
        </div>
      </div>

      {enabledCustomFields.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="section-title">{t("createProject.sectionCustom")}</div>
          <div className="grid-2">
            {enabledCustomFields.map((field) => (
              <div className="field" key={field.index}>
                <label className="field-label">{field.name}</label>
                <input
                  className="input"
                  value={customFields[field.index]}
                  onChange={(e) =>
                    setCustomFields((prev) => {
                      const next = [...prev];
                      next[field.index] = e.target.value;
                      return next;
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 40 }}>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          {t("common.cancel")}
        </button>
        <button
          className="btn btn-primary btn-lg"
          disabled={saving}
          onClick={() => void onSubmit()}
        >
          {saving
            ? t("common.saving")
            : isEdit
              ? t("editProject.save")
              : t("createProject.create")}
        </button>
      </div>

      {templatesOpen && (
        <Modal title={t("templates.title")} onClose={() => setTemplatesOpen(false)}>
          {templates.length === 0 ? (
            <p className="text-muted text-small">{t("templates.empty")}</p>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="list-row">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{template.name}</div>
                  <div className="text-xs text-muted">
                    {[template.projectType, template.priority]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => applyTemplate(template)}
                >
                  {t("templates.apply")}
                </button>
                <button
                  className="icon-btn"
                  onClick={() =>
                    void deleteTemplate(currentUser.id, template.id).then(() =>
                      setTemplates((prev) => prev.filter((x) => x.id !== template.id))
                    )
                  }
                >
                  <IconTrash />
                </button>
              </div>
            ))
          )}
        </Modal>
      )}

      {saveTemplateOpen && (
        <Modal
          title={t("templates.saveAs")}
          onClose={() => setSaveTemplateOpen(false)}
          footer={
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setSaveTemplateOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void onSaveTemplate()}>
                {t("common.save")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t("templates.nameLabel")}</label>
            <input
              className="input"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              autoFocus
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
