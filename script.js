// <!-- FIRESTORE INTEGRATION MODULE (UUID, NAME, ROLE) -->
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBnS3btV2W6hNnwl3FjsjgKZj0ynyVLi7E",
  authDomain: "khedma-b800a.firebaseapp.com",
  projectId: "khedma-b800a",
  storageBucket: "khedma-b800a.firebasestorage.app",
  messagingSenderId: "129133198805",
  appId: "1:129133198805:web:a68249fe77d1b44d5bd15c",
  measurementId: "G-CT6GRSTSTV",
};

// Initialize Firebase & Firestore
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// Collections References
const usersColl = collection(db, "users");
const datesColl = collection(db, "dates");
const attendanceColl = collection(db, "attendance");

let state = { users: [], dates: [], attendance: {} };
let currentUser = null;
let activeTab = "tracker";

// Helper to generate UUID v4
function generateUUID() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : "id_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

// -------------------------------------------------------------
// REAL-TIME LISTENERS
// -------------------------------------------------------------
let loadedCount = 0;
function markLoaded() {
  loadedCount++;
  if (loadedCount >= 3) {
    // Ensure default admin user exists
    if (!state.users.some((u) => u.name.toLowerCase() === "admin")) {
      const adminId = generateUUID();
      setDoc(doc(usersColl, adminId), {
        id: adminId,
        name: "Admin",
        role: "admin",
        createdAt: new Date().toISOString(),
      });
    }
    refreshCurrentView();
  }
}

// 1. Listen to Users Collection
onSnapshot(
  usersColl,
  (snapshot) => {
    state.users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    refreshCurrentView();
    if (loadedCount < 3) markLoaded();
  },
  (err) => console.error("Users sync error:", err),
);

// 2. Listen to dates Collection
onSnapshot(
  datesColl,
  (snapshot) => {
    state.dates = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.date.localeCompare(b.date));
    refreshCurrentView();
    if (loadedCount < 3) markLoaded();
  },
  (err) => console.error("dates sync error:", err),
);

// 3. Listen to Attendance Collection
onSnapshot(
  attendanceColl,
  (snapshot) => {
    const attMap = {};
    snapshot.docs.forEach((d) => {
      const data = d.data();
      attMap[`${data.userId}||${data.sessionId}`] = data.present;
    });
    state.attendance = attMap;
    refreshCurrentView();
    if (loadedCount < 3) markLoaded();
  },
  (err) => console.error("Attendance sync error:", err),
);

// Helper Keys & Formatting
function attKey(uId, sId) {
  return uId + "||" + sId;
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return (
    d +
    " " +
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][+m - 1]
  );
}
function fmtDateLong(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return (
    d +
    " " +
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][+m - 1] +
    " " +
    y
  );
}

// -------------------------------------------------------------
// AUTHENTICATION (ADMIN ONLY)
// -------------------------------------------------------------
function doLogin() {
  const codeInput = document.getElementById("code-input");
  if (!codeInput) return;
  const nameInput = codeInput.value.trim();
  const errEl = document.getElementById("login-err");
  if (errEl) errEl.style.display = "none";

  if (!nameInput) {
    if (errEl) {
      errEl.textContent = "Please enter your admin name or ID.";
      errEl.style.display = "block";
    }
    return;
  }

  // Match either user Name or UUID
  const matchedUser = state.users.find(
    (u) =>
      u.name.toLowerCase() === nameInput.toLowerCase() || u.id === nameInput,
  );

  if (!matchedUser) {
    if (errEl) {
      errEl.innerHTML = '⚠ User "<b>' + nameInput + '</b>" not found in system.';
      errEl.style.display = "block";
    }
    return;
  }

  // Strictly check for Admin role
  if (matchedUser.role !== "admin") {
    if (errEl) {
      errEl.innerHTML =
        "Access denied. Only <b>Admins</b> are allowed to log in.";
      errEl.style.display = "block";
    }
    return;
  }

  currentUser = matchedUser;
  document.getElementById("login-page").style.display = "none";
  document.getElementById("app-page").classList.add("visible");
  document.getElementById("nav-user").textContent =
    `${matchedUser.name} (${matchedUser.role})`;
  renderTracker();
}

