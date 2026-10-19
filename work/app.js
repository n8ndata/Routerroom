/**
 * ROUTER Incident & Defect Management System
 * Core Application Logic, Hybrid Firebase Sync (RTDB + Firestore) & IndexedDB Persistence
 */

// ================= FIREBASE CONFIGURATION =================
const firebaseConfig = {
  apiKey: "AIzaSyAAiLksWnWi5KYc2wPqbuufG8_olFMGZmg",
  authDomain: "system-routerf2.firebaseapp.com",
  databaseURL: "https://system-routerf2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "system-routerf2",
  storageBucket: "system-routerf2.firebasestorage.app",
  messagingSenderId: "17102878285",
  appId: "1:17102878285:web:4378f5d85bba3c56d44e04",
  measurementId: "G-E212Z5C2YH"
};

let app = null, db = null, storage = null, rtdb = null;
try {
  if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
  } else {
    app = firebase.app();
  }
  try { rtdb = firebase.database(); console.log("Firebase Realtime Database initialized"); } catch (e) { console.warn("RTDB init warning:", e); }
  db = null;
  try { storage = firebase.storage(); } catch (e) { console.warn("Storage init warning:", e); }
} catch (err) { console.error("Firebase init general error:", err); }

// ================= INDEXED-DB PERSISTENCE =================
const DB_NAME = "RouterDepartmentDB";
const DB_VERSION = 1;
const STORE_NAME = "reports";

function openLocalDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) { resolve(null); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) idb.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = () => resolve(null);
  });
}

async function saveToIndexedDB(report) {
  try {
    const idb = await openLocalDB();
    if (!idb) { saveToLocalStorageFallback(report); return; }
    return new Promise((resolve) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(report);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => { saveToLocalStorageFallback(report); resolve(false); };
    });
  } catch (err) { saveToLocalStorageFallback(report); }
}

async function getAllFromIndexedDB() {
  try {
    const idb = await openLocalDB();
    if (!idb) return getFromLocalStorageFallback();
    return new Promise((resolve) => {
      const tx = idb.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = req.result || [];
        resolve(result.length ? result : getFromLocalStorageFallback());
      };
      req.onerror = () => resolve(getFromLocalStorageFallback());
    });
  } catch (err) { return getFromLocalStorageFallback(); }
}

async function deleteFromIndexedDB(id) {
  try {
    const idb = await openLocalDB();
    if (!idb) { removeFromLocalStorageFallback(id); return; }
    return new Promise((resolve) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => { removeFromLocalStorageFallback(id); resolve(true); };
      tx.onerror = () => resolve(false);
    });
  } catch (err) {}
}

function saveToLocalStorageFallback(report) {
  try {
    let list = getFromLocalStorageFallback();
    const idx = list.findIndex(r => r.id === report.id);
    if (idx !== -1) list[idx] = report; else list.unshift(report);
    localStorage.setItem("router_reports_backup", JSON.stringify(list));
  } catch (e) {}
}

function getFromLocalStorageFallback() {
  try { return JSON.parse(localStorage.getItem("router_reports_backup") || "[]"); }
  catch (e) { return []; }
}

function removeFromLocalStorageFallback(id) {
  try {
    let list = getFromLocalStorageFallback().filter(r => r.id !== id);
    localStorage.setItem("router_reports_backup", JSON.stringify(list));
  } catch (e) {}
}

// ================= GLOBAL STATE =================
let allReports = [], filteredReports = [], currentTab = 'dashboard';
let currentUploadedImages = [], selectedDateForCalendar = null, currentCalendarDate = new Date();
let chartRatioInstance = null, chartMachineInstance = null, chartCategoryInstance = null, chartTrendInstance = null;
let firestoreReportsUnsubscribe = null, flushingPendingSync = false;
const PENDING_SYNC_KEY = 'router_pending_sync_ids';
const PENDING_DELETES_KEY = 'router_pending_delete_ids';