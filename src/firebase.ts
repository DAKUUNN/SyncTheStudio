import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, indexedDBLocalPersistence } from "firebase/auth";
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

export const auth = getAuth(app);
void setPersistence(auth, indexedDBLocalPersistence).catch(() => {
  /* falls back to default persistence */
});

// Long-polling auto detection keeps Firestore reliable inside the
// Tauri WebViews (WKWebView on macOS, WebView2 on Windows).
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

export const storage = getStorage(app);
export const functions = getFunctions(app);
