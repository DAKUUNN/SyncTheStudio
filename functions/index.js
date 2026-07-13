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
 *  collection doesn't accumulate dead entries forever. */
async function sendToUser(userId, notification) {
  const tokensSnap = await db.collection("users").doc(userId).collection("pushTokens").get();
  if (tokensSnap.empty) return;

  const tokens = tokensSnap.docs.map((d) => d.id);
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification,
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
    await Promise.all(
      recipients.map((userId) =>
        sendToUser(userId, {
          title: senderName,
          body: "Neue Nachricht im Projekt-Chat",
        }).catch((err) => logger.error(`push to ${userId} failed`, err))
      )
    );
  }
);
