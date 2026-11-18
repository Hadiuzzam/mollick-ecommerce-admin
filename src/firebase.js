import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectStorageEmulator, getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length ? getApp() : initializeApp(config);
export const auth = getAuth(app);
const storage = getStorage(app);

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

const databaseURL = import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true"
  ? "http://127.0.0.1:9000"
  : config.databaseURL?.replace(/\/$/, "");

export async function dbRequest(path, { method = "GET", data, user } = {}) {
  if (!databaseURL) throw new Error("Firebase database URL is missing");
  const url = new URL(`${databaseURL}/${path}.json`);
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") url.searchParams.set("ns", config.projectId + "-default-rtdb");
  if (user) url.searchParams.set("auth", await user.getIdToken());
  const response = await fetch(url, {
    method,
    headers: data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Firebase request failed (${response.status})`);
  return response.json();
}

export async function uploadImage(file, user) {
  if (!file?.size) return "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a JPG, PNG or WebP image under 5 MB.");
  }
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const filename = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const imageRef = ref(storage, `users/${user.uid}/shops/client-demo/${filename}.${extension}`);
  await uploadBytes(imageRef, file, { contentType: file.type });
  return getDownloadURL(imageRef);
}

export const list = (data) => Object.entries(data || {}).map(([id, value]) => ({ id, ...value }));
