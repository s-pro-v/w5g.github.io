// --- CONFIGURATION & STATE ---
const LS_CONFIG_KEY = 'gh_editor_config';
const LS_DATA_KEY = 'gh_editor_data';

let config = {
    token: '',
    owner: '',
    repo: '',
    path: '',
    branch: 'main'
};

let state = {
    json: null,
    sha: null, // Required for GitHub API updates
    rawText: ''
};

// --- DOM ELEMENTS ---
const els = {
    editor: document.getElementById('json-editor'),
    lines: document.getElementById('line-numbers'),
    schedule: document.getElementById('schedule-container'),
    statusRepo: document.getElementById('status-repo'),
    statusFile: document.getElementById('status-file'),
    statusMsg: document.getElementById('status-msg'),
    notification: document.getElementById('notification'),
    notifMsg: document.getElementById('notif-msg'),
    notifIcon: document.getElementById('notif-icon')
};

// --- INITIALIZATION ---
function init() {
    loadConfig();
    loadLocalData();

    // Event Listeners
    document.getElementById('btn-config').addEventListener('click', () => {
        populateConfigForm();
        toggleModal('config-modal', true);
    });

    document.getElementById('btn-save-config').addEventListener('click', saveConfig);

    document.getElementById('btn-pull').addEventListener('click', pullFromGitHub);
    document.getElementById('btn-push').addEventListener('click', pushToGitHub);

    document.getElementById('btn-view-table').addEventListener('click', () => switchView('table'));
    document.getElementById('btn-view-code').addEventListener('click', () => switchView('code'));

    document.getElementById('btn-theme').addEventListener('click', toggleTheme);

    // Editor Sync
    els.editor.addEventListener('input', () => {
        state.rawText = els.editor.value;
        updateLineNumbers();
        try {
            state.json = JSON.parse(state.rawText);
            localStorage.setItem(LS_DATA_KEY, state.rawText);
            // Usually we would re-render table, but for performance let's wait for view switch or manual trigger
        } catch (e) {
            // Invalid JSON
        }
    });

    els.editor.addEventListener('scroll', () => {
        els.lines.scrollTop = els.editor.scrollTop;
    });
}

// --- GITHUB API FUNCTIONS ---
async function pullFromGitHub() {
    if (!validateConfig()) return;

    showNotify('POBIERANIE DANYCH...', 'loading');

    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}?ref=${config.branch}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${config.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) throw new Error(`Błąd HTTP: ${response.status}`);

        const data = await response.json();

        // GitHub returns content in base64
        // Need to handle UTF-8 properly
        const content = decodeURIComponent(escape(window.atob(data.content)));

        state.sha = data.sha; // Save SHA for next update
        state.rawText = content;
        state.json = JSON.parse(content);

        els.editor.value = content;
        updateLineNumbers();
        renderTable();

        localStorage.setItem(LS_DATA_KEY, content);
        showNotify('DANE POBRANE POMYŚLNIE.', 'success');
        updateStatus('ZSYNCHRONIZOWANO');

    } catch (error) {
        console.error(error);
        showNotify(`BŁĄD: ${error.message}`, 'error');
    }
}

