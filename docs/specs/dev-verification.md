# 接續開發與驗證

含 UI 檢查接續進度、優先入口與驗證指令。進度不代表真實雲端、部署或其他待實機驗證項目已完成。

## 接續開發與驗證

- UI 檢查進度（2026/11/05，使用者確認）：總覽、行程、公積金、進度已完成 UI 檢查、修改與測試；剩下支出頁，待使用者接續指示後再進行。接續優先查看 `pages/TripViews.tsx` 的 `Expenses`、`data/expense-summary.ts` 與 `styles/trip-views.css`，保留實際記帳與每人參考金額的區分。此進度不代表真實雲端、部署或其他待實機驗證項目已完成。

- 開始先讀 `README.md` 的實作入口與帳務計算區分，再查看 `git status --short`／`git diff`；保留未提交修改，不擅自 reset、覆蓋 `.env.local` 或清除使用者資料。
- 優先入口：閱讀頁 `pages/TripViews.tsx`、表單 `components/TripEditor.tsx`、解析 `data/portal.ts`、寫入／均分／多人收款 `data/trip-editor.ts`、每人參考費用 `data/expense-summary.ts`、日期 `data/itinerary.ts`／`date-groups.ts`；路徑皆以 `frontend/src/` 為根。
- 資料／計算修改執行 `npm run test:coverage`，AI 修改執行 `npm run test:ai:coverage` 與 `npm run check:ai:bundle`；畫面使用 `npm run test:render`、`npm run typecheck`，正式建置使用 `npm run build`。完整檢查為 `npm run check`，門檻與測試腳本以根目錄 package.json 為準。
- `scripts/trip_editor_browser_smoke.py` 包含新增／編輯返回、日期選擇器、均分及多人收款；所有 Google API 都是模擬。啟動設定見 README，不以 mock 通過宣稱真實雲端寫入。瀏覽器測試不含在 `npm run check`，要另行執行並如實記錄結果。
- schema／範例／產生器變更才執行 `npm run templates`，再檢查範本；一般 UI 不重產範本。詳細 AI 設計以 `frontend/src/ai/README.md`、旅程接入以 `docs/ai-agent-integration.md` 為入口。
