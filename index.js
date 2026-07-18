// --- CONSTANTS & STATE ---
const LS_KEYS = {
  CONFIG: "w5g_sys_cfg_v2",
  DATA: "w5g_sys_data_v2",
  ACTIVE_MODULE: "w5g_active_module",
  GROUPS: "w5g_sys_groups_v2",
  JSON_DISPLAY: "w5g_json_display_mode",
};

// PROTOCOL: GROUP_IDENTIFICATION_MATRIX
// UPDATED: Icons are now raw SVG URLs (no color params needed)
const defaultGroupSettings = {
  "groups": [
    {
      "min": 1,
      "max": 6,
      "code": "d",
      "name": "SEKCJA D"
    },
    {
      "min": 7,
      "max": 9,
      "code": "s",
      "name": "SEKCJA S"
    },
    {
      "min": 10,
      "max": 11,
      "code": "l",
      "name": "SEKCJA L"
    },
    {
      "min": 12,
      "max": 27,
      "code": "k",
      "name": "SEKCJA K"
    },
    {
      "min": 28,
      "max": 39,
      "code": "m",
      "name": "SEKCJA M"
    },
    {
      "min": 40,
      "max": 999999,
      "code": "y",
      "name": "SEKCJA Y"
    }
  ]
};

const groupMetadata = {
  d: {
    cssVar: "bg-d",
    colorDark: "#cc8a28",
    colorLight: "#d35400",
    icon: "https://api.iconify.design/game-icons:rank-3.svg",
  },
  s: {
    cssVar: "bg-s",
    colorDark: "#0052cc",
    colorLight: "#0056b3",
    icon: "https://api.iconify.design/game-icons:rank-2.svg",
  },
  l: {
    cssVar: "bg-l",
    colorDark: "#5981cc",
    colorLight: "#3178c6",
    icon: "https://api.iconify.design/game-icons:rank-1.svg",
  },
  k: {
    cssVar: "bg-k",
    colorDark: "#cc6f44",
    colorLight: "#c0392b",
    icon: "https://api.iconify.design/game-icons:rank-1.svg",
  },
  m: {
    cssVar: "bg-m",
    colorDark: "#cccc00",
    colorLight: "#b7950b",
    icon: "https://api.iconify.design/game-icons:rank-1.svg",
  },
  y: {
    cssVar: "bg-y",
    colorDark: "#00cc00",
    colorLight: "#196f3d",
    icon: "https://api.iconify.design/game-icons:rank-1.svg",
  },
};

// === DYNAMIC DATA STREAMS CONFIGURATION ===
// System automatically scans the repo for files matching 'w5g-*.json' pattern.
let DATA_MODULES = [];

let sys_config = {
  token: "",
  owner: "s-pro-v",
  repo: "json-lista",
  path: "mobile-grafik.json", // Default fallback
  branch: "main",
};

/** Zdalny manifest PAT / rep (json-lista). */
const REMOTE_AUTH_JSON_URL =
  "https://cdn.jsdelivr.net/gh/s-pro-v/json-lista@main/dev/auth.json";
const DEFAULT_REMOTE_REPO_FULL = "s-pro-v/json-lista";

let remoteAuthRecords = null;

let sys_state = {
  data: null,
  allMonths: [],
  sha: null,
  isLocked: true,
  currentDayIdx: 0,
  activeWorker: null,
  monthRanges: [],
};

const SHIFT_MAP = {
  1: "DZIEN_06-18",
  2: "NOC_18-06",
  P1: "PARKING_D1",
  P2: "PARKING_D2",
  N1: "NAGODZINY_N1",
  N2: "NAGODZINY_N2",
  NP1: "NAGODZINY_P1",
  NP2: "NAGODZINY_P2",
  X: "ABSENCJA_CRITICAL",
  U: "URLOP_WYPEŁNIONY",
  S1: "SZKOLENIE_TECH",
  S2: "SZKOLENIE_TECH",
  ZW: "ZWOLNIENIE_LEK",
  W: "WOLNE_WEEKEND",
};

const WEEKDAYS_MAP = { PN: 0, WT: 1, ŚR: 2, SR: 2, CZ: 3, PT: 4, SO: 5, ND: 6 };
const WEEKDAYS_HEADER = ["PN", "WT", "ŚR", "CZ", "PT", "SO", "ND"];
const VALID_SHIFT_CODES = Object.keys(SHIFT_MAP);

function xorDecryptB64(b64, passphrase) {
  const bin = atob(b64);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  const key = new TextEncoder().encode(passphrase);
  if (!key.length) throw new Error("EMPTY_XOR_PASS");
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] ^ key[i % key.length];
  return new TextDecoder().decode(out);
}

function isPlausibleGithubToken(s) {
  const t = (s || "").trim();
  return (
    /^ghp_[A-Za-z0-9_]{20,}$/.test(t) || /^github_pat_[A-Za-z0-9_]+$/.test(t)
  );
}

function isPlausibleGithubRepoPath(s) {
  const t = (s || "").trim();
  return /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/i.test(t);
}

function collectXorPassCandidates() {
  const el = document.getElementById("cfg-auth-xor-pass");
  const typed = el && el.value ? el.value.trim() : "";
  const list = [];
  if (typed) list.push(typed);
  list.push("xxor", "w5g");
  return [...new Set(list)];
}

function mergeRemoteAuthJsonArray(data) {
  if (!Array.isArray(data)) throw new Error("INVALID_AUTH_JSON");
  return Object.assign({}, ...data);
}