function signOut() {
  currentUser = null;
  document.getElementById("login-page").style.display = "flex";
  document.getElementById("app-page").classList.remove("visible");
  const codeInput = document.getElementById("code-input");
  if (codeInput) codeInput.value = "";
  const errEl = document.getElementById("login-err");
  if (errEl) errEl.style.display = "none";
  
  const trackerTab = document.querySelector('.nav-tab[data-tab="tracker"]');
  if (trackerTab) switchTab("tracker", trackerTab);
}

function switchTab(name, btn) {
  activeTab = name;
  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".nav-tab")
    .forEach((b) => b.classList.remove("active"));
  
  const targetTab = document.getElementById("tab-" + name);
  if (targetTab) targetTab.classList.add("active");
  if (btn) btn.classList.add("active");
  
  refreshCurrentView();
}

function refreshCurrentView() {
  if (!currentUser) return;
  if (activeTab === "tracker") renderTracker();
  if (activeTab === "analytics") renderAnalytics();
  if (activeTab === "status") renderStatus();
  if (activeTab === "data") renderDataTab();
}

// -------------------------------------------------------------
// TRACKER & FIRESTORE WRITE OPERATIONS
// -------------------------------------------------------------

function renderTracker() {
  const { dates } = state;
  const searchInput = document.getElementById("tracker-search");
  const q = ((searchInput && searchInput.value) || "").trim().toLowerCase();

  // 1. Exclude admins first
  const nonAdminUsers = state.users.filter((u) => u.role !== "admin");

  // 2. Filter remaining non-admin users by search query
  const users = q
    ? nonAdminUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q),
      )
    : nonAdminUsers;

  const badge = document.getElementById("filter-badge");

  if (badge) {
    if (q) {
      badge.style.display = "inline-flex";
      badge.innerHTML = `<span class="filter-info">Showing ${users.length} of ${nonAdminUsers.length} for "<b>${q}</b>" <button class="filter-clear" id="btn-clear-filter">✕</button></span>`;
      const clearBtn = document.getElementById("btn-clear-filter");
      if (clearBtn) {
        clearBtn.onclick = () => {
          if (searchInput) searchInput.value = "";
          renderTracker();
        };
      }
    } else {
      badge.style.display = "none";
    }
  }

  // Header
  let hHTML = '<tr><th class="user-id-cell">User Name</th><th>Role</th>';
  dates.forEach((s) => {
    hHTML += `<th class="th-center"><div class="date-th-wrap"><span class="date-label">${fmtDate(
      s.date,
    )}</span><button class="del-date-btn" data-session-id="${
      s.id
    }">✕</button></div></th>`;
  });
  hHTML += "<th></th></tr>";
  const headEl = document.getElementById("tracker-head");
  if (headEl) headEl.innerHTML = hHTML;

  // Body
  let bHTML = "";
  if (!nonAdminUsers.length) {
    bHTML = `<tr class="empty-row"><td colspan="${dates.length + 3}">No users yet.</td></tr>`;
  } else if (!users.length) {
    bHTML = `<tr class="empty-row"><td colspan="${dates.length + 3}">No users match "<b>${q}</b>".</td></tr>`;
  } else {
    users.forEach((u) => {
      bHTML += `<tr>
        <td class="user-id-cell"><b>${u.name}</b></td>
        <td><span class="badge ${u.role === "admin" ? "badge-success" : "filter-info"}">${u.role}</span></td>`;
      dates.forEach((s) => {
        const chk = state.attendance[attKey(u.id, s.id)] ? "checked" : "";
        bHTML += `<td class="td-center"><input type="checkbox" ${chk} data-user="${u.id}" data-session="${s.id}"></td>`;
      });
      bHTML += `<td><button class="btn-icon" data-del-user="${u.id}">✕</button></td></tr>`;
    });
  }
  const bodyEl = document.getElementById("tracker-body");
  if (bodyEl) bodyEl.innerHTML = bHTML;

  // Row Event Handlers
  document.querySelectorAll("#tracker-head .del-date-btn").forEach((btn) => {
    btn.onclick = () => removeSession(btn.getAttribute("data-session-id"));
  });
  document
    .querySelectorAll('#tracker-body input[type="checkbox"]')
    .forEach((chk) => {
      chk.onchange = (e) =>
        toggleAttendance(
          e.target.getAttribute("data-user"),
          e.target.getAttribute("data-session"),
          e.target.checked,
        );
    });
  document.querySelectorAll("#tracker-body .btn-icon").forEach((btn) => {
    btn.onclick = () => removeUser(btn.getAttribute("data-del-user"));
  });
}

