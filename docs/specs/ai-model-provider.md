# AI 助手：模型、串流與 App Check

模型切換、錯誤分類、Firebase Provider、串流與 App Check。

## 模型、串流與 App Check

- 模型切換已採用：`VITE_AI_DEFAULT_MODEL` 為預設／推薦模型，`VITE_AI_MODELS` 為額外模型 ID 的 JSON 字串陣列（最多 20 筆，去空白／去重並自動包含預設）。送出左側顯示模型下拉選單，箭頭位置為 right 20px center，無可見外框，維持原有最大 180px 寬度及窄版縮放，名稱單行過長顯示省略號，聚焦時也不顯示外框，鍵盤焦點以底色提示；預設模型後標 `(推薦)`。只接受清單內選擇，未設定清單時保留單一預設模型。候選模型須自行確認支援目前工具及附件能力。
- 切換模型重建 agent，各模型已完成對話／opaque 分開保存，保留當次未送出輸入與附件；重新整理回預設模型。連線、解析、模型處理、待確認、寫入／寄信期間禁止切換。身份切換清除離開身份在各設定模型的暫存；不同模型不繞過身份、scope 或副作用確認。
- 模型 API 429 以可移植 `ProviderRateLimitError`／`rate_limit` 代碼呈現正紅色「超過用量，請更換語言模型，或稍後再試。」；不自動切換／重試。模型 API 404 使用 `ProviderModelUnavailableError`／`model_unavailable`，正紅色提示「此模型目前無法使用，請更換語言模型或聯絡導遊。」；不把所有 400／403 誤分類為模型不支援。EmailJS 404／429 不混用模型提示。切換模型不重設 Firebase 共用限流、費用或 spend cap。
- Provider 使用 Firebase 官方 AI／App／App Check 模組，可替換；公開設定以 `VITE_AI_*` 明確啟用，模型名稱由設定注入。不得公開服務 Secret、傳送 OAuth token 給模型或自動啟用 debug token。
- Firebase AI runtime 依模型名稱設定推理：Lite 模型（名稱含獨立 lite 區段，包含 preview 等後綴）完全不傳 `thinkingConfig`，使用模型預設（目前 Flash-Lite 為 MINIMAL）；其他選用模型設定 `thinkingLevel = ThinkingLevel.LOW`。`maxOutputTokens` 一律維持 4096，不新增 env；尚未量測真實 API 延遲。
- Firebase Provider 使用 SDK `generateContentStream` 逐段顯示公開回答，Provider 透過可選 `onText(delta)` callback、Controller 的 `partialText`／`activity` 傳遞當次進度；相容不支援串流的 Provider。首段立即呈現，後續最多約每 50ms 更新。未完成回答以純文字保留換行，完成後才進入正式 Markdown 訊息及顯示複製按鈕；僅完整聚合回應的工具呼叫可執行，維持原簽章 opaque。取消／新對話／卸載／失敗清除部分文字與計時，不自動重試、不中途儲存；不顯示內部思考、工具參數或原始結果。使用者上滑閱讀時不強制隨串流捲到最下方。串流錯誤回報記錄實際 `streamGenerateContent` 操作。
- Firebase 未設定仍可開聊天介面，輸入／上傳停用並顯示未啟用；開啟時才初始化 Provider、送出時才發模型請求。
- App Check debug token 僅在本機 DEV 且明確提供 `VITE_AI_APP_CHECK_DEBUG_TOKEN` 時由旅程 Host 設定，不自動產生／啟用、不放入核心或正式 bundle；實際值不提交或用於 CI。
