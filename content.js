// ============================================================
// KKTIX 搶票小幫手 — Content Script v2.0
// 負責：頁面自動化、多票種備援、自動提交、502/503 重試、日誌回報
// ============================================================

console.log("[KKTIX Helper] Extension Loaded v2.0");

// ---------- 狀態回報 ----------
function reportStatus(status, detail = '', log = '') {
    try {
        chrome.runtime.sendMessage({
            type: 'STATUS_UPDATE',
            status,
            detail,
            log
        });
    } catch (e) {
        // Extension context 可能已失效
        console.log("[KKTIX Helper] Failed to report status:", e.message);
    }
}

function reportNotify(title, message) {
    try {
        chrome.runtime.sendMessage({ type: 'NOTIFY', title, message });
    } catch (e) {
        console.log("[KKTIX Helper] Failed to send notification:", e.message);
    }
}

// ---------- 浮動狀態 Badge ----------
function createStatusBadge() {
    if (document.getElementById('kktix-helper-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'kktix-helper-badge';
    badge.innerHTML = '🎫 搶票小幫手：運作中';
    Object.assign(badge.style, {
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: '99999',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        color: '#00ff88',
        padding: '12px 20px',
        borderRadius: '16px',
        fontSize: '13px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: '600',
        boxShadow: '0 4px 24px rgba(0,255,136,0.15), 0 0 0 1px rgba(0,255,136,0.1)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: '0',
        transform: 'translateY(10px)',
        pointerEvents: 'none',
        backdropFilter: 'blur(10px)',
        maxWidth: '320px',
        lineHeight: '1.4'
    });
    document.body.appendChild(badge);
    requestAnimationFrame(() => {
        badge.style.opacity = '1';
        badge.style.transform = 'translateY(0)';
    });
    return badge;
}

function updateStatusBadge(text) {
    let badge = document.getElementById('kktix-helper-badge');
    if (!badge) badge = createStatusBadge();
    if (badge) badge.innerHTML = text;
}

// ---------- 502/503 自動重試 ----------
function check502503(config) {
    if (!config.autoRetry) return false;

    const title = document.title || '';
    const bodyText = document.body?.textContent || '';
    const is502 = title.includes('502') || title.includes('503') ||
                  title.includes('Bad Gateway') || title.includes('Service Unavailable') ||
                  bodyText.includes('502 Bad Gateway') ||
                  bodyText.includes('503 Service Temporarily Unavailable') ||
                  bodyText.includes('Service Temporarily Unavailable');

    if (is502) {
        const delay = 500 + Math.floor(Math.random() * 500); // 500-1000ms
        console.log(`[KKTIX Helper] Detected error page, retrying in ${delay}ms...`);
        updateStatusBadge(`🔁 偵測到 502/503 錯誤，${(delay / 1000).toFixed(1)} 秒後自動重試...`);
        reportStatus('retry', '502/503', `偵測到伺服器錯誤頁面，${delay}ms 後重試`);
        setTimeout(() => location.reload(), delay);
        return true;
    }
    return false;
}

// ---------- waitForElement ----------
function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);

        let timer = null;
        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                clearTimeout(timer);
                observer.disconnect();
                resolve(el);
            }
        });

        observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true
        });

        timer = setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
}

let eventPageInterval = null;
let refreshTimeoutId = null;

// ---------- Angular Digest ----------
function triggerAngularDigest(element) {
    try {
        if (typeof angular !== 'undefined' && angular.element) {
            const scope = angular.element(element).scope();
            if (scope && typeof scope.$apply === 'function') {
                scope.$apply();
                console.log("[KKTIX Helper] Triggered Angular $apply()");
            }
        }
    } catch (e) {
        // Angular 可能不存在
    }
}