// Toggle Attendance Document
async function toggleAttendance(userId, sessionId, isChecked) {
  const docId = `${userId}_${sessionId}`;
  const attRef = doc(attendanceColl, docId);
  try {
    if (isChecked) {
      await setDoc(attRef, {
        userId,
        sessionId,
        present: true,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await deleteDoc(attRef);
    }
  } catch (err) {
    showToast("Error updating attendance: " + err.message);
  }
}

// Add Session Document
async function addDate() {
  const datePicker = document.getElementById("date-picker");
  if (!datePicker || !datePicker.value) {
    showToast("Pick a date first");
    return;
  }
  const d = datePicker.value;
  if (state.dates.some((s) => s.date === d)) {
    showToast("Session date already exists");
    return;
  }

  const sessionId = generateUUID();
  try {
    await setDoc(doc(datesColl, sessionId), {
      id: sessionId,
      date: d,
      createdAt: new Date().toISOString(),
    });
    showToast("Session added: " + fmtDateLong(d));
  } catch (err) {
    showToast("Error adding session: " + err.message);
  }
}

// Delete Session Document
async function removeSession(sessionId) {
  const session = state.dates.find((s) => s.id === sessionId);
  if (!session) return;
  if (
    !confirm(
      'Remove "' +
        fmtDateLong(session.date) +
        '"? All attendance data for this session will be deleted.',
    )
  )
    return;

  try {
    await deleteDoc(doc(datesColl, sessionId));
    state.users.forEach((u) =>
      deleteDoc(doc(attendanceColl, `${u.id}_${sessionId}`)),
    );
    showToast("Session removed");
  } catch (err) {
    showToast("Error deleting session: " + err.message);
  }
}

// Add User Document with UUID, Name, and Role
async function confirmAddUser() {
  const nameEl = document.getElementById("new-user-name");
  const roleEl = document.getElementById("new-user-role");
  const errEl = document.getElementById("add-user-err");

  const name = nameEl ? nameEl.value.trim() : "";
  const role = roleEl ? roleEl.value : "user";

  if (!name) {
    if (errEl) {
      errEl.textContent = "Please enter a name.";
      errEl.style.display = "block";
    }
    return;
  }

  const userId = generateUUID();
  try {
    await setDoc(doc(usersColl, userId), {
      id: userId,
      name: name,
      role: role,
      createdAt: new Date().toISOString(),
    });
    closeAddUserModal();
    showToast("User added: " + name);
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message;
      errEl.style.display = "block";
    }
  }
}

// Delete User Document
async function removeUser(userId) {
  const user = state.users.find((u) => u.id === userId);
  if (user && user.name.toLowerCase() === "admin") {
    showToast("Cannot remove the default admin user");
    return;
  }
  if (
    !confirm(
      'Remove user "' +
        (user ? user.name : userId) +
        '"? Their data will be deleted.',
    )
  )
    return;

  try {
    await deleteDoc(doc(usersColl, userId));
    state.dates.forEach((s) =>
      deleteDoc(doc(attendanceColl, `${userId}_${s.id}`)),
    );
    showToast("User removed");
  } catch (err) {
    showToast("Error removing user: " + err.message);
  }
}

function openAddUserModal() {
  const nameEl = document.getElementById("new-user-name");
  const roleEl = document.getElementById("new-user-role");
  const errEl = document.getElementById("add-user-err");
  const modal = document.getElementById("add-user-modal");

  if (nameEl) nameEl.value = "";
  if (roleEl) roleEl.value = "user";
  if (errEl) errEl.style.display = "none";
  if (modal) modal.classList.add("open");
  if (nameEl) setTimeout(() => nameEl.focus(), 50);
}

function closeAddUserModal() {
  const modal = document.getElementById("add-user-modal");
  if (modal) modal.classList.remove("open");
}

// -------------------------------------------------------------
// ANALYTICS & STATUS TABS
// -------------------------------------------------------------

function renderAnalytics() {
  const nonAdminUsers = state.users.filter((u) => u.role !== "admin");
  const { dates } = state;
  const total = nonAdminUsers.length;
  const sessionCount = dates.length;
  let tot = 0,
    bestPct = -1,
    bestDate = "—";

  const rows = dates.map((s) => {
    const count = nonAdminUsers.filter(
      (u) => state.attendance[attKey(u.id, s.id)],
    ).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    tot += count;
    if (pct > bestPct) {
      bestPct = pct;
      bestDate = fmtDate(s.date);
    }
    return { d: s.date, count, pct };
  });

  const possible = total * sessionCount;
  const overall = possible > 0 ? Math.round((tot / possible) * 100) : 0;

  const metricsEl = document.getElementById("analytics-metrics");
  if (metricsEl) {
    metricsEl.innerHTML = `
        <div class="metric"><div class="metric-lbl">Total users</div><div class="metric-val">${total}</div></div>
        <div class="metric"><div class="metric-lbl">Dates</div><div class="metric-val">${sessionCount}</div></div>
        <div class="metric"><div class="metric-lbl">Overall rate</div><div class="metric-val">${overall}%</div><div class="metric-hint">${tot}/${possible} slots</div></div>
        <div class="metric"><div class="metric-lbl">Best session</div><div class="metric-val" style="font-size:18px">${sessionCount > 0 ? bestDate : "—"}</div>${sessionCount > 0 ? '<div class="metric-hint">' + bestPct + "% attendance</div>" : ""}</div>`;
  }

  const tbody = document.getElementById("analytics-body");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="4">No Dates yet.</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map(
      ({ d, count, pct }) => `<tr>
      <td>${fmtDateLong(d)}</td><td>${count}/${total}</td>
      <td class="td-center"><span style="font-size:13px;font-weight:500">${pct}%</span></td>
      <td style="min-width:130px"><div class="bar-row"><div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div></div></td>
    </tr>`,
    )
    .join("");
}

function renderStatus() {
  const { dates } = state,
    total = dates.length;

  // 1. Filter out admins first
  const nonAdminUsers = state.users.filter((u) => u.role !== "admin");

  const searchEl = document.getElementById("status-search");
  const q = ((searchEl && searchEl.value) || "").trim().toLowerCase();

  // 2. Filter remaining non-admin users by search query
  const filtered = q
    ? nonAdminUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q),
      )
    : nonAdminUsers;

  const tbody = document.getElementById("status-body");
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = q
      ? `<tr class="empty-row"><td colspan="4">No match for "<b>${q}</b>".</td></tr>`
      : '<tr class="empty-row"><td colspan="4">No users yet.</td></tr>';
    return;
  }

  const rows = filtered
    .map((u) => {
      const attended = dates.filter(
        (s) => state.attendance[attKey(u.id, s.id)],
      ).length;
      const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
      let bc, label;
      if (total === 0) {
        bc = "badge-info";
        label = "No dates";
      } else if (pct === 100) {
        bc = "badge-success";
        label = "✓ Full attendance";
      } else if (pct >= 75) {
        bc = "badge-success";
        label = "Good";
      } else if (pct >= 50) {
        bc = "badge-warn";
        label = "Partial";
      } else if (pct > 0) {
        bc = "badge-danger";
        label = "Low";
      } else {
        bc = "badge-danger";
        label = "Absent";
      }
      return { uName: u.name, role: u.role, attended, pct, bc, label };
    })
    .sort((a, b) => b.pct - a.pct);

  tbody.innerHTML = rows
    .map(
      ({ uName, role, attended, pct, bc, label }) => `<tr>
      <td class="user-id-cell"><b>${uName}</b> (${role})</td><td>${attended}/${total}</td>
      <style>
        .bar-row { display: flex; align-items: center; gap: 8px; }
        .bar-bg { flex: 1; background: var(--surface2); height: 6px; border-radius: 3px; overflow: hidden; }
        .bar-fill { background: var(--accent); height: 100%; }
        .pct-label { font-size: 11px; color: var(--text2); width: 32px; text-align: right; }
      </style>
      <td style="min-width:150px"><div class="bar-row"><div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div><span class="pct-label">${pct}%</span></div></td>
      <td><span class="badge ${bc}">${label}</span></td>
    </tr>`,
    )
    .join("");
}