async function fetchRemoteAuthRecords() {
  const res = await fetch(REMOTE_AUTH_JSON_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = await res.json();
  remoteAuthRecords = mergeRemoteAuthJsonArray(data);
  return remoteAuthRecords;
}

function decryptTokenFromAuthBundle(bundle) {
  const blob = bundle && bundle.sys_pat;
  if (!blob) throw new Error("NO_SYS_PAT_IN_MANIFEST");
  for (const pass of collectXorPassCandidates()) {
    try {
      const t = xorDecryptB64(blob, pass).trim();
      if (isPlausibleGithubToken(t)) return t;
    } catch (e) {
      /* next candidate */
    }
  }
  throw new Error("XOR_DECRYPT_TOKEN_FAILED");
}

function decryptRepoPathFromAuthBundle(bundle) {
  const blob = bundle && bundle.rep_all;
  if (!blob) return null;
  for (const pass of collectXorPassCandidates()) {
    try {
      const r = xorDecryptB64(blob, pass).trim();
      if (isPlausibleGithubRepoPath(r)) return r;
    } catch (e) {
      /* next */
    }
  }
  return null;
}

function syncConfigFormFromState() {
  const tokenEl = document.getElementById("cfg-token");
  const repoEl = document.getElementById("cfg-repo");
  if (!tokenEl || !repoEl) return;
  tokenEl.value = sys_config.token || "";
  const full =
    sys_config.owner && sys_config.repo
      ? `${sys_config.owner}/${sys_config.repo}`
      : "";
  repoEl.value = full || DEFAULT_REMOTE_REPO_FULL;
}

// --- CORE UTILS ---

function utf8StringToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function escapeHtmlJson(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightShiftArrayString(slice) {
  let inner;
  try {
    inner = JSON.parse(slice);
  } catch (e) {
    return `<span class="json-hl-array-val">${escapeHtmlJson(slice)}</span>`;
  }
  if (inner === "") {
    return `<span class="json-hl-shift-mark">${escapeHtmlJson(slice)}</span>`;
  }
  return `<span class="json-hl-shift-mark">"</span><span class="json-hl-array-val">${escapeHtmlJson(String(inner))}</span><span class="json-hl-shift-mark">"</span>`;
}

function highlightJsonSource(src) {
  const n = src.length;
  let i = 0;
  const parts = [];
  const dataArrayKeys = new Set(["days", "weekdays", "shifts"]);
  let pendingKey = null;
  let valueKey = null;
  let inDataArrayDepth = 0;
  let activeArrayKey = null;

  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\n" || c === "\r" || c === "\t") {
      let j = i + 1;
      while (j < n && /[\s]/.test(src[j])) j++;
      parts.push(
        `<span class="json-hl-ws">${escapeHtmlJson(src.slice(i, j))}</span>`,
      );
      i = j;
      continue;
    }
    if (c === '"') {
      const start = i;
      i++;
      while (i < n) {
        const ch = src[i];
        if (ch === "\\") {
          i++;
          if (i < n) i++;
          continue;
        }
        if (ch === '"') {
          i++;
          break;
        }
        i++;
      }
      const slice = src.slice(start, i);
      let k = i;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === ":") {
        pendingKey = JSON.parse(slice);
        parts.push(`<span class="json-hl-key">${escapeHtmlJson(slice)}</span>`);
      } else if (inDataArrayDepth > 0) {
        if (activeArrayKey === "shifts") {
          parts.push(highlightShiftArrayString(slice));
        } else {
          let arrayCls = "json-hl-array-val";
          try {
            if (JSON.parse(slice) === "") arrayCls = "json-hl-array-empty";
          } catch (e) {
            /* keep default */
          }
          parts.push(
            `<span class="${arrayCls}">${escapeHtmlJson(slice)}</span>`,
          );
        }
        valueKey = null;
      } else {
        let scalarCls = "json-hl-string";
        if (valueKey === "name") scalarCls = "json-hl-worker-name";
        parts.push(
          `<span class="${scalarCls}">${escapeHtmlJson(slice)}</span>`,
        );
        valueKey = null;
      }
      continue;
    }
    if (c === "[") {
      const arrayKey = pendingKey ?? valueKey;
      if (arrayKey && dataArrayKeys.has(arrayKey)) {
        inDataArrayDepth++;
        if (inDataArrayDepth === 1) activeArrayKey = arrayKey;
      }
      pendingKey = null;
      parts.push(`<span class="json-hl-punct">${escapeHtmlJson(c)}</span>`);
      i++;
      continue;
    }
    if (c === "]") {
      if (inDataArrayDepth > 0) {
        inDataArrayDepth--;
        if (inDataArrayDepth === 0) activeArrayKey = null;
      }
      parts.push(`<span class="json-hl-punct">${escapeHtmlJson(c)}</span>`);
      i++;
      continue;
    }
    if ("{},".includes(c)) {
      parts.push(`<span class="json-hl-punct">${escapeHtmlJson(c)}</span>`);
      i++;
      continue;
    }
    if (c === ":") {
      valueKey = pendingKey;
      pendingKey = null;
      parts.push('<span class="json-hl-punct">:</span>');
      i++;
      continue;
    }
    if (/[-0-9]/.test(c)) {
      let j = i;
      while (j < n && /[-0-9.eE+]/.test(src[j])) j++;
      let cls = "json-hl-number";
      if (inDataArrayDepth > 0) cls = "json-hl-array-val";
      parts.push(
        `<span class="${cls}">${escapeHtmlJson(src.slice(i, j))}</span>`,
      );
      valueKey = null;
      i = j;
      continue;
    }
    if (src.startsWith("true", i)) {
      parts.push('<span class="json-hl-bool">true</span>');
      i += 4;
      continue;
    }
    if (src.startsWith("false", i)) {
      parts.push('<span class="json-hl-bool">false</span>');
      i += 5;
      continue;
    }
    if (src.startsWith("null", i)) {
      parts.push('<span class="json-hl-null">null</span>');
      i += 4;
      continue;
    }
    parts.push(`<span class="json-hl-unknown">${escapeHtmlJson(c)}</span>`);
    i++;
  }
  return parts.join("");
}

const JSON_RAW_INLINE_ARRAY_KEYS = new Set(["days", "weekdays", "shifts"]);

function shouldInlineRawArray(key, value) {
  return (
    JSON_RAW_INLINE_ARRAY_KEYS.has(key) &&
    Array.isArray(value) &&
    value.every(
      (item) =>
        item === null ||
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean",
    )
  );
}

function formatRawJsonScalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatRawJsonInlineArray(value) {
  return `[ ${value.map((item) => formatRawJsonScalar(item)).join(", ")} ]`;
}

function formatRawJsonValue(value, indent, key = null) {
  const pad = "  ".repeat(indent);

  if (Array.isArray(value)) {
    if (shouldInlineRawArray(key, value)) {
      return formatRawJsonInlineArray(value);
    }
    const inner = "  ".repeat(indent + 1);
    const rows = value.map(
      (item) => `${inner}${formatRawJsonValue(item, indent + 1)}`,
    );
    return `[\n${rows.join(",\n")}\n${pad}]`;
  }

  if (value && typeof value === "object") {
    const rows = Object.keys(value).map((k) => {
      const inner = "  ".repeat(indent + 1);
      return `${inner}${JSON.stringify(k)}: ${formatRawJsonValue(value[k], indent + 1, k)}`;
    });
    return `{\n${rows.join(",\n")}\n${pad}}`;
  }

  return formatRawJsonScalar(value);
}

function getJsonSourceText() {
  if (!sys_state.data) return "";
  return formatRawJsonValue(sys_state.data, 0);
}

function syncJsonSourceScroll() {
  const view = document.getElementById("json-source-view");
  const gutterCode = document.getElementById("json-line-numbers");
  if (!view || !gutterCode) return;
  gutterCode.style.transform = `translate(0px, ${-view.scrollTop}px)`;
}

function updateJsonLineNumbers(src) {
  const g = document.getElementById("json-line-numbers");
  if (!g) return;
  const text = src ?? getJsonSourceText();
  const lineCount = text.length === 0 ? 1 : text.split(/\r\n|\r|\n/).length;
  g.textContent = Array.from({ length: lineCount }, (_, i) =>
    String(i + 1),
  ).join("\n");
}

function refreshJsonRawView() {
  const code = document.getElementById("json-raw-code");
  if (!code) return;
  const src = getJsonSourceText();
  code.innerHTML = src ? highlightJsonSource(src) : "";
  updateJsonLineNumbers(src);
  syncJsonSourceScroll();
}

function getJsonDisplayMode() {
  return localStorage.getItem(LS_KEYS.JSON_DISPLAY) || "panel";
}

function setJsonDisplayMode(mode) {
  const panelEl = document.getElementById("json-mode-panel");
  const rawEl = document.getElementById("json-mode-raw");
  if (!panelEl || !rawEl) return;
  localStorage.setItem(LS_KEYS.JSON_DISPLAY, mode);
  const isRaw = mode === "raw";
  panelEl.hidden = isRaw;
  rawEl.hidden = !isRaw;
  document.querySelectorAll(".json-mode-btn").forEach((btn) => {
    btn.classList.toggle("btn-active", btn.dataset.mode === mode);
  });
  if (isRaw) requestAnimationFrame(() => refreshJsonRawView());
  else refreshJsonPanelView();
}

function applyJsonDisplayModeFromStorage() {
  setJsonDisplayMode(getJsonDisplayMode());
}

function setupJsonRawScroll() {
  const view = document.getElementById("json-source-view");
  if (!view || view.dataset.hlBound === "1") return;
  view.dataset.hlBound = "1";
  view.addEventListener("scroll", () => syncJsonSourceScroll());
}

function formatJsonCellText(value, fieldKey) {
  if (value === null) return "null";
  if (value === "" && JSON_RAW_INLINE_ARRAY_KEYS.has(fieldKey)) return '""';
  if (value === "") return "·";
  return String(value);
}

function getJsonCellClass(key) {
  const map = {
    days: "json-meta-day",
    weekdays: "json-meta-wd",
    id: "json-meta-id",
    name: "json-meta-name",
    shifts: "json-meta-shift",
  };
  return map[key] || "json-meta-val";
}

function isHorizontalJsonValue(val) {
  if (
    val === null ||
    typeof val === "boolean" ||
    typeof val === "number" ||
    typeof val === "string"
  ) {
    return true;
  }
  if (!Array.isArray(val)) return false;
  if (val.length === 0) return true;
  return val.every(
    (item) =>
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean",
  );
}

function renderJsonLabeledRow(label, val, cellClass) {
  const values = Array.isArray(val) ? val : [val];
  const cells = values
    .map((v) => {
      const empty = v === "";
      const cls = empty ? `${cellClass} json-meta-cell-empty` : cellClass;
      return `<span class="json-meta-cell ${cls}">${escapeHtmlJson(formatJsonCellText(v, label))}</span>`;
    })
    .join("");
  return `
    <div class="json-meta-row">
      <span class="json-tree-key">${escapeHtmlJson(label)}</span>
      <span class="json-tree-colon">:</span>
      <div class="json-meta-track">${cells}</div>
    </div>`;
}

