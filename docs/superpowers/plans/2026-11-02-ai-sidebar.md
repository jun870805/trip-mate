# AI sidebar implementation plan

**Goal:** 將已確認的右側 AI 側欄與手機聊天窗接入正式行程頁面。
**Architecture:** 保留可移植核心與旅程橋接分界；核心提供驗證過的 completed conversation checkpoint，sessionStorage 由旅程端注入。單一聊天元件以 portal 顯示，桌面 aside 不鎖背景，手機以 modal 語意、inert、焦點循環及共用捲動鎖保護互動。
**Tech Stack:** React、TypeScript、CSS modules、Zod、Node tests、Python Playwright。

- [x] 核心測試：完整工具呼叫／結果與 opaque 可恢復；恢復不執行工具；不接受跨範圍、未配對、附件或過大資料；非完成狀態不可匯出。
- [x] 核心加入 exportConversation / restoreConversation；不保存授權、閉包或未送出內容。
- [x] 橋接加入按 base／來源／旅程／身份／模型隔離的 sessionStorage；失敗提示並回退記憶體，清空同時刪除保存資料。
- [x] 側欄改為明顯機器人入口、僅縮小、清空對話；跨 breakpoint 保留相同 composer 與 agent。手機封鎖背景，桌面讓出內容寬度並允許展開行程內文。
- [x] 更新 AGENTS、核心 README 與整合說明，取代舊 X／Escape 清空規則。
- [x] 執行 npm run check 及 scripts/ai_browser_smoke.py，驗證桌面／手機、重整、清空、身份隔離、待確認不重播及實際工具結果（API 替身）。

本次使用者已授權實作，直接於本工作階段逐項完成，不建立提交或推送。

驗證結果：npm run check 通過；Chrome headless API 替身測試通過，含兩次單批寫入、附件不持久化及 quota 回退。未執行真實 Google 寫入或部署。
