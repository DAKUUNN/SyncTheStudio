const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

/** Sends `notification` to every push token registered under
 *  users/{userId}/pushTokens, dropping tokens FCM reports as no longer
 *  registered (uninstalled app, revoked permission, etc.) so the
 *  collection doesn't accumulate dead entries forever. `data` (all string
 *  values, FCM's requirement) rides along in the payload so the client can
 *  deep-link straight to the relevant project/tab when the notification is
 *  tapped instead of just opening to the default screen. */
async function sendToUser(userId, notification, data) {
  const tokensSnap = await db.collection("users").doc(userId).collection("pushTokens").get();
  if (tokensSnap.empty) return;

  const tokens = tokensSnap.docs.map((d) => d.id);
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification,
    data,
    apns: { payload: { aps: { sound: "default" } } },
  });

  const deletions = [];
  response.responses.forEach((result, i) => {
    if (!result.success && result.error?.code === "messaging/registration-token-not-registered") {
      deletions.push(tokensSnap.docs[i].ref.delete());
    }
  });
  if (deletions.length > 0) await Promise.all(deletions);
}

/** Mirrors the same event into app_admin_notifications so it also shows up
 *  in the in-app notification bell (and carries `screen` for that click to
 *  deep-link too) — desktop has no APNs/FCM push, so this in-app doc is
 *  its only source for these events. */
async function writeInAppNotification({
  senderId,
  senderName,
  title,
  message,
  type,
  targetUserId,
  projectId,
  screen,
}) {
  await db.collection("app_admin_notifications").add({
    title,
    message,
    senderId: senderId || "system",
    senderName: senderName || null,
    type,
    priority: 0,
    targetUserId,
    targetUserIds: [],
    projectId: projectId || null,
    screen: screen || null,
    readBy: [],
    createdAt: new Date(),
  });
}

// New chat message → push everyone on the project's chat thread except
// the sender. Message text itself is end-to-end encrypted client-side
// (see chatService.ts) and never readable server-side, so the
// notification body intentionally stays generic rather than a preview.
exports.pushOnChatMessage = onDocumentCreated(
  "chats/{projectId}/messages/{messageId}",
  async (event) => {
    const message = event.data?.data();
    if (!message?.senderId) return;

    const chatDoc = await db.collection("chats").doc(event.params.projectId).get();
    const participants = chatDoc.exists ? chatDoc.data().sharedWith || [] : [];
    const recipients = participants.filter((id) => id && id !== message.senderId);
    if (recipients.length === 0) return;

    const senderName = message.senderName || "Jemand";
    const projectId = event.params.projectId;
    await Promise.all(
      recipients.map((userId) =>
        Promise.all([
          sendToUser(
            userId,
            { title: senderName, body: "Neue Nachricht im Projekt-Chat" },
            { projectId, screen: "chat" }
          ),
          writeInAppNotification({
            senderId: message.senderId,
            senderName,
            title: senderName,
            message: "Neue Nachricht im Projekt-Chat",
            type: "chat_message",
            targetUserId: userId,
            projectId,
            screen: "chat",
          }),
        ]).catch((err) => logger.error(`push to ${userId} failed`, err))
      )
    );
  }
);

/** Looks up the project's owner via the root metadata doc projects/{id}
 *  (mirrored on create, holds ownerId + projectName). */
async function getProjectOwnerAndName(projectId) {
  const projectDoc = await db.collection("projects").doc(projectId).get();
  if (!projectDoc.exists) return null;
  const data = projectDoc.data();
  return { ownerId: data.ownerId, projectName: data.projectName || "Projekt" };
}

// Customer left feedback via the public master-review link → push the
// project owner. Feedback docs are written by the (anonymous) public
// share page into projects/{projectId}/masterFeedback.
exports.pushOnMasterFeedback = onDocumentCreated(
  "projects/{projectId}/masterFeedback/{feedbackId}",
  async (event) => {
    const feedback = event.data?.data();
    if (!feedback) return;

    const project = await getProjectOwnerAndName(event.params.projectId);
    if (!project?.ownerId) return;
    // in-app reviews by the owner themselves shouldn't self-notify
    if (feedback.authorId && feedback.authorId === project.ownerId) return;

    const projectId = event.params.projectId;
    const title = feedback.authorName || "Kunde";
    const body = `Neues Feedback zu „${project.projectName}“`;
    await Promise.all([
      sendToUser(project.ownerId, { title, body }, { projectId, screen: "files" }),
      writeInAppNotification({
        senderId: feedback.authorId,
        senderName: feedback.authorName,
        title,
        message: body,
        type: "master_feedback",
        targetUserId: project.ownerId,
        projectId,
        screen: "files",
      }),
    ]).catch((err) => logger.error("feedback push failed", err));
  }
);

// Customer uploaded files via the public upload link → push the project
// owner. The public upload flow writes one marker doc per file into
// projects/{projectId}/customerUploads (see publicLinkService.ts).
exports.pushOnCustomerUpload = onDocumentCreated(
  "projects/{projectId}/customerUploads/{uploadId}",
  async (event) => {
    const upload = event.data?.data();
    if (!upload) return;

    const project = await getProjectOwnerAndName(event.params.projectId);
    if (!project?.ownerId) return;

    const projectId = event.params.projectId;
    const title = project.projectName;
    const body = `Neue Kunden-Datei: ${upload.fileName || "Datei"}`;
    await Promise.all([
      sendToUser(project.ownerId, { title, body }, { projectId, screen: "files" }),
      writeInAppNotification({
        senderId: null,
        senderName: null,
        title,
        message: body,
        type: "customer_upload",
        targetUserId: project.ownerId,
        projectId,
        screen: "files",
      }),
    ]).catch((err) => logger.error("upload push failed", err));
  }
);
