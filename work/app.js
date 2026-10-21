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

// Initialize Firebase
let app = null, db = null, rtdb = null;
try {
  if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
  } else {
    app = firebase.app();
  }
  
  // Realtime Database (Primary Cloud Sync for this project)
  try {
    rtdb = firebase.database();
    console.log("Firebase Realtime Database initialized");
  } catch (e) {
    console.warn("RTDB init warning:", e);
  }

  // Realtime Database is the authoritative cloud store for this secured build.
  // Firestore is intentionally not used for writes because its rules cannot read RTDB role records.
  db = null;

} catch (err) {
  console.error("Firebase init general error:", err);
}

// ================= RESILIENT UX LAYER (SAFETY NET) =================
// SweetAlert2 and the other helper libraries are loaded from a CDN. When the CDN is
// blocked, slow, or the device is offline the library is missing and every alert used to
// vanish silently - the save button then looked like it "did nothing" even though the
// report was stored. This dependency-free fallback guarantees visible feedback instead.
(function installSwalFallback() {
  if (typeof window.Swal !== 'undefined' && window.Swal && typeof window.Swal.fire === 'function') return;
  window.Swal = {
    fire(titleOrOptions, text, icon) {
      let opts = titleOrOptions;
      if (typeof opts === 'string') opts = { title: opts, html: text, icon };
      else opts = opts || {};
      const title = opts.title ? String(opts.title) : '';
      const body = opts.text ? String(opts.text)
        : (opts.html ? String(opts.html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');
      const message = [title, body].filter(Boolean).join('\n\n') || ' ';
      if (opts.showCancelButton) {
        const confirmed = window.confirm(message);
        return Promise.resolve({ isConfirmed: confirmed, isDismissed: !confirmed });
      }
      window.alert(message);
      return Promise.resolve({ isConfirmed: true });
    },
    close() {},
    showLoading() {},
    isVisible() { return false; }
  };
  console.warn('SweetAlert2 ไม่พร้อมใช้งาน (อาจถูกบล็อกหรือออฟไลน์) — สลับไปใช้กล่องแจ้งเตือนสำรองของเบราว์เซอร์');
})();

// Never let an error be invisible: surface it on screen so the user (and support) can see why.
function showSystemNotice(message) {
  try {
    let el = document.getElementById('app-system-notice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-system-notice';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;background:#b91c1c;color:#fff;font-family:Prompt,system-ui,sans-serif;font-size:13px;line-height:1.55;padding:12px 42px 12px 14px;border-radius:12px;box-shadow:0 12px 30px rgba(15,23,42,.35);cursor:pointer';
      el.title = 'คลิกเพื่อปิด';
      el.addEventListener('click', () => el.remove());
      document.body.appendChild(el);
    }
    el.textContent = 'ระบบแจ้งเตือน: ' + message + ' — (คลิกเพื่อปิด)';
  } catch (ignore) { /* last-resort guard */ }
}

window.addEventListener('unhandledrejection', event => {
  const reason = event && event.reason;
  const msg = (reason && (reason.message || String(reason))) || 'ไม่ทราบสาเหตุ';
  console.error('Unhandled promise rejection:', reason);
  showSystemNotice('เกิดข้อผิดพลาดระหว่างบันทึกหรือประมวลผล: ' + msg);
});

window.addEventListener('error', event => {
  if (!event || !event.message) return;
  console.error('Runtime error:', event.message);
  showSystemNotice('เกิดข้อผิดพลาด: ' + event.message);
});

// ================= INDEXED-DB PERSISTENCE (ZERO-DATA-LOSS) =================
const DB_NAME = "RouterDepartmentDB";
const DB_VERSION = 1;
const STORE_NAME = "reports";

function openLocalDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => {
      console.warn("IndexedDB open error:", e);
      resolve(null);
    };
  });
}

async function saveToIndexedDB(report) {
  try {
    const idb = await openLocalDB();
    if (!idb) {
      saveToLocalStorageFallback(report);
      return;
    }
    return new Promise((resolve) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(report);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        saveToLocalStorageFallback(report);
        resolve(false);
      };
    });
  } catch (err) {
    console.warn("IndexedDB save error:", err);
    saveToLocalStorageFallback(report);
  }
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
        if (result.length === 0) {
          resolve(getFromLocalStorageFallback());
        } else {
          resolve(result);
        }
      };
      req.onerror = () => resolve(getFromLocalStorageFallback());
    });
  } catch (err) {
    console.warn("IndexedDB getAll error:", err);
    return getFromLocalStorageFallback();
  }
}

