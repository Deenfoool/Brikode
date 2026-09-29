import { deepClone } from "./utils.js";
import { migrateProject, normalizeProject } from "./ir.js";

const DB_NAME = "brikode";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const SETTINGS_STORE = "settings";
const SHADOW_PREFIX = "brikode:recovery:";

let dbPromise = null;

function openDatabase() {
  if (!("indexedDB" in globalThis)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        const store = db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "metadata.updatedAt");
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function transact(storeName, mode, callback) {
  const db = await openDatabase();
  if (!db) return callback(null);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;

    try {
      result = callback(store);
    } catch (error) {
      reject(error);
      return;
    }

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function recoveryProjects() {
  return Object.keys(localStorage)
    .filter(key => key.startsWith(SHADOW_PREFIX))
    .map(key => {
      try {
        return migrateProject(JSON.parse(localStorage.getItem(key)));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function newestProject(primary, recovery) {
  if (!primary) return recovery || null;
  if (!recovery) return primary;
  return String(recovery.metadata?.updatedAt || "") > String(primary.metadata?.updatedAt || "")
    ? recovery
    : primary;
}

export async function listProjects() {
  const db = await openDatabase();
  let stored = [];

  if (!db) {
    stored = Object.keys(localStorage)
      .filter(key => key.startsWith("brikode:project:"))
      .map(key => {
        try {
          return migrateProject(JSON.parse(localStorage.getItem(key)));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } else {
    const tx = db.transaction(PROJECT_STORE, "readonly");
    const request = tx.objectStore(PROJECT_STORE).getAll();
    stored = (await requestToPromise(request)).map(migrateProject);
  }

  const byId = new Map(stored.map(project => [project.id, project]));
  for (const recovery of recoveryProjects()) {
    byId.set(recovery.id, newestProject(byId.get(recovery.id), recovery));
  }

  return [...byId.values()]
    .sort((a, b) => String(b.metadata.updatedAt).localeCompare(String(a.metadata.updatedAt)));
}

export async function getProject(id) {
  const db = await openDatabase();
  let raw;

  if (!db) {
    raw = JSON.parse(localStorage.getItem("brikode:project:" + id) || "null");
  } else {
    const tx = db.transaction(PROJECT_STORE, "readonly");
    raw = await requestToPromise(tx.objectStore(PROJECT_STORE).get(id));
  }

  const recoveryRaw = localStorage.getItem(SHADOW_PREFIX + id);
  let recovery = null;
  if (recoveryRaw) {
    try {
      recovery = migrateProject(JSON.parse(recoveryRaw));
    } catch {
      recovery = null;
    }
  }

  const primary = raw ? migrateProject(raw) : null;
  return newestProject(primary, recovery);
}

export async function saveProject(project) {
  const normalized = normalizeProject(project);
  localStorage.setItem(SHADOW_PREFIX + normalized.id, JSON.stringify(normalized));

  const db = await openDatabase();
  if (!db) {
    localStorage.setItem("brikode:project:" + normalized.id, JSON.stringify(normalized));
    return deepClone(normalized);
  }

  await new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, "readwrite");
    tx.objectStore(PROJECT_STORE).put(normalized);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  return deepClone(normalized);
}

export async function deleteProject(id) {
  localStorage.removeItem(SHADOW_PREFIX + id);
  localStorage.removeItem("brikode:project:" + id);

  const db = await openDatabase();
  if (!db) return;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, "readwrite");
    tx.objectStore(PROJECT_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function duplicateProject(project) {
  const clone = migrateProject(deepClone(project));
  clone.id = globalThis.crypto?.randomUUID?.()
    ? "project_" + crypto.randomUUID().replace(/-/g, "")
    : "project_" + Math.random().toString(36).slice(2);
  clone.name = clone.name + " copy";
  const now = new Date().toISOString();
  clone.metadata.createdAt = now;
  clone.metadata.updatedAt = now;
  return saveProject(clone);
}

export async function getSetting(key, fallback = null) {
  const db = await openDatabase();
  if (!db) {
    const raw = localStorage.getItem("brikode:setting:" + key);
    return raw == null ? fallback : JSON.parse(raw);
  }

  const tx = db.transaction(SETTINGS_STORE, "readonly");
  const record = await requestToPromise(tx.objectStore(SETTINGS_STORE).get(key));
  return record ? record.value : fallback;
}

export async function setSetting(key, value) {
  localStorage.setItem("brikode:setting:" + key, JSON.stringify(value));
  const db = await openDatabase();
  if (!db) return;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readwrite");
    tx.objectStore(SETTINGS_STORE).put({ key, value });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function recoverableProjectIds() {
  return Object.keys(localStorage)
    .filter(key => key.startsWith(SHADOW_PREFIX))
    .map(key => key.slice(SHADOW_PREFIX.length));
}
