# 🎫 KKTIX 搶票小幫手

> 一款功能強大的 Chrome 擴充功能，輔助你在 KKTIX 上更快速地完成選票與購票流程。

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-00C853?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-2.0-FF9800?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

---

## ✨ 功能特色

| 功能 | 說明 |
|------|------|
| ⏰ **開賣時間排程** | 設定開賣時間，自動在開賣前 10 秒開啟目標頁面 |
| 🎯 **多票種備援** | 支援三個志願依序嘗試，第一個售完自動切換下一個 |
| ⚡ **自動提交** | 無驗證碼/自訂問題時，自動點擊「下一步」 |
| 🔁 **502/503 自動重試** | 偵測伺服器錯誤頁面，自動以隨機延遲重新整理 |
| 📋 **操作日誌** | 完整記錄每一步操作，方便事後檢查 |
| 🔔 **桌面通知** | 關鍵時刻（倒數結束、搶票成功/失敗）發送系統通知 |
| 📤 **設定匯出/匯入** | 將設定匯出為 JSON 檔案，方便分享或跨裝置同步 |
| 🎨 **深色模式 UI** | 精美的深色主題分頁式介面，附即時狀態指示燈 |

---

## 📦 安裝方式

### 方法一：手動載入（開發者模式）

1. 下載或 Clone 此專案到本機

   ```bash
   git clone https://github.com/your-username/kktix-helper.git
   ```

2. 開啟 Chrome，前往 `chrome://extensions/`

3. 開啟右上角的 **「開發人員模式」**

4. 點擊 **「載入未封裝項目」**

5. 選擇此專案的資料夾

6. 完成！你會在工具列看到 🎫 圖示

---

## 🚀 使用教學

### 1️⃣ 基本設定

點擊工具列上的 🎫 圖示，開啟設定面板：

- **目標活動 URL**：貼上 KKTIX 活動頁面網址
- **開賣時間**：設定開賣的日期與時間
- **場次關鍵字**：輸入場次名稱（如：`台北場`、`12/25`）
- **票種關鍵字**：最多設定三個志願（如：`VIP`、`A區`、`B區`）
- **購買張數**：選擇 1~8 張

### 2️⃣ 自動化選項

| 選項 | 預設 | 說明 |
|------|------|------|
| 自動進入場次 | ❌ | 倒數結束後自動點擊進入選票頁面 |
| 未開賣自動重新整理 | ✅ | 偵測到「尚未開賣」時自動重新整理頁面 |
| 自動勾選同意條款 | ✅ | 自動勾選「我已閱讀並同意」 |
| 自動提交 | ❌ | 無驗證碼時自動點擊「下一步」 |
| 502/503 自動重試 | ✅ | 伺服器錯誤時自動重新整理 |

### 3️⃣ 搶票流程

```
設定好參數 → 儲存設定 → 開啟活動頁面（或等排程自動開啟）
    │
    ▼
  活動頁面：偵測倒數 → 倒數結束自動進入選票頁面
    │
    ▼
  選票頁面：自動選票 → 填數量 → 勾同意 → 自動/手動提交
    │
    ▼
  完成！處理驗證碼（如有）後付款 🎉
```

### 4️⃣ 設定匯出/匯入

- **匯出**：點擊 `📤 匯出` 按鈕，下載 JSON 設定檔
- **匯入**：點擊 `📥 匯入` 按鈕，選擇之前匯出的 JSON 檔案

---

## 📁 專案結構

```
KKtix輔助搶票/
├── manifest.json      # Chrome Extension 設定檔（Manifest V3）
├── background.js      # Service Worker：排程、通知、Badge、日誌管理
├── content.js         # Content Script：頁面自動化核心邏輯
├── popup.html         # Popup UI 結構
├── popup.css          # Popup 樣式（深色模式）
├── popup.js           # Popup 互動邏輯
└── README.md          # 本文件
```

---

## 🔧 技術架構

### 通訊流程

```
Content Script ──(STATUS_UPDATE)──▶ Background SW ──▶ Badge 更新
               ──(NOTIFY)────────▶              ──▶ 桌面通知
                                        │
Popup ──(GET_STATUS)──────────────▶ Background SW
      ──(GET_LOGS)────────────────▶     │
      ──(SETUP_ALARM)─────────────▶     │
                                        │
                              chrome.storage.local  (操作日誌)
                              chrome.storage.sync   (使用者設定)
```

### 使用的 Chrome API

| API | 用途 |
|-----|------|
| `chrome.storage.sync` | 儲存使用者設定（跨裝置同步） |
| `chrome.storage.local` | 儲存操作日誌 |
| `chrome.alarms` | 開賣時間排程 |
| `chrome.notifications` | 系統桌面通知 |
| `chrome.tabs` | 分頁管理（開啟/重新整理） |
| `chrome.runtime` | Content Script ↔ Background ↔ Popup 通訊 |
| `MutationObserver` | 監聽 DOM 變化，等待元素出現 |

---

## ⚠️ 注意事項

> [!WARNING]
> 此工具僅供**輔助**使用，請遵守 KKTIX 的使用條款與規範。

- 本工具**不保證**一定能搶到票，最終結果取決於網路速度、伺服器負載等因素
- 自動提交功能預設為**關閉**，請確認了解風險後再開啟
- 重新整理間隔已設定隨機延遲（1~3 秒），以降低被偵測或封鎖的風險
- 建議搭配穩定的網路環境使用

---

## 🔄 更新日誌

### v2.0（2026-06-30）
- ✨ 新增 Background Service Worker
- ✨ 新增開賣時間排程功能
- ✨ 新增多票種備援（三個志願）
- ✨ 新增自動提交功能（無驗證碼時）
- ✨ 新增 502/503 自動重試
- ✨ 新增操作日誌系統
- ✨ 新增系統桌面通知
- ✨ 新增設定匯出/匯入
- 🎨 全新深色模式 UI 設計
- 🎨 分頁式介面（設定/日誌/關於）
- 🎨 即時狀態指示燈 + 脈衝動畫

### v1.0
- 🎉 初始版本
- 基本票種選擇與數量填入
- 自動勾選同意條款
- 自動重新整理
- 倒數偵測

---

## 📄 授權

本專案採用 [MIT License](LICENSE) 授權。

---

<p align="center">
  Made with ❤️ for 搶票人
</p>
