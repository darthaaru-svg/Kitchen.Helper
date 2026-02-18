const DB_NAME = "expiry_graph_tracker_db";
const DB_VERSION = 1;
const STORE_NAME = "foods";
const LEGACY_STORAGE_KEY = "expiry_graph_tracker_items_v1";

const form = document.getElementById("expiry-form");
const graphElement = document.getElementById("graph");
const tableWrap = document.getElementById("table-wrap");
const statsElement = document.getElementById("stats");
const message = document.getElementById("message");
const clearButton = document.getElementById("clear-all");

const dbReady = openDatabase().catch(() => null);
let items = [];

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const foodName = form.foodName.value.trim();
  const expiryCode = form.expiryCode.value.trim();
  if (!foodName) {
    showMessage("Please enter a food name.", "error");
    return;
  }

  const parsedDate = parseExpiryCode(expiryCode);
  if (!parsedDate) {
    showMessage(
      `Could not read "${expiryCode}". Use YYYY-MM-DD, DD/MM/YYYY, MM/YY, or YYYYMMDD.`,
      "error"
    );
    return;
  }

  const newItem = {
    id: makeId(),
    foodName,
    expiryCode,
    expiryISO: parsedDate.toISOString()
  };

  items.push(newItem);
  await persistItems();
  render();
  showMessage(`Added "${foodName}" to your expiry graph.`, "success");
  form.reset();
  form.foodName.focus();
});

clearButton.addEventListener("click", async () => {
  if (!items.length) return;
  items = [];
  await persistItems();
  render();
  showMessage("Cleared all foods from the tracker.", "success");
});

tableWrap.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-remove-id]");
  if (!button) return;
  const id = button.getAttribute("data-remove-id");
  items = items.filter((item) => item.id !== id);
  await persistItems();
  render();
});

initializeApp();

async function initializeApp() {
  items = await loadItems();
  render();
}

function render() {
  const decorated = items
    .map((item) => buildRowModel(item))
    .sort((a, b) => a.expiryDate - b.expiryDate);

  renderStats(decorated);
  renderGraph(decorated);
  renderTable(decorated);
}

function renderStats(rows) {
  const expired = rows.filter((row) => row.status.type === "expired").length;
  const soon = rows.filter((row) => row.status.type === "soon" || row.status.type === "today").length;
  const fresh = rows.filter((row) => row.status.type === "fresh").length;

  statsElement.innerHTML = `
    <article class="stat"><div class="label">Total foods</div><div class="value">${rows.length}</div></article>
    <article class="stat"><div class="label">Expired</div><div class="value">${expired}</div></article>
    <article class="stat"><div class="label">Safe / fresh</div><div class="value">${fresh + soon}</div></article>
  `;
}

function renderGraph(rows) {
  if (!rows.length) {
    graphElement.innerHTML = `<div class="empty">No foods yet. Add one above and the expiry graph appears here.</div>`;
    return;
  }

  const maxAbsDays = Math.max(
    7,
    ...rows.map((row) => Math.abs(row.status.daysLeft)),
    ...rows.map((row) => row.status.daysLeft)
  );

  graphElement.innerHTML = rows
    .map((row) => {
      const widthPct = Math.max(6, Math.min(100, (Math.abs(row.status.daysLeft) / maxAbsDays) * 100));
      const typeClass = row.status.type === "today" ? "soon" : row.status.type;
      return `
        <article class="bar-row">
          <div class="bar-top">
            <strong>${escapeHtml(row.foodName)}</strong>
            <span class="bar-date">${row.formattedDate}</span>
          </div>
          <div class="track"><div class="fill ${typeClass}" style="width: ${widthPct}%"></div></div>
          <div class="bar-meta">${escapeHtml(row.status.text)}</div>
        </article>
      `;
    })
    .join("");
}

function renderTable(rows) {
  if (!rows.length) {
    tableWrap.innerHTML = `<div class="empty">No entries to show.</div>`;
    return;
  }

  tableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Food</th>
          <th>Expiry date</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const pillClass = row.status.type === "today" ? "soon" : row.status.type;
            return `
              <tr>
                <td>${escapeHtml(row.foodName)}</td>
                <td>${row.formattedDate}</td>
                <td><span class="pill ${pillClass}">${escapeHtml(row.status.short)}</span></td>
                <td class="row-actions">
                  <button type="button" data-remove-id="${row.id}">Remove</button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function buildRowModel(item) {
  const expiryDate = new Date(item.expiryISO);
  const status = getExpiryStatus(expiryDate);
  return {
    ...item,
    expiryDate,
    status,
    formattedDate: expiryDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    })
  };
}

function parseExpiryCode(raw) {
  const input = raw.trim();
  if (!input) return null;

  let match = null;

  match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return safeDate(match[1], match[2], match[3], false);

  match = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return safeDate(match[3], match[2], match[1], false);

  match = input.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) return safeDate(match[3], match[2], match[1], false);

  match = input.match(/^(\d{8})$/);
  if (match) {
    const value = match[1];
    return safeDate(value.slice(0, 4), value.slice(4, 6), value.slice(6, 8), false);
  }

  match = input.match(/^(\d{2})\/(\d{4})$/);
  if (match) return safeDate(match[2], match[1], 1, true);

  match = input.match(/^(\d{2})\/(\d{2})$/);
  if (match) return safeDate(`20${match[2]}`, match[1], 1, true);

  return null;
}

function safeDate(year, month, day, endOfMonth) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12) return null;

  if (endOfMonth) {
    return new Date(y, m, 0, 23, 59, 59, 999);
  }

  const date = new Date(y, m - 1, d, 23, 59, 59, 999);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

function getExpiryStatus(expiryDate) {
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.ceil((expiryDate - todayEnd) / msPerDay);

  if (expiryDate < now) {
    const ago = Math.abs(daysLeft);
    return {
      type: "expired",
      daysLeft,
      short: "Expired",
      text: ago === 0 ? "Expired today" : `Expired ${ago} day${ago === 1 ? "" : "s"} ago`
    };
  }

  if (daysLeft <= 0) {
    return {
      type: "today",
      daysLeft: 0,
      short: "Today",
      text: "Expires today"
    };
  }

  if (daysLeft <= 7) {
    return {
      type: "soon",
      daysLeft,
      short: "Soon",
      text: `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
    };
  }

  return {
    type: "fresh",
    daysLeft,
    short: "Fresh",
    text: `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
  };
}

function showMessage(text, tone) {
  message.className = `message ${tone}`;
  message.textContent = text;
  message.classList.remove("hidden");
}

async function persistItems() {
  const db = await dbReady;
  if (!db) {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(items));
    return;
  }

  await dbClearAll(db);
  for (const item of items) {
    await dbPut(db, item);
  }
}

async function loadItems() {
  const db = await dbReady;
  if (!db) return loadLegacyItems();

  try {
    const stored = await dbGetAll(db);
    if (stored.length) return sanitizeItems(stored);

    const legacy = loadLegacyItems();
    if (legacy.length) {
      for (const item of legacy) {
        await dbPut(db, item);
      }
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy;
    }
    return [];
  } catch {
    return loadLegacyItems();
  }
}

function loadLegacyItems() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sanitizeItems(parsed);
  } catch {
    return [];
  }
}

function sanitizeItems(input) {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.foodName === "string" &&
      typeof item.expiryCode === "string" &&
      typeof item.expiryISO === "string"
  );
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB unsupported"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function dbPut(db, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function dbClearAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