function isWorkerRecord(value) {
  return (
    value &&
    typeof value === "object" &&
    "id" in value &&
    "name" in value &&
    Array.isArray(value.shifts)
  );
}

function renderMetaDaysWeekdays(days, weekdays) {
  return `<div class="json-meta-calendar">
    ${renderJsonLabeledRow("days", days, "json-meta-day")}
    ${renderJsonLabeledRow("weekdays", weekdays, "json-meta-wd")}
  </div>`;
}

function renderWorkerRecord(worker) {
  return `<div class="json-meta-calendar json-worker-block">
    ${renderJsonLabeledRow("id", worker.id, "json-meta-id")}
    ${renderJsonLabeledRow("name", worker.name, "json-meta-name")}
    ${renderJsonLabeledRow("shifts", worker.shifts, "json-meta-shift")}
  </div>`;
}

function renderObjectFieldsFlat(obj) {
  const keys = Object.keys(obj);
  const hasCalendar = Array.isArray(obj.days) && Array.isArray(obj.weekdays);
  const isWorker = isWorkerRecord(obj);
  const skipKeys = new Set();
  if (hasCalendar) {
    skipKeys.add("days");
    skipKeys.add("weekdays");
  }
  if (isWorker) {
    skipKeys.add("id");
    skipKeys.add("name");
    skipKeys.add("shifts");
  }

  return keys
    .map((k) => {
      if (k === "days" && hasCalendar) {
        return renderMetaDaysWeekdays(obj.days, obj.weekdays);
      }
      if (k === "id" && isWorker) {
        return renderWorkerRecord(obj);
      }
      if (skipKeys.has(k)) return "";

      const fieldVal = obj[k];
      if (isHorizontalJsonValue(fieldVal)) {
        return renderJsonLabeledRow(k, fieldVal, getJsonCellClass(k));
      }
      if (fieldVal && typeof fieldVal === "object") {
        return `<div class="json-nested-block">${renderObjectFieldsFlat(fieldVal)}</div>`;
      }
      return renderJsonLabeledRow(k, fieldVal, getJsonCellClass(k));
    })
    .join("");
}

function renderWorkersSection(workers) {
  return workers
    .map(
      (worker, idx) => `
    <div class="json-worker-group">
      <div class="json-worker-head">#${idx} · ${escapeHtmlJson(String(worker.name ?? worker.id ?? idx))}</div>
      ${renderWorkerRecord(worker)}
    </div>`,
    )
    .join("");
}

function renderFullJsonView(data) {
  if (!data) {
    return '<div class="json-tree-error"><strong>BRAK_DANYCH</strong></div>';
  }

  const sections = Object.keys(data)
    .map((key) => {
      const value = data[key];
      let body = "";

      if (
        key === "meta" &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        body = renderObjectFieldsFlat(value);
      } else if (key === "workers" && Array.isArray(value)) {
        body = renderWorkersSection(value);
      } else if (isHorizontalJsonValue(value)) {
        body = renderJsonLabeledRow(key, value, getJsonCellClass(key));
      } else if (isWorkerRecord(value)) {
        body = renderWorkerRecord(value);
      } else if (value && typeof value === "object") {
        body = renderObjectFieldsFlat(value);
      } else {
        body = renderJsonLabeledRow(key, value, getJsonCellClass(key));
      }

      return `
      <section class="json-section">
        <div class="json-section-title">${escapeHtmlJson(key)}</div>
        <div class="json-section-body">${body}</div>
      </section>`;
    })
    .join("");

  return `<div class="json-full-view">${sections}</div>`;
}

function refreshJsonPanelView() {
  const viewport = document.getElementById("json-full-viewport");
  if (!viewport) return;
  viewport.innerHTML = renderFullJsonView(sys_state.data);
}

function refreshJsonView() {
  refreshJsonPanelView();
  refreshJsonRawView();
}

/**
 * PROTOCOL: INJECT_CSS_MASKING_ENGINE
 * Injects required styles for the masking protocol directly into DOM.
 */
const injectCoreStyles = () => {
  const styleId = "sys-core-styles-v2";
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = "";
  document.head.appendChild(style);
};

/**
 * Returns the current active theme color for a specific group.
 * Resolves based on 'data-theme' attribute.
 */
const getGroupColorForTheme = (group) => {
  const currentTheme =
    document.documentElement.getAttribute("data-theme") || "dark";
  return currentTheme === "light" ? group.colorLight : group.colorDark;
};

function updateDataModulesFromMonths() {
  if (!sys_state.allMonths || !sys_state.allMonths.length) {
    DATA_MODULES = [];
    return;
  }
  DATA_MODULES = sys_state.allMonths.map((m) => {
    const monthName = m.meta.month.toUpperCase();
    return {
      id: monthName,
      label: monthName,
      file: monthName,
    };
  });
}

async function fetchMobileGrafik() {
  const repoOwner = sys_config.owner || "s-pro-v";
  const repoName = sys_config.repo === "w5g.github.io" ? "json-lista" : sys_config.repo;
  const filePath = "mobile-grafik.json";
  
  if (sys_config.token) {
    const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}?ref=${sys_config.branch}`;
    try {
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `token ${sys_config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (res.ok) {
        const json = await res.json();
        sys_state.sha = json.sha;
        const content = decodeURIComponent(
          atob(json.content)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join(""),
        );
        return JSON.parse(content);
      }
    } catch (e) {
      console.warn("GitHub API fetch failed, falling back to raw URL", e);
    }
  }

  const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${sys_config.branch}/${filePath}?t=${new Date().getTime()}`;
  try {
    const res = await fetch(rawUrl);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("Raw GitHub fetch failed, falling back to CDN", e);
  }

  const cdnUrl = `https://cdn.jsdelivr.net/gh/${repoOwner}/${repoName}@${sys_config.branch}/${filePath}`;
  const res = await fetch(cdnUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return await res.json();
}

// --- CORE FUNCTIONS ---
async function init() {
  injectCoreStyles(); // <--- CRITICAL: Load CSS Engine
  loadConfig();
  syncConfigFormFromState();
  loadGroupSettings();

  fetchRemoteAuthRecords().catch(() => {
    /* offline / CORS — import nadal spróbuje ponownie */
  });

  // Load cache first so user sees data immediately
  loadCachedData();

  if (sys_state.data) {
    const today = new Date().getDate();
    const idx = sys_state.data.meta.days.findIndex(
      (d) => parseInt(d) === today,
    );
    sys_state.currentDayIdx = idx !== -1 ? idx : 0;
    refreshUI();
  }

  // 1. AUTO-DISCOVERY PROTOCOL (loads from CDN/GitHub and updates cache)
  await discoverDataStreams();

  if (sys_state.data) {
    const today = new Date().getDate();
    const idx = sys_state.data.meta.days.findIndex(
      (d) => parseInt(d) === today,
    );
    sys_state.currentDayIdx = idx !== -1 ? idx : 0;
  }

  startClock();
  injectDataModuleSelector();
  updateFooter();
  refreshUI();

  document
    .getElementById("staff-search")
    .addEventListener("input", (e) => renderStaffList(e.target.value));

  // Setup modal background click handlers
  setupModalBackgroundHandlers();
  setupJsonRawScroll();
  applyJsonDisplayModeFromStorage();
}

// === LOGIC REPAIRED: DYNAMIC GROUP RANGES ===
let groupSettings = JSON.parse(JSON.stringify(defaultGroupSettings));

function loadGroupSettings() {
  const saved = localStorage.getItem(LS_KEYS.GROUPS);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.groups)) {
        groupSettings = parsed;
      } else {
        groupSettings = JSON.parse(JSON.stringify(defaultGroupSettings));
      }
    } catch (e) {
      console.error("GROUP_CONFIG_LOAD_FAIL", e);
      groupSettings = JSON.parse(JSON.stringify(defaultGroupSettings));
    }
  } else {
    groupSettings = JSON.parse(JSON.stringify(defaultGroupSettings));
  }
  applyThemeSpecificColors();
}

