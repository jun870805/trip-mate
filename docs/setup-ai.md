# AI 助手與 Firebase 設定

AI 入口已接在每趟旅程的「行程」分頁。尚未設定時可開啟彈窗，但輸入與上傳停用，顯示尚未啟用。完成以下設定並重新啟動／建置後，才會連到真實模型。

## 1. 建立 Firebase Web App

1. 在 [Firebase Console](https://console.firebase.google.com/) 選擇或建立專案。可以沿用既有 Google Cloud 專案，但不要求與 Sheets／GIS OAuth 相同專案。
2. 到「專案設定 → 一般 → 你的應用程式」，新增 Web App（`</>`）。網站繼續由 GitHub Pages 提供，不需要另外啟用 Firebase Hosting。
3. 在該 Web App 的 SDK 設定中取得 `firebaseConfig`：至少要有 `apiKey`、`projectId`、`appId`。本專案接受的其他欄位是 `authDomain`、`storageBucket`、`messagingSenderId`、`measurementId`、`databaseURL`。
4. Web config 轉成 **JSON 物件字串**，不是 `const firebaseConfig = ...` 的整段 JavaScript，也不是 SDK script。

此整合不需要新增 Firestore、Firebase Authentication 或 Storage。導遊登入與 Sheets 編輯仍沿用原本 GIS OAuth 與 Google ACL。Firebase Web API key 與原本只允許 Sheets API 的 key 分開配置；若自行限制 Firebase key，依 Firebase 建議保留它所需的 API，不要直接套用 Sheets-only 限制。[官方起步流程](https://firebase.google.com/docs/ai-logic/get-started?platform=web)

## 2. 啟用 Firebase AI Logic

1. Firebase Console 進入「AI Logic」，按開始設定。
2. 本專案的 adapter 使用 `GoogleAIBackend`，選 **Gemini Developer API**。
3. 依控制台流程啟用所需 API 與建立／連結 Gemini API 存取。Gemini 服務金鑰留在 Firebase 管理流程內；**不要貼進 `.env` 或前端程式**。
4. 在專案可用模型中選擇同時支援文字、Function Calling、PDF／圖片輸入的模型，把預設模型的完整 model ID 填入 `VITE_AI_DEFAULT_MODEL`。不要選只有圖片生成／即時語音用途的模型，也不要把顯示名稱當成 model ID。
5. 模型供應與計費條件可能調整，以控制台與 [支援模型表](https://firebase.google.com/docs/ai-logic/models) 為準。本專案不硬編碼模型名稱。

若要求連結帳單，先確認模型與用量方案，並設定用量／配額與費用警示；費用取決於實際模型與功能。詳細條件見 [官方計費說明](https://firebase.google.com/docs/ai-logic/pricing)。

## 3. 設定 reCAPTCHA Enterprise 與 App Check

1. 到同一 Firebase 專案對應的 Google Cloud console，開啟 reCAPTCHA Enterprise 的管理頁面；介面可能顯示在 Fraud Defense 下。
2. 啟用 API（若控制台要求），建立 **Web、score-based、無 checkbox challenge** 的 key。
3. 加入正式網站的主機名稱，例如 `your-name.github.io` 或自訂網域。不填 `https://`、`/trip-mate/` 路徑或旅程網址；正式 key 不加入 localhost。
4. 記下這個公開的 **site key**，填入 `VITE_AI_APP_CHECK_SITE_KEY`。
5. Firebase Console → Security → App Check → Apps，為剛才同一個 Web App 註冊 **reCAPTCHA Enterprise**，使用上述 site key。
6. App Check → APIs → Firebase AI Logic：設定 **Baseline protection = Enforced**。目前程式使用一般 App Check token，**Replay protection 選 Disabled**；要啟用 replay protection，必須先另行接入 limited-use token，不能只改控制台開關。

程式已在模型建立前初始化 `ReCaptchaEnterpriseProvider`，並開啟 token 自動更新。App Check 是應用驗證，不取代導遊登入、Sheets 權限或每使用者費用限制。[Enterprise 設定](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)、[AI Logic App Check 與 replay 設定](https://firebase.google.com/docs/ai-logic/app-check)

## 4. 本機環境變數

在 `frontend/.env.local` 設定以下值；使用自己的實際資料替換尖括號內容：

```dotenv
VITE_AI_ENABLED=true
VITE_AI_FIREBASE_CONFIG='{"apiKey":"<Firebase Web API key>","projectId":"<project ID>","appId":"<Web App ID>"}'
VITE_AI_DEFAULT_MODEL=<預設模型的完整 model ID>
# 選填：允許切換的模型 ID JSON 陣列，預設模型會自動加入
VITE_AI_MODELS='["model-a","model-b"]'
VITE_AI_APP_CHECK_SITE_KEY=<reCAPTCHA Enterprise site key>
```

上述都是公開前端設定；`model-a`／`model-b` 是格式示例，請換成專案可用的實際 model ID。Firebase private key、Gemini／其他 LLM Secret、OAuth access token、App Check debug token 不放入 `VITE_*`。變更 env 後重新啟動 `npm run dev`；正式站必須重新建置／部署，不會動態讀本機 env。

## 5. 本機 App Check Debug Provider

正式 reCAPTCHA key 不加 localhost。開發時遵循 [官方 Debug Provider 流程](https://firebase.google.com/docs/app-check/web/debug-provider)：

1. 在本機瀏覽器 DevTools Console 設定 `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`。
2. 在**同一頁面、不重新整理**的情況下，首次開啟 AI 助手並送出一則訊息；本專案只在第一次開啟時延遲初始化 App Check。
3. 在 console 看到產生的 debug token 後，到 Firebase App Check 該 Web App 的管理選單登錄 debug token。
4. 登錄完成後再送出請求。若已初始化過，先重新整理頁面，再在開啟 AI 前設定上述值。
5. debug token 僅用於私人開發環境，不提交版本控制、不放正式環境。完成開發後可在控制台撤銷。

若瀏覽器重新整理導致記憶體 flag 消失，要在重新開啟 AI 前再次設定；SDK 的本機 debug 資料依官方機制處理，網站本身不新增 token 設定表單。

## 6. GitHub Pages 設定

到 GitHub repository → Settings → Secrets and variables → Actions → **Variables**，新增：

| Variable | 值 |
| --- | --- |
| `VITE_AI_ENABLED` | `true` |
| `VITE_AI_FIREBASE_CONFIG` | 一行合法 JSON 物件，外層**不要加 shell 單引號** |
| `VITE_AI_DEFAULT_MODEL` | 預設／推薦模型的完整 model ID |
| `VITE_AI_MODELS` | 選填 JSON 字串陣列，例如 `["model-a","model-b"]`，不加 shell 外層單引號 |
| `VITE_AI_APP_CHECK_SITE_KEY` | 公開 site key |

`.github/workflows/pages.yml` 已接入以上 variables；未設定時 AI 預設停用。原本 Sheets／GIS variables／secret 保留。設定完成後自行重新執行部署工作流程；本次沒有替你部署或修改 Firebase Console。

## 7. 啟用後驗證

1. 在正式網址或已配置 Debug Provider 的本機打開旅程 → 行程 → AI 助手。確認看到目前旅程名稱與可用輸入框。
2. 訪客詢問「第二天有哪些行程」，核對實際行程資料；不應有編輯能力。
3. 導遊登入後要求改一筆行程，先檢查日期、項目、欄位前後差異與警告；按取消，核對 Sheets 完全未變更。
4. 再測試確認儲存，核對網站操作結果、頁面更新與實際 Sheets；不要僅憑模型說「完成」判斷成功。
5. 分別上傳自己可傳送給模型的 TXT／CSV／XLSX、PDF 與圖片，核對解析與預覽；不確定資料需人工確認。
6. 測試縮小恢復、X／Escape 縮小保留對話、切換旅程／登出、App Check 拒絕及 OAuth 過期。
7. 在 Firebase console 核對 App Check metrics 與模型用量。不要開啟自動重送不明寫入結果的機制。

本次已透過測試替身驗證 UI／工具／模擬 Sheets 流程，但尚未執行你的真實 Firebase／App Check、Google 寫入或部署驗證。


## 8. 使用者切換模型與 429

- `VITE_AI_DEFAULT_MODEL` 為每次頁面載入的預設模型，下拉選項會標示 `(推薦)`。
- `VITE_AI_MODELS` 為 JSON 字串陣列，最多設定 20 筆；自動去除前後空白與重複，預設模型一定會加入，即使不在陣列內。未設定或空陣列時只顯示預設模型。格式不正確會讓 AI 設定驗證失敗。
- 選單位於「送出」左側，桌面／手機皆可使用。候選模型須在同一專案可用，並支援目前工具呼叫、PDF／圖片輸入；列入清單不代表已替你驗證模型可用性或取得額度。
- 切換時保留當次未送出的文字與附件，重建 agent 並載入該模型自己的已完成 checkpoint；不同模型的 opaque／簽章與歷史不互相帶入。重新整理回預設模型，可再手動選回其他模型的已完成對話。
- 連線、檔案處理、模型請求、待確認變更／郵件及提交期間停用切換，避免重複副作用。
- 模型 API HTTP 429 顯示正紅色「超過用量，請更換語言模型，或稍後再試。」。不會自動切換模型、重送訊息、重播 Sheets 寫入或郵件。
- 此為模型 API 的限額提示；EmailJS 的 429 仍沿用郵件寄送失敗流程，不提示更換語言模型。

模型清單是前端選項驗證，不能取代服務端防濫用或配額限制。更換模型不會重設 Firebase AI Logic 共用的每使用者／區域 RPM，也不會重設專案費用或 spend cap；見 [配額說明](https://firebase.google.com/docs/ai-logic/quotas)。


### 模型 API 404

模型 API 回傳 HTTP 404 時，顯示正紅色「此模型目前無法使用，請更換語言模型或聯絡導遊。」。可能是模型名稱／版本錯誤、專案無法存取，或服務設定缺漏，不能只憑 404 判定模型永久不支援。使用者可手動換模型，不會自動切換／重送；400、403 等錯誤保留通用處理。EmailJS 的 HTTP 錯誤仍屬寄送結果，不提示換模型。
