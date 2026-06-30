// ============================================================
// KKTIX 搶票小幫手 — Popup Script v2.0
// 分頁切換、狀態查詢、日誌、匯出/匯入、倒數計時
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // ---------- DOM References ----------
    const els = {
        targetUrl: document.getElementById('targetUrl'),
        saleTime: document.getElementById('saleTime'),
        sessionKeyword: document.getElementById('sessionKeyword'),
        autoSelectSession: document.getElementById('autoSelectSession'),
        keyword: document.getElementById('keyword'),
        keyword2: document.getElementById('keyword2'),
        keyword3: document.getElementById('keyword3'),
        quantity: document.getElementById('quantity'),
        autoRefresh: document.getElementById('autoRefresh'),
        autoAgree: document.getElementById('autoAgree'),
        autoSubmit: document.getElementById('autoSubmit'),
        autoRetry: document.getElementById('autoRetry'),
        saveBtn: document.getElementById('saveBtn'),
        saveStatus: document.getElementById('saveStatus'),
        exportBtn: document.getElementById('exportBtn'),
        importBtn: document.getElementById('importBtn'),
        importFile: document.getElementById('importFile'),
        openUrlBtn: document.getElementById('openUrlBtn'),
        clearLogsBtn: document.getElementById('clearLogsBtn'),
        logsContainer: document.getElementById('logsContainer'),
        statusDot: document.getElementById('statusDot'),
        statusText: document.getElementById('statusText'),
        countdownDisplay: document.getElementById('countdownDisplay'),
    };

    const CONFIG_KEYS = {
        targetUrl: '',
        saleTime: '',
        sessionKeyword: '',
        autoSelectSession: false,
        keyword: '',
        keyword2: '',
        keyword3: '',
        quantity: '1',
        autoRefresh: true,
        autoAgree: true,
        autoSubmit: false,
        autoRetry: true
    };

    // ---------- Tab Switching ----------
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById(`tab-${tab.dataset.tab}`);
            if (target) target.classList.add('active');

            // Load logs when switching to logs tab
            if (tab.dataset.tab === 'logs') loadLogs();
        });
    });

    // ---------- Load Settings ----------
    function loadSettings() {
        chrome.storage.sync.get(CONFIG_KEYS, (items) => {
            setVal('targetUrl', items.targetUrl);
            setVal('saleTime', items.saleTime);
            setVal('sessionKeyword', items.sessionKeyword);
            setChecked('autoSelectSession', items.autoSelectSession);
            setVal('keyword', items.keyword);
            setVal('keyword2', items.keyword2);
            setVal('keyword3', items.keyword3);
            setVal('quantity', items.quantity);
            setChecked('autoRefresh', items.autoRefresh);
            setChecked('autoAgree', items.autoAgree);
            setChecked('autoSubmit', items.autoSubmit);
            setChecked('autoRetry', items.autoRetry);

            updateCountdown(items.saleTime);
        });
    }

    function setVal(id, value) {
        if (els[id]) els[id].value = value || '';
    }

    function setChecked(id, value) {
        if (els[id]) els[id].checked = !!value;
    }

    // ---------- Save Settings ----------
    if (els.saveBtn) {
        els.saveBtn.addEventListener('click', () => {
            const config = {
                targetUrl: els.targetUrl?.value || '',
                saleTime: els.saleTime?.value || '',
                sessionKeyword: els.sessionKeyword?.value || '',
                autoSelectSession: els.autoSelectSession?.checked || false,
                keyword: els.keyword?.value || '',
                keyword2: els.keyword2?.value || '',
                keyword3: els.keyword3?.value || '',
                quantity: els.quantity?.value || '1',
                autoRefresh: els.autoRefresh?.checked ?? true,
                autoAgree: els.autoAgree?.checked ?? true,
                autoSubmit: els.autoSubmit?.checked || false,
                autoRetry: els.autoRetry?.checked ?? true,
            };

            chrome.storage.sync.set(config, () => {
                showSaveStatus('✅ 設定已儲存！');

                // Setup alarm if sale time is set
                if (config.saleTime) {
                    chrome.runtime.sendMessage({
                        type: 'SETUP_ALARM',
                        saleTime: config.saleTime
                    });
                }

                updateCountdown(config.saleTime);
            });
        });
    }

    function showSaveStatus(text) {
        if (els.saveStatus) {
            els.saveStatus.textContent = text;
            els.saveStatus.style.opacity = '1';
            setTimeout(() => {
                els.saveStatus.style.opacity = '0';
                setTimeout(() => { els.saveStatus.textContent = ''; }, 300);
            }, 2000);
        }
    }

    // ---------- Export / Import ----------
    if (els.exportBtn) {
        els.exportBtn.addEventListener('click', () => {
            chrome.storage.sync.get(CONFIG_KEYS, (items) => {
                const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `kktix-settings-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showSaveStatus('📤 設定已匯出！');
            });
        });
    }

    if (els.importBtn) {
        els.importBtn.addEventListener('click', () => {
            els.importFile?.click();
        });
    }

    if (els.importFile) {
        els.importFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const config = JSON.parse(evt.target.result);
                    // Validate: only save known keys
                    const validConfig = {};
                    for (const key of Object.keys(CONFIG_KEYS)) {
                        if (key in config) validConfig[key] = config[key];
                    }
                    chrome.storage.sync.set(validConfig, () => {
                        loadSettings();
                        showSaveStatus('📥 設定已匯入！');
                    });
                } catch (err) {
                    showSaveStatus('❌ 匯入失敗：檔案格式錯誤');
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // Reset file input
        });
    }

    // ---------- Open URL ----------
    if (els.openUrlBtn) {
        els.openUrlBtn.addEventListener('click', () => {
            const url = els.targetUrl?.value;
            if (url) {
                chrome.tabs.create({ url, active: true });
            }
        });
    }

    // ---------- Countdown Display ----------
    let countdownTimer = null;

    function updateCountdown(saleTimeStr) {
        if (countdownTimer) clearInterval(countdownTimer);
        if (!els.countdownDisplay) return;

        if (!saleTimeStr) {
            els.countdownDisplay.classList.remove('visible');
            return;
        }

        const tick = () => {
            const now = Date.now();
            const sale = new Date(saleTimeStr).getTime();
            const diff = sale - now;

            if (diff <= 0) {
                els.countdownDisplay.textContent = '🔥 已開賣！';
                els.countdownDisplay.classList.add('visible');
                els.countdownDisplay.style.color = '#00ff88';
                els.countdownDisplay.style.borderColor = 'rgba(0, 255, 136, 0.2)';
                els.countdownDisplay.style.background = 'rgba(0, 255, 136, 0.1)';
                clearInterval(countdownTimer);
                return;
            }

            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            const secs = Math.floor((diff % 60000) / 1000);

            let text = '⏰ 距離開賣：';
            if (days > 0) text += `${days} 天 `;
            text += `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            els.countdownDisplay.textContent = text;
            els.countdownDisplay.classList.add('visible');
        };

        tick();
        countdownTimer = setInterval(tick, 1000);
    }

    // ---------- Status Query ----------
    function queryStatus() {
        try {
            chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    setStatus('offline', '未連線');
                    return;
                }

                const { tabStates } = response;
                const activeStates = Object.values(tabStates || {});

                if (activeStates.length === 0) {
                    setStatus('idle', '待命中 — 開啟 KKTIX 頁面後自動啟動');
                    return;
                }

                // Find the most recent/active state
                const latest = activeStates.sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0))[0];
                const statusMap = {
                    'watching': { cls: 'active', label: '監控中' },
                    'countdown': { cls: 'warning', label: '偵測倒數中' },
                    'refreshing': { cls: 'warning', label: '自動重新整理中' },
                    'filling': { cls: 'active', label: '自動填寫中' },
                    'success': { cls: 'active', label: '操作成功' },
                    'error': { cls: 'error', label: '發生錯誤' },
                    'retry': { cls: 'warning', label: '重試中' },
                };

                const info = statusMap[latest.status] || { cls: '', label: latest.status };
                setStatus(info.cls, `${info.label}${latest.detail ? ' — ' + latest.detail : ''}`);
            });
        } catch (e) {
            setStatus('offline', '未連線');
        }
    }

    function setStatus(cls, text) {
        if (els.statusDot) {
            els.statusDot.className = 'status-dot';
            if (cls) els.statusDot.classList.add(cls);
        }
        if (els.statusText) els.statusText.textContent = text;
    }

    // ---------- Logs ----------
    function loadLogs() {
        try {
            chrome.runtime.sendMessage({ type: 'GET_LOGS' }, (response) => {
                if (chrome.runtime.lastError || !response || !response.logs) {
                    renderLogs([]);
                    return;
                }
                renderLogs(response.logs);
            });
        } catch (e) {
            renderLogs([]);
        }
    }

    function renderLogs(logs) {
        if (!els.logsContainer) return;

        if (!logs || logs.length === 0) {
            els.logsContainer.innerHTML = '<div class="logs-empty">尚無日誌記錄</div>';
            return;
        }

        // Show newest first
        const reversedLogs = [...logs].reverse();
        const icons = {
            'system': '⚙️',
            'action': '▶️',
            'notify': '🔔'
        };

        els.logsContainer.innerHTML = reversedLogs.map(log => {
            const time = new Date(log.time).toLocaleTimeString('zh-TW', { hour12: false });
            const icon = icons[log.type] || '📝';
            const type = log.type || 'system';
            return `<div class="log-entry ${type}">
                <span class="log-time">${time}</span>
                <span class="log-icon">${icon}</span>
                <span class="log-message">${escapeHtml(log.message || '')}</span>
            </div>`;
        }).join('');
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    if (els.clearLogsBtn) {
        els.clearLogsBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, () => {
                renderLogs([]);
            });
        });
    }

    // ---------- Init ----------
    loadSettings();
    queryStatus();

    // Refresh status every 2 seconds while popup is open
    setInterval(queryStatus, 2000);
});