async function deleteFromIndexedDB(id) {
  try {
    const idb = await openLocalDB();
    if (!idb) {
      removeFromLocalStorageFallback(id);
      return;
    }
    return new Promise((resolve) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => {
        removeFromLocalStorageFallback(id);
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn("IndexedDB delete error:", err);
  }
}

// LocalStorage safety net
function saveToLocalStorageFallback(report) {
  try {
    let list = getFromLocalStorageFallback();
    const idx = list.findIndex(r => r.id === report.id);
    if (idx !== -1) list[idx] = report;
    else list.unshift(report);
    localStorage.setItem("router_reports_backup", JSON.stringify(list));
  } catch (e) {
    console.warn("LocalStorage quota error:", e);
  }
}

function getFromLocalStorageFallback() {
  try {
    const raw = localStorage.getItem("router_reports_backup");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function removeFromLocalStorageFallback(id) {
  try {
    let list = getFromLocalStorageFallback();
    list = list.filter(r => r.id !== id);
    localStorage.setItem("router_reports_backup", JSON.stringify(list));
  } catch (e) {}
}

// ================= GLOBAL APPLICATION STATE =================
let allReports = [];
let filteredReports = [];
let currentTab = 'dashboard';
let photos = []; // Stores objects { name, type, dataUrl, caption }
let selectedDateForCalendar = null;
let currentCalendarDate = new Date();

// Chart instances
let chartRatioInstance = null;
let chartMachineInstance = null;
let chartCategoryInstance = null;
let chartTrendInstance = null;
let firestoreReportsUnsubscribe = null;
let flushingPendingSync = false;
const PENDING_SYNC_KEY = 'router_pending_sync_ids';

// Problem Categories definition
const CATEGORIES = {
  internal: [
    "เครื่องจักรขัดข้อง / Spindle Alarm / แกนติดขัด",
    "หัวล็อค / Spindle overload",
    "งาน Router ไม่สมบูรณ์ / Incomplete Slot",
    "ดอกเราเตอร์หักคาชิ้นงาน (Tool Broken)",
    "ดอกเราเตอร์สึกหรอ / หมดอายุ (Tool Wear)",
    "ใส่ดอกเราเตอร์ผิดขนาด / Collet ลื่น",
    "ชิ้นงานกัดกินเนื้อ / กัดแหว่ง / ผิดขนาด (Over-routing / Dimension NG)",
    "ครีบชิ้นงานหนา / ขอบไม่เรียบ / Delamination",
    "รอยขีดข่วน / รอยบุบ / กระแทกระหว่างผลิต (Scratch / Handling)",
    "ระบบดูดฝุ่นขัดข้อง / เศษฝุ่นตกค้างหนาแน่น",
    "โปรแกรมกัดผิดพลาด / NC Offset ผิด (Program / Zero Point Error)",
    "การเซ็ตอัพจิ๊ก / ตัวหนีบชิ้นงานผิดพลาด (Jig Setup / Clamping Error)",
    "ความผิดพลาดของผู้ปฏิบัติงาน (Human Error / Operation)",
    "ปัญหาวัตถุดิบ / แผ่น PCB โก่งงอ (Material Warped)",
    "อื่นๆ (ระบุในรายละเอียด)"
  ],
  escaped: [
    "งานกัดเยื้อง / หลุดศูนย์ (Shifted Route / Registration Offset)",
    "กัดกินลายวงจร / กิน Pad (Over-routing into Circuit / Pad)",
    "กัดไม่ขาด / เหลือขอบติ่งชิ้นงาน (Under-cut / Tab not Severed)",
    "ครีบขอบบอร์ดตกค้าง (Burr / Rough Edge Escaped)",
    "มิติขนาดกว้าง-ยาว เกินเกณฑ์สเปก (Outline Dimension Out of Spec)",
    "รอยขีดข่วนรุนแรงบนผิวชิ้นงาน (Heavy Scratch / Surface Damage)",
    "ชิ้นงานบิ่น / ขอบแตก (Chipped / Fractured Edge)",
    "ปะปน P/N / บรรจุสลับ Lot (Mixed Lot / Wrong Part Number)",
    "มีเศษฝุ่น/ผงไฟเบอร์ติดชิ้นงานส่งออก (Dust Contamination on Parts)",
    "อื่นๆ (ระบุในรายละเอียด)"
  ]
};

// ================= AUTHENTICATION + ON DOM LOAD =================
let routerCurrentUser = null;
let routerCurrentRole = null;
let routerAppInitialized = false;
const ROUTER_ROLE_LEVEL = { viewer: 1, operator: 2, supervisor: 3, admin: 4 };

function showAuthError(message) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

function setRoleVisibility(role) {
  const level = ROUTER_ROLE_LEVEL[role] || 0;
  document.querySelectorAll('[data-role-min]').forEach(el => {
    const required = Number(el.getAttribute('data-role-min') || 1);
    el.classList.toggle('hidden', level < required);
  });
  // Viewers can inspect records and charts, but cannot submit or delete records.
  const saveButton = document.getElementById('btn-save-report');
  if (saveButton) saveButton.disabled = level < ROUTER_ROLE_LEVEL.operator;
  if (level < ROUTER_ROLE_LEVEL.operator) {
    document.querySelectorAll('#incident-form input, #incident-form select, #incident-form textarea').forEach(el => el.disabled = true);
  }
}

async function routerSignOut() {
  try { if (app && firebase.auth) await firebase.auth().signOut(); }
  catch (e) { console.error('Sign out failed', e); }
}

async function resolveRouterRole(user) {
  if (!rtdb) throw new Error('Firebase Realtime Database ยังไม่พร้อมใช้งาน');
  const snap = await rtdb.ref('user_roles/' + user.uid).once('value');
  const value = snap.val();
  const role = typeof value === 'string' ? value : (value && value.role);
  if (!ROUTER_ROLE_LEVEL[role]) throw new Error('บัญชีนี้ยังไม่ได้กำหนดบทบาทใน user_roles หรือบทบาทไม่ถูกต้อง');
  return role;
}

async function activateRouterApp(user, role) {
  routerCurrentUser = user;
  routerCurrentRole = role;
  document.getElementById('auth-gate')?.classList.add('hidden');
  document.getElementById('auth-user-chip')?.classList.remove('hidden');
  setText('auth-user-label', user.email || user.uid);
  setText('auth-role-label', ({admin:'ผู้ดูแลระบบ', supervisor:'หัวหน้างาน', operator:'ผู้บันทึก', viewer:'ผู้ดูข้อมูล'})[role] || role);
  setRoleVisibility(role);
  if (routerAppInitialized) return;
  routerAppInitialized = true;
  initFormDateTime();
  populateProblemCategories('internal');
  await loadInitialLocalData();
  setupCloudSync();
  setupCalendar(currentCalendarDate);
}

document.addEventListener('DOMContentLoaded', async () => {
  initFormDateTime();
  populateProblemCategories('internal');

  // Bind image inputs (Mode 2 style: pick or capture, auto-compress on select)
  const imagesInput = document.getElementById('images');
  const cameraInput = document.getElementById('camera');
  if (imagesInput) imagesInput.addEventListener('change', async e => { await addImageFiles(e.target.files); e.target.value = ''; });
  if (cameraInput) cameraInput.addEventListener('change', async e => { await addImageFiles(e.target.files); e.target.value = ''; });

  if (typeof firebase === 'undefined' || !firebase.auth) {
    console.warn('Firebase Authentication SDK ไม่พร้อมใช้งาน');
    await activateRouterApp({uid:'local-session', email:'ผู้ใช้งาน'}, 'operator');
    showSystemNotice('ไม่พบ Firebase SDK — บันทึกได้เฉพาะในเครื่องนี้ ยังไม่ซิงค์ขึ้นคลาวด์');
    return;
  }
  firebase.auth().onAuthStateChanged(async user => {
    try {
      if (!user) user = (await firebase.auth().signInAnonymously()).user;
      // เข้าใช้งานทันทีด้วย Anonymous Authentication ไม่ต้องกรอกอีเมล/รหัสผ่าน
      await activateRouterApp(user, 'operator');
    } catch (error) {
      console.error('Anonymous access failed:', error);
      // ให้เปิด UI และบันทึกในเครื่องได้ แม้ Firebase Auth ยังไม่พร้อม
      await activateRouterApp({uid:'local-session', email:'ผู้ใช้งาน'}, 'operator');
      const notice = document.createElement('div');
      notice.className = 'mx-4 my-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800';
      notice.textContent = 'เปิดใช้งานโหมดในเครื่องแล้ว แต่การซิงค์ Firebase อาจยังไม่พร้อม: ' + (error.message || error);
      document.querySelector('main')?.prepend(notice);
    }
  });
});

// Load from IndexedDB immediately on startup
async function loadInitialLocalData() {
  const localList = await getAllFromIndexedDB();
  if (localList && localList.length > 0) {
    console.log(`Loaded ${localList.length} reports from local persistent storage`);
    allReports = localList;
    sortReportsDesc();
    applyDashboardFilter();
    filterRecords();
    renderCalendar();
    updateBadgeCounts();
  }
}

// Use the browser's local calendar date (avoids UTC date shifts in Thailand).
function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Set default datetime in form to current local time
function initFormDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;
  
  const dtInput = document.getElementById('reportDateTime');
  if (dtInput) dtInput.value = formatted;
}

// Populate Category dropdown based on internal vs escaped
function populateProblemCategories(type) {
  const catSelect = document.getElementById('problemCategory');
  if (!catSelect) return;
  
  catSelect.innerHTML = '';
  const list = CATEGORIES[type] || CATEGORIES.internal;
  list.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  });
}

// Toggle form fields based on Internal vs Escaped Defect
function toggleReportTypeFields() {
  const reportType = document.querySelector('input[name="reportType"]:checked')?.value || 'internal';
  const escapedSection = document.getElementById('escaped-section');
  
  populateProblemCategories(reportType);

  if (reportType === 'escaped') {
    escapedSection.classList.remove('hidden');
  } else {
    escapedSection.classList.add('hidden');
  }
}

// Handle Machine dropdown change
function handleMachineChange() {
  const sel = document.getElementById('machineName');
  const customInput = document.getElementById('customMachineInput');
  if (sel.value === 'OTHER') {
    customInput.classList.remove('hidden');
    customInput.required = true;
    customInput.focus();
  } else {
    customInput.classList.add('hidden');
    customInput.required = false;
  }
}

// Auto calculate Defect Rate %
function calculateDefectRate() {
  const total = parseFloat(document.getElementById('totalQty')?.value) || 0;
  const defect = parseFloat(document.getElementById('defectQty')?.value) || 0;
  const badge = document.getElementById('defect-rate-badge');
  if (!badge) return;

  if (total > 0 && defect >= 0) {
    const rate = ((defect / total) * 100).toFixed(2);
    badge.textContent = `${rate}% เสีย`;
    if (rate > 5) {
      badge.className = "text-xs bg-red-100 text-red-700 px-2 py-1.5 rounded-lg whitespace-nowrap font-bold";
    } else if (rate > 1) {
      badge.className = "text-xs bg-amber-100 text-amber-700 px-2 py-1.5 rounded-lg whitespace-nowrap font-semibold";
    } else {
      badge.className = "text-xs bg-emerald-100 text-emerald-700 px-2 py-1.5 rounded-lg whitespace-nowrap font-semibold";
    }
  } else {
    badge.textContent = "0% เสีย";
    badge.className = "text-xs bg-slate-200 text-slate-700 px-2 py-1.5 rounded-lg whitespace-nowrap font-semibold";
  }
}

// ================= IMAGE HANDLING & AUTO COMPRESSION (aligned with โหมด 2) =================
// Fast canvas-based compression that keeps quality but stays small, so reports
// upload and sync to Firebase quickly.
async function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const im = new Image();
      im.onerror = reject;
      im.onload = () => {
        const maxDim = 1400;
        const scale = Math.min(1, maxDim / Math.max(im.width, im.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(im.width * scale);
        canvas.height = Math.round(im.height * scale);
        canvas.getContext('2d').drawImage(im, 0, 0, canvas.width, canvas.height);
        resolve({ name: file.name, type: 'image/jpeg', dataUrl: canvas.toDataURL('image/jpeg', 0.78), caption: '' });
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function addImageFiles(files) {
  const list = Array.from(files || []).filter(f => f.type.startsWith('image/'));
  if (!list.length) return;
  for (const file of list) {
    try { photos.push(await compressImageFile(file)); }
    catch (e) { console.error('Image compression error:', e); }
  }
  renderImagePreviews();
}

function renderImagePreviews() {
  const container = document.getElementById('previews');
  if (!container) return;
  container.innerHTML = photos.map((p, i) => `
    <div class="text-center">
      <img class="w-[90px] h-[90px] object-cover rounded-xl border border-slate-300 cursor-pointer" src="${p.dataUrl}" alt="รูปแนบ" onclick="openPhoto(${i})">
      <input class="mt-1 w-[150px] text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="คำอธิบายภาพ" value="${escapeHtml(p.caption || '')}" oninput="photos[${i}].caption=this.value">
      <button type="button" class="mt-1 w-full text-xs bg-red-100 hover:bg-red-200 text-red-700 font-semibold px-2 py-1 rounded-lg transition" onclick="removeImage(${i})">
        <i class="fa-solid fa-trash mr-1"></i>ลบรูป
      </button>
    </div>
  `).join('');
}

function removeImage(index) {
  photos.splice(index, 1);
  renderImagePreviews();
}

function openPhoto(index) {
  const p = photos[index];
  if (!p) return;
  const modal = document.getElementById('photoLightbox');
  const img = document.getElementById('lightboxImg');
  if (!modal || !img) return;
  img.src = p.dataUrl;
  modal.classList.remove('hidden');
}

// View a photo stored on a saved report (read-only records/detail views).
function openReportPhoto(reportId, index) {
  const report = allReports.find(r => r.id === reportId);
  const p = report && (report.photos || [])[index];
  if (!p) return;
  const modal = document.getElementById('photoLightbox');
  const img = document.getElementById('lightboxImg');
  if (!modal || !img) return;
  img.src = p.dataUrl;
  modal.classList.remove('hidden');
}

function getPendingSyncIds() {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_SYNC_KEY) || '[]');
    return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string'))] : [];
  } catch (_) { return []; }
}

function setPendingSyncIds(ids) {
  try { localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify([...new Set(ids)])); }
  catch (error) { console.warn('Unable to store pending sync queue:', error); }
}

function queueReportForSync(reportId) {
  if (!reportId) return;
  setPendingSyncIds([...getPendingSyncIds(), reportId]);
}

function removeReportFromSyncQueue(reportId) {
  setPendingSyncIds(getPendingSyncIds().filter(id => id !== reportId));
}

async function flushPendingCloudSync() {
  if (flushingPendingSync || (!rtdb && !db)) return;
  const pending = getPendingSyncIds();
  if (!pending.length) return;
  flushingPendingSync = true;
  try {
    for (const id of pending) {
      const report = allReports.find(item => item.id === id);
      if (!report) {
        removeReportFromSyncQueue(id);
        continue;
      }
      const result = await writeReportToCloud(report);
      if (result.cloudSaved) removeReportFromSyncQueue(id);
    }
  } finally {
    flushingPendingSync = false;
  }
}

// Show honest local/cloud status without claiming a cloud write succeeded early.
function setCloudStatus(mode, message) {
  const statusEl = document.getElementById('connection-status');
  const textEl = document.getElementById('connection-text');
  if (textEl) textEl.textContent = message;
  if (statusEl) {
    const classes = {
      online: "flex items-center space-x-1.5 text-xs bg-emerald-950/60 text-emerald-300 border border-emerald-600/40 px-2.5 py-1 rounded-full",
      local: "flex items-center space-x-1.5 text-xs bg-amber-950/60 text-amber-300 border border-amber-600/40 px-2.5 py-1 rounded-full",
      offline: "flex items-center space-x-1.5 text-xs bg-red-950/60 text-red-300 border border-red-600/40 px-2.5 py-1 rounded-full"
    };
    statusEl.className = classes[mode] || classes.local;
  }
}

async function writeReportToCloud(reportData) {
  const jobs = [];
  const serializedSize = (() => {
    try { return new Blob([JSON.stringify(reportData)]).size; }
    catch (_) { return JSON.stringify(reportData).length; }
  })();

  if (rtdb) {
    jobs.push(
      Promise.resolve().then(() => rtdb.ref("router_reports/" + reportData.id).set(reportData))
        .then(() => ({ backend: "Realtime Database", ok: true }))
        .catch(error => ({ backend: "Realtime Database", ok: false, error }))
    );
  }
  // Firestore documents are limited to 1 MiB. Skip the secondary copy when a
  // report is too large; RTDB remains the primary cloud copy.
  if (db && serializedSize < 850 * 1024) {
    jobs.push(
      Promise.resolve().then(() => db.collection("router_reports").doc(reportData.id).set(reportData))
        .then(() => ({ backend: "Firestore", ok: true }))
        .catch(error => ({ backend: "Firestore", ok: false, error }))
    );
  } else if (db && serializedSize >= 850 * 1024) {
    console.warn("Firestore copy skipped because report is too large; RTDB remains the primary cloud copy.");
  }

  if (!jobs.length) {
    setCloudStatus("local", "บันทึกในเครื่องเท่านั้น — ยังไม่ได้เชื่อมต่อ Firebase");
    return { cloudSaved: false, results: [] };
  }
  const results = await Promise.all(jobs);
  results.filter(x => !x.ok).forEach(x => console.warn(x.backend + " write failed:", x.error));
  const cloudSaved = results.some(x => x.ok);
  setCloudStatus(cloudSaved ? "online" : "offline",
    cloudSaved ? "Firebase ซิงค์ออนไลน์เรียบร้อย" : "บันทึกในเครื่องแล้ว — ซิงค์ Firebase ไม่สำเร็จ");
  return { cloudSaved, results };
}

