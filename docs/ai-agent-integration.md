# AI 助手接入與驗證

目前已接入旅程「行程」分頁的 AI UI 及能力層。原始初步規劃見 [ai_agent_plan.md.md](ai_agent_plan.md.md)，可移植設計見 [AI README](../frontend/src/ai/README.md)，正式服務設定見 [Firebase 設定](setup-ai.md)。

## 介面與生命週期

- 有效旅程的行程分頁顯示懸浮入口；手機避開底部導覽。首頁、其他分頁、讀取失敗與行程資料錯誤不顯示入口。
- 桌面為右側非模態 aside；手機為單一 portal 聊天窗，具 modal 語意、背景 inert、共用捲動鎖及 Tab 焦點循環。訊息區獨立捲動，輸入區保持可操作。
- 縮小保留當次記憶體 agent、對話、附件、輸入及待確認變更；再開啟恢復。Escape 同樣縮小；清空對話才刪除上下文與暫存，不建立輸入草稿。
- 寫入中清空與縮小停用。切換旅程、登入身份、離開行程分頁、外部重讀或不可讀狀態改變時清理 agent；舊非同步回覆不能復活對話。
- AI 自己成功寫入後引發頁面更新時，保留聊天窗、對話與真實工具結果；loader 暫時清空資料不卸載聊天。讀取期間不提供舊資料給工具。
- 訪客唯讀、導遊依 Google ACL 編輯。範例唯讀且導遊登出後停止顯示。一般角色不顯示業務 ID。
- 未設定 Firebase 時仍可開啟查看未啟用狀態，輸入／上傳停用。Provider 在第一次開啟時初始化，送出訊息才請求模型，不使用假回覆。

- 空白聊天顯示大字「您好！ 我是您的 AI 助手」與「輸入提示詞即可開始使用，或是可以先試試以下功能～」。模板點擊立即詢問 AI，防止連點重送；不夾帶輸入草稿或附件。
- 桌面／手機皆 Enter 送出、Shift＋Enter 換行；中文輸入法組字 Enter 不送出。X 左側有邊框「新對話」文字按鈕，清空當前上下文與暫存後重新開始；歷史紀錄按鈕為後續需求，本次未實作。

## 實際接入位置

| 責任 | 程式 | 接入方式 |
| --- | --- | --- |
| 當前旅程及讀取 | `App.tsx` 的 `TripLoader` | 既有來源＋旅程 ID key 隔離資源；各 loader 分支保留同位置的 AI 元件，成功寫入後沿用 revision 重讀 |
| 旅程 UI Host | `features/trip-ai/TripAIEntry.tsx` | portal／側欄與手機聊天窗、共用元件、Lazy Provider、session／data ref、訂閱與清理；憑證不傳給面板／模型 |
| 通用面板 | `ai/ui/ChatPanel.tsx`、`.module.css` | 輸入、附件、訊息、常用問題、狀態；注入安全 Markdown renderer 與預覽插槽，不依賴旅程／Sheets／路由 |
| 訊息與結果 | `ai/ui/presentation.ts`、`features/trip-ai/preview.ts` | 不顯示工具參數／原始結果／opaque／文件抽取原文；真實工具結果單獨顯示 |
| 預覽 | `features/trip-ai/ChangePreview.tsx` | 旅程、操作、日期、欄位前後值、數量與警告；取消不寫入，確認僅傳 approval ID |
| 核心 | `ai/core/controller.ts`、`registry.ts` | 嚴格 Schema、工具白名單、單一待確認操作、輪次／次數上限、Abort 與 scope 驗證 |
| 資料及工具 | `features/trip-ai/host.ts`、`tools.ts` | 唯讀查詢每日行程、航班／住宿及備註內文交叉資料；搜尋／摘要／缺地圖；增改刪／排序／整批匯入／補地圖僅限目前旅程每日行程 |
| 授權儲存 | `data/trip-editor.ts` | `read`、`mutateTripBook`、`automaticTripIds`、`saveItineraryBatch`，沿用既有驗證、快照、ID 與差異儲存格更新 |
| Provider | `ai/providers/firebase.ts`、`firebase-runtime.ts` | Firebase 官方 AI／App／App Check 模組；SDK 特有內容保留為 opaque，不交由 UI 顯示 |
| 設定 | `features/trip-ai/config.ts` | 明確啟用的 `VITE_AI_*` 公開設定；Pages workflow 已接入對應 variables |
| 捲動與樣式 | `data/dialog-scroll.ts`、既有全域 CSS | 不複製背景捲動鎖；新樣式限 CSS Module，保留米白／奶茶棕、RWD、安全區及列印隱藏 |

## 資料邊界

核心與通用 UI 不反向 import 旅程模型、Sheets 或路由。只有可選 `ai/ui` 依賴 React；純核心仍可用於其他前端。AI Markdown 不自動載入模型指定的遠端圖片，外連沿用安全 HTTP(S) 規則。

`saveItineraryBatch` 僅接受 1～100 筆每日行程 mutation，沿用相同驗證、快照比對、自動 ID 與差異計算，合併成一次 batchUpdate；實際寫入前重查 session 與 AbortSignal。Sheets 先讀後寫仍不具伺服器原子鎖，送出後 Abort 不代表回滾。未知結果、拒絕與衝突後停止後續寫入，需重新讀取／登入。

