# 可移植 AI 能力 Implementation Plan

> **For agentic workers:** Execute this plan inline, task by task. UI is explicitly deferred by the user.

**Goal:** 先交付無 UI 的 AI 能力與旅程工具，並提供可複製的模組及 README。

**Architecture:** 通用 `frontend/src/ai` 注入 Provider、Context 與 Tool Pack，不依賴旅行業務或 React。`frontend/src/features/trip-ai` 薄封裝現有讀寫；所有寫入先準備具體差異，獨立確認後再驗快照並提交。

**Tech Stack:** TypeScript、Zod、Firebase AI Logic、read-excel-file／fflate、Node test runner。

---

### Task 1：契約、Registry 與 Controller

Files: `frontend/src/ai/contracts.ts`, `core/registry.ts`, `core/controller.ts`, `tests/controller.test.ts`。

- [x] 先建立失敗測試：未知工具／未知參數、scope 改變、授權變更、確認與取消、防重送、輪次／次數上限、Abort。
- [x] 實作 `createAgent({provider, tools, getContext})`，暴露 `send`、`approve`、`reject`、`cancel`、`dispose`、`getState`／`subscribe`。
- [x] 讀取自動執行，寫入只回傳 `PreparedChange { preview, commit }`；approval ID 由應用產生，參數與預覽不從 UI 回傳值採用。
- [x] `node --experimental-strip-types --test frontend/src/ai/tests/*.test.ts`。

### Task 2：真實 Provider 與檔案

Files: `frontend/src/ai/providers/firebase.ts`, `files/intake.ts`, `tests/provider.test.ts`, `tests/files.test.ts`。

- [x] 先測試 SDK request／response 映射、Function Call 歷史與附帶資訊保留、模型錯誤、無效設定與檔案限制。
- [x] Firebase 官方 SDK 使用注入的 model ID；App Check 由初始化函式設定，無 Vite／專案環境直接依賴。
- [x] TXT／CSV 以文字、XLSX 以只讀儲存格抽取，PDF／PNG／JPEG／WebP 以 inline data 送模型；限制大小、數量與抽取量，拒絕其他類型。
- [x] 不開啟檔案 URL，不執行試算表公式，不將文件指令提升為 system。

### Task 3：旅程 Host 與工具

Files: `frontend/src/features/trip-ai/*.ts`, `frontend/src/data/trip-editor.ts`, existing and new tests。

- [x] 新增多筆行程 mutation 的授權批次寫入測試，再擴充既有 editor，沿用一次 batchUpdate 與前後讀取。
- [x] Host 從最新快照建立變更預覽，工具只允許日期、時間、標題、副標、內文、標籤、類別；新 ID 由既有 ID 邏輯產生。
- [x] 查詢、搜尋、缺地圖工具；新增、修改、刪除、跨日排序、匯入與地圖搜尋連結批次工具。
- [x] 排序衝突在預覽列出清除被移動項目的時間；既有地圖不覆蓋，模糊名稱拒絕自動配對。
- [x] session 僅在 Host；確認時重查身份與快照，失敗後鎖住寫入直到新建 Host／重新讀取。

### Task 4：接入、移植文件與驗證

Files: `frontend/src/ai/README.md`, `frontend/src/ai/index.ts`, trip factory, `.env.example`, `AGENTS.md`, integration doc, `package.json`。

- [x] 提供真實 Provider 建立與旅程 agent factory；不掛入頁面或新增 UI。
- [x] README 包含安裝、檔案責任、工具契約、send→preview→approve、外部服務設定、替換 Provider、新專案 mock 範例、能力與限制。
- [x] AI 測試納入一般測試及獨立 80% 覆蓋率；執行 `npm run check`。
- [x] 報告自動測試與未執行的模型／Google 真實操作，不把測試替身當成正式 API 驗證。
