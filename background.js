// ============================================================
// KKTIX 搶票小幫手 — Background Service Worker
// 負責：排程、通知、Badge、日誌管理、跨分頁協調
// ============================================================

// ---------- 初始化 ----------
chrome.runtime.onInstalled.addListener(() => {
    console.log("[KKTIX BG] Extension installed / updated");
    chrome.action.setBadgeBackgroundColor({ color: '#666666' });
    chrome.action.setBadgeText({ text: '' });
});

// ---------- 狀態管理 ----------
const tabStates = {}; // tabId -> { status, lastUpdate }

function updateBadge(status) {
    const badges = {
        'idle':       { text: '',   color: '#666666' },
        'watching':   { text: '👁',  color: '#FF9800' },
        'countdown':  { text: '⏳',  color: '#FF9800' },
        'refreshing': { text: '🔄',  color: '#2196F3' },
        'filling':    { text: '✏️',  color: '#4CAF50' },
        'success':    { text: '✅',  color: '#4CAF50' },
        'error':      { text: '❌',  color: '#F44336' },
        'retry':      { text: '🔁',  color: '#FF5722' }
    };
    const b = badges[status] || badges['idle'];
    chrome.action.setBadgeText({ text: b.text });
    chrome.action.setBadgeBackgroundColor({ color: b.color });
}

// ---------- 操作日誌 ----------
async function addLog(entry) {
    const data = await chrome.storage.local.get({ logs: [] });
    const logs = data.logs;
    logs.push({
        time: new Date().toISOString(),
        ...entry
    });
    // 保留最近 200 筆
    if (logs.length > 200) logs.splice(0, logs.length - 200);
    await chrome.storage.local.set({ logs });
}

async function getLogs() {
    const data = await chrome.storage.local.get({ logs: [] });
    return data.logs;
}

async function clearLogs() {
    await chrome.storage.local.set({ logs: [] });
}

// ---------- 開賣時間排程 ----------
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'kktix-sale-pre') {
        console.log("[KKTIX BG] Pre-sale alarm fired! Opening target page...");
        await addLog({ type: 'system', message: '開賣排程觸發，正在開啟目標頁面...' });

        const config = await chrome.storage.sync.get({ targetUrl: '', autoRefresh: true });
        if (config.targetUrl) {
            // 檢查是否已有開啟的分頁
            const tabs = await chrome.tabs.query({ url: '*://*.kktix.com/*' });
            const kktixTabs = tabs.concat(await chrome.tabs.query({ url: '*://*.kktix.cc/*' }));
            const existingTab = kktixTabs.find(t => t.url && t.url.includes(config.targetUrl.replace(/https?:\/\//, '')));

            if (existingTab) {
                await chrome.tabs.reload(existingTab.id);
                await chrome.tabs.update(existingTab.id, { active: true });
            } else {
                await chrome.tabs.create({ url: config.targetUrl, active: true });
            }

            sendNotification('開賣排程', '已自動開啟目標活動頁面，準備搶票！');
            updateBadge('watching');
        }
    }

    if (alarm.name === 'kktix-sale-refresh') {
        // 高頻重新整理階段（開賣前後 30 秒內）
        const config = await chrome.storage.sync.get({ targetUrl: '' });
        if (config.targetUrl) {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.url && (tab.url.includes('kktix.com') || tab.url.includes('kktix.cc'))) {
                    chrome.tabs.reload(tab.id);
                }
            }
        }
    }
});

async function setupSaleAlarm(saleTimeISO) {
    // 清除現有 alarm
    await chrome.alarms.clear('kktix-sale-pre');
    await chrome.alarms.clear('kktix-sale-refresh');

    if (!saleTimeISO) return;

    const saleTime = new Date(saleTimeISO).getTime();
    const now = Date.now();

    if (saleTime <= now) {
        console.log("[KKTIX BG] Sale time is in the past, skipping alarm.");
        return;
    }

    // 開賣前 10 秒觸發
    const preAlarmTime = saleTime - 10000;
    if (preAlarmTime > now) {
        chrome.alarms.create('kktix-sale-pre', { when: preAlarmTime });
        console.log(`[KKTIX BG] Pre-sale alarm set for ${new Date(preAlarmTime).toLocaleString()}`);
        await addLog({ type: 'system', message: `排程已設定：${new Date(preAlarmTime).toLocaleString()} 自動開啟頁面` });
    }
}

// ---------- 系統通知 ----------
function sendNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎫</text></svg>'),
        title: `KKTIX 搶票小幫手 — ${title}`,
        message: message
    });
}

// ---------- 訊息處理（來自 content script 和 popup） ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        switch (msg.type) {
            case 'STATUS_UPDATE':
                if (sender.tab) {
                    tabStates[sender.tab.id] = {
                        status: msg.status,
                        detail: msg.detail || '',
                        url: sender.tab.url,
                        lastUpdate: Date.now()
                    };
                }
                updateBadge(msg.status);
                if (msg.log) {
                    await addLog({ type: 'action', tabId: sender.tab?.id, message: msg.log });
                }
                sendResponse({ ok: true });
                break;

            case 'NOTIFY':
                sendNotification(msg.title || '通知', msg.message);
                await addLog({ type: 'notify', message: msg.message });
                sendResponse({ ok: true });
                break;

            case 'GET_STATUS':
                sendResponse({ tabStates, badge: await chrome.action.getBadgeText({}) });
                break;

            case 'GET_LOGS':
                const logs = await getLogs();
                sendResponse({ logs });
                break;

            case 'CLEAR_LOGS':
                await clearLogs();
                sendResponse({ ok: true });
                break;

            case 'SETUP_ALARM':
                await setupSaleAlarm(msg.saleTime);
                sendResponse({ ok: true });
                break;

            case 'GET_ALARM':
                const alarm = await chrome.alarms.get('kktix-sale-pre');
                sendResponse({ alarm: alarm || null });
                break;

            default:
                sendResponse({ error: 'Unknown message type' });
        }
    })();
    return true; // 保持 sendResponse 有效（非同步）
});

// 分頁關閉時清除狀態
chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabStates[tabId];
    // 若無活躍分頁，重置 badge
    if (Object.keys(tabStates).length === 0) {
        updateBadge('idle');
    }
});

console.log("[KKTIX BG] Background service worker started.");
