# 專案協作與技術入口

AGENTS.md 精簡前的「協作方式與專案範圍」「技術與文件入口」原文。

本規格集只保留現行需求；同一主題以最新確認為準，不累積歷次調整紀錄。尚未確認的事項集中於 [pending.md](pending.md)。

## 協作方式與專案範圍

- 已授權實作純前端旅遊網站、PDF、導遊登入、旅程清單，以及旅程內團員、航班、住宿、每日行程、帳務與待辦編輯。
- 明確要求實作的事項可直接執行；若使用者指定先討論，須等確認開始後才修改功能。建議不可直接視為已確認需求。
- 每次釐清需求、業務邏輯或設計規則，都同步更新 `docs/specs/` 對應 spec（索引見根目錄 `AGENTS.md`），合併或刪除被取代內容；已確認規則與待確認提案分開。
- 目前不建立後端、離線模式或多人同步機制。不提供表單草稿：關閉、取消、重新整理後捨棄未儲存內容，不暫存、復原或加入重新整理／離站的草稿提醒；關閉確認依各功能規則處理。
- 不宣稱已完成未執行的真實 Google 寫入、共用設定、部署、瀏覽器或 PDF 實機驗證。

## 技術與文件入口

- 前端：Vite、React、TypeScript、Tailwind CSS；Google Sheets API 為資料來源，每趟旅程一份獨立 Spreadsheet，入口目錄使用「旅程清單」分頁。
- 網站名稱與分頁標題為「蕃薯旅遊團」；圖示來源為根目錄 `icon.png`，公開素材為 `frontend/public/icon.png`。
- 固定分頁／欄位以 `frontend/src/data/schema.json` 為共同來源；ID 前綴以 `frontend/src/data/id-rules.json` 為準。解析、網站建檔、Excel、範例與 Apps Script 須保持一致。
- 資料結構與操作細節見 `docs/google-sheets-schema.md`；國家資料來源見 `docs/country-data.md`；部署見 `docs/deploy-github-pages.md`。
