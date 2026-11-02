# 訪客行程需求郵件（EmailJS）

未登入訪客要求調整行程時，AI 可整理需求並顯示郵件預覽。只有使用者按「確認寄送」才提交 EmailJS；取消、縮小、重新整理不會寄送。訪客仍不能修改 Google Sheets。這是額外的可選功能，不影響原本行程查詢與導遊編輯。

## 1. 建立 EmailJS 服務

1. 在 [EmailJS](https://www.emailjs.com/) 建立帳號，新增 Email Service，連接你用來寄信的信箱。
2. 建立專用 Email Template。
3. **To Email 直接填入 `VITE_GUIDE_EMAILS` 第一個信箱**，與網站正規化後的第一筆一致。不要填 `{{to_email}}`，不要使用任何由前端傳入的收件人變數。CC／BCC 留空，停用自動回覆範本。
4. From Email 使用已連接的服務預設寄件者；From Name 可填「蕃薯旅遊團」。不要把訪客信箱當作 From Email。
5. Subject 填 `{{subject}}`；Reply-To 可填 `{{reply_to}}`。沒有回覆信箱時為空，請先用 EmailJS Test 驗證你的服務接受空白 Reply-To；若服務要求必填，使用前請讓訪客先提供回覆信箱。
6. 郵件內容使用 `{{message}}`。使用一般雙大括號保留預設 HTML 跳脫，不使用三大括號，不把使用者文字當 HTML。例如在 HTML 編輯器中：

```html
<pre style="white-space: pre-wrap; font-family: sans-serif;">{{message}}</pre>
```

範本亦可直接使用以下變數：

| 變數 | 內容 |
| --- | --- |
| `{{title}}` | 旅程名稱 |
| `{{name}}` | 使用者自願提供的姓名；未提供為「未知使用者」，不臆造 |
| `{{time}}` | 確認寄送當下的台灣時間（Asia/Taipei），格式 `YYYY/MM/DD HH:mm:ss` |
| `{{message}}` | 預覽中的完整郵件本文 |
| `{{reply_to}}` | 使用者提供的回覆信箱；未提供為空白 |
| `{{subject}}` | 含旅程名稱的郵件主旨 |

既有 `trip_name`／`requester_name` 參數繼續保留，相容原範本；其中 `requester_name` 與 `name` 同樣在未填時為「未知使用者」。

本文已包含旅程名稱、日期、具體調整需求、使用者自願提供的稱呼／回覆信箱，以及需求編號。前端預覽的本文就是送入 `message` 的文字；不寄送原始附件或整段聊天。

**收件人限制要在 EmailJS 範本設定。** 網站固定顯示／使用第一位導遊，不接受模型指定地址；但純前端不能驗證遠端範本的 To 設定，也不能阻止別人修改公開請求參數，所以 EmailJS To 必須固定，避免任意轉寄。

## 2. 本機環境變數

在 `frontend/.env.local` 加入以下公開設定（不提交本機檔）：

```dotenv
VITE_EMAILJS_ENABLED=true
VITE_EMAILJS_SERVICE_ID=service_xxxxx
VITE_EMAILJS_TEMPLATE_ID=template_xxxxx
VITE_EMAILJS_PUBLIC_KEY=你的EmailJS_Public_Key
```

沿用既有 `VITE_GUIDE_EMAILS='["第一位導遊@example.com","其他導遊@example.com"]'`，不新增第二份收件人名單。第一位導遊變更時，必須同步更改 EmailJS 範本的固定 To。

Service ID／Template ID 從 EmailJS Dashboard 複製，Public Key 從 Account 的 API Keys 取得。它們是前端公開設定；**不要放 Private Key、SMTP 密碼、OAuth token 或信箱密碼進 `VITE_*`**。Firebase 的 App Check 設定不能代替 EmailJS 的寄信設定。

只有明確啟用、三項設定完整且有第一位導遊信箱時，訪客才會取得 `contact_guide` 權限。設定缺漏會停用郵件工具，AI 仍可查詢行程；已登入導遊及範例旅程不提供此工具。

修改 env 後重啟 Vite。正式環境在 GitHub repository 的 Settings → Secrets and variables → Actions → Variables 新增以上四個同名變數；Pages workflow 已接入，重新部署才生效。

## 3. 發布前的 EmailJS 設定

- 在 EmailJS 啟用網站來源 allowlist，只允許你的正式 origin 與必要的本機測試 origin，例如 `https://你的帳號.github.io`、`http://localhost:5173`，依實際網址設定。
- 保持 To 固定，不使用動態收件人、不開自動回覆，先用 EmailJS Dashboard 測試寄給你自己的導遊信箱。
- 檢查服務用量限制、寄件帳號授權與垃圾郵件分類。EmailJS 有其 IP／用量限制；前端另做同一 agent 60 秒冷卻，但這不是伺服器防濫用，也不能保證外部請求不會消耗配額。
- 本版尚未接 EmailJS reCAPTCHA v2。若範本要求 CAPTCHA，本版請求會失敗，須另接專用驗證；Firebase App Check 不會自動替 EmailJS 驗證。

## 4. 使用流程與結果

1. 訪客說明想調整的行程，AI 整理需求。稱呼與回覆信箱可自願提供，不從其他團員／附件推測。
2. 助手顯示收件人、主旨、完整本文。若未提供回覆信箱，預覽會提醒；需要修改內容時先取消並補充需求，再重新準備。
3. 點「確認寄送」才送出一次固定的 EmailJS 請求；「取消寄送」不產生外部請求。
4. HTTP 200 且服務回覆 OK 才顯示「郵件服務已接受寄送申請」。這不代表導遊已收到／閱讀／同意，也不代表行程已修改。
5. 拒絕、逾時、網路錯誤或未知結果不自動重試；先確認 EmailJS history／收件情況，避免重複寄送。相同待確認操作不能重複提交。

## 驗證範圍

`npm run test:ai`／`npm run check` 及 `scripts/ai_browser_smoke.py` 使用 Provider／EmailJS／Google API 替身，不寄真實郵件。完成上述外部設定後，請自行用一封測試需求確認 To、Reply-To、格式與實際收件；程式完成不等於已替你設定 EmailJS 或驗證真實投遞。

參考：[EmailJS REST send](https://www.emailjs.com/docs/rest-api/send/)、[模板變數與跳脫](https://www.emailjs.com/docs/user-guide/dynamic-variables-templates/)、[防濫用功能](https://www.emailjs.com/docs/faq/does-emailjs-expose-my-account-to-spam/)。