// Data Summary
function renderDataTab() {
  const recordCount = Object.values(state.attendance).filter(Boolean).length;
  const summaryEl = document.getElementById("data-summary");
  if (summaryEl) {
    summaryEl.innerHTML = `
        👥 <b>${state.users.length}</b> users in <code>users</code> collection<br>
        📅 <b>${state.dates.length}</b> dates in <code>dates</code> collection<br>
        ✅ <b>${recordCount}</b> attendance records in <code>attendance</code> collection<br>
        ⚡ Status: 3-Collection Listener Active
      `;
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    "attendance-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Backup downloaded!");
}

// Toasts
let toastTimer;
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

// Event Listeners Binding
document.addEventListener("DOMContentLoaded", () => {
  const btnLogin = document.getElementById("btn-login");
  if (btnLogin) btnLogin.addEventListener("click", doLogin);

  const codeInput = document.getElementById("code-input");
  if (codeInput) {
    codeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });
  }

  const btnSignout = document.getElementById("btn-signout");
  if (btnSignout) btnSignout.addEventListener("click", signOut);

  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () =>
      switchTab(btn.getAttribute("data-tab"), btn),
    );
  });

  const btnAddDate = document.getElementById("btn-add-date");
  if (btnAddDate) btnAddDate.addEventListener("click", addDate);

  const btnOpenUser = document.getElementById("btn-open-add-user");
  if (btnOpenUser) btnOpenUser.addEventListener("click", openAddUserModal);

  const btnCloseModal = document.getElementById("btn-close-modal");
  if (btnCloseModal) btnCloseModal.addEventListener("click", closeAddUserModal);

  const btnConfirmUser = document.getElementById("btn-confirm-user");
  if (btnConfirmUser) btnConfirmUser.addEventListener("click", confirmAddUser);

  const trackerSearch = document.getElementById("tracker-search");
  if (trackerSearch) trackerSearch.addEventListener("input", renderTracker);

  const statusSearch = document.getElementById("status-search");
  if (statusSearch) statusSearch.addEventListener("input", renderStatus);

  const btnExport = document.getElementById("btn-export");
  if (btnExport) btnExport.addEventListener("click", exportData);

  const modal = document.getElementById("add-user-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeAddUserModal();
    });
  }

  // Init default date input
  const datePicker = document.getElementById("date-picker");
  if (datePicker) {
    datePicker.value = new Date().toISOString().split("T")[0];
  }

  // Theme Controls
  const themeToggleBtn = document.getElementById("theme-toggle");
  const themeIcon = document.getElementById("theme-icon");
  const themeText = document.getElementById("theme-text");

  function updateToggleUI(theme) {
    if (!themeText || !themeIcon) return;
    if (theme === "light") {
      themeText.textContent = "Light";
      themeIcon.textContent = "☀️";
    } else {
      themeIcon.textContent = "🌙";
      themeText.textContent = "Dark";
    }
  }

  const savedTheme = localStorage.getItem("theme");
  const systemPrefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;

  if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateToggleUI(savedTheme);
  } else if (systemPrefersLight) {
    document.documentElement.setAttribute("data-theme", "light");
    updateToggleUI("light");
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      const newTheme = currentTheme === "light" ? "dark" : "light";

      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("theme", newTheme);
      updateToggleUI(newTheme);
    });
  }
});

// -------------------------------------------------------------
// GLOBAL WINDOW BINDINGS (Required for ES Module Compatibility)
// -------------------------------------------------------------
window.doLogin = doLogin;
window.signOut = signOut;
window.switchTab = switchTab;
window.addDate = addDate;
window.removeSession = removeSession;
window.confirmAddUser = confirmAddUser;
window.openAddUserModal = openAddUserModal;
window.closeAddUserModal = closeAddUserModal;
window.removeUser = removeUser;
window.exportData = exportData;