// ================= CLOUD SYNC & MERGING (RTDB + FIRESTORE) =================
function setupCloudSync() {
  // Avoid stacking duplicate listeners when the user manually refreshes data.
  if (rtdb) { try { rtdb.ref('router_reports').off('value'); } catch (_) {} }
  if (typeof firestoreReportsUnsubscribe === 'function') {
    try { firestoreReportsUnsubscribe(); } catch (_) {}
    firestoreReportsUnsubscribe = null;
  }
  const statusEl = document.getElementById('connection-status');
  const statusText = document.getElementById('connection-text');

  let rtdbConnected = false;
  let firestoreConnected = false;

  const updateStatusUI = () => {
    setCloudStatus(
      (rtdbConnected || firestoreConnected) ? "online" : "local",
      (rtdbConnected || firestoreConnected) ? "Firebase ซิงค์ออนไลน์เรียบร้อย" : "บันทึกในเครื่อง (รอการเชื่อมต่อ Firebase)"
    );
  };

  // 1. Listen to Realtime Database
  if (rtdb) {
    try {
      rtdb.ref("router_reports").on("value", (snapshot) => {
        rtdbConnected = true;
        updateStatusUI();
        flushPendingCloudSync();
        const data = snapshot.val();
        if (data) {
          const list = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          mergeIncomingReports(list);
        }
      }, (err) => {
        console.warn("RTDB listener warning:", err);
      });
    } catch (e) {
      console.warn("RTDB ref error:", e);
    }
  }

  // 2. Listen to Cloud Firestore (with fallback)
  if (db) {
    try {
      firestoreReportsUnsubscribe = db.collection("router_reports").onSnapshot((snapshot) => {
        firestoreConnected = true;
        updateStatusUI();
        flushPendingCloudSync();
        const list = [];
        snapshot.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        if (list.length > 0) {
          mergeIncomingReports(list);
        }
      }, (err) => {
        console.warn("Firestore snapshot warning (using RTDB & local storage):", err);
      });
    } catch (e) {
      console.warn("Firestore listen error:", e);
    }
  }

  updateStatusUI();
}

// Safely merge incoming reports with local store
function mergeIncomingReports(incomingList) {
  if (!incomingList || incomingList.length === 0) return;

  const map = new Map();
  // Keep the newest copy when RTDB and Firestore deliver snapshots in different orders.
  allReports.forEach(r => map.set(r.id, r));
  incomingList.forEach(incoming => {
    if (!incoming || !incoming.id) return;
    const existing = map.get(incoming.id);
    let chosen = incoming;
    if (existing) {
      const oldTime = Date.parse(existing.updatedAt || existing.createdAt || 0) || 0;
      const newTime = Date.parse(incoming.updatedAt || incoming.createdAt || 0) || 0;
      chosen = newTime >= oldTime ? { ...existing, ...incoming } : { ...incoming, ...existing };
      if ((!incoming.photos || !incoming.photos.length) && existing.photos && existing.photos.length) {
        chosen.photos = existing.photos;
      }
    }
    map.set(incoming.id, chosen);
    // Persist the merged result, not a potentially older backend snapshot.
    saveToIndexedDB(chosen);
  });

  allReports = Array.from(map.values());
  sortReportsDesc();

  applyDashboardFilter();
  filterRecords();
  renderCalendar();
  updateBadgeCounts();
}

function sortReportsDesc() {
  allReports.sort((a, b) => {
    const tA = new Date(a.reportDateTime || a.reportDate || 0).getTime();
    const tB = new Date(b.reportDateTime || b.reportDate || 0).getTime();
    return tB - tA;
  });
}

function reloadFromFirebase() {
  setupCloudSync();
  Swal.fire({
    icon: 'info',
    title: 'รีเฟรชข้อมูล',
    text: 'กำลังซิงค์ข้อมูลล่าสุดกับระบบ Firebase...',
    timer: 1500,
    showConfirmButton: false
  });
}

// ================= FORM SUBMISSION (MULTI-TIER SAVE) =================
async function handleFormSubmit(e) {
  e.preventDefault();

  // Show feedback immediately. Previously, if a CDN script was blocked, the first Swal call
  // threw and the whole handler aborted silently, so the button appeared to do nothing.
  const btnSave = document.getElementById('btn-save-report');
  if (btnSave) btnSave.disabled = true;
  setText('btn-save-text', 'กำลังบันทึก...');

  const editDocId = (document.getElementById('edit-doc-id') || {}).value || '';

  try {
    // Validate explicitly: if a required control is not focusable the browser fails silently.
    const formEl = document.getElementById('incident-form');
    if (formEl && typeof formEl.checkValidity === 'function' && !formEl.checkValidity()) {
      if (formEl.reportValidity) formEl.reportValidity();
      await Swal.fire({
        icon: 'warning',
        title: 'กรอกข้อมูลไม่ครบถ้วน',
        text: 'กรุณากรอกช่องที่มีเครื่องหมาย * ให้ครบก่อนบันทึก'
      });
      return;
    }

    const reportType = document.querySelector('input[name="reportType"]:checked').value;
  let machineName = document.getElementById('machineName').value;
  if (machineName === 'OTHER') {
    machineName = document.getElementById('customMachineInput').value.trim() || 'OTHER';
  }

  const reportDateTime = document.getElementById('reportDateTime').value;
  const shift = document.getElementById('shift').value;
  const reporterName = document.getElementById('reporterName').value.trim();
  const severity = document.getElementById('severity').value;
  const problemCategory = document.getElementById('problemCategory').value;
  const title = document.getElementById('title').value.trim();
  const lotNo = document.getElementById('lotNo').value.trim();
  const partNo = document.getElementById('partNo').value.trim();
  const modelSerial = document.getElementById('modelSerial') ? document.getElementById('modelSerial').value.trim() : '';
  const totalQty = parseFloat(document.getElementById('totalQty').value) || 0;
  const defectQty = parseFloat(document.getElementById('defectQty').value) || 0;
  const description = document.getElementById('description').value.trim();
  const rootCause = document.getElementById('rootCause').value.trim();
  const correctiveAction = document.getElementById('correctiveAction').value.trim();
  const status = document.getElementById('status').value;
  const supervisorName = document.getElementById('supervisorName').value.trim();

  // Escaped specific fields
  const escapedTo = reportType === 'escaped' ? document.getElementById('escapedTo').value : '';
  const escapedRootCause = reportType === 'escaped' ? document.getElementById('escapedRootCause').value : '';
  const containmentAction = reportType === 'escaped' ? document.getElementById('containmentAction').value.trim() : '';

  // Determine Machine Group (TONGTAI, ROUTER_VIA, OTHER)
  let machineGroup = 'OTHER';
  if (machineName.startsWith('TONGTAI')) machineGroup = 'TONGTAI';
  else if (machineName.startsWith('ROUTER_VIA')) machineGroup = 'ROUTER_VIA';

  // Unique report ID
  const docId = editDocId || ('REP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));

  const reportData = {
    id: docId,
    reportType,
    machineName,
    machineGroup,
    reportDateTime,
    reportDate: reportDateTime ? reportDateTime.split('T')[0] : localDateString(),
    shift,
    reporterName,
    severity,
    problemCategory,
    title,
    lotNo,
    partNo,
    modelSerial,
    totalQty,
    defectQty,
    defectRate: totalQty > 0 ? parseFloat(((defectQty / totalQty) * 100).toFixed(2)) : 0,
    escapedTo,
    escapedRootCause,
    containmentAction,
    description,
    rootCause,
    correctiveAction,
    status,
    supervisorName,
    photos,
    updatedAt: new Date().toISOString()
  };

  if (!editDocId) {
    reportData.createdAt = new Date().toISOString();
  }

  // Persist and refresh the UI immediately (same snappy feel as โหมด 2).
    // 1. IMMEDIATELY update in-memory state
    const existingIdx = allReports.findIndex(r => r.id === docId);
    if (existingIdx !== -1) {
      allReports[existingIdx] = { ...reportData };
    } else {
      allReports.unshift({ ...reportData });
    }
    sortReportsDesc();

    // 2. Refresh UI right away — do not wait for IndexedDB or the network.
    try { applyDashboardFilter(); } catch (err) { console.warn("Dashboard refresh warning:", err); }
    try { filterRecords(); } catch (err) { console.warn("Records filter warning:", err); }
    try { renderCalendar(); } catch (err) { console.warn("Calendar render warning:", err); }
    try { updateBadgeCounts(); } catch (err) { console.warn("Badge count warning:", err); }

    // 3. Persist to IndexedDB in the background (survives refresh) so saving stays fast.
    Promise.resolve()
      .then(() => saveToIndexedDB(reportData))
      .catch(idbErr => console.warn("IndexedDB save fallback warning:", idbErr));

    // 4. Wait for cloud results before telling the user that cloud sync succeeded.
    const syncResult = await writeReportToCloud(reportData);
    if (syncResult.cloudSaved) {
      removeReportFromSyncQueue(docId);
      await Swal.fire({
        icon: 'success',
        title: editDocId ? 'แก้ไขข้อมูลสำเร็จ!' : 'บันทึกรายงานเรียบร้อย!',
        timer: 1200,
        showConfirmButton: false
      });
    } else {
      queueReportForSync(docId);
      await Swal.fire({
        icon: 'warning',
        title: 'บันทึกในเครื่องแล้ว แต่ยังไม่ขึ้นคลาวด์',
        text: 'ข้อมูลถูกเก็บไว้ในเครื่องนี้แล้ว โปรดตรวจสอบอินเทอร์เน็ตและ Firebase ก่อนใช้งานจากเครื่องอื่น',
        confirmButtonText: 'รับทราบ'
      });
    }

    try { resetForm(); } catch (err) { console.warn("Reset form warning:", err); }
    try { switchTab('records'); } catch (err) { console.warn("Switch tab warning:", err); }

  } catch (error) {
    console.error("Save error:", error);
    try {
      Swal.fire({
        icon: 'error',
        title: 'บันทึกข้อมูลไม่สำเร็จ',
        text: error.message || 'โปรดลองอีกครั้ง'
      });
    } catch (notifyError) {
      showSystemNotice('บันทึกข้อมูลไม่สำเร็จ: ' + (error.message || error));
    }
  } finally {
    if (btnSave) btnSave.disabled = false;
    setText('btn-save-text', editDocId ? 'บันทึกการแก้ไข' : 'บันทึกรายงานปัญหา');
  }
}

// Bulletproof element text helper
function setText(id, value) {
  try {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = (value !== undefined && value !== null) ? value : '';
    }
  } catch (e) {
    console.warn(`setText warning for ${id}:`, e);
  }
}

// Reset Form to Clean State
function resetForm() {
  const form = document.getElementById('incident-form');
  if (form) form.reset();

  const editIdEl = document.getElementById('edit-doc-id');
  if (editIdEl) editIdEl.value = '';

  setText('form-mode-title', 'บันทึกรายงานปัญหาแผนก ROUTER');
  setText('form-ticket-id', 'New Ticket');
  setText('btn-save-text', 'บันทึกรายงานปัญหา');
  
  const btnSave = document.getElementById('btn-save-report');
  if (btnSave) btnSave.disabled = false;
  
  const customInput = document.getElementById('customMachineInput');
  if (customInput) customInput.classList.add('hidden');

  const escapedSection = document.getElementById('escaped-section');
  if (escapedSection) escapedSection.classList.add('hidden');

  photos = [];
  try { renderImagePreviews(); } catch (e) {}
  try { initFormDateTime(); } catch (e) {}
  try { populateProblemCategories('internal'); } catch (e) {}
  try { calculateDefectRate(); } catch (e) {}
}