// ============================================================
// Event Page: 偵測倒數、自動重新整理、自動進入場次
// ============================================================
function handleEventPage(config) {
    console.log("[KKTIX Helper] Started Event Page Watcher");
    createStatusBadge();
    updateStatusBadge('🎫 搶票小幫手：偵測倒數中...');
    reportStatus('countdown', '偵測倒數中', '進入活動頁面，開始偵測倒數');

    if (eventPageInterval) clearInterval(eventPageInterval);
    if (refreshTimeoutId) clearTimeout(refreshTimeoutId);

    eventPageInterval = setInterval(() => {
        const buttons = document.querySelectorAll(
            '.tickets .btn-point, .ticket-buy-btn, a.btn-point, ' +
            '.btn-primary[href*="registrations"], a[href*="registrations/new"]'
        );

        if (buttons.length === 0) return;

        let targetBtn = null;

        if (config.sessionKeyword) {
            for (let btn of buttons) {
                const row = btn.closest('li, tr, .ticket-info, .event-info, div');
                if (row && row.textContent.includes(config.sessionKeyword)) {
                    targetBtn = btn;
                    break;
                }
            }
        }

        if (!targetBtn) targetBtn = buttons[0];

        const isDisabled = targetBtn.disabled || targetBtn.classList.contains('disabled') || 
                           targetBtn.textContent.includes('尚未開賣') || targetBtn.textContent.includes('即將開賣');

        if (isDisabled) {
            if (config.autoRefresh) {
                let delay = 1000;
                if (config.saleTime) {
                    const diff = new Date(config.saleTime).getTime() - Date.now();
                    if (diff < 10000 && diff > 0) {
                        delay = 300 + Math.random() * 300; // 倒數 10 秒內，極速重整 (300-600ms)
                    } else if (diff < 0) {
                        delay = 500 + Math.random() * 500; // 已過開賣時間但按鈕仍鎖住，快速重整 (500-1000ms)
                    } else {
                        delay = 1500 + Math.random() * 1000; // 距離開賣還很久，適度重整 (1.5-2.5s)
                    }
                } else {
                    delay = 800 + Math.random() * 700; // 沒設定時間，預設 800-1500ms
                }
                console.log(`[KKTIX Helper] Not on sale yet, refreshing in ${delay.toFixed(0)}ms...`);
                updateStatusBadge(`🎫 尚未開賣，${(delay / 1000).toFixed(2)} 秒後重新整理...`);
                reportStatus('refreshing', '尚未開賣', `尚未開賣，${delay.toFixed(0)}ms 後重新整理`);
                clearInterval(eventPageInterval);
                refreshTimeoutId = setTimeout(() => location.reload(), delay);
            }
        } else {
            if (config.autoSelectSession) {
                console.log("[KKTIX Helper] Countdown finished! Clicking ticket button!");
                updateStatusBadge('🎫 倒數結束！正在進入選票頁面...');
                reportStatus('success', '倒數結束', '倒數結束，自動點擊進入選票頁面');
                reportNotify('倒數結束', '已自動點擊進入選票頁面！');
                clearInterval(eventPageInterval);
                targetBtn.click();
                if (targetBtn.tagName.toLowerCase() === 'a' && targetBtn.href) {
                    location.href = targetBtn.href;
                }
            } else {
                updateStatusBadge('🎫 已開賣！請手動點擊按鈕進入');
                reportStatus('watching', '已開賣', '已開賣，等待手動點擊');
            }
        }
    }, 200);
}