async function pushToGitHub() {
    if (!validateConfig()) return;
    if (!state.sha) {
        showNotify('BRAK SHA. NAJPIERW ZRÓB PULL.', 'error');
        return;
    }

    try {
        // Validate JSON before sending
        JSON.parse(state.rawText);
    } catch (e) {
        showNotify('BŁĄD JSON. POPRAW SKŁADNIĘ.', 'error');
        return;
    }

    const commitMsg = prompt("WIADOMOŚĆ COMMITA:", `Aktualizacja ${new Date().toLocaleTimeString()}`);
    if (commitMsg === null) return;

    showNotify('WYSYŁANIE ZMIAN...', 'loading');

    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`;

    // Encode content to Base64 (UTF-8 safe)
    const contentEncoded = btoa(unescape(encodeURIComponent(state.rawText)));

    const payload = {
        message: commitMsg,
        content: contentEncoded,
        sha: state.sha,
        branch: config.branch
    };

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${config.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || response.statusText);
        }

        const data = await response.json();
        state.sha = data.content.sha; // Update SHA

        showNotify('ZMIANY ZAPISANE W REPOZYTORIUM!', 'success');
        updateStatus(`ZAPISANO: ${new Date().toLocaleTimeString()}`);

    } catch (error) {
        console.error(error);
        showNotify(`BŁĄD ZAPISU: ${error.message}`, 'error');
    }
}

// --- UI LOGIC ---
function renderTable() {
    if (!state.json || !state.json.workers || !state.json.meta) {
        els.schedule.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted); text-transform:uppercase;">Brak danych lub niepoprawny format JSON (wymagane "meta" i "workers")</div>';
        return;
    }

    const days = state.json.meta.days;
    const weekdays = state.json.meta.weekdays;

    let html = '<table><thead><tr>';
    html += '<th class="col-id">ID</th>';
    html += '<th class="col-name">PRACOWNIK</th>';

    days.forEach((day, idx) => {
        const wd = weekdays[idx] || '';
        const isWeekend = wd === 'SO' || wd === 'ND';
        const style = isWeekend ? 'color: var(--highlight-color)' : '';
        html += `<th style="${style}; width: 35px;">${day}<br><span style="font-size:9px; opacity:0.7">${wd}</span></th>`;
    });

    html += '<th class="col-sum">SUMA</th></tr></thead><tbody>';

    state.json.workers.forEach((worker, wIdx) => {
        const shifts = worker.shifts || [];
        let hours = 0;

        html += `<tr>`;
        html += `<td class="col-id">${worker.id}</td>`;
        html += `<td class="col-name" title="${worker.name}">${worker.name}</td>`;

        days.forEach((day, dIdx) => {
            const val = shifts[dIdx] || '';
            const wd = weekdays[dIdx] || '';
            const isWeekend = wd === 'SO' || wd === 'ND';
            const bgClass = isWeekend ? 'weekend' : '';

            // Count hours (simplified logic: 12h for specific codes)
            if (['1', '2', 'N', 'N1', 'N2'].includes(val.toUpperCase())) hours += 12;

            html += `<td class="${bgClass}">
                        <input type="text" 
                               value="${val}" 
                               data-w="${wIdx}" 
                               data-d="${dIdx}"
                               onchange="updateShift(this)">
                    </td>`;
        });

        html += `<td class="col-sum" id="sum-${wIdx}">${hours}</td>`;
        html += `</tr>`;
    });

    html += '</tbody></table>';
    els.schedule.innerHTML = html;
}

window.updateShift = function (input) {
    const wIdx = input.dataset.w;
    const dIdx = input.dataset.d;
    const val = input.value;

    // Update State
    if (!state.json.workers[wIdx].shifts) state.json.workers[wIdx].shifts = [];
    state.json.workers[wIdx].shifts[dIdx] = val;

    // Recalculate Sum (Simple logic)
    let hours = 0;
    state.json.workers[wIdx].shifts.forEach(s => {
        if (['1', '2', 'N', 'N1', 'N2'].includes(String(s).toUpperCase())) hours += 12;
    });
    document.getElementById(`sum-${wIdx}`).textContent = hours;

    // Sync to Raw JSON
    state.rawText = JSON.stringify(state.json, null, 2);
    els.editor.value = state.rawText;
    updateLineNumbers();
    localStorage.setItem(LS_DATA_KEY, state.rawText);
};

function switchView(view) {
    document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.toolbar .btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`view-${view}`).classList.add('active');
    document.getElementById(`btn-view-${view}`).classList.add('active');

    if (view === 'table') renderTable();
}

function updateLineNumbers() {
    const count = state.rawText.split('\n').length;
    els.lines.innerHTML = Array(count).fill(0).map((_, i) => i + 1).join('<br>');
}

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('theme') === 'dark';
    if (isDark) html.removeAttribute('theme');
    else html.setAttribute('theme', 'dark');
}

// --- CONFIG HELPERS ---
function loadConfig() {
    const saved = localStorage.getItem(LS_CONFIG_KEY);
    if (saved) {
        config = JSON.parse(saved);
        updateStatusDisplay();
    }
}

function populateConfigForm() {
    document.getElementById('cfg-token').value = config.token;
    document.getElementById('cfg-owner').value = config.owner;
    document.getElementById('cfg-repo').value = config.repo;
    document.getElementById('cfg-path').value = config.path;
    document.getElementById('cfg-branch').value = config.branch;
}

function saveConfig() {
    config.token = document.getElementById('cfg-token').value.trim();
    config.owner = document.getElementById('cfg-owner').value.trim();
    config.repo = document.getElementById('cfg-repo').value.trim();
    config.path = document.getElementById('cfg-path').value.trim();
    config.branch = document.getElementById('cfg-branch').value.trim() || 'main';

    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(config));
    toggleModal('config-modal', false);
    updateStatusDisplay();
    showNotify('KONFIGURACJA ZAPISANA.', 'success');
}

function loadLocalData() {
    const saved = localStorage.getItem(LS_DATA_KEY);
    if (saved) {
        state.rawText = saved;
        els.editor.value = saved;
        try {
            state.json = JSON.parse(saved);
            updateLineNumbers();
            renderTable();
        } catch (e) { }
    }
}

function updateStatusDisplay() {
    if (config.owner && config.repo) {
        els.statusRepo.innerHTML = `REPO: <span style="color: var(--highlight-color)">${config.owner}/${config.repo}</span>`;
        els.statusFile.textContent = `PLIK: ${config.path}`;
    }
}

function validateConfig() {
    if (!config.token || !config.repo || !config.path) {
        showNotify('BŁĄD KONFIGURACJI.', 'error');
        toggleModal('config-modal', true);
        return false;
    }
    return true;
}

// --- UTILS ---
function toggleModal(id, show) {
    const el = document.getElementById(id);
    if (show) el.classList.add('active');
    else el.classList.remove('active');
}

function updateStatus(msg) {
    els.statusMsg.textContent = msg;
}

function showNotify(msg, type = 'info') {
    els.notifMsg.textContent = msg;
    els.notification.classList.add('visible');

    // Icon handling
    const icons = {
        'loading': 'fas fa-spinner fa-spin',
        'success': 'fas fa-check',
        'error': 'fas fa-triangle-exclamation',
        'info': 'fas fa-info-circle'
    };
    els.notifIcon.className = icons[type] || icons['info'];

    // Color handling
    if (type === 'error') els.notification.style.borderColor = 'red';
    else els.notification.style.borderColor = 'var(--highlight-color)';

    setTimeout(() => {
        els.notification.classList.remove('visible');
    }, 3000);
}

// Start
init();