# AI model selection implementation plan

**Goal:** 以 VITE_AI_DEFAULT_MODEL 為預設／推薦模型，VITE_AI_MODELS 為 JSON 模型清單，送出左側可切換並以正紅色顯示模型 API 429。
**Architecture:** 模型清單由旅程 Host 解析及驗證，核心不讀 env；切換重建 Provider／agent、按模型保存 checkpoint，composer 保留當次輸入。Firebase adapter 將 SDK HTTP 429 正規化為可移植的錯誤代碼，Controller 與 UI 只顯示安全提示，不洩漏原始 SDK 訊息、不自動重試。
**Tech Stack:** TypeScript、React、CSS modules、Zod、Firebase SDK、Node tests、Playwright。

- [x] 先測試預設、去空白／去重、空清單、錯誤清單、禁止選非清單模型。
- [x] 先測試 SDK customErrorData.status=429 → core errorCode；其他錯誤保持通用訊息，工具結果保留。
- [x] `config.ts` / factory 增加白名單選擇；`ai/core/errors.ts`、adapter／controller 增加 rate_limit 語意。
- [x] `TripAIEntry.tsx` 管理選擇、重建、身份隔離與 busy guard；`ChatPanel` 提供模型插槽，送出左側顯示下拉，quota alert 正紅色。
- [x] `.env.example`、Pages workflow、setup-ai、AI README、AGENTS 同步設定與行為。
- [x] 完整 check 及 Chrome API 替身測試：推薦標示、typed draft 保留、跨模型上下文隔離、429 紅字、無自動切換／重試、手機不溢出、待確認與副作用期間停用。

沿用已授權範圍直接實作，不推送／部署或改外部模型配額。

驗證結果：npm run check 通過（227 項資料、58 項 AI／旅程測試），AI 行／分支／函式覆蓋皆超過 80%。Chrome headless 替身測試通過，包含模型推薦、切換保留草稿／隔離歷史、紅色 429、無自動重試／切換、身份切換清理與桌面／手機版面。未呼叫真實模型、寄真實郵件或更動外部配額／部署。