// ============================================================
// Registration Page: 多票種備援、自動填寫、自動提交
// ============================================================
async function handleRegistrationPage(config) {
    console.log("[KKTIX Helper] Handling Registration Page");
    createStatusBadge();
    updateStatusBadge('🎫 正在載入票種列表...');
    reportStatus('filling', '載入票種', '進入選票頁面，等待票種列表載入');

    try {
        await waitForElement('.ticket-list > .ng-scope, .ticket-list .ticket-row, .display-table-row', 30000);
        console.log("[KKTIX Helper] Ticket list found.");
        reportStatus('filling', '票種列表已載入', '票種列表已載入');

        const ticketRows = document.querySelectorAll(
            '.ticket-list > .ng-scope, .ticket-list .ticket-row, .display-table-row'
        );

        // 多票種備援：依序嘗試 keyword → keyword2 → keyword3 → 第一個可用
        const keywords = [config.keyword, config.keyword2, config.keyword3].filter(k => k && k.trim());
        let selectedRow = null;
        let matchedKeyword = '';

        for (const kw of keywords) {
            for (let row of ticketRows) {
                const titleEl = row.querySelector('.ticket-name, .name');
                const qtyInput = row.querySelector('input[type="text"], input[type="number"], select');
                if (titleEl && titleEl.textContent.includes(kw)) {
                    if (qtyInput && !qtyInput.disabled) {
                        selectedRow = row;
                        matchedKeyword = kw;
                        console.log(`[KKTIX Helper] Found ticket matching keyword: "${kw}"`);
                        reportStatus('filling', `匹配票種: ${kw}`, `以關鍵字「${kw}」找到可用票種`);
                        break;
                    } else {
                        console.log(`[KKTIX Helper] Keyword "${kw}" matched but sold out, trying next...`);
                        reportStatus('filling', `${kw} 已售完`, `關鍵字「${kw}」的票種已售完，嘗試下一個`);
                    }
                }
            }
            if (selectedRow) break;
        }

        // Fallback: 選第一個可用
        if (!selectedRow && ticketRows.length > 0) {
            console.log("[KKTIX Helper] No keyword match. Selecting the first available ticket.");
            reportStatus('filling', '選擇第一個可用票種', '無關鍵字匹配，選擇第一個可用票種');
            for (let row of ticketRows) {
                const qtyInput = row.querySelector('input[type="text"], input[type="number"], select');
                if (qtyInput && !qtyInput.disabled) {
                    selectedRow = row;
                    break;
                }
            }
        }

        if (selectedRow) {
            const qtyInput = selectedRow.querySelector('input[type="text"], input[type="number"], select');

            if (qtyInput && !qtyInput.disabled) {
                qtyInput.focus();

                if (qtyInput.tagName.toLowerCase() === 'select') {
                    const desiredQty = String(config.quantity);
                    const optionExists = Array.from(qtyInput.options).some(opt => opt.value === desiredQty);

                    if (optionExists) {
                        qtyInput.value = desiredQty;
                    } else {
                        const maxOption = Array.from(qtyInput.options)
                            .filter(opt => opt.value && !isNaN(opt.value))
                            .sort((a, b) => Number(b.value) - Number(a.value))[0];
                        if (maxOption) {
                            qtyInput.value = maxOption.value;
                            console.log(`[KKTIX Helper] Qty ${desiredQty} unavailable, fallback to max: ${maxOption.value}`);
                            reportStatus('filling', `數量降級: ${maxOption.value}`, `要求 ${desiredQty} 張但不可用，降級為 ${maxOption.value} 張`);
                        }
                    }
                } else {
                    // Try to click "+" button if available (most robust for modern frameworks)
                    const buttons = selectedRow.querySelectorAll('button');
                    let plusBtn = null;
                    for (const btn of buttons) {
                        if (btn.textContent.includes('+') || btn.querySelector('.fa-plus') || btn.classList.contains('plus')) {
                            plusBtn = btn;
                            break;
                        }
                    }

                    if (plusBtn) {
                        const currentQty = parseInt(qtyInput.value, 10) || 0;
                        const targetQty = parseInt(config.quantity, 10) || 1;
                        let clicksNeeded = targetQty - currentQty;
                        while (clicksNeeded > 0) {
                            plusBtn.click();
                            clicksNeeded--;
                        }
                    } else {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLInputElement.prototype, 'value'
                        )?.set;
                        if (nativeInputValueSetter) {
                            nativeInputValueSetter.call(qtyInput, config.quantity);
                        } else {
                            qtyInput.value = config.quantity;
                        }
                    }
                }

                qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
                qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
                triggerAngularDigest(qtyInput);

                const finalQty = qtyInput.value;
                console.log(`[KKTIX Helper] Set quantity to ${finalQty}`);
                updateStatusBadge(`🎫 已選擇 ${finalQty} 張票${matchedKeyword ? ` (${matchedKeyword})` : ''}`);
                reportStatus('filling', `已填 ${finalQty} 張`, `已填入數量: ${finalQty} 張`);
            } else {
                console.log("[KKTIX Helper] Input is disabled, likely sold out.");
                updateStatusBadge('🎫 該票種已售完');
                reportStatus('error', '已售完', '所選票種已售完');
            }
        } else {
            console.log("[KKTIX Helper] No available ticket rows found.");
            updateStatusBadge('🎫 找不到可選購的票種');
            reportStatus('error', '無可用票種', '找不到任何可選購的票種');
            reportNotify('搶票失敗', '找不到任何可選購的票種！');
        }

        // 自動勾選同意條款
        if (config.autoAgree) {
            const agreeCheckbox = document.querySelector(
                'input[type="checkbox"][id="person_agree_terms"], ' +
                'input[type="checkbox"][id*="agree"]'
            );
            if (agreeCheckbox && !agreeCheckbox.checked) {
                agreeCheckbox.click();
                agreeCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                triggerAngularDigest(agreeCheckbox);
                console.log("[KKTIX Helper] Checked agree terms.");
                reportStatus('filling', '已勾同意', '已自動勾選同意條款');
            }
        }

        // Auto-focus on CAPTCHA/custom question (排除 ticket-list 內的 input)
        let hasCaptchaOrQuestion = false;
        const questionInput = document.querySelector([
            '.custom-question input[type="text"]',
            '.captcha input[type="text"]',
            'input.custom-question-input',
        ].join(', '));

        if (questionInput) {
            questionInput.focus();
            hasCaptchaOrQuestion = true;
            console.log("[KKTIX Helper] Auto-focused on question/captcha input.");
            reportStatus('filling', '等待驗證碼', '偵測到驗證碼/自訂問題欄位，已自動聚焦');
        } else {
            const allTextInputs = document.querySelectorAll('input[type="text"]:not([readonly]):not([disabled])');
            for (const input of allTextInputs) {
                if (!input.closest('.ticket-list') && !input.closest('.ticket-row')) {
                    input.focus();
                    hasCaptchaOrQuestion = true;
                    console.log("[KKTIX Helper] Auto-focused on fallback input outside ticket-list.");
                    reportStatus('filling', '等待填寫', '偵測到需填寫的欄位，已自動聚焦');
                    break;
                }
            }
        }

        // 自動提交
        if (config.autoSubmit && selectedRow) {
            if (hasCaptchaOrQuestion) {
                console.log("[KKTIX Helper] CAPTCHA/question detected, skipping auto-submit.");
                updateStatusBadge('🎫 偵測到驗證碼/問題，請手動填寫後送出');
                reportStatus('filling', '等待手動提交', '偵測到驗證碼/自訂問題，跳過自動提交');
            } else {
                // Wait for submit button to be enabled (up to 3 seconds for AJAX price calc)
                let submitBtn = null;
                for (let i = 0; i < 15; i++) {
                    const btns = document.querySelectorAll(
                        'button[type="submit"], .btn-primary, input[type="submit"], button.submit-btn, .register-new-next-button-area button'
                    );
                    submitBtn = Array.from(btns).find(b => 
                        !b.disabled && 
                        !b.classList.contains('disabled') &&
                        (b.type === 'submit' || b.classList.contains('btn-primary') || b.textContent.includes('下一步') || b.textContent.includes('確認'))
                    );
                    if (submitBtn) break;
                    await new Promise(r => setTimeout(r, 200));
                }

                if (submitBtn) {
                    console.log("[KKTIX Helper] Auto-submitting (no CAPTCHA detected)...");
                    updateStatusBadge('🎫 自動提交中...');
                    reportStatus('success', '自動提交', '無驗證碼，自動點擊「下一步」');
                    submitBtn.click();
                    reportNotify('自動提交', '已自動點擊「下一步」！請繼續完成後續步驟。');
                } else {
                    console.log("[KKTIX Helper] Submit button not found or disabled after waiting.");
                    updateStatusBadge('🎫 自動化完成！請手動點擊下一步');
                    reportStatus('filling', '等待手動提交', '提交按鈕未找到或不可用');
                }
            }
        } else {
            updateStatusBadge('🎫 自動化完成！請確認後送出');
            reportStatus('filling', '等待手動提交', '自動化完成，等待手動提交');
        }

        console.log("[KKTIX Helper] Registration page automation complete.");

    } catch (e) {
        console.log("[KKTIX Helper] Error on registration page:", e);
        updateStatusBadge('🎫 發生錯誤，請手動操作');
        reportStatus('error', e.message, `選票頁面錯誤: ${e.message}`);
    }
}

// ============================================================
// Main: 根據 URL/頁面狀態執行
// ============================================================
function run() {
    chrome.storage.sync.get({
        sessionKeyword: '',
        autoSelectSession: false,
        keyword: '',
        keyword2: '',
        keyword3: '',
        quantity: '1',
        autoRefresh: true,
        autoAgree: true,
        autoSubmit: false,
        autoRetry: true,
        targetUrl: '',
        saleTime: ''
    }, (config) => {
        // 先檢查 502/503
        if (check502503(config)) return;

        // Clear previous intervals/timeouts for SPA navigations
        if (eventPageInterval) clearInterval(eventPageInterval);
        if (refreshTimeoutId) clearTimeout(refreshTimeoutId);

        const url = window.location.href;

        if (url.includes('/registrations/new')) {
            handleRegistrationPage(config);
        } else if (url.includes('/events/')) {
            handleEventPage(config);
        }
    });
}

// 初始執行
run();

// SPA URL 變更偵測
let lastUrl = location.href;
setInterval(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log("[KKTIX Helper] URL changed to", url);
        run();
    }
}, 500);