// Load Report into Form for Editing
function editReport(id) {
  const report = allReports.find(r => r.id === id);
  if (!report) return;

  switchTab('form');

  const editIdEl = document.getElementById('edit-doc-id');
  if (editIdEl) editIdEl.value = report.id;

  setText('form-mode-title', `แก้ไขรายงาน: #${report.id.substr(0, 10)}`);
  setText('form-ticket-id', `ID: ${report.id.substr(0, 10)}`);
  setText('btn-save-text', 'บันทึกการแก้ไข');

  const btnSave = document.getElementById('btn-save-report');
  if (btnSave) btnSave.disabled = false;

  // Report Type
  const radio = document.querySelector(`input[name="reportType"][value="${report.reportType}"]`);
  if (radio) {
    radio.checked = true;
    toggleReportTypeFields();
  }

  // Machine
  const machineSelect = document.getElementById('machineName');
  const customInput = document.getElementById('customMachineInput');
  const existsInSelect = Array.from(machineSelect.options).some(opt => opt.value === report.machineName);

  if (existsInSelect) {
    machineSelect.value = report.machineName;
    customInput.classList.add('hidden');
  } else {
    machineSelect.value = 'OTHER';
    customInput.value = report.machineName;
    customInput.classList.remove('hidden');
  }

  document.getElementById('reportDateTime').value = report.reportDateTime || '';
  document.getElementById('shift').value = report.shift || 'กะ A (กลางวัน)';
  document.getElementById('reporterName').value = report.reporterName || '';
  document.getElementById('severity').value = report.severity || 'ปานกลาง';
  document.getElementById('problemCategory').value = report.problemCategory || '';
  document.getElementById('title').value = report.title || '';
  document.getElementById('lotNo').value = report.lotNo || '';
  document.getElementById('partNo').value = report.partNo || '';
  const modelSerialInput = document.getElementById('modelSerial');
  if (modelSerialInput) modelSerialInput.value = report.modelSerial || '';
  document.getElementById('totalQty').value = report.totalQty || '';
  document.getElementById('defectQty').value = report.defectQty || '';
  document.getElementById('description').value = report.description || '';
  document.getElementById('rootCause').value = report.rootCause || '';
  document.getElementById('correctiveAction').value = report.correctiveAction || '';
  document.getElementById('status').value = report.status || 'open';
  document.getElementById('supervisorName').value = report.supervisorName || '';

  if (report.reportType === 'escaped') {
    document.getElementById('escapedTo').value = report.escapedTo || '';
    document.getElementById('escapedRootCause').value = report.escapedRootCause || '';
    document.getElementById('containmentAction').value = report.containmentAction || '';
  }

  calculateDefectRate();

  photos = (report.photos || []).map(p => ({ ...p }));
  renderImagePreviews();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Delete Report
async function deleteReport(id) {
  const result = await Swal.fire({
    title: 'ยืนยันการลบรายงาน?',
    text: "หากลบแล้วข้อมูลจะถูกนำออกจากระบบทั้งบนเครื่องและระบบคลาวด์",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ลบข้อมูล',
    cancelButtonText: 'ยกเลิก'
  });

  if (!result.isConfirmed) return;

  try {
    // 1. Remove from memory
    allReports = allReports.filter(r => r.id !== id);
    
    // 2. Remove from IndexedDB
    await deleteFromIndexedDB(id);
    removeReportFromSyncQueue(id);

    // 3. Delete from cloud and wait for the outcome so the UI does not claim
    // that remote deletion succeeded before Firebase confirms it.
    const deleteJobs = [];
    if (rtdb) deleteJobs.push(Promise.resolve().then(() => rtdb.ref("router_reports/" + id).remove()).then(
      () => ({ ok: true, backend: "Realtime Database" }),
      error => ({ ok: false, backend: "Realtime Database", error })
    ));
    if (db) deleteJobs.push(Promise.resolve().then(() => db.collection("router_reports").doc(id).delete()).then(
      () => ({ ok: true, backend: "Firestore" }),
      error => ({ ok: false, backend: "Firestore", error })
    ));
    const deleteResults = await Promise.all(deleteJobs);
    deleteResults.filter(x => !x.ok).forEach(x => console.warn(x.backend + " delete failed:", x.error));
    const cloudDeleted = deleteResults.length > 0 && deleteResults.some(x => x.ok);
    if (!cloudDeleted) {
      setCloudStatus("offline", "ลบในเครื่องแล้ว — การลบจาก Firebase ยังไม่สำเร็จ");
    }

    // Refresh UI
    applyDashboardFilter();
    filterRecords();
    renderCalendar();
    updateBadgeCounts();

    if (cloudDeleted) {
      Swal.fire({
        icon: 'success',
        title: 'ลบข้อมูลเรียบร้อย',
        text: deleteResults.every(x => x.ok) ? 'ลบจาก Firebase แล้ว' : 'ลบจาก Firebase บางส่วน โปรดตรวจสอบการเชื่อมต่อ',
        timer: 1800,
        showConfirmButton: false
      });
    } else {
      Swal.fire({
        icon: 'warning',
        title: 'ลบเฉพาะข้อมูลในเครื่องนี้',
        text: 'การลบจาก Firebase ยังไม่สำเร็จ ข้อมูลอาจกลับมาเมื่อเชื่อมต่อคลาวด์อีกครั้ง',
        confirmButtonText: 'รับทราบ'
      });
    }
  } catch (err) {
    console.error("Delete error:", err);
    Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
  }
}

// ================= DASHBOARD & CHARTS LOGIC =================
function applyDashboardFilter() {
  const filter = document.getElementById('dash-date-filter').value;
  const now = new Date();
  
  let reports = [...allReports];
  const summaryLabel = document.getElementById('dash-summary-label');

  if (filter === 'today') {
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    reports = reports.filter(r => r.reportDate === todayStr);
    setText('dash-summary-label', `ข้อมูลเฉพาะวันนี้ (${todayStr})`);
  } else if (filter === 'this_week') {
    const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
    firstDay.setHours(0,0,0,0);
    reports = reports.filter(r => new Date(r.reportDateTime) >= firstDay);
    setText('dash-summary-label', `ข้อมูลสัปดาห์นี้`);
  } else if (filter === 'this_month') {
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    reports = reports.filter(r => r.reportDate && r.reportDate.startsWith(currentMonthStr));
    setText('dash-summary-label', `ข้อมูลเดือนนี้ (${now.toLocaleString('th-TH', { month: 'long', year: 'numeric' })})`);
  } else if (filter === 'last_month') {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    reports = reports.filter(r => r.reportDate && r.reportDate.startsWith(lastMonthStr));
    setText('dash-summary-label', `ข้อมูลเดือนที่แล้ว (${lastMonthDate.toLocaleString('th-TH', { month: 'long', year: 'numeric' })})`);
  } else {
    setText('dash-summary-label', `ข้อมูลสะสมทั้งหมด (${reports.length} รายการ)`);
  }

  updateDashboardKPIs(reports);
  renderDashboardCharts(reports);
  renderDashboardEscapedAlerts(reports);
}

function updateDashboardKPIs(reports) {
  const total = reports.length;
  const internalCount = reports.filter(r => r.reportType === 'internal').length;
  const escapedCount = reports.filter(r => r.reportType === 'escaped').length;
  const totalDefect = reports.reduce((sum, r) => sum + (parseFloat(r.defectQty) || 0), 0);
  const resolvedCount = reports.filter(r => r.status === 'resolved' || r.status === 'closed').length;
  const pendingCount = reports.filter(r => r.status === 'open' || r.status === 'in_progress').length;

  setText('kpi-total', total);
  setText('kpi-internal', internalCount);
  setText('kpi-escaped', escapedCount);
  setText('kpi-defect-qty', totalDefect.toLocaleString());

  const internalPct = total > 0 ? ((internalCount / total) * 100).toFixed(0) : 0;
  const escapedPct = total > 0 ? ((escapedCount / total) * 100).toFixed(0) : 0;
  const resolvedPct = total > 0 ? ((resolvedCount / total) * 100).toFixed(0) : 0;

  setText('kpi-internal-pct', `${internalPct}%`);
  setText('kpi-escaped-pct', `${escapedPct}%`);
  setText('kpi-resolved-pct', `${resolvedPct}%`);
  setText('kpi-pending-count', `รอ ${pendingCount}`);

  // Machine Group Breakdown
  const tongtaiCount = reports.filter(r => r.machineGroup === 'TONGTAI').length;
  const viaCount = reports.filter(r => r.machineGroup === 'ROUTER_VIA').length;
  const otherCount = reports.filter(r => r.machineGroup === 'OTHER').length;

  setText('group-tongtai-count', tongtaiCount);
  setText('group-via-count', viaCount);
  setText('group-other-count', otherCount);

  setText('ratio-internal-text', `${internalCount} (${internalPct}%)`);
  setText('ratio-escaped-text', `${escapedCount} (${escapedPct}%)`);
}

function renderDashboardCharts(reports) {
  // If the Chart.js CDN is blocked the dashboard should still load normally.
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js ไม่พร้อมใช้งาน — ข้ามการวาดกราฟ');
    return;
  }
  // Draw the value above every bar (vertical bars only).
  const valueLabelPlugin = {
    id: 'valueLabelTop',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta || meta.hidden) return;
      const area = chart.chartArea || { bottom: chart.height };
      const ctx2 = chart.ctx;
      if (!ctx2) return;
      ctx2.save();
      ctx2.font = '600 11px Prompt, system-ui, sans-serif';
      ctx2.fillStyle = '#1e293b';
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'bottom';
      meta.data.forEach((bar, i) => {
        const value = chart.data.datasets[0].data[i];
        if (value === undefined || value === null || !bar) return;
        const isZero = Number(value) === 0;
        const y = Number.isFinite(bar.y) ? bar.y : area.bottom;
        ctx2.fillStyle = isZero ? '#94a3b8' : '#1e293b';
        ctx2.fillText(String(value), bar.x, isZero ? Math.min(y - 3, area.bottom - 3) : y - 4);
      });
      ctx2.restore();
    }
  };
  // Chart 1: Ratio Internal vs Escaped
  const internalCount = reports.filter(r => r.reportType === 'internal').length;
  const escapedCount = reports.filter(r => r.reportType === 'escaped').length;

  // Charts are re-created only after their container is visible again (a hidden
  // canvas measures 0px wide, so the size is forced from the visible wrapper).
  ['chart-ratio-wrap', 'chart-machine-wrap', 'chart-category-wrap', 'chart-trend-wrap'].forEach(wrapId => {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const cv = wrap.querySelector('canvas');
    if (!cv) return;
    const w = wrap.clientWidth || wrap.parentElement?.clientWidth || 0;
    if (w > 0) {
      cv.style.width = '100%';
      cv.style.height = '100%';
      cv.style.maxWidth = '100%';
      cv.style.display = 'block';
    }
  });

  const ctxRatio = document.getElementById('chart-ratio').getContext('2d');
  if (chartRatioInstance) chartRatioInstance.destroy();
  
  chartRatioInstance = new Chart(ctxRatio, {
    type: 'doughnut',
    data: {
      labels: ['ปัญหาภายใน ROUTER', 'งานหลุดออกไป (Escaped)'],
      datasets: [{
        data: [internalCount, escapedCount],
        backgroundColor: ['#ef4444', '#f59e0b'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, family: 'Prompt' } } }
      },
      cutout: '65%'
    }
  });

  // Chart 2: Issues by Machine (Top 10 machines)
  const machineCounts = {};
  reports.forEach(r => {
    const m = r.machineName || 'Unknown';
    machineCounts[m] = (machineCounts[m] || 0) + 1;
  });

  const sortedMachines = Object.keys(machineCounts)
    .sort((a, b) => machineCounts[b] - machineCounts[a])
    .slice(0, 10);

  const machineLabels = sortedMachines.length > 0 ? sortedMachines : ['ไม่มีข้อมูล'];
  const machineData = sortedMachines.length > 0 ? sortedMachines.map(m => machineCounts[m]) : [0];
  const machineColors = machineLabels.map(m => m.startsWith('TONGTAI') ? '#2563eb' : (m.startsWith('ROUTER_VIA') ? '#9333ea' : '#64748b'));

  const ctxMachine = document.getElementById('chart-machine').getContext('2d');
  if (chartMachineInstance) chartMachineInstance.destroy();

  chartMachineInstance = new Chart(ctxMachine, {
    type: 'bar',
    plugins: [valueLabelPlugin],
    data: {
      labels: machineLabels,
      datasets: [{
        label: 'จำนวนปัญหา (เคส)',
        data: machineData,
        backgroundColor: machineColors,
        borderRadius: 6,
        maxBarThickness: 54
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y} เคส`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { family: 'Prompt' } } },
        x: {
          ticks: { font: { size: 10, family: 'Prompt' }, color: '#334155', maxRotation: 0, autoSkip: false },
          grid: { display: false }
        }
      }
    }
  });

  // Detail rows under the bars: full machine name, group and count.
  const machineRank = document.getElementById('chart-machine-rank');
  if (machineRank) {
    if (sortedMachines.length === 0) {
      machineRank.innerHTML = `<p class="text-xs text-slate-400 text-center py-2">ไม่มีข้อมูลในช่วงนี้</p>`;
    } else {
      machineRank.innerHTML = sortedMachines.map((m, i) => {
        const n = machineCounts[m];
        const isVia = m.startsWith('ROUTER_VIA');
        const isTong = m.startsWith('TONGTAI');
        const group = isTong ? 'TONGTAI' : (isVia ? 'ROUTER_VIA' : 'อื่นๆ');
        const cls = isTong ? 'text-blue-700 bg-blue-50 border-blue-100' : (isVia ? 'text-purple-700 bg-purple-50 border-purple-100' : 'text-slate-600 bg-slate-50 border-slate-200');
        return `<div class="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[10px] font-bold text-indigo-600 w-3.5 shrink-0">${i + 1}</span>
            <span class="text-xs font-semibold text-slate-700 truncate">${escapeHtml(m)}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full border ${cls} shrink-0">${group}</span>
          </div>
          <span class="text-xs font-bold text-slate-800 whitespace-nowrap shrink-0">${n} เคส</span>
        </div>`;
      }).join('');
    }
  }

  // Chart 3: Top Defect Categories
  const catCounts = {};
  reports.forEach(r => {
    const c = r.problemCategory || 'อื่นๆ';
    catCounts[c] = (catCounts[c] || 0) + 1;
  });

  const sortedCats = Object.keys(catCounts)
    .sort((a, b) => catCounts[b] - catCounts[a])
    .slice(0, 6);

  const catLabels = sortedCats.length > 0 ? sortedCats : ['ไม่มีข้อมูล'];
  const catData = sortedCats.length > 0 ? sortedCats.map(c => catCounts[c]) : [0];
  // Show the real category name on the axis; only shorten genuinely long names.
  const shorten = (s, max) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);

  const ctxCat = document.getElementById('chart-category').getContext('2d');
  if (chartCategoryInstance) chartCategoryInstance.destroy();

  chartCategoryInstance = new Chart(ctxCat, {
    type: 'bar',
    plugins: [valueLabelPlugin],
    data: {
      labels: catLabels.map(l => shorten(l, 14)),
      datasets: [{
        label: 'จำนวนครั้งที่พบ',
        data: catData,
        backgroundColor: '#f43f5e',
        borderRadius: 4,
        maxBarThickness: 54
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => sortedCats[items[0].dataIndex] || catLabels[items[0].dataIndex],
            label: (ctx) => ` ${ctx.parsed.y} ครั้ง`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { family: 'Prompt' } } },
        x: {
          ticks: {
            font: { size: 10, family: 'Prompt' },
            color: '#334155',
            autoSkip: false,
            maxRotation: 45,
            minRotation: 0,
            callback(value) {
              // Wrap long names onto up to two short lines.
              const label = this.getLabelForValue(value);
              if (!label || label.length <= 11) return label;
              const words = String(label).split(/\s+/);
              if (words.length > 1) return words;
              const mid = Math.ceil(label.length / 2);
              return [label.slice(0, mid), label.slice(mid)];
            }
          },
          grid: { display: false }
        }
      }
    }
  });

  // Detail list shown under the bars (full category names + counts).
  const catRank = document.getElementById('chart-category-rank');
  if (catRank) {
    if (sortedCats.length === 0) {
      catRank.innerHTML = `<p class="text-xs text-slate-400 text-center py-2">ไม่มีข้อมูลในช่วงนี้</p>`;
    } else {
      const totalCat = catData.reduce((s, v) => s + v, 0) || 1;
      catRank.innerHTML = sortedCats.map((c, i) => {
        const n = catCounts[c];
        const share = Math.round((n / totalCat) * 100);
        return `<div class="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
          <div class="flex items-start gap-2 min-w-0">
            <span class="text-[10px] font-bold text-rose-600 w-3.5 pt-0.5 shrink-0">${i + 1}</span>
            <span class="text-xs text-slate-700 leading-snug">${escapeHtml(c)}</span>
          </div>
          <span class="text-xs font-bold text-rose-700 whitespace-nowrap shrink-0">${n} ครั้ง · ${share}%</span>
        </div>`;
      }).join('');
    }
  }

  // Chart 4: Incident Trend Over Time (Last 10 days)
  const dateCounts = {};
  reports.forEach(r => {
    if (r.reportDate) {
      dateCounts[r.reportDate] = (dateCounts[r.reportDate] || 0) + 1;
    }
  });

  const sortedDates = Object.keys(dateCounts).sort().slice(-10);
  const trendLabels = sortedDates.length > 0 ? sortedDates : ['ไม่มีข้อมูล'];
  const trendData = sortedDates.length > 0 ? sortedDates.map(d => dateCounts[d]) : [0];

  const ctxTrend = document.getElementById('chart-trend').getContext('2d');
  if (chartTrendInstance) chartTrendInstance.destroy();

  chartTrendInstance = new Chart(ctxTrend, {
    type: 'line',
    plugins: [valueLabelPlugin],
    data: {
      labels: trendLabels,
      datasets: [{
        label: 'จำนวนรายงานต่อวัน',
        data: trendData,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#10b981'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { ticks: { font: { size: 10, family: 'Prompt' } } }
      }
    }
  });
}

function renderDashboardEscapedAlerts(reports) {
  const container = document.getElementById('dashboard-escaped-list');
  if (!container) return;

  const escaped = reports.filter(r => r.reportType === 'escaped').slice(0, 5);
  if (escaped.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">ไม่มีรายงานงานหลุดในช่วงเวลานี้</p>`;
    return;
  }

  container.innerHTML = '';
  escaped.forEach(item => {
    const el = document.createElement('div');
    el.className = "p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-100/50 transition cursor-pointer flex items-center justify-between";
    el.onclick = () => viewReportDetail(item.id);
    el.innerHTML = `
      <div class="flex items-center space-x-2.5 overflow-hidden">
        <div class="w-7 h-7 rounded-lg bg-amber-200 text-amber-800 flex items-center justify-center flex-shrink-0 text-xs">
          <i class="fa-solid fa-truck-fast"></i>
        </div>
        <div class="truncate">
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold text-slate-800">${escapeHtml(item.machineName)}</span>
            <span class="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-medium">${escapeHtml(item.escapedTo || 'ไม่ระบุแผนก')}</span>
          </div>
          <p class="text-[11px] text-slate-600 truncate">${escapeHtml(item.title)}</p>
        </div>
      </div>
      <div class="text-right flex-shrink-0 ml-2">
        <span class="text-[10px] text-slate-400 block">${item.reportDate || ''}</span>
        <span class="text-xs font-bold text-red-600">${item.defectQty || 0} NG</span>
      </div>
    `;
    container.appendChild(el);
  });
}

// ================= RECORDS TABLE & FILTERING =================
function filterRecords() {
  const query = (document.getElementById('record-search').value || '').toLowerCase().trim();
  const type = document.getElementById('filter-type').value;
  const group = document.getElementById('filter-machine-group').value;
  const status = document.getElementById('filter-status').value;

  filteredReports = allReports.filter(r => {
    // Search query match
    if (query) {
      const matchMachine = (r.machineName || '').toLowerCase().includes(query);
      const matchTitle = (r.title || '').toLowerCase().includes(query);
      const matchLot = (r.lotNo || '').toLowerCase().includes(query);
      const matchPart = (r.partNo || '').toLowerCase().includes(query);
      const matchSerial = (r.modelSerial || '').toLowerCase().includes(query);
      const matchReporter = (r.reporterName || '').toLowerCase().includes(query);
      const matchDesc = (r.description || '').toLowerCase().includes(query);
      if (!matchMachine && !matchTitle && !matchLot && !matchPart && !matchSerial && !matchReporter && !matchDesc) {
        return false;
      }
    }

    // Type match
    if (type !== 'all' && r.reportType !== type) return false;

    // Machine Group match
    if (group !== 'all' && r.machineGroup !== group) return false;

    // Status match
    if (status !== 'all' && r.status !== status) return false;

    return true;
  });

  setText('record-filtered-count', filteredReports.length);
  setText('record-total-count', allReports.length);

  renderRecordsTable(filteredReports);
  renderRecordsCards(filteredReports);
}

function filterRecordsByType(type) {
  switchTab('records');
  const typeSelect = document.getElementById('filter-type');
  if (typeSelect) {
    typeSelect.value = type;
    filterRecords();
  }
}

function sortRecords(criteria) {
  if (criteria === 'date_desc') {
    filteredReports.sort((a, b) => new Date(b.reportDateTime || b.reportDate) - new Date(a.reportDateTime || a.reportDate));
  } else if (criteria === 'defect_desc') {
    filteredReports.sort((a, b) => (b.defectQty || 0) - (a.defectQty || 0));
  }
  renderRecordsTable(filteredReports);
  renderRecordsCards(filteredReports);
}

function renderRecordsTable(reports) {
  const tbody = document.getElementById('records-table-body');
  const empty = document.getElementById('records-table-empty');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (reports.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  reports.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50/80 transition";

    const isInternal = r.reportType === 'internal';
    const typeBadge = isInternal
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700"><i class="fa-solid fa-wrench mr-1"></i> ภายใน</span>`
      : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"><i class="fa-solid fa-truck-fast mr-1"></i> งานหลุด</span>`;

    const machineBadgeClass = r.machineGroup === 'TONGTAI' ? 'badge-tongtai' : (r.machineGroup === 'ROUTER_VIA' ? 'badge-router-via' : 'bg-slate-100 text-slate-700');
    const statusBadge = getStatusBadge(r.status);
    const photoCount = (r.photos || []).length;
    const photoThumb = photoCount > 0
      ? `<button onclick="openReportPhoto('${r.id}', 0)" class="relative group cursor-pointer inline-block">
          <img src="${r.photos[0].dataUrl}" class="w-8 h-8 rounded-lg object-cover border border-slate-200">
          <span class="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">${photoCount}</span>
         </button>`
      : `<span class="text-slate-300">-</span>`;

    tr.innerHTML = `
      <td class="px-4 py-3 whitespace-nowrap">
        <div class="font-semibold text-slate-800">${r.reportDate || '-'}</div>
        <div class="text-[10px] text-slate-400">${r.shift || '-'}</div>
      </td>
      <td class="px-3 py-3 whitespace-nowrap">
        ${typeBadge}
        ${!isInternal && r.escapedTo ? `<div class="text-[9px] text-amber-700 mt-0.5 font-medium">ตรวจพบ: ${escapeHtml(r.escapedTo.split('(')[0])}</div>` : ''}
      </td>
      <td class="px-3 py-3 whitespace-nowrap">
        <span class="px-2 py-0.5 rounded-lg text-xs font-bold ${machineBadgeClass}">${escapeHtml(r.machineName || '-')}</span>
      </td>
      <td class="px-4 py-3">
        <div class="font-bold text-slate-800 max-w-xs truncate cursor-pointer hover:text-blue-600" onclick="viewReportDetail('${r.id}')">${escapeHtml(r.title || '-')}</div>
        <div class="text-[11px] text-slate-500 max-w-xs truncate">${escapeHtml(r.problemCategory || '-')}</div>
      </td>
      <td class="px-3 py-3 whitespace-nowrap">
        <div class="font-medium text-slate-700">${escapeHtml(r.lotNo || '-')}</div>
        <div class="text-[10px] text-slate-400">${escapeHtml(r.partNo || '-')}</div>
        ${r.modelSerial ? `<div class="text-[10px] text-slate-400">S/N: ${escapeHtml(r.modelSerial)}</div>` : ''}
      </td>
      <td class="px-3 py-3 text-center whitespace-nowrap">
        <span class="font-bold ${r.defectQty > 0 ? 'text-red-600' : 'text-slate-500'}">${r.defectQty || 0}</span>
        ${r.defectRate > 0 ? `<div class="text-[10px] text-slate-400">${r.defectRate}%</div>` : ''}
      </td>
      <td class="px-3 py-3 text-center whitespace-nowrap">
        ${photoThumb}
      </td>
      <td class="px-3 py-3 whitespace-nowrap">
        ${statusBadge}
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <div class="flex items-center justify-end space-x-1.5">
          <button onclick="viewReportDetail('${r.id}')" class="icon-btn sm view" title="ดูรายละเอียดฉบับเต็ม">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button onclick="printSingleReport('${r.id}')" class="icon-btn sm print" title="พิมพ์ใบรายงาน 8D (PDF)">
            <i class="fa-solid fa-print"></i>
          </button>
          <button onclick="editReport('${r.id}')" class="icon-btn sm edit" title="แก้ไขข้อมูล">
            <i class="fa-solid fa-pen-to-square text-xs"></i>
          </button>
          <button onclick="deleteReport('${r.id}')" class="icon-btn sm del" title="ลบรายงาน">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRecordsCards(reports) {
  const container = document.getElementById('records-cards-container');
  if (!container) return;

  container.innerHTML = '';
  if (reports.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-slate-400 bg-white rounded-2xl p-6 border border-slate-200">ไม่พบรายงานตามที่ค้นหา</div>`;
    return;
  }

  reports.forEach(r => {
    const card = document.createElement('div');
    card.className = "bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3";

    const isInternal = r.reportType === 'internal';
    const typeBadge = isInternal
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">ภายในแผนก</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">งานหลุดออกไป</span>`;

    const photosHtml = (r.photos || []).slice(0, 4).map((p, i) => `
      <img src="${p.dataUrl}" alt="${escapeHtml(p.caption || '')}" class="w-14 h-14 rounded-lg object-cover border border-slate-200 cursor-pointer" onclick="openReportPhoto('${r.id}', ${i})">
    `).join('');

    card.innerHTML = `
      <div class="flex items-start justify-between">
        <div class="flex items-center space-x-2">
          ${typeBadge}
          <span class="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">${escapeHtml(r.machineName)}</span>
        </div>
        <span class="text-[10px] text-slate-400">${r.reportDate || ''} (${r.shift || ''})</span>
      </div>

      <div class="flex items-start space-x-3">
        <div class="flex-1 min-w-0">
          <h4 class="text-xs font-bold text-slate-800 truncate cursor-pointer hover:text-blue-600" onclick="viewReportDetail('${r.id}')">${escapeHtml(r.title)}</h4>
          <p class="text-[11px] text-slate-500 line-clamp-2 mt-0.5">${escapeHtml(r.description || r.problemCategory)}</p>
          
          <div class="mt-2 flex items-center space-x-3 text-[11px] text-slate-600">
            ${r.lotNo ? `<span>Lot: <strong>${escapeHtml(r.lotNo)}</strong></span>` : ''}
            ${r.modelSerial ? `<span>S/N: <strong>${escapeHtml(r.modelSerial)}</strong></span>` : ''}
            <span>เสีย: <strong class="text-red-600">${r.defectQty || 0} ชิ้น</strong></span>
          </div>
        </div>
      </div>

      ${photosHtml ? `<div class="flex flex-wrap gap-2">${photosHtml}</div>` : ''}

      <div class="flex items-center justify-between pt-2 border-t border-slate-100">
        <div>${getStatusBadge(r.status)}</div>
        <div class="flex items-center space-x-1">
          <button onclick="viewReportDetail('${r.id}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 text-xs font-medium">ดูรายละเอียด</button>
          <button onclick="printSingleReport('${r.id}')" class="icon-btn xs print" title="พิมพ์"><i class="fa-solid fa-print"></i></button>
          <button onclick="editReport('${r.id}')" class="icon-btn xs edit" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
          <button onclick="deleteReport('${r.id}')" class="icon-btn xs del" title="ลบ"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function getStatusBadge(status) {
  switch (status) {
    case 'open':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700"><span class="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></span> รอดำเนินการ</span>`;
    case 'in_progress':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700"><span class="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></span> กำลังแก้ไข</span>`;
    case 'resolved':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span> แก้ไขเสร็จสิ้น</span>`;
    case 'closed':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700"><span class="w-1.5 h-1.5 rounded-full bg-slate-500 mr-1.5"></span> ปิดเคส</span>`;
    default:
      return `<span class="text-xs text-slate-400">-</span>`;
  }
}

// ================= CALENDAR VIEW LOGIC =================
function setupCalendar(date) {
  currentCalendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
  renderCalendar();
}

function changeMonth(delta) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
  renderCalendar();
}

function goToCurrentMonth() {
  currentCalendarDate = new Date();
  currentCalendarDate.setDate(1);
  renderCalendar();
}

function renderCalendar() {
  const monthYearLabel = document.getElementById('calendar-month-year');
  if (!monthYearLabel) return;

  const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  setText('calendar-month-year', `${thaiMonths[month]} ${year + 543} (${year})`);

  const grid = document.getElementById('calendar-days-grid');
  if (grid) grid.innerHTML = '';

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  // Create Date lookup map
  const dateMap = {};
  allReports.forEach(r => {
    if (!r.reportDate) return;
    if (!dateMap[r.reportDate]) {
      dateMap[r.reportDate] = { internal: 0, escaped: 0, list: [] };
    }
    if (r.reportType === 'internal') dateMap[r.reportDate].internal++;
    else dateMap[r.reportDate].escaped++;
    dateMap[r.reportDate].list.push(r);
  });

  const todayStr = localDateString();

  // 1. Previous month blank days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const prevDayNum = prevMonthDays - i;
    const cell = document.createElement('div');
    cell.className = "calendar-day bg-slate-50/50 rounded-xl p-1.5 text-slate-300 text-xs border border-slate-100 flex flex-col justify-between opacity-50";
    cell.innerHTML = `<span>${prevDayNum}</span>`;
    grid.appendChild(cell);
  }

  // 2. Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const incidentData = dateMap[dateStr];
    const isToday = dateStr === todayStr;
    const isSelected = selectedDateForCalendar === dateStr;

    const cell = document.createElement('div');
    cell.className = `calendar-day rounded-xl p-1.5 sm:p-2 text-xs border border-slate-200/80 flex flex-col justify-between cursor-pointer transition ${isToday ? 'today font-bold text-emerald-800' : 'bg-white text-slate-700'} ${isSelected ? 'selected' : ''}`;
    cell.onclick = () => selectCalendarDate(dateStr, incidentData?.list || []);

    let badgeHtml = '';
    if (incidentData) {
      badgeHtml = `
        <div class="flex flex-col sm:flex-row items-center gap-1 mt-1">
          ${incidentData.internal > 0 ? `<span class="bg-red-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold" title="${incidentData.internal} ปัญหาภายใน">${incidentData.internal}</span>` : ''}
          ${incidentData.escaped > 0 ? `<span class="bg-amber-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold" title="${incidentData.escaped} งานหลุด">${incidentData.escaped}</span>` : ''}
        </div>
      `;
    }

    cell.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="${isToday ? 'bg-emerald-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[11px]' : ''}">${day}</span>
        ${isToday ? '<span class="text-[9px] text-emerald-600 font-normal hidden sm:inline">วันนี้</span>' : ''}
      </div>
      ${badgeHtml}
    `;

    grid.appendChild(cell);
  }

  if (selectedDateForCalendar) {
    selectCalendarDate(selectedDateForCalendar, dateMap[selectedDateForCalendar]?.list || []);
  }
}

function selectCalendarDate(dateStr, reports) {
  selectedDateForCalendar = dateStr;
  
  document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));

  setText('calendar-selected-date-label', dateStr);

  const listContainer = document.getElementById('calendar-date-reports-list');
  if (!listContainer) return;

  if (reports.length === 0) {
    if (listContainer) listContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">ไม่มีรายงานปัญหาในวันที่ ${dateStr}</p>`;
    return;
  }

  listContainer.innerHTML = '';
  reports.forEach(r => {
    const isInternal = r.reportType === 'internal';
    const item = document.createElement('div');
    item.className = "p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-blue-50/50 transition cursor-pointer flex items-center justify-between";
    item.onclick = () => viewReportDetail(r.id);
    item.innerHTML = `
      <div class="flex items-center space-x-3">
        <div class="w-8 h-8 rounded-lg ${isInternal ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'} flex items-center justify-center text-xs font-bold">
          ${isInternal ? '<i class="fa-solid fa-wrench"></i>' : '<i class="fa-solid fa-truck-fast"></i>'}
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold text-slate-800">${escapeHtml(r.machineName)}</span>
            <span class="text-[10px] text-slate-500">${r.shift || ''}</span>
          </div>
          <p class="text-xs text-slate-600 font-medium truncate">${escapeHtml(r.title)}</p>
        </div>
      </div>
      <div class="text-right">
        <span class="text-xs font-bold text-red-600">${r.defectQty || 0} NG</span>
        <div class="mt-0.5">${getStatusBadge(r.status)}</div>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

function quickAddForSelectedDate() {
  switchTab('form');
  if (selectedDateForCalendar) {
    const dtInput = document.getElementById('reportDateTime');
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    dtInput.value = `${selectedDateForCalendar}T${hours}:${minutes}`;
  }
}

// ================= MODAL: VIEW FULL REPORT DETAILS =================
function viewReportDetail(id) {
  const report = allReports.find(r => r.id === id);
  if (!report) return;

  const modal = document.getElementById('modal-view-detail');
  const typeBadge = document.getElementById('modal-type-badge');
  const titleEl = document.getElementById('modal-title');
  const contentEl = document.getElementById('modal-detail-content');
  if (!modal || !contentEl) return;

  const isInternal = report.reportType === 'internal';
  setText('modal-type-badge', isInternal ? 'ปัญหาภายในแผนก ROUTER' : 'งานหลุดออกไปจากแผนก (Escaped)');
  if (typeBadge) {
    typeBadge.className = isInternal
      ? 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white'
      : 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white';
  }

  setText('modal-title', `${report.machineName} - ${report.title}`);

  const photos = report.photos || [];
  const photoGalleryHtml = photos.length > 0 ? `
    <div class="space-y-2 pt-3 border-t border-slate-200">
      <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
        <i class="fa-solid fa-images text-blue-600"></i>
        <span>รูปภาพประกอบรายงาน (${photos.length} รูป) - คลิกเพื่อดูภาพขยาย</span>
      </h4>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        ${photos.map((p, i) => `
          <div class="relative rounded-xl overflow-hidden border border-slate-200 group cursor-pointer" onclick="openReportPhoto('${report.id}', ${i})">
            <img src="${p.dataUrl}" class="w-full h-28 object-cover group-hover:scale-105 transition duration-200">
            <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs">
              <i class="fa-solid fa-magnifying-glass-plus"></i>
            </div>
            ${p.caption ? `<div class="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 truncate">${escapeHtml(p.caption)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  contentEl.innerHTML = `
    <!-- Top Summary Metadata -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
      <div>
        <span class="text-[10px] text-slate-400 uppercase font-semibold block">เครื่องจักร</span>
        <span class="text-sm font-bold text-blue-700">${escapeHtml(report.machineName)}</span>
      </div>
      <div>
        <span class="text-[10px] text-slate-400 uppercase font-semibold block">วัน/เวลา & กะ</span>
        <span class="text-xs font-semibold text-slate-800">${report.reportDateTime || report.reportDate}</span>
        <span class="text-[10px] text-slate-500 block">${report.shift || ''}</span>
      </div>
      <div>
        <span class="text-[10px] text-slate-400 uppercase font-semibold block">ระดับความรุนแรง</span>
        <span class="text-xs font-bold">${report.severity || 'ปานกลาง'}</span>
      </div>
      <div>
        <span class="text-[10px] text-slate-400 uppercase font-semibold block">สถานะ</span>
        <div class="mt-0.5">${getStatusBadge(report.status)}</div>
      </div>
    </div>

    <!-- Production Job Info -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
      <div>
        <span class="text-[10px] text-blue-700 font-semibold block">หมายเลข Lot</span>
        <span class="text-xs font-bold text-slate-800">${escapeHtml(report.lotNo || '-')}</span>
      </div>
      <div>
        <span class="text-[10px] text-blue-700 font-semibold block">รหัสชิ้นงาน (P/N)</span>
        <span class="text-xs font-bold text-slate-800">${escapeHtml(report.partNo || '-')}</span>
      </div>
      <div>
        <span class="text-[10px] text-blue-700 font-semibold block">รุ่นซีเรียล (Model Serial)</span>
        <span class="text-xs font-bold text-slate-800">${escapeHtml(report.modelSerial || '-')}</span>
      </div>
      <div>
        <span class="text-[10px] text-blue-700 font-semibold block">จำนวนงานใน Lot</span>
        <span class="text-xs font-bold text-slate-800">${report.totalQty || 0} ชิ้น</span>
      </div>
      <div>
        <span class="text-[10px] text-blue-700 font-semibold block">จำนวนงานเสีย / หลุด</span>
        <span class="text-xs font-bold text-red-600">${report.defectQty || 0} ชิ้น (${report.defectRate || 0}%)</span>
      </div>
    </div>

    ${!isInternal ? `
      <!-- Escaped Defect Details -->
      <div class="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
        <h4 class="text-xs font-bold text-amber-900 flex items-center space-x-1.5">
          <i class="fa-solid fa-truck-fast text-amber-600"></i>
          <span>รายละเอียดการหลุดออกไปจากแผนก ROUTER</span>
        </h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div>
            <span class="text-slate-500 block text-[10px]">แผนกที่ตรวจพบ:</span>
            <strong class="text-slate-800">${escapeHtml(report.escapedTo || '-')}</strong>
          </div>
          <div>
            <span class="text-slate-500 block text-[10px]">สาเหตุที่หลุดการตรวจเช็คใน ROUTER:</span>
            <strong class="text-slate-800">${escapeHtml(report.escapedRootCause || '-')}</strong>
          </div>
          <div class="sm:col-span-2">
            <span class="text-slate-500 block text-[10px]">การกักกันงานทันที (Containment):</span>
            <strong class="text-amber-900">${escapeHtml(report.containmentAction || '-')}</strong>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Description & Analysis -->
    <div class="space-y-3">
      <div>
        <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">รายละเอียดอาการของปัญหา</h4>
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap">${escapeHtml(report.description || '-')}</div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">สาเหตุที่ตรวจพบ (Root Cause)</h4>
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap">${escapeHtml(report.rootCause || '-')}</div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">การแก้ไขและมาตรการป้องกัน (CAPA)</h4>
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap">${escapeHtml(report.correctiveAction || '-')}</div>
        </div>
      </div>
    </div>

    <!-- Sign-off & Reporter Info -->
    <div class="flex items-center justify-between pt-3 border-t border-slate-200 text-xs text-slate-500">
      <div>
        <span>ผู้บันทึกรายงาน: </span>
        <strong class="text-slate-800">${escapeHtml(report.reporterName || '-')}</strong>
      </div>
      <div>
        <span>หัวหน้างาน (Supervisor): </span>
        <strong class="text-slate-800">${escapeHtml(report.supervisorName || '-')}</strong>
      </div>
    </div>

    <!-- Photo Gallery -->
    ${photoGalleryHtml}
  `;

  modal.classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('modal-view-detail').classList.add('hidden');
}

// ================= PRINT & PDF EXPORT (8D INCIDENT SHEET) =================
function printSingleTicketPDF() {
  const modal = document.getElementById('modal-view-detail');
  const reportTitle = document.getElementById('modal-title')?.textContent || '';
  
  const report = allReports.find(r => reportTitle.includes(r.machineName) && reportTitle.includes(r.title));
  if (report) {
    printSingleReport(report.id);
  }
}

// Lazily create the off-screen container that the A4 print/PDF report renders into.
function ensurePrintContainer() {
  let el = document.getElementById('printable-report-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'printable-report-container';
    el.className = 'hidden';
    document.body.appendChild(el);
  }
  return el;
}

function printSingleReport(id) {
  const report = allReports.find(r => r.id === id);
  if (!report) return;

  const isInternal = report.reportType === 'internal';
  const photos = report.photos || [];
  const container = ensurePrintContainer();

  container.innerHTML = `
    <div class="print-page print-one-page font-sans text-slate-800">
      
      <!-- Report Header -->
      <div class="border-b-2 border-slate-800 pb-3 mb-4 flex justify-between items-center">
        <div>
          <h1 class="text-xl font-black tracking-tight text-slate-900">ROUTER INCIDENT & DEFECT REPORT</h1>
          <h2 class="text-sm font-semibold text-blue-800">ใบรายงานปัญหาและการแก้ไขข้อบกพร่อง แผนก ROUTER</h2>
        </div>
        <div class="text-right text-xs">
          <div class="font-bold text-slate-800">เลขที่เอกสาร: #${report.id.substr(0, 10).toUpperCase()}</div>
          <div class="text-slate-500">วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH')}</div>
        </div>
      </div>

      <!-- Main Metadata Table -->
      <table class="w-full text-xs border-collapse border border-slate-400 mb-4">
        <colgroup>
          <col style="width:22%"><col style="width:28%"><col style="width:22%"><col style="width:28%">
        </colgroup>
        <tr class="bg-slate-100">
          <th class="border border-slate-300 p-2 text-left">ประเภทรายงาน:</th>
          <td class="border border-slate-300 p-2 font-bold ${isInternal ? 'text-red-700' : 'text-amber-800'}">
            ${isInternal ? '🔴 ปัญหาภายในแผนก ROUTER' : '⚠️ ปัญหาที่งานหลุดออกไปจากแผนก'}
          </td>
          <th class="border border-slate-300 p-2 text-left">เครื่องจักร (Machine):</th>
          <td class="border border-slate-300 p-2 font-bold text-blue-800">${escapeHtml(report.machineName)}</td>
        </tr>
        <tr>
          <th class="border border-slate-300 p-2 text-left">วัน/เวลาที่เกิดเหตุ:</th>
          <td class="border border-slate-300 p-2">${report.reportDateTime || report.reportDate}</td>
          <th class="border border-slate-300 p-2 text-left">กะการทำงาน (Shift):</th>
          <td class="border border-slate-300 p-2">${report.shift || '-'}</td>
        </tr>
        <tr class="bg-slate-50">
          <th class="border border-slate-300 p-2 text-left">หมายเลข Lot (Lot No.):</th>
          <td class="border border-slate-300 p-2 font-semibold">${escapeHtml(report.lotNo || '-')}</td>
          <th class="border border-slate-300 p-2 text-left">รหัสชิ้นงาน (Part No.):</th>
          <td class="border border-slate-300 p-2 font-semibold">${escapeHtml(report.partNo || '-')}</td>
        </tr>
        <tr>
          <th class="border border-slate-300 p-2 text-left">รุ่นซีเรียล (Model Serial):</th>
          <td class="border border-slate-300 p-2 font-semibold" colspan="3">${escapeHtml(report.modelSerial || '-')}</td>
        </tr>
        <tr>
          <th class="border border-slate-300 p-2 text-left">จำนวนงานทั้งหมด (Lot Qty):</th>
          <td class="border border-slate-300 p-2">${report.totalQty || 0} ชิ้น</td>
          <th class="border border-slate-300 p-2 text-left">จำนวนงานเสีย/หลุด (NG Qty):</th>
          <td class="border border-slate-300 p-2 font-bold text-red-600">${report.defectQty || 0} ชิ้น (${report.defectRate || 0}%)</td>
        </tr>
        <tr class="bg-slate-50">
          <th class="border border-slate-300 p-2 text-left">หมวดหมู่ของปัญหา:</th>
          <td class="border border-slate-300 p-2" colspan="3">${escapeHtml(report.problemCategory || '-')}</td>
        </tr>
      </table>

      ${!isInternal ? `
        <!-- Escaped Details Box -->
        <div class="mb-4 p-3 bg-amber-50 border border-amber-300 rounded text-xs space-y-1">
          <div class="font-bold text-amber-900">รายละเอียดงานหลุดออกไปนอกแผนก (Escaped Defect):</div>
          <div>• ตรวจพบที่แผนก: <strong>${escapeHtml(report.escapedTo || '-')}</strong></div>
          <div>• สาเหตุที่หลุดการตรวจใน ROUTER: <strong>${escapeHtml(report.escapedRootCause || '-')}</strong></div>
          <div>• การกักกันงานทันที (Containment): <strong>${escapeHtml(report.containmentAction || '-')}</strong></div>
        </div>
      ` : ''}

      <!-- Problem Title & Symptoms -->
      <div class="mb-3">
        <h3 class="text-xs font-bold uppercase text-slate-800 bg-slate-200 p-1.5 border border-slate-300">
          1. รายละเอียดอาการของปัญหา (Problem Description & Symptoms): ${escapeHtml(report.title)}
        </h3>
        <div class="p-2.5 border border-slate-300 border-t-0 text-xs whitespace-pre-wrap leading-relaxed">
          ${escapeHtml(report.description || '-')}
        </div>
      </div>

      <!-- Root Cause Analysis -->
      <div class="mb-3">
        <h3 class="text-xs font-bold uppercase text-slate-800 bg-slate-200 p-1.5 border border-slate-300">
          2. การวิเคราะห์สาเหตุของปัญหา (Root Cause Analysis)
        </h3>
        <div class="p-2.5 border border-slate-300 border-t-0 text-xs whitespace-pre-wrap leading-relaxed">
          ${escapeHtml(report.rootCause || '-')}
        </div>
      </div>

      <!-- Corrective & Preventive Action -->
      <div class="mb-4">
        <h3 class="text-xs font-bold uppercase text-slate-800 bg-slate-200 p-1.5 border border-slate-300">
          3. การแก้ไขและมาตรการป้องกันการเกิดซ้ำ (Corrective & Preventive Action)
        </h3>
        <div class="p-2.5 border border-slate-300 border-t-0 text-xs whitespace-pre-wrap leading-relaxed">
          ${escapeHtml(report.correctiveAction || '-')}
        </div>
      </div>

      <!-- Attached Photos Grid (Photographic Evidence) -->
      ${photos.length > 0 ? `
        <div class="mb-5 page-break-inside-avoid">
          <h3 class="text-xs font-bold uppercase text-slate-800 bg-slate-200 p-1.5 border border-slate-300">
            4. ภาพถ่ายหลักฐานประกอบรายงาน (Photographic Evidence)
          </h3>
          <div class="print-image-grid grid grid-cols-2 gap-3 p-3 border border-slate-300 border-t-0 photo-count-${photos.length}">
            ${photos.map((p, idx) => `
              <div class="print-image-item border border-slate-300 p-1 rounded bg-slate-50">
                <img src="${p.dataUrl}" class="w-full">
                <div class="text-[10px] text-center text-slate-600 mt-1">รูปที่ ${idx + 1}: ${escapeHtml(p.caption || p.name || 'รูปความเสียหาย')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Sign-off Block -->
      <div class="mt-6 border border-slate-400 p-3 bg-slate-50 page-break-inside-avoid">
        <div class="grid grid-cols-3 gap-4 text-center text-xs">
          <div class="space-y-6">
            <span class="block font-semibold">ผู้รายงาน (Reporter)</span>
            <div class="border-b border-dashed border-slate-400 w-3/4 mx-auto"></div>
            <span class="block text-slate-600">(${escapeHtml(report.reporterName || '...............................')})</span>
            <span class="block text-[10px] text-slate-400">วันที่: ......./......./.......</span>
          </div>

          <div class="space-y-6">
            <span class="block font-semibold">หัวหน้างาน (Supervisor)</span>
            <div class="border-b border-dashed border-slate-400 w-3/4 mx-auto"></div>
            <span class="block text-slate-600">(${escapeHtml(report.supervisorName || '...............................')})</span>
            <span class="block text-[10px] text-slate-400">วันที่: ......./......./.......</span>
          </div>

          <div class="space-y-6">
            <span class="block font-semibold">ผู้จัดการแผนก (Manager)</span>
            <div class="border-b border-dashed border-slate-400 w-3/4 mx-auto"></div>
            <span class="block text-slate-600">(...............................................)</span>
            <span class="block text-[10px] text-slate-400">วันที่: ......./......./.......</span>
          </div>
        </div>
      </div>

    </div>
  `;

  Swal.fire({
    title: 'เลือกรูปแบบการส่งออก',
    text: `รายงาน: ${report.machineName} - ${report.title}`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#2563eb',
    cancelButtonColor: '#10b981',
    confirmButtonText: 'ดาวน์โหลดเป็น PDF ทันที',
    cancelButtonText: 'เปิดหน้าต่างพิมพ์ (Print)'
  }).then((res) => {
    const element = container.querySelector('.print-page');
    if (res.isConfirmed) {
      // Wait for photos, then shrink the sheet so its whole content lands on
      // exactly one A4 page before html2pdf captures it.
      waitForImages(element, () => {
        fitSheetToOnePage(element, 'canvas');
        const opt = {
          margin: 0,
          filename: `ROUTER_Report_${report.machineName}_${report.reportDate || 'ticket'}.pdf`,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['.print-image-item', '.page-break-inside-avoid'] }
        };
        html2pdf().set(opt).from(element).save();
      });
    } else if (res.dismiss === Swal.DismissReason.cancel) {
      // Phones ignore @page size/margin and stamp the page URL on the paper,
      // so on mobile we emit a real A4 PDF instead of the print dialog.
      const useMobilePdf = isMobileDevice() && window.html2pdf;
      // Wait for photos to load, then scale down if the sheet is taller than A4.
      waitForImages(element, () => {
        if (useMobilePdf) {
          fitSheetToOnePage(element, 'canvas');
          const opt = {
            margin: 0,
            filename: `ROUTER_Report_${report.machineName}_${report.reportDate || 'ticket'}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'], avoid: ['.print-image-item', '.page-break-inside-avoid'] }
          };
          html2pdf().set(opt).from(element).save();
        } else {
          fitSheetToOnePage(element);
          window.print();
        }
      });
    }
  });
}

// True on phones/tablets, where the native print dialog cannot honour A4.
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
}

// Scale a print sheet down (uniformly) so it fits inside one A4 page.
// A4 height is 297mm; at 96dpi that is 1122.5px. We scale only when needed,
// and cap the shrink so text never becomes unreadably small.
//   mode 'print'  -> CSS zoom (affects pagination in the browser print engine)
//   mode 'canvas' -> transform scale (reliably captured by html2canvas/html2pdf)
function fitSheetToOnePage(sheetEl, mode = 'print') {
  if (!sheetEl) return;
  const A4_HEIGHT_PX = 1122.5;
  sheetEl.style.zoom = '';
  sheetEl.style.transform = '';
  sheetEl.style.transformOrigin = 'top left';
  sheetEl.style.height = '';
  sheetEl.style.width = '210mm';

  const natural = sheetEl.scrollHeight;
  if (natural <= A4_HEIGHT_PX) return; // already fits on one page

  const scale = Math.max(0.6, A4_HEIGHT_PX / natural);

  if (mode === 'canvas') {
    // html2canvas reads transforms; keep the visible width at 210mm by
    // widening the unscaled box so scale() brings it back down.
    sheetEl.style.width = (210 / scale) + 'mm';
    sheetEl.style.transform = `scale(${scale})`;
    // Collapse the reserved box height so no blank second page is captured.
    sheetEl.style.height = (natural * scale) + 'px';
  } else {
    // `zoom` shrinks layout size for the browser print engine.
    sheetEl.style.width = (210 / scale) + 'mm';
    sheetEl.style.zoom = String(scale);
  }
}

// Run a callback once every <img> inside the element has finished loading
// (or after a short timeout), so measurements are accurate before printing.
function waitForImages(rootEl, done) {
  const imgs = Array.from(rootEl.querySelectorAll('img'));
  let remaining = imgs.length;
  let finished = false;
  const finish = () => { if (!finished) { finished = true; done(); } };

  if (remaining === 0) { finish(); return; }
  const timer = setTimeout(finish, 2500);
  imgs.forEach(img => {
    if (img.complete) {
      remaining -= 1;
      if (remaining === 0) { clearTimeout(timer); finish(); }
    } else {
      img.addEventListener('load', () => { remaining -= 1; if (remaining === 0) { clearTimeout(timer); finish(); } }, { once: true });
      img.addEventListener('error', () => { remaining -= 1; if (remaining === 0) { clearTimeout(timer); finish(); } }, { once: true });
    }
  });
}

// ================= EXCEL EXPORT (QUICK EXPORT FROM RECORDS LIST) =================
function exportFilteredExcel() {
  exportToExcelData(filteredReports, 'ROUTER_Filtered_Reports.xlsx');
}

function exportToExcelData(dataList, fileName) {
  const rows = dataList.map((r, i) => ({
    "ลำดับ": i + 1,
    "รหัสรายงาน": r.id,
    "ประเภท": r.reportType === 'internal' ? 'ปัญหาภายใน ROUTER' : 'งานหลุดออกไปจากแผนก',
    "เครื่องจักร": r.machineName || '',
    "กลุ่มเครื่องจักร": r.machineGroup || '',
    "วัน/เวลาเกิดเหตุ": r.reportDateTime || r.reportDate || '',
    "กะการทำงาน": r.shift || '',
    "หัวข้อปัญหา": r.title || '',
    "หมวดหมู่ปัญหา": r.problemCategory || '',
    "หมายเลข Lot": r.lotNo || '',
    "รหัสชิ้นงาน (P/N)": r.partNo || '',
    "รุ่นซีเรียล (Model Serial)": r.modelSerial || '',
    "จำนวนงานทั้งหมด (Pcs)": r.totalQty || 0,
    "จำนวนงานเสีย/หลุด (NG)": r.defectQty || 0,
    "อัตรางานเสีย (%)": r.defectRate || 0,
    "แผนกที่พบงานหลุด": r.escapedTo || '',
    "สาเหตุที่หลุดการตรวจ": r.escapedRootCause || '',
    "การกักกันงาน": r.containmentAction || '',
    "รายละเอียดอาการ": r.description || '',
    "สาเหตุที่ตรวจพบ": r.rootCause || '',
    "การแก้ไขและป้องกัน": r.correctiveAction || '',
    "ระดับความรุนแรง": r.severity || '',
    "สถานะ": r.status || '',
    "ผู้รายงาน": r.reporterName || '',
    "หัวหน้างาน": r.supervisorName || '',
    "จำนวนรูปภาพแนบ": (r.photos || []).length
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ROUTER_Reports");
  XLSX.writeFile(workbook, fileName);

  Swal.fire({
    icon: 'success',
    title: 'ส่งออกไฟล์ Excel สำเร็จ',
    text: `ส่งออกทั้งหมด ${rows.length} รายการ`,
    timer: 2000,
    showConfirmButton: false
  });
}

// ================= NAVIGATION & TAB SWITCHING =================
function switchTab(tab) {
  currentTab = tab;

  const views = ['dashboard', 'form', 'records', 'calendar'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      if (v === tab) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  // Vertical mode switcher highlight (same as โหมด 2)
  document.querySelectorAll('.mode-nav .tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));

  // Tab-specific data refresh
  if (tab === 'dashboard') {
    applyDashboardFilter();
  } else if (tab === 'records') {
    filterRecords();
  } else if (tab === 'calendar') {
    renderCalendar();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Attach the vertical mode switcher (buttons use data-tab, like โหมด 2)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.mode-nav .tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  const current = document.querySelector('.mode-nav .tab.active');
  if (current && current.dataset.tab) switchTab(current.dataset.tab);
});

function updateBadgeCounts() {
  setText('badge-count', allReports.length);
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
