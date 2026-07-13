import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Same Firebase project as the original SyncTheStudio app.
const firebaseConfig = {
  apiKey: "AIzaSyDtw1wOdSmStX6dZYhyx0EuSM-IAUYwqJM",
  authDomain: "syncthestudio-1d6b2.firebaseapp.com",
  projectId: "syncthestudio-1d6b2",
  storageBucket: "syncthestudio-1d6b2.firebasestorage.app",
  messagingSenderId: "596180784949",
  appId: "1:596180784949:web:syncthestudio-desktop",
  databaseURL:
    "https://syncthestudio-1d6b2-default-rtdb.europe-west1.firebasedatabase.app",
};

export const app = initializeApp(firebaseConfig);

// getAuth(app) (no explicit persistence) makes the SDK auto-detect the best
// available persistence, which tries IndexedDB first — and under Tauri's
// custom `tauri://` scheme that IndexedDB open() call hangs forever (no
// error, no resolution), which in turn wedges the SDK's whole init sequence
// so onAuthStateChanged's first callback never fires either — confirmed on
// iOS, where the mobile webview always loads through that scheme (even in
// dev mode, unlike desktop's dev server which uses a real http:// origin).
// initializeAuth() with an explicit persistence value skips that
// auto-detection entirely, which is the standard fix for non-browser
// environments (React Native, Capacitor, ...). localStorage-based
// persistence has none of IndexedDB's origin/partitioning edge cases, so
// it's used for every non-http(s) origin — that covers iOS/Android and
// desktop production builds alike, not just this specific hang.
const isRegularWebOrigin =
  location.protocol === "http:" || location.protocol === "https:";
export const auth = initializeAuth(app, {
  persistence: isRegularWebOrigin ? indexedDBLocalPersistence : browserLocalPersistence,
});

// Long-polling auto detection keeps Firestore reliable inside the
// Tauri WebViews (WKWebView on macOS, WebView2 on Windows).
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

export const storage = getStorage(app);
export const functions = getFunctions(app);