行程以穩定 ID 定位；新地圖搜尋連結存副標，舊地點／地圖與結束時間依既有編輯規則合併／清空，不另加雲端欄。其他舊關聯、時區、額外欄與未變更值保留。沒有全站、公積金或旅程目錄 AI 操作；航班／住宿僅唯讀查詢，不提供新增／修改／刪除。相關問題透過 `itinerary_get_travel_details` 交叉檢查全部班次、住宿備註及行程內文，規則見 `features/trip-ai/travel-context-rules.ts`。

## 自動驗證

`npm run check` 包含既有資料測試、AI／旅程工具測試、80% 以上覆蓋率門檻、核心與 UI 的可移植邊界／瀏覽器打包、五頁與新面板靜態渲染、Excel／Apps Script、型別／正式建置，以及 Pages 資源／404 還原。

`scripts/ai_browser_smoke.py` 在本機 Vite 測試設定下，用模擬 Provider／OAuth／Sheets 驗證桌面／手機、開啟／縮小／恢復／Escape、焦點、背景捲動、附件、ID 隱藏、預覽取消／確認、寫後結果與頁面更新、舊回覆丟棄、入口範圍、矮螢幕及 Firebase 未設定畫面。模擬寫入不會存取真實 Google 資料。

未執行的外部驗證：真實 Firebase AI Logic／App Check、OAuth／Sheets 寫入、模型文件辨識與建議品質、實體手機觸控及正式部署。瀏覽器模擬測試不等同這些正式服務驗證。

本次結果（2026-11-02）：完整 `npm run check` 通過，資料測試 227 項、AI／旅程測試 42 項；AI 程式行／分支／函式覆蓋率皆超過 80%。另以 Chrome headless 實際執行上述桌面／手機／橫向 UI 模擬測試，全部通過，模擬 Sheets 批次寫入共 2 次。


## 右側聊天 UI（2026/11/02）

已依核准樣稿接上右側機器人入口、桌面非模態側欄與手機聊天窗。桌面可同時操作日期／標籤與展開行程內文；手機使用背景 inert、共用捲動鎖及焦點循環。無邊框 X 保留縮小行為（Escape 同義），左側有邊框「新對話」文字按鈕，清空當前對話與上下文後重新開始；寫入中兩者停用，清空不回滾實際變更。

重新整理後重新開啟助手可恢復本分頁已完成的無附件對話。核心完整 checkpoint 與 Host sessionStorage 分離；按部署、旅程、來源、身份與 Provider／模型隔離，不含憑證。附件對話不持久化，草稿與待確認變更不恢復；寫入開始／錯誤會移除暫存，不自動重送。限制及移植 API 見 `frontend/src/ai/README.md`。

本輪自動化以 Provider／OAuth／Sheets 替身驗證，無真實雲端寫入。執行 `npm run check` 與 `python3 scripts/ai_browser_smoke.py --chrome '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`（測試用 Vite 預設 port 5193）。

AI 回覆下方左側的小型無邊框複製圖示由可移植的 `ai/ui/CopyMessageButton.tsx` 提供；僅複製該則回覆的 Markdown 文字，成功顯示短暫勾號，剪貼簿不可用／拒絕時提示手動選取。


## 訪客需求郵件

未登入訪客要求調整行程時，若 EmailJS 設定完整，AI 可使用 `itinerary_request_email` 整理需求。獨立 `contact_guide` 權限不授予行程寫入權；導遊登入／範例不提供此工具。郵件預覽顯示第一位導遊收件人、主旨及完整本文，確認才提交，取消不寄送。寄送中套用既有 busy 限制，避免關閉、新對話或重複批准。

`guest-email.ts` 重驗身份、範圍與目前公開資料；`emailjs.ts` 使用固定 API、公鑰與模板，無私鑰或自動重試。服務接受結果獨立呈現，不能當作行程儲存或導遊收件證明。EmailJS 範本的 To 必須固定為 `VITE_GUIDE_EMAILS` 第一筆；前端不傳動態 To，純前端也無法獨立核對遠端模板設定。

設定步驟與已知限制見 [EmailJS 設定](setup-email.md)。本輪 Node 測試與瀏覽器 Provider／EmailJS／Sheets 替身驗證通過；未寄真實郵件、未設定 EmailJS 帳號或部署。


## 模型選擇與限額提示

`VITE_AI_DEFAULT_MODEL` 作為預設／推薦，`VITE_AI_MODELS` 設定額外可選模型；送出左側的下拉選單顯示推薦標示。切換保留 composer 草稿，重建 agent 並分模型恢復已完成紀錄；處理／待確認／提交期間禁止切換，沒有自動 fallback。各身份、旅程與模型隔離。

Firebase adapter 正規化模型 HTTP 429，Controller 使用安全錯誤代碼，UI 以正紅色顯示「超過用量，請更換語言模型，或稍後再試。」。不顯示原始 SDK 資料，也不將 EmailJS 的 429 當模型限額。設定格式與限制見 [Firebase 設定](setup-ai.md#8-使用者切換模型與-429)。

模型 API 404 另以 `model_unavailable` 安全代碼呈現紅字「此模型目前無法使用，請更換語言模型或聯絡導遊。」；不自動換模型、不重送，EmailJS 404 仍顯示郵件未確認成功。
