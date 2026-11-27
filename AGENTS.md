# 蕃薯旅遊團專案規範

本檔只放全域約束與索引；詳細已確認規格在 `docs/specs/`，依任務按需讀取，不必一次讀完。

## 協作與範圍

- 純前端（Vite、React、TypeScript、Tailwind）；Google Sheets API 為資料來源，每趟旅程一份 Spreadsheet，入口為「旅程清單」分頁。不建後端、離線模式或多人同步，不提供表單草稿。
- 明確要求的事項可直接執行；使用者指定先討論則等確認後再改。建議不等於已確認需求。
- 保留未提交修改；不擅自 reset、覆蓋 `.env.local` 或清除使用者資料。開始前先看 `git status --short`／`git diff`。
- 設計規則以專案已確認規格優先於通用設計技能或元件庫預設；文案只表達功能、資料與狀態。

## 不可違反的不變量

- 授權：真實寫入由 Google Sheets／Drive ACL 強制；前端隱藏與 email 比對不能取代授權。第一個 `VITE_GUIDE_EMAILS` 帳號是唯一超級使用者。
- 驗證誠實：mock／測試替身不等於真實 Google 寫入、OAuth／Drive、AI 模型、App Check、郵件、部署、瀏覽器或 PDF 實機驗證；未執行就不宣稱，待驗與已驗要分開。
- 資料：`frontend/src/data/schema.json` 為分頁／欄位來源，`frontend/src/data/id-rules.json` 為 ID 前綴來源；解析、建檔、Excel、範例與 Apps Script 須一致。ID 取同前綴最大號＋1，不補缺號。
- 寫入：儲存前重讀並比對快照，不同則拒絕；跨表變更用單次 `batchUpdate`；結果不明須重讀後才可再寫；被引用資料禁止刪除。
- 帳務：實際記帳與每人參考金額分開，參考金額不改寫應繳、實收或餘額；公積金只收退當地貨幣。
- 安全：不提交或公開 Secret／token／debug token；外連只接受 HTTP(S)；Markdown／HTML 內文只輸出允許的標籤，不用 `dangerouslySetInnerHTML`。
- AI：僅限旅遊議題；寫入須先確認並重驗授權與快照；不開放帳務、團員、待辦表給 AI。

## 驗證入口

- 先讀 `README.md` 的實作入口與帳務計算區分。資料／計算改動跑 `npm run test:coverage`；AI 改動跑 `npm run test:ai:coverage` 與 `npm run check:ai:bundle`；畫面跑 `npm run test:render`、`npm run typecheck`；建置 `npm run build`；完整檢查 `npm run check`。
- 瀏覽器 smoke（`scripts/trip_editor_browser_smoke.py`）不在 `npm run check`，須另跑並如實記錄。schema／範例／產生器變更才跑 `npm run templates`。
- 細節與優先入口檔案見 [dev-verification.md](docs/specs/dev-verification.md)。

## 規格索引（需要時才讀）

| 任務 | 讀這份 |
| --- | --- |
| 協作範圍、技術與文件入口、維護規則原文 | [overview.md](docs/specs/overview.md) |
| 接續進度（UI 檢查到支出頁）、驗證指令、優先入口 | [dev-verification.md](docs/specs/dev-verification.md) |
| 樣式、間距、元件、dialog、CSS、日期時間、旅程標題資訊 | [ui-and-dates.md](docs/specs/ui-and-dates.md) |
| 導遊登入、權限、ID、寫入、旅程建檔／Google 共用、讀取錯誤 | [sheets-access.md](docs/specs/sheets-access.md) |
| 公積金、行前費用、收款批次、支出頁與參考金額 | [accounting.md](docs/specs/accounting.md) |
| 每日行程、類別配色、篩選、編輯與拖曳排序 | [itinerary.md](docs/specs/itinerary.md) |
| 航班、住宿、PDF 匯出 | [bookings-pdf.md](docs/specs/bookings-pdf.md) |
| GitHub Pages、路由、CI／部署檢查 | [deployment.md](docs/specs/deployment.md) |
| AI 架構、可用資料、授權 | [ai-core.md](docs/specs/ai-core.md) |
| AI 聊天介面與操作 | [ai-chat-ui.md](docs/specs/ai-chat-ui.md) |
| AI 模型切換、串流、Provider、App Check | [ai-model-provider.md](docs/specs/ai-model-provider.md) |
| AI 郵件、錯誤回報、回覆評價、對話暫存 | [ai-email-feedback.md](docs/specs/ai-email-feedback.md) |
| 待確認事項、待實機驗證、參考報告 | [pending.md](docs/specs/pending.md) |

其他文件：`docs/google-sheets-schema.md`（資料結構）、`docs/country-data.md`、`docs/deploy-github-pages.md`、`docs/ai-agent-integration.md`、`frontend/src/ai/README.md`。

## 維護規則

- 釐清需求、業務邏輯或設計規則後，優先修改對應 spec，合併或刪除被取代內容；已確認規則與待確認提案分開（後者放 `pending.md`）。
- 根檔只保留全域約束與索引，不重複詳細規格；新增 spec 時同步更新上方索引。
