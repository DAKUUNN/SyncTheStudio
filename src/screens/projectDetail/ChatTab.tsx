import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import type { ChatMessageModel, ProjectModel } from "@/models/types";
import { watchMessages, sendMessage, deleteMessage } from "@/services/chatService";
import { markChatNotificationsAsReadForProject } from "@/services/notificationService";
import { extractTasksFromMessage } from "@/services/taskExtractionService";
import { createTask } from "@/services/taskService";
import { Avatar, Modal } from "@/components/ui";
import { IconSend, IconTrash, IconZap, IconMessage } from "@/components/Icons";

export function ChatTab({ project }: { project: ProjectModel }) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t, lang } = useI18n();

  const [messages, setMessages] = useState<ChatMessageModel[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState<
    { title: string; description: string | null }[] | null
  >(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = watchMessages(project.id, setMessages);
    if (currentUser) {
      void markChatNotificationsAsReadForProject(currentUser.id, project.id);
    }
    return unsubscribe;
  }, [project.id, currentUser?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const onSend = async () => {
    if (!currentUser || !draft.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage({
        projectId: project.id,
        userId: currentUser.id,
        username: currentUser.username,
        userAvatarUrl: currentUser.avatarUrl,
        message: draft.trim(),
        participantIds: [...project.sharedWith, project.ownerId].filter(Boolean),
        ownerId: project.ownerId || currentUser.id,
      });
      setDraft("");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSending(false);
    }
  };

  const onExtractTasks = async (message: string) => {
    setExtracting(true);
    try {
      const extracted = await extractTasksFromMessage(message, lang);
      if (extracted.length === 0) {
        showToast(t("chat.noTasksFound"), "info");
        return;
      }
      setSuggestions(
        extracted.map((item) => ({ title: item.title, description: item.description }))
      );
    } finally {
      setExtracting(false);
    }
  };

  const onCreateSuggestedTasks = async () => {
    if (!currentUser || !suggestions) return;
    for (const suggestion of suggestions) {
      await createTask({
        projectId: project.id,
        title: suggestion.title,
        description: suggestion.description,
        createdBy: currentUser.username,
      });
    }
    showToast(t("chat.tasksCreated", { count: suggestions.length }), "success");
    setSuggestions(null);
  };

  if (!currentUser) return null;

  return (
    <div className="card" style={{ height: "calc(100vh - 300px)", minHeight: 420 }}>
      <div className="chat-column" style={{ padding: "0 18px 14px" }}>
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="empty-state" style={{ margin: "auto" }}>
              <IconMessage />
              <h3>{t("chat.emptyTitle")}</h3>
              <div className="text-small text-muted">{t("chat.emptySubtitle")}</div>
            </div>
          )}
          {messages.map((message) => {
            const own = message.userId === currentUser.id;
            return (
              <div key={message.id} className={`chat-bubble-row${own ? " own" : ""}`}>
                {!own && (
                  <Avatar name={message.username} url={message.userAvatarUrl} size={28} />
                )}
                <div style={{ minWidth: 0 }}>
                  {!own && (
                    <div className="text-xs text-muted" style={{ marginBottom: 2 }}>
                      {message.username}
                    </div>
                  )}
                  <div className="chat-bubble">
                    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {message.message}
                    </div>
                    <div className="chat-meta row" style={{ gap: 6 }}>
                      {message.timestamp.toLocaleTimeString(lang, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {own && (
                        <button
                          className="icon-btn"
                          style={{ width: 18, height: 18, color: "inherit", opacity: 0.7 }}
                          title={t("common.delete")}
                          onClick={() => void deleteMessage(project.id, message.id)}
                        >
                          <IconTrash style={{ width: 11, height: 11 }} />
                        </button>
                      )}
                      {!own && (
                        <button
                          className="icon-btn"
                          style={{ width: 18, height: 18, color: "inherit", opacity: 0.7 }}
                          title={t("chat.extractTasks")}
                          onClick={() => void onExtractTasks(message.message)}
                        >
                          <IconZap style={{ width: 11, height: 11 }} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-row">
          <input
            className="input grow"
            placeholder={t("chat.inputHint")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
          />
          <button
            className="btn btn-secondary"
            title={t("chat.extractTasks")}
            disabled={extracting || !draft.trim()}
            onClick={() => void onExtractTasks(draft)}
          >
            <IconZap />
          </button>
          <button
            className="btn btn-primary"
            disabled={sending || !draft.trim()}
            onClick={() => void onSend()}
          >
            <IconSend />
          </button>
        </div>
      </div>

      {suggestions && (
        <Modal
          title={t("chat.suggestedTasks")}
          onClose={() => setSuggestions(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setSuggestions(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void onCreateSuggestedTasks()}>
                {t("chat.createTasks", { count: suggestions.length })}
              </button>
            </>
          }
        >
          {suggestions.map((suggestion, index) => (
            <div key={index} className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="text-small" style={{ fontWeight: 600 }}>
                  {suggestion.title}
                </div>
                {suggestion.description && (
                  <div className="text-xs text-muted truncate">{suggestion.description}</div>
                )}
              </div>
              <button
                className="icon-btn"
                onClick={() =>
                  setSuggestions((prev) =>
                    prev ? prev.filter((_, i) => i !== index) : prev
                  )
                }
              >
                <IconTrash />
              </button>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