function applyThemeSpecificColors() {
  const currentTheme =
    document.documentElement.getAttribute("data-theme") || "dark";

  const grpList = groupSettings.groups || defaultGroupSettings.groups || [];
  grpList.forEach((g) => {
    const meta = groupMetadata[g.code.toLowerCase()] || {};
    const color = currentTheme === "light" ? meta.colorLight : meta.colorDark;
    if (color && meta.cssVar) {
      document.documentElement.style.setProperty(`--${meta.cssVar}`, color);
    }
  });
}

// === CRITICAL LOGIC FIX: SEQUENTIAL RANGES ===
function getWorkerGroup(id) {
  const pid = parseInt(id, 10);
  if (isNaN(pid)) return null;

  const grpList = groupSettings.groups || defaultGroupSettings.groups || [];
  const found = grpList.find(g => pid >= g.min && pid <= g.max);
  if (!found) return null;

  const meta = groupMetadata[found.code.toLowerCase()] || {};
  return {
    ...found,
    ...meta,
    label: found.code.toUpperCase()
  };
}

async function syncGroupSettingsToGithub() {
  if (!sys_config.token) return;

  const fileName = "ustawienia.json";
  const url = `https://api.github.com/repos/${sys_config.owner}/${sys_config.repo}/contents/${fileName}`;

  notify("INITIATING UPLINK: settings sync...", "info");

  try {
    // 1. Get SHA (if file exists)
    let sha = null;
    try {
      const getRes = await fetch(`${url}?ref=${sys_config.branch}`, {
        headers: {
          Authorization: `token ${sys_config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (getRes.ok) {
        const json = await getRes.json();
        sha = json.sha;
      }
    } catch (e) {
      /* Ignore 404 */
    }

    // 2. Prepare Payload
    const contentStr = JSON.stringify(groupSettings, null, 2);
    const encoded = utf8StringToBase64(contentStr);

    const bodyPayload = {
      message: `SYS_MATRIX_CONFIG_UPDATE_${new Date().getTime()}`,
      content: encoded,
      branch: sys_config.branch,
    };
    if (sha) bodyPayload.sha = sha;

    // 3. Push
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `token ${sys_config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) throw new Error(`HTTP_${res.status}`);

    notify("REMOTE_CONFIG_SAVED: ustawienia.json", "success");
  } catch (err) {
    console.error("SETTINGS_SYNC_ERROR", err);
    notify(`SYNC_FAIL: ${err.message}`, "error");
  }
}

async function saveGroupConfig() {
  const container = document.getElementById("groups-editor-container");
  if (!container) return;

  const rows = container.querySelectorAll(".group-row");
  const grpList = [];

  rows.forEach((row) => {
    const code = row.dataset.code;
    const minInput = row.querySelector(".inp-min");
    const maxInput = row.querySelector(".inp-max");

    if (minInput && maxInput) {
      const minVal = parseInt(minInput.value, 10);
      const maxVal = parseInt(maxInput.value, 10);
      
      const existingGrp = (groupSettings.groups || []).find(g => g.code === code);
      const name = existingGrp ? existingGrp.name : `SEKCJA ${code.toUpperCase()}`;

      grpList.push({
        min: isNaN(minVal) ? 0 : minVal,
        max: isNaN(maxVal) ? 999999 : maxVal,
        code: code,
        name: name
      });
    }
  });

  groupSettings = { groups: grpList };

  localStorage.setItem(LS_KEYS.GROUPS, JSON.stringify(groupSettings));
  applyThemeSpecificColors();

  // Trigger remote sync
  await syncGroupSettingsToGithub();

  toggleModal("modal-groups", false);
  notify("MATRIX_UPDATED: Ranges Synced", "success");
  refreshUI();
}

function renderGroupConfigModal() {
  const container = document.getElementById("groups-editor-container");
  if (!container) return;

  const grpList = groupSettings.groups || [];

  container.innerHTML = `
                <form id="groups-form" style="display: flex; flex-direction: column; gap: 10px;">
                    <div style="font-size:10px; color:var(--text-secondary); margin-bottom:10px;">
                        EDIT GROUP RANGES (MIN - MAX)
                    </div>
                    <div style="display:grid; grid-template-columns: 80px 1fr 1fr; gap:10px; font-size:14px; font-weight:bold; color:var(--text-secondary); padding: 0 12px;">
                        <span>CODE</span>
                        <span>MIN</span>
                        <span>MAX</span>
                    </div>
                    ${grpList
                      .map((grp) => {
                        const meta = groupMetadata[grp.code.toLowerCase()] || {};
                        return `
                        <div class="group-row" data-code="${grp.code}" style="display:grid; grid-template-columns: 80px 1fr 1fr; gap:10px; align-items:center; background:var(--bg-input); padding:12px; border:1px solid var(--border-color);">
                            <div class="group-id-badge" style="background:var(--${meta.cssVar || 'bg-d'}); color:var(--text-badge); font-weight:bold; text-align:center; padding:2px;">${grp.code.toUpperCase()}</div>

                            <div>
                                <input type="number" class="inp-min cell-input" value="${grp.min}" style="width: 100%; border:1px solid var(--border-color); background:var(--bg-card); text-align: left; padding-left: 5px;">
                            </div>

                            <div>
                                <input type="number" class="inp-max cell-input" value="${grp.max}" style="width: 100%; border:1px solid var(--border-color); background:var(--bg-card); text-align: left; padding-left: 5px;">
                            </div>
                        </div>
                    `;
                      })
                      .join("")}
                </form>
            `;
}

async function discoverDataStreams() {
  try {
    notify("PULLING_SCHEDULE_DATA...", "info");
    const allMonths = await fetchMobileGrafik();
    if (Array.isArray(allMonths)) {
      sys_state.allMonths = allMonths;
      localStorage.setItem("w5g_all_months", JSON.stringify(allMonths));
      updateDataModulesFromMonths();

      // Determine the active module
      const lastModule = localStorage.getItem(LS_KEYS.ACTIVE_MODULE);
      const activeMonth = allMonths.find(m => m.meta.month.toUpperCase() === String(lastModule || "").toUpperCase()) || allMonths[0];
      if (activeMonth) {
        sys_state.data = activeMonth;
        localStorage.setItem(LS_KEYS.DATA, JSON.stringify(activeMonth));
        identifyMonths();
      }

      notify(`DISCOVERED ${allMonths.length} MONTHS`, "success");
    } else {
      throw new Error("INVALID_JSON_FORMAT");
    }
  } catch (e) {
    console.error("DISCOVERY_ERROR:", e);
    notify(`FETCH_FAIL: ${e.message}`, "error");
    loadCachedData();
  }
}

function startClock() {
  setInterval(() => {
    const now = new Date();
    document.getElementById("system-clock").textContent = now
      .toTimeString()
      .split(" ")[0];
  }, 1000);
}

function injectDataModuleSelector() {
  const container = document.querySelector(".top-bar-right");
  if (!container) return;

  const existing = document.getElementById("data-module-wrapper");
  if (existing) existing.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "data-module-wrapper";
  wrapper.className = "custom-select";

  const label = document.createElement("span");
  label.innerText = "DATA_STREAM:";
  label.style.fontSize = "10px";
  label.style.color = "var(--text-secondary)";
  label.style.fontWeight = "bold";
  label.style.marginRight = "8px";

  const trigger = document.createElement("div");
  trigger.className = "select-trigger";
  trigger.innerHTML =
    '<span id="selected-module-text">SELECT</span><i class="fas fa-chevron-down"></i>';

  const optionsContainer = document.createElement("div");
  optionsContainer.className = "select-options";

  DATA_MODULES.forEach((mod) => {
    const option = document.createElement("div");
    option.className = "option";
    option.dataset.value = mod.file;
    option.innerHTML = `<i class="fas fa-database"></i>${mod.label}`;
    const activeModule = localStorage.getItem(LS_KEYS.ACTIVE_MODULE) || (sys_state.data ? sys_state.data.meta.month : "");
    if (mod.file.toUpperCase() === String(activeModule).toUpperCase()) {
      option.classList.add("selected");
      trigger.querySelector("#selected-module-text").textContent = mod.label;
    }
    option.addEventListener("click", () => {
      document
        .querySelectorAll(".option")
        .forEach((o) => o.classList.remove("selected"));
      option.classList.add("selected");
      trigger.querySelector("#selected-module-text").textContent = mod.label;
      optionsContainer.classList.remove("show");
      trigger.classList.remove("active");
      switchDataModule(mod.file);
    });
    optionsContainer.appendChild(option);
  });

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    trigger.classList.toggle("active");
    optionsContainer.classList.toggle("show");
  });

  document.addEventListener("click", () => {
    optionsContainer.classList.remove("show");
    trigger.classList.remove("active");
  });

  wrapper.appendChild(trigger);
  wrapper.appendChild(optionsContainer);

  const labelWrapper = document.createElement("div");
  labelWrapper.style.display = "flex";
  labelWrapper.style.alignItems = "center";
  labelWrapper.style.gap = "8px";
  labelWrapper.appendChild(label);
  labelWrapper.appendChild(wrapper);

  container.insertBefore(labelWrapper, container.firstChild);
}

async function switchDataModule(newPath) {
  if (sys_state.data && newPath.toUpperCase() === sys_state.data.meta.month.toUpperCase()) return;

  notify(`MOUNTING_STREAM: ${newPath}...`, "info");
  localStorage.setItem(LS_KEYS.ACTIVE_MODULE, newPath);

  const activeMonth = sys_state.allMonths.find(m => m.meta.month.toUpperCase() === String(newPath).toUpperCase());
  if (activeMonth) {
    sys_state.data = activeMonth;
    localStorage.setItem(LS_KEYS.DATA, JSON.stringify(activeMonth));
    identifyMonths();
    refreshUI();
    notify(`MOUNTED_STREAM: ${newPath}`, "success");
  } else {
    notify(`MONTH_NOT_FOUND: ${newPath}`, "error");
  }
}

function updateFooter() {
  if (sys_state.sha)
    document.getElementById("footer-sha").textContent = sys_state.sha.substring(
      0,
      7,
    );
  if (sys_config.path)
    document.getElementById("footer-path").textContent = sys_config.path;
  const now = new Date();
  document.getElementById("footer-sync").textContent = now
    .toTimeString()
    .split(" ")[0];
}

// === LOGIC: DETECT MONTHS ===
function identifyMonths() {
  if (!sys_state.data) return;
  const { days, months } = sys_state.data.meta;
  sys_state.monthRanges = [];

  const activeModuleKey = sys_state.data ? sys_state.data.meta.month : "";
  const activeMod = DATA_MODULES.find((m) => m.file.toUpperCase() === String(activeModuleKey).toUpperCase());
  const defaultName = activeMod
    ? activeMod.label
    : (sys_state.data && sys_state.data.meta.month ? sys_state.data.meta.month : "UNKNOWN_CYCLE");

  let rangeStart = 0;
  let monthIdx = 0;

  for (let i = 1; i < days.length; i++) {
    if (parseInt(days[i], 10) < parseInt(days[i - 1], 10)) {
      const metaName = months && months[monthIdx] ? months[monthIdx] : null;
      const finalName = metaName || `${defaultName} ${monthIdx + 1}`;

      sys_state.monthRanges.push({
        start: rangeStart,
        end: i - 1,
        name: finalName,
      });
      rangeStart = i;
      monthIdx++;
    }
  }

  const metaName = months && months[monthIdx] ? months[monthIdx] : null;
  const finalName =
    metaName ||
    (monthIdx === 0 ? defaultName : `${defaultName} ${monthIdx + 1}`);

  sys_state.monthRanges.push({
    start: rangeStart,
    end: days.length - 1,
    name: finalName,
  });
}

function getCurrentMonthInfo() {
  const idx = sys_state.currentDayIdx;
  return sys_state.monthRanges.find((m) => idx >= m.start && idx <= m.end);
}

// === NAVIGATION ===
function stepDay(delta) {
  if (!sys_state.data) return;
  const newIdx = sys_state.currentDayIdx + delta;
  if (newIdx >= 0 && newIdx < sys_state.data.meta.days.length) {
    sys_state.currentDayIdx = newIdx;
    renderDashboard();
  }
}

function stepMonth(delta) {
  if (!sys_state.data) return;
  const currentMonth = getCurrentMonthInfo();
  if (!currentMonth) return;

  const mIdx = sys_state.monthRanges.indexOf(currentMonth);
  if (mIdx === -1) return;

  const nextMIdx = mIdx + delta;

  if (nextMIdx >= 0 && nextMIdx < sys_state.monthRanges.length) {
    sys_state.currentDayIdx = sys_state.monthRanges[nextMIdx].start;
    renderDashboard();
  } else {
    notify("END_OF_DATA_STREAM. CHECK_DATA_STREAM_SELECTOR", "warning");
    const selector = document.getElementById("module-selector");
    if (selector) {
      selector.style.borderColor = "var(--status-error)";
      setTimeout(
        () => (selector.style.borderColor = "var(--border-color)"),
        1000,
      );
    }
  }
}

function jumpToDay(absIdx) {
  sys_state.currentDayIdx = absIdx;
  renderDashboard();
}

async function syncData(mode) {
  if (!sys_config.token) return toggleModal("modal-config", true);
  setLoader(true);
  const repoOwner = sys_config.owner || "s-pro-v";
  const repoName = sys_config.repo === "w5g.github.io" ? "json-lista" : sys_config.repo;
  const filePath = "mobile-grafik.json";
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;
  try {
    if (mode === "pull") {
      const allMonths = await fetchMobileGrafik();
      if (Array.isArray(allMonths)) {
        sys_state.allMonths = allMonths;
        localStorage.setItem("w5g_all_months", JSON.stringify(allMonths));
        updateDataModulesFromMonths();

        // Restore active month or pick first
        const activeModule = localStorage.getItem(LS_KEYS.ACTIVE_MODULE);
        const activeMonth = allMonths.find(m => m.meta.month.toUpperCase() === String(activeModule || "").toUpperCase()) || allMonths[0];
        if (activeMonth) {
          sys_state.data = activeMonth;
          localStorage.setItem(LS_KEYS.DATA, JSON.stringify(activeMonth));
          identifyMonths();
        }
        notify("DATA_PULL_SUCCESSFUL", "success");
        updateFooter();
        refreshUI();
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      if (!sys_state.allMonths || sys_state.allMonths.length === 0) throw new Error("NO_DATA_TO_PUSH");
      
      // Update the current active month inside allMonths before pushing
      if (sys_state.data) {
        const idx = sys_state.allMonths.findIndex(m => m.meta.month.toUpperCase() === sys_state.data.meta.month.toUpperCase());
        if (idx !== -1) {
          sys_state.allMonths[idx] = sys_state.data;
        }
      }

      // Fetch latest SHA from GitHub content API to avoid conflicts
      let sha = sys_state.sha;
      try {
        const getRes = await fetch(`${url}?ref=${sys_config.branch}`, {
          headers: {
            Authorization: `token ${sys_config.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        if (getRes.ok) {
          const fileMeta = await getRes.json();
          sha = fileMeta.sha;
        }
      } catch (e) {
        console.warn("Could not fetch fresh SHA from GitHub, using cached", e);
      }

      const contentStr = JSON.stringify(sys_state.allMonths, null, 2);
      const encoded = utf8StringToBase64(contentStr);

      const bodyPayload = {
        message: `SYS_SYNC_${new Date().getTime()}`,
        content: encoded,
        branch: sys_config.branch,
      };
      if (sha) bodyPayload.sha = sha;

      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `token ${sys_config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      });
      if (!res.ok) throw new Error("PUSH_FAILED");
      const result = await res.json();
      sys_state.sha = result.content.sha;
      
      localStorage.setItem("w5g_all_months", contentStr);
      if (sys_state.data) {
        localStorage.setItem(LS_KEYS.DATA, JSON.stringify(sys_state.data));
      }
      updateFooter();
      notify("REMOTE_STORAGE_UPDATED", "success");

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
    if (!err.message.includes("REMOTE_REF")) {
      notify(`ERROR: ${err.message}`, "error");
    }
  } finally {
    setLoader(false);
  }
}

function refreshUI() {
  if (!sys_state.data) return;
  updateStats();
  renderDashboard();
  renderScheduleTable();
  renderStaffList();
  refreshJsonView();
}

function updateStats() {
  if (!sys_state.data) return;
  document.getElementById("val-workers").textContent =
    sys_state.data.workers.length;
  document.getElementById("val-days").textContent =
    sys_state.data.meta.days.length;
  let totalHours = 0;
  sys_state.data.workers.forEach((w) => {
    w.shifts.forEach((s) => {
      if (["1", "2", "P1", "P2", "N1", "N2"].includes(String(s).toUpperCase()))
        totalHours += 12;
    });
  });
  const avg = (totalHours / sys_state.data.workers.length).toFixed(1);
  document.getElementById("val-avg-hours").textContent = `${avg} H`;
}

// === VIEW: DASHBOARD HUD ===
// REFACTORED: Now aggregates Overtime (N1/N2/P1/P2) into main Day/Night cards
function renderDashboard() {
  if (!sys_state.data) return;
  const { meta, workers } = sys_state.data;
  const idx = sys_state.currentDayIdx;

  const curMonth = getCurrentMonthInfo();
  const monthName = curMonth ? curMonth.name : "SECTOR_UNKNOWN";
  const weekday = meta.weekdays[idx];
  const dayNum = meta.days[idx];

  const activeModuleKey = sys_state.data ? sys_state.data.meta.month : "";
  const activeMod = DATA_MODULES.find((m) => m.file.toUpperCase() === String(activeModuleKey).toUpperCase());
  const moduleLabel = activeMod ? activeMod.label : (sys_state.data ? sys_state.data.meta.month : sys_config.path);

  document.getElementById("day-counter").textContent =
    `DZIEŃ ROBOCZY [${idx + 1}/${meta.days.length}]`;
  document.getElementById("current-date-display").textContent =
    `${monthName} ${dayNum} [${weekday}]`;

  renderMiniCalendar(curMonth, moduleLabel);

  // LOGIC: AGGREGATION MAP
  // Defines which raw codes should merge into which Display Card
  const dayCodes = ["1", "N1", "NP1", "P1"];
  const nightCodes = ["2", "N2", "NP2", "P2"];

  const grouped = {};

  workers.forEach((w) => {
    const rawCode = (w.shifts[idx] || "").trim().toUpperCase();

    if (rawCode.length > 0) {
      let cardKey = rawCode;

      // Aggregation Logic
      if (dayCodes.includes(rawCode)) cardKey = "1";
      else if (nightCodes.includes(rawCode)) cardKey = "2";

      if (!grouped[cardKey]) grouped[cardKey] = [];

      // Push structured object to keep track of original code
      grouped[cardKey].push({ worker: w, code: rawCode });
    }
  });

  const sortedCodes = Object.keys(grouped).sort();

  let html = "";
  sortedCodes.forEach((cardKey) => {
    const count = grouped[cardKey].length;

    // Determine Card Styling based on Key
    const badgeClass = getTagClass(cardKey);

    let shiftLabel = SHIFT_MAP[cardKey] || `STATUS_${cardKey}`;
    // Custom Labels for Aggregated Cards
    if (cardKey === "1") shiftLabel = "DZIEN_06-18 [+P1]";
    if (cardKey === "2") shiftLabel = "NOC_18-06 [+P2]";

    html += `
            <div class="shift-card">
                <div class="shift-header">
                    <span class="shift-tag tag ${badgeClass}">${cardKey}</span>
                    <span class="shift-label">${shiftLabel}</span>
                    <span class="shift-count" style="margin-left: auto; font-weight: bold; color: var(--primary);">${count}</span>
                </div>
                <div class="shift-body">
                    ${grouped[cardKey]
                      .map((item) => {
                        const w = item.worker;
                        const originalCode = item.code;
                        const grp = getWorkerGroup(w.id);

                        // LOGIC: CSS MASKING PROTOCOL
                        let iconHtml = "";
                        if (grp) {
                          const themeColor = getGroupColorForTheme(grp);
                          if (grp.icon) {
                            // MASKING: Using div with mask-image instead of img tag
                            iconHtml = `<div class="sys-icon-mask" style="--icon-url: url('${grp.icon}'); --icon-color: ${themeColor}; width: 25px; height: 25px; margin-right: 8px;"></div>`;
                          } else {
                            iconHtml = `<i class="fas fa-circle" style="color:${themeColor}"></i>`;
                          }
                        }

                        // SUB-BADGE Logic: Show original code if it differs from Card Key (e.g. N1 inside 1)
                        // UPDATED: Now fetches mapped color class for the sub-badge
                        let subBadge = "";
                        if (originalCode !== cardKey) {
                          let subBadgeClass = getTagClass(originalCode);
                          // Specific Overtime Color Logic: Force 'sb-n' for N-codes to differentiate from Day color
                          if (originalCode.startsWith("N"))
                            subBadgeClass = "sb-n";

                          subBadge = `<span class="sys-mini-badge ${subBadgeClass}">${originalCode}</span>`;
                        }

                        return `
                            <div class="worker-entry">
                                ${iconHtml}
                                <span>${w.name}${subBadge}</span>
                            </div>
                        `;
                      })
                      .join("")}
                </div>
            </div>`;
  });

  document.getElementById("shifts-grid").innerHTML =
    html ||
    '<div style="color:var(--text-secondary); padding: 20px; border: 1px dashed var(--border-color);">NO_ACTIVE_SHIFTS // SYSTEM IDLE</div>';
}

function renderMiniCalendar(monthRange, moduleLabel) {
  const container = document.getElementById("mini-calendar");
  if (!container || !monthRange || !sys_state.data) return;

  const { meta } = sys_state.data;
  container.innerHTML = "";

  const header = document.createElement("div");
  header.className = "mini-cal-header";
  const headerSpan = document.createElement("span");
  headerSpan.id = "mini-calendar-month-name";
  headerSpan.textContent = `[ ${moduleLabel} ]`;
  header.appendChild(headerSpan);
  container.appendChild(header);

  const wrapper = document.createElement("div");
  wrapper.className = "day-selector-wrapper";

  const label = document.createElement("label");
  label.className = "form-label";
  label.style.marginBottom = "5px";
  label.textContent = "DZIEŃ ROBOCZY:";

  const customSelect = document.createElement("div");
  customSelect.className = "custom-select";
  customSelect.style.width = "100%";

  const trigger = document.createElement("div");
  trigger.className = "select-trigger";

  const selectedText = document.createElement("span");
  selectedText.id = "selected-day-text";
  const currentDay = meta.days[sys_state.currentDayIdx];
  const currentWeekday = meta.weekdays[sys_state.currentDayIdx];
  selectedText.textContent = `${currentDay} (${currentWeekday})`;

  const icon = document.createElement("i");
  icon.className = "fas fa-chevron-down";

  trigger.appendChild(selectedText);
  trigger.appendChild(icon);

  const optionsContainer = document.createElement("div");
  optionsContainer.className = "select-options";

  for (let i = 0; i < meta.days.length; i++) {
    const dayVal = meta.days[i];
    const weekday = meta.weekdays[i];

    const option = document.createElement("div");
    option.className = "option";
    option.dataset.value = i;

    const optionIcon = document.createElement("i");
    optionIcon.className = "fas fa-calendar-day";

    const optionText = document.createTextNode(`${dayVal} (${weekday})`);

    option.appendChild(optionIcon);
    option.appendChild(optionText);

    if (i === sys_state.currentDayIdx) {
      option.classList.add("selected");
    }

    const isWeekend = weekday === "SO" || weekday === "ND";
    if (isWeekend) {
      option.style.color = "var(--primary)";
    }

    option.addEventListener("click", () => {
      document
        .querySelectorAll(".select-options .option")
        .forEach((o) => o.classList.remove("selected"));
      option.classList.add("selected");
      selectedText.textContent = `${dayVal} (${weekday})`;
      optionsContainer.classList.remove("show");
      trigger.classList.remove("active");
      jumpToDay(i);
    });

    optionsContainer.appendChild(option);
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    trigger.classList.toggle("active");
    optionsContainer.classList.toggle("show");
  });

  const closeDropdown = (e) => {
    if (!customSelect.contains(e.target)) {
      optionsContainer.classList.remove("show");
      trigger.classList.remove("active");
    }
  };

  document.removeEventListener("click", closeDropdown);
  document.addEventListener("click", closeDropdown);

  customSelect.appendChild(trigger);
  customSelect.appendChild(optionsContainer);

  wrapper.appendChild(label);
  wrapper.appendChild(customSelect);
  container.appendChild(wrapper);
}

// === VIEW: SCHEDULE HUD (TABLE) ===
function renderScheduleTable() {
  if (!sys_state.data) return;
  const { meta, workers } = sys_state.data;
  const locked = sys_state.isLocked ? "disabled" : "";

  let html = `<thead><tr><th width="40">ID</th><th width="200" style="text-align:left;">OPERATOR</th>`;
  meta.days.forEach((d, i) => {
    const weekend = meta.weekdays[i] === "SO" || meta.weekdays[i] === "ND";
    html += `<th class="${weekend ? "highlight" : ""}">${d}<br>${meta.weekdays[i]}</th>`;
  });
  html += `<th>Σ</th></thead><tbody>`;

  workers.forEach((w, wIdx) => {
    let hrs = 0;
    const grp = getWorkerGroup(w.id);
    const themeColor = grp ? getGroupColorForTheme(grp) : "inherit";

    const idStyle = grp
      ? `style="color:${themeColor}; font-weight:bold; opacity:0.7;"`
      : `style="opacity:0.5;"`;
    const nameStyle = grp
      ? `style="text-align:left; font-weight:bold; border-left: 2px solid ${themeColor}; padding-left: 8px; background: linear-gradient(90deg, ${themeColor}15, transparent);"`
      : `style="text-align:left; font-weight:bold;"`;

    html += `<tr><td ${idStyle}>${w.id}</td><td ${nameStyle}>${w.name}</td>`;

    w.shifts.forEach((s, dIdx) => {
      if (["1", "2", "P1", "P2", "N1", "N2"].includes(String(s).toUpperCase()))
        hrs += 12;

      const cellClass = getCellClass(s);
      html += `<td class="${cellClass}"><input type="text" class="cell-input" value="${s}" ${locked} onchange="modifyShift(${wIdx}, ${dIdx}, this.value)"></td>`;
    });
    html += `<td class="highlight">${hrs}H</td></tr>`;
  });
  document.getElementById("main-schedule-table").innerHTML = html + `</tbody>`;
}

function renderStaffList(filter = "") {
  if (!sys_state.data) return;
  const list = document.getElementById("staff-list");

  list.innerHTML = sys_state.data.workers
    .filter((w) => w.name.toLowerCase().includes(filter.toLowerCase()))
    .map((w, idx) => {
      const grp = getWorkerGroup(w.id);
      let borderStyle = "";
      let backgroundStyle = "";

      let grpBadge = "";
      if (grp) {
        const themeColor = getGroupColorForTheme(grp);
        borderStyle = `border-left-color: ${themeColor} !important; border-left-width: 3px !important;`;
        backgroundStyle = `background: linear-gradient(90deg, ${themeColor}20, transparent);`;

        if (grp.icon) {
          // MASKING
          grpBadge = `<div class="sys-icon-mask" style="--icon-url: url('${grp.icon}'); --icon-color: ${themeColor}; width: 25px; height: 25px; margin-left: 6px;"></div>`;
        } else {
          grpBadge = `<span style="font-size:14px; background:${themeColor}; color:var(--text-badge); padding:1px 4px; margin-left:6px; font-weight:bold; border-radius:0;">${grp.label}</span>`;
        }
      }

      return `
                <div class="nav-link" style="border-left-width: 2px; ${borderStyle} ${backgroundStyle}" onclick="viewStaffDetails(${idx})">
                    <div style="width:100%">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="font-weight:bold;">${w.name}</div>
                            ${grpBadge}
                        </div>
                        <div style="font-size:14px; opacity:0.5;">UID: ${w.id}</div>
                    </div>
                </div>
            `;
    })
    .join("");
}

function viewStaffDetails(idx) {
  if (!sys_state.data) return;
  sys_state.activeWorker = idx;
  const w = sys_state.data.workers[idx];
  const meta = sys_state.data.meta;
  const grp = getWorkerGroup(w.id);

  document.querySelectorAll("#staff-list .nav-link").forEach((el, i) => {
    if (el.textContent.includes(w.name)) el.classList.add("active");
    else el.classList.remove("active");
  });

  let total = 0;
  const shiftCounts = {};
  VALID_SHIFT_CODES.forEach((code) => (shiftCounts[code] = 0));
  ["X", "U", "S", "ZW"].forEach((c) => {
    if (!shiftCounts[c]) shiftCounts[c] = 0;
  });

  let calendarGridHtml = "";

  WEEKDAYS_HEADER.forEach(
    (day) =>
      (calendarGridHtml += `<div class="calendar-header-cell">${day}</div>`),
  );

  const firstDayWeekday = String(meta.weekdays[0] || "").toUpperCase().trim();
  let paddingDays = WEEKDAYS_MAP[firstDayWeekday];
  if (paddingDays === undefined) paddingDays = 0;

  for (let i = 0; i < paddingDays; i++)
    calendarGridHtml += `<div class="calendar-day-cell empty"></div>`;

  meta.days.forEach((d, i) => {
    const s = (w.shifts[i] || "").toUpperCase();
    const isWeekend = meta.weekdays[i] === "SO" || meta.weekdays[i] === "ND";

    if (["1", "2", "P1", "P2", "N1", "N2"].includes(s)) total += 12;

    if (shiftCounts.hasOwnProperty(s)) shiftCounts[s]++;
    else if (s) {
      if (!shiftCounts[s]) shiftCounts[s] = 1;
      else shiftCounts[s]++;
    }

    const badgeClass = getTagClass(s);
    const shiftDisplay = s
      ? `<span class="shift-tag ${badgeClass}">${s}</span>`
      : "";

    calendarGridHtml += `
            <div class="calendar-day-cell ${isWeekend ? "weekend" : ""}">
                <div class="calendar-day-num">${d}</div>
                <div class="calendar-shift-code">${shiftDisplay}</div>
                <div style="font-size:7px; opacity:0.4; text-align:right;">${meta.weekdays[i]}</div>
            </div>`;
  });

  let statsHtml = `<div class="shift-stats-box"><div style="font-size:10px; font-weight:bold; color:var(--primary); margin-bottom:10px; border-bottom:1px solid var(--border-color); padding-bottom:5px;">SHIFT_ANALYTICS</div>`;

  Object.keys(shiftCounts)
    .sort()
    .forEach((code) => {
      if (shiftCounts[code] > 0) {
        const badgeClass = getTagClass(code);
        statsHtml += `<div class="stat-item"><span class="shift-tag ${badgeClass}" style="font-size:14px; width:25px; text-align:center;">${code}</span><span class="highlight">${shiftCounts[code]}x</span></div>`;
      }
    });
  statsHtml += `</div>`;

  let groupBadge = "";
  if (grp) {
    const themeColor = getGroupColorForTheme(grp);
    if (grp.icon) {
      // MASKING
      const iconMask = `<div class="sys-icon-mask" style="--icon-url: url('${grp.icon}'); --icon-color: var(--text-badge); width: 20px; height: 20px;"></div>`;
      groupBadge = `<div style="display:inline-flex; align-items:center; gap:8px; background:${themeColor}; color:var(--text-badge); padding:4px 10px; font-weight:bold; font-size:10px; margin-bottom:5px;">
                ${iconMask}
                <span>GROUP_${grp.label}</span>
            </div>`;
    } else {
      groupBadge = `<div style="display:inline-block; background:${themeColor}; color:var(--text-badge); padding:2px 8px; font-weight:bold; font-size:10px; margin-bottom:5px;">GROUP_${grp.label}</div>`;
    }
  }

  document.getElementById("staff-details").innerHTML = `
        <div class="staff-details-header">
            <div class="staff-details-info">${groupBadge}<div class="staff-details-label">OPERATOR_PROFILE</div><h1 class="highlight staff-details-name">${w.name}</h1><div class="staff-details-id">IDENTIFIER: ${w.id}</div></div>
            <div class="staff-details-hours-card"><div class="staff-details-hours-label">TOTAL_DUTY_HOURS</div><div class="staff-details-hours-value">${total} H</div></div>
        </div>
        <div class="staff-details-legend">
            <i class="fas fa-calendar-alt"></i> HARMONOGRAM_INDYWIDUALNY [ LEGENDA: ]
            <span class="staff-details-legend-items">[  <span class="shift-tag sb-1 day">D</span> <span class="shift-tag sb-2 night">N</span> <span class="shift-tag sb-x critical">X</span> <span class="shift-tag sb-u vacation">U</span> <span class="shift-tag sb-s training">S</span> ]</span>
        </div>
        <div class="calendar-layout"><div class="calendar-grid">${calendarGridHtml}</div>${statsHtml}</div>
        <div class="staff-details-status"><span class="highlight">STATUS:</span> Podmiot aktywny w systemie.</div>
    `;
}

window.modifyShift = (wIdx, dIdx, val) => {
  if (!sys_state.data) return;
  sys_state.data.workers[wIdx].shifts[dIdx] = val.toUpperCase();
  if (sys_state.allMonths) {
    const idx = sys_state.allMonths.findIndex(m => m.meta.month.toUpperCase() === sys_state.data.meta.month.toUpperCase());
    if (idx !== -1) {
      sys_state.allMonths[idx] = sys_state.data;
      localStorage.setItem("w5g_all_months", JSON.stringify(sys_state.allMonths));
    }
  }
  localStorage.setItem(LS_KEYS.DATA, JSON.stringify(sys_state.data));
  updateStats();
  renderDashboard();
};

const VIEW_LABELS = {
  dashboard: "DASHBOARD_HUD",
  schedule: "HARMONOGRAM_MTX",
  staff: "PERSONEL_DB",
  editor: "RAW_JSON_DATA",
};

function switchView(view, el) {
  document
    .querySelectorAll(".view-pane")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((l) => l.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  el.classList.add("active");
  document.getElementById("current-view-name").textContent =
    VIEW_LABELS[view] || `${view.toUpperCase()}_HUD`;
  if (view === "editor") {
    requestAnimationFrame(() => refreshJsonView());
  }
}

function toggleSecurityLock() {
  sys_state.isLocked = !sys_state.isLocked;
  document.getElementById("access-mode").textContent = sys_state.isLocked
    ? "READ_ONLY"
    : "EDIT_MODE";
  document.getElementById("btn-lock").innerHTML = sys_state.isLocked
    ? '<i class="fas fa-lock"></i> ODBLOKUJ'
    : '<i class="fas fa-lock-open"></i> ZABLOKUJ';
  renderScheduleTable();
  notify(
    sys_state.isLocked ? "ACCESS_RESTRICTED" : "WRITE_ACCESS_GRANTED",
    sys_state.isLocked ? "info" : "warning",
  );
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme");
  const newTheme = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", newTheme);

  // Update button icon
  const themeBtn = document.querySelector(".btn-theme");
  if (themeBtn) {
    const icon = themeBtn.querySelector("i");
    if (icon) {
      icon.className = newTheme === "dark" ? "fas fa-sun" : "fas fa-moon";
    }
  }

  applyThemeSpecificColors();
  refreshUI();
}

function notify(msg, type) {
  const el = document.getElementById("sys-notify");
  el.textContent = `> ${msg}`;
  el.style.borderLeftColor =
    type === "error" ? "var(--status-error)" : "var(--primary)";
  el.classList.add("active");
  setTimeout(() => el.classList.remove("active"), 3000);
}

function setLoader(val) {
  document.getElementById("loader").style.display = val ? "flex" : "none";
}

function toggleModal(id, val) {
  // REPAIRED LOGIC: Auto-recover if modal missing
  let modal = document.getElementById(id);

  if (!modal && id === "modal-groups") {
    createGroupsModal();
    modal = document.getElementById(id); // Try getting again
  }

  if (!modal) {
    console.error(`[MODAL_ERROR] Element with id '${id}' not found`);
    notify(`MODAL_SYSTEM_ERROR: ${id} NOT_FOUND`, "error");

    // Still try to init specific modals if creation function exists
    if (id === "modal-groups") {
      createGroupsModal();
      // Don't recursive loop, just return. Next click should work if DOM updates.
    }
    return;
  }

  modal.style.display = val ? "flex" : "none";
  if (id === "modal-groups" && val) {
    renderGroupConfigModal();
  }
}

function setupModalBackgroundHandlers() {
  // Setup click handlers for all modals with class 'sys-overlay'
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("sys-overlay")) {
      const modalId = e.target.id;
      if (modalId) {
        toggleModal(modalId, false);
      }
    }
  });
}

function createGroupsModal() {
  const modalHtml = `
        <div id="modal-groups" class="sys-overlay">
            <div class="sys-modal">
                <div class="sys-modal-header">
                    <span>GROUP_PROTOCOLS_EDITOR</span>
                    <i class="fas fa-times modal-close" onclick="toggleModal('modal-groups', false)"></i>
                </div>
                <div class="sys-modal-body">
                    <div id="groups-editor-container"></div>
                    <div class="button-group" style="margin-top:20px;">
                        <button class="btn btn-active" onclick="saveGroupConfig()">SAVE_MATRIX</button>
                        <button class="btn" onclick="toggleModal('modal-groups', false)">CANCEL</button>
                    </div>
                </div>
            </div>
        </div>
    `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

function saveConfiguration() {
  sys_config.token = document.getElementById("cfg-token").value;
  sys_config.repo =
    document.getElementById("cfg-repo").value || DEFAULT_REMOTE_REPO_FULL;
  if (sys_config.repo.includes("/")) {
    const parts = sys_config.repo.split("/");
    sys_config.owner = parts[0];
    sys_config.repo = parts[1];
  }
  localStorage.setItem(LS_KEYS.CONFIG, JSON.stringify(sys_config));
  toggleModal("modal-config", false);
  notify("CONFIG_UPDATED", "success");
}

function loadConfig() {
  const saved = localStorage.getItem(LS_KEYS.CONFIG);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      sys_config = { ...sys_config, ...parsed };
    } catch (e) {
      console.warn("CONFIG_PARSE_FAIL", e);
    }
  }
  if (!sys_config.path || sys_config.path.startsWith("w5g-")) {
    sys_config.path = "mobile-grafik.json";
  }
  if (!sys_config.repo || sys_config.repo === "w5g.github.io") {
    sys_config.repo = "json-lista";
  }
}

async function importCredentialsFromRemoteAuth() {
  try {
    setLoader(true);
    const bundle = remoteAuthRecords || (await fetchRemoteAuthRecords());
    const token = decryptTokenFromAuthBundle(bundle);
    const repoFull =
      decryptRepoPathFromAuthBundle(bundle) || DEFAULT_REMOTE_REPO_FULL;
    document.getElementById("cfg-token").value = token;
    document.getElementById("cfg-repo").value = repoFull;
    notify("REMOTE_AUTH_DECRYPTED", "success");
  } catch (err) {
    notify(`AUTH_IMPORT_FAILED: ${err.message}`, "error");
  } finally {
    setLoader(false);
  }
}

function loadCachedData() {
  const saved = localStorage.getItem("w5g_all_months");
  if (saved) {
    try {
      sys_state.allMonths = JSON.parse(saved);
      updateDataModulesFromMonths();
      const lastModule = localStorage.getItem(LS_KEYS.ACTIVE_MODULE);
      const activeMonth = sys_state.allMonths.find(m => m.meta.month.toUpperCase() === String(lastModule || "").toUpperCase()) || sys_state.allMonths[0];
      if (activeMonth) {
        sys_state.data = activeMonth;
        identifyMonths();
      }
    } catch (e) {
      console.error("LOAD_CACHED_DATA_FAIL", e);
    }
  }
}

window.onload = init;

// === HELPER FUNCTIONS: VISUAL CLASSIFICATION ===
function getTagClass(c) {
  c = (c || "").toUpperCase();
  if (c === "1") return "sb-1";
  if (c === "2") return "sb-2";
  if (c.startsWith("P")) return "sb-p";
  if (c.startsWith("N")) return "sb-1"; // N mapped to day style or sb-n

  if (c === "X") return "sb-x";
  if (c === "U" || c === "ZW") return "sb-u";
  if (c === "S") return "sb-s";

  return "sb-x";
}

function getCellClass(c) {
  c = (c || "").toUpperCase();
  if (c === "1") return "cell-1";
  if (c === "2") return "cell-2";
  if (c.startsWith("P")) return "cell-p";
  if (c.startsWith("N")) return "cell-n";

  if (c === "X") return "cell-x";
  if (c === "U" || c === "ZW") return "cell-u";
  if (c === "S") return "cell-s";

  return "";
}
