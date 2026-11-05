# 蕃薯旅遊團

純前端旅遊網站，使用 Vite、React、TypeScript 與 Tailwind CSS。Google Sheets 是資料來源，每趟旅程使用獨立 Spreadsheet；一般團員免登入查看，指定導遊可維護旅程、行程、團員、帳務及進度。

## 下次接續開發

目前 UI 檢查進度（2026/11/05，使用者確認）：總覽、行程、公積金、進度已完成 UI 檢查、修改與測試；剩下支出頁，待使用者接續指示後再進行。支出頁優先入口為 `TripViews.tsx` 的 `Expenses`、`data/expense-summary.ts` 與 `styles/trip-views.css`，帳務實際記帳與每人參考金額須維持下方區分。

1. 先讀 [AGENTS.md](AGENTS.md)，以其中的現行規則為準；舊規劃、樣稿與檢查報告不代表已確認需求。
2. 先看 `git status --short` 與 `git diff`，保留工作區未提交的修改，不為了開始新工作而還原既有內容。
3. 依下表找到實作入口，修改資料規則時同步檢查解析、表單、寫入、閱讀畫面、範本及測試。
4. 執行對應檢查；交付前需要完整驗證時使用 `npm run check`。模擬 Google API 的通過結果不等於真實登入、雲端寫入或部署成功。

| 開發範圍 | 主要入口 |
| --- | --- |
| 旅程導覽、讀取生命週期 | [App.tsx](frontend/src/App.tsx)、[portal-api.ts](frontend/src/data/portal-api.ts) |
| 總覽、行程、公積金、支出、進度閱讀畫面 | [TripViews.tsx](frontend/src/pages/TripViews.tsx) |
| 旅程內新增／編輯表單與帳務列表 | [TripEditor.tsx](frontend/src/components/TripEditor.tsx) |
| 驗證、金額與原始帳務統計 | [portal.ts](frontend/src/data/portal.ts) |
| 編輯快照、均分、多人收款與跨表寫入 | [trip-editor.ts](frontend/src/data/trip-editor.ts) |
| 「所有費用」每人參考金額 | [expense-summary.ts](frontend/src/data/expense-summary.ts) |
| 日期／DAY 顯示與帳務日期分組 | [itinerary.ts](frontend/src/data/itinerary.ts)、[date-groups.ts](frontend/src/data/date-groups.ts) |
| 行程拖曳、複製與標籤 | [ItineraryList.tsx](frontend/src/components/ItineraryList.tsx)、[ItineraryTag.tsx](frontend/src/components/ItineraryTag.tsx) |
| 共用樣式與帳務局部規則 | [index.css](frontend/src/index.css)、[styles/](frontend/src/styles/)、元件同層 `.module.css` |
| 資料結構、業務 ID | [schema.json](frontend/src/data/schema.json)、[id-rules.json](frontend/src/data/id-rules.json) |
| 可移植 AI 核心、UI 與設計 | [AI README](frontend/src/ai/README.md) |
| 旅程 AI 工具、授權與 EmailJS | [features/trip-ai/](frontend/src/features/trip-ai/)、[接入說明](docs/ai-agent-integration.md) |

## 本機啟動與設定

需要 Node.js 22.12 以上；GitHub Actions 使用 Node.js 24。在專案根目錄執行：

```sh
npm ci
# 僅首次建立；已有 .env.local 時直接編輯，勿覆蓋。
cp frontend/.env.example frontend/.env.local
npm run dev
```

依終端顯示開啟本機網址。環境變數範例以 [frontend/.env.example](frontend/.env.example) 為準；修改後重新啟動 Vite，正式站則重新建置部署。

| 設定 | 用途 |
| --- | --- |
| `VITE_GOOGLE_SHEETS_API_KEY` | 瀏覽器讀取公開 Sheets；限制 API 與 HTTP referrer |
| `VITE_GOOGLE_SHEETS_CATALOG_ID` | 含「旅程清單」分頁的目錄 Spreadsheet ID |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 網頁用戶端 Client ID |
| `VITE_GUIDE_EMAILS` | 指定導遊 JSON 陣列，第一位為唯一超級使用者 |
| `VITE_BASE_PATH` | 部署路徑，本機預設 `/`，Pages 可用 `/trip-mate/` |
| `VITE_AI_ENABLED`、`VITE_AI_FIREBASE_CONFIG`、`VITE_AI_APP_CHECK_SITE_KEY` | 選用的 Firebase AI Logic 與 App Check 公開設定 |
| `VITE_AI_DEFAULT_MODEL`、`VITE_AI_MODELS` | 預設／推薦模型與額外可選模型 JSON 清單 |
| `VITE_EMAILJS_ENABLED`、`VITE_EMAILJS_SERVICE_ID`、`VITE_EMAILJS_TEMPLATE_ID`、`VITE_EMAILJS_PUBLIC_KEY` | 選用的訪客需求、錯誤及回覆評價郵件 |

`VITE_` 設定會進入瀏覽器，不可放 LLM Secret、OAuth Client Secret、EmailJS 私鑰或 SMTP 密碼。本機 App Check debug token 僅能放未提交的 `.env.local`，使用 `VITE_AI_APP_CHECK_DEBUG_TOKEN`，只在 DEV 啟用；不提交 Git、不放 CI 或正式環境。

舊的 `VITE_GOOGLE_SHEETS_SPREADSHEET_ID` 僅保留為目錄 ID 備援。模型設定使用 `VITE_AI_DEFAULT_MODEL`，郵件設定使用 `VITE_EMAILJS_*`，不再使用舊名稱。

## 功能與權限

- 旅程目錄：名稱／目的地搜尋、狀態篩選；超級使用者可新增／刪除入口、建立旅程試算表及同步導遊 Google 共用權限。
- 行程：航班、住宿、每日行程、日期／標籤篩選、Markdown 詳情；導遊可編輯、複製與跨日拖曳排序。
- PDF：選擇每日行程日期後，列印所選日期及全部航班／住宿；不含帳務與進度。
- 帳務：當地貨幣公積金、行前台幣費用、均分、個人餘額、公共餘款及逐項收款。
- 進度：待辦狀態、截止／完成日期、負責人與逾期提示。
- AI 助手：僅在有效旅程的「行程」分頁提供，支援旅遊問答、唯讀旅程查詢、經確認的每日行程變更、附件與選用郵件功能。

一般團員免登入唯讀及匯出 PDF。指定導遊可編輯旅程內容；`VITE_GUIDE_EMAILS` 第一位才可管理旅程檔案對應、建檔與共用。一般管理者仍可維護既有旅程基本資料及旅程內功能。範例限登入導遊，範本與設定教學限超級使用者；範例不得寫入雲端。

真正的寫入授權由 Google Sheets／Drive ACL 執行，前端角色不能取代 Google 權限。公開試算表可由網址直接閱讀，網站隱藏欄位不構成保密。OAuth session 按部署 base 保存至 localStorage，恢復時重新驗證帳號、scope 與原效期；到期需重登，不保存 Client Secret 或 refresh token。

## 帳務：實際記帳與閱讀統計

### 公積金

只收退當地貨幣，每趟獨立結算。介面名稱「收款」對應 Sheets 既有代碼「儲值」，不遷移舊資料。

- 收款／退款：輸入每人金額，勾選參與者，可全選；調整仍逐人輸入正負金額且需理由。
- 支出：輸入實際金額及參與者，每人同額向上取至幣別最小單位，同步交易、分攤及一筆支出明細。例：1,000 JPY／3 人，各扣 334，公共餘款增加 2；實際支出仍是 1,000。
- 對帳：`個人餘額合計＋公共餘款＝現金餘額`。收款、退款不列為旅遊消費，公共尾差不重複列支出。
- 舊收款／退款各人金額不同時，不填共同金額可保留原值，不自動改成同額。

收支明細依日期由早到晚分組，每筆預設收合，右側箭頭可獨立展開／收合；同日交易間距 16px、不加逐筆分隔線。選「所有團員」時第一行顯示交易總額，展開顯示分攤與參與人員；選定團員後只列其參與交易，第一行改顯示該團員金額，展開顯示「x 人參與，總共 xxx」，支出有向上取整尾差時加上「(向上取整後 xxx)」，括號內為全體分攤合計。各金額保留幣別與正負號，只調整顯示、不改記帳。完整規格見 [AGENTS.md](AGENTS.md#公積金閱讀畫面)。

### 行前費用與收款批次

新增行前費用輸入實際刷卡台幣總額，只勾選「實際參與者」，不逐人填金額。總額須能由參與人數整除，產生同額應繳；無法整除時提示修正，不產生額外餘額。**既有費用的編輯仍保留逐人金額**，相容歷史不同應繳與已收款資料，合計須等於實際支出。

新增收款批次可複選／全選團員；只列出選取團員共同參與的費用，填寫各項「每人實收金額」，預覽合計乘以人數。每人各建一個批次，明細 ID 全部唯一，驗證完成後由同一次 `spreadsheets.batchUpdate` 寫入。編輯／刪除仍操作個人批次。已有收款的費用或團員分攤不能直接刪除。

### 支出頁面

「所有費用」在「團員收款摘要」上方；依類別分組、使用標籤、不列日期。這裡的金額是**每人參考費用**：

| 項目 | 計算方式 |
| --- | --- |
| 行前費用 | 該筆實際台幣總額 ÷ 該筆實際參與人數，向上取至台幣最小單位 |
| 其他 → 公積金支出 | 每筆實際當地消費 ÷ 該筆參與人數，各筆先向上取整後再加總 |

「公積金支出」代表一個人全部參加時的費用，不是取某位團員的最高花費；收款／退款／調整不計入，也不再逐筆列出公積金費用。缺少參與者時顯示「無法計算」。

上方統計卡片仍使用整趟實際總額，沒有改成每人金額。「整趟參考花費」以 `TWD ` 顯示，計算為：

```text
行前實際台幣支出 + 公積金實際當地消費 ÷ 旅程匯率
```

旅程匯率固定為 `1 TWD = 多少當地貨幣`；行前應繳／實收不套用匯率。閱讀統計不回寫原始應繳、實收或公積金餘額。

### 日期與編輯表單

- `DAY N`／`DN` 只在旅程起訖日期內顯示，包含起訖日。閱讀／PDF 與編輯清單使用各自已確認的格式，不混用大字 DAY 與緊湊日期標題。
- 編輯帳務的公積金、行前費用、收款批次依日期分組，日期在卡片外，格式如 `D1 - 4/22(三)`；範圍外為完整年月日與星期。團員依 ID 數字排序。
- 新增公積金交易、行前費用、收款批次，日期初始預填台灣今天；既有資料保留原日期。
- 旅程內新增／編輯表單按 X／Escape 均先提示未儲存內容，確認後返回上一層列表；純列表直接關閉。底部取消返回列表，不暫存草稿。

## AI 助手

701px 起為右側非模態側欄，左側行程可繼續操作；700px 以下為聊天視窗。X／Escape 縮小並保留當次對話；「新對話」才清空上下文。桌面 Enter 送出、Shift＋Enter 換行；手機 Enter 換行。輸入視覺字級維持 14px，手機以 16px 計算字級搭配縮放避免 Safari 聚焦放大，保留手動縮放。

已完成且無附件的對話按旅程、身份、模型及設定隔離保存於 sessionStorage，重新整理後可恢復；未送出輸入不建立持久草稿，附件對話僅保留當次記憶體。串流文字及工具步驟沿用狀態列，未完成內容不持久保存。

提示詞限旅遊議題；航班、住宿與每日行程內文／備註交叉查詢，導遊只能經預覽確認寫入每日行程。AI 不直接讀取帳務、團員或待辦表；相關資料若只出現在這些表，回覆「尚未開放查詢」。其他細節以 [AI README](frontend/src/ai/README.md) 與 [接入說明](docs/ai-agent-integration.md) 為準。

Firebase 未設定仍可開啟介面，但輸入停用，不產生假回覆。模型清單、App Check、429／404 處理與正式站排查見 [AI 設定](docs/setup-ai.md)。EmailJS 可處理訪客調整需求、API 錯誤與回覆不佳回報；收件人固定第一位導遊，不使用任意動態收件人，見 [郵件設定](docs/setup-email.md)。

## 驗證

在專案根目錄執行：

```sh
npm run check             # 資料／AI 覆蓋率、打包邊界、SSR、範本、建置、Pages
```

針對修改範圍可先執行：

```sh
npm run typecheck
npm test
npm run test:coverage     # 資料層 lines／functions／branches 至少 80%
npm run test:ai:coverage
npm run test:render       # React 靜態渲染，不取代瀏覽器互動
npm run build
npm run preview
```

變更 schema、範例或範本產生器時，執行 `npm run templates` 更新範本，再執行 `npm run check`；不因一般 UI 修改重產範本。

### 模擬瀏覽器操作

需安裝 Python Playwright 並有可啟動的 Chromium。用獨立測試伺服器，避免沿用真實服務設定：

```sh
# 終端一：Google 登入與 Sheets 由測試攔截，不使用真實金鑰。
VITE_GOOGLE_CLIENT_ID=test-client VITE_GUIDE_EMAILS='["guide@example.com"]' VITE_GOOGLE_SHEETS_API_KEY=test-key VITE_GOOGLE_SHEETS_CATALOG_ID=test-catalog npm run dev --workspace frontend -- --host 127.0.0.1 --port 5188 --strictPort

# 終端二：依修改範圍執行。
python3 scripts/guide_browser_smoke.py
python3 scripts/trip_editor_browser_smoke.py
# macOS 若使用已安裝的 Chrome，可加入：
# --chrome '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

`trip_editor_browser_smoke.py` 包含表單返回、巢狀選擇器、行程拖曳、行前均分及多人收款，所有 Google API 都是模擬。一般訪客導覽測試 `scripts/browser_smoke.py` 使用相同 API 設定，但 `VITE_GUIDE_EMAILS='[]'`。AI 測試 `scripts/ai_browser_smoke.py` 使用獨立的 AI／EmailJS 測試設定與預設 5193 埠，步驟見 [AI UI 模擬測試](frontend/src/ai/README.md#旅程-ui-模擬測試)。

測試輸出只能證明當次命令覆蓋的範圍；真實 OAuth、Google 共用／寫入、Firebase／App Check、郵件收件、iOS Safari 與實際 PDF 排版，須另外驗證。

## Google 設定、範本與部署

| 文件／資源 | 用途 |
| --- | --- |
| [試算表設定指南](docs/setup-sheets.md) | Sheets API、OAuth、公開閱讀、導遊權限、建檔與填寫範例 |
| [資料結構](docs/google-sheets-schema.md) | 固定分頁、欄位、關聯與帳務規則 |
| [範本目錄](frontend/public/templates/) | 目錄／每趟旅程／範例 Excel 與 Apps Script |
| [國家資料](docs/country-data.md) | 隨專案提供的國家／幣別／時區資料來源 |
| [GitHub Pages 部署](docs/deploy-github-pages.md) | Actions variables／secret、base、OAuth origins、API referrers |

超級使用者可在新增旅程時建立空白 Spreadsheet，填入旅程 ID、幣別、時區、匯率並設定共用；儲存目錄後才成為入口。取消或刪除入口不會刪除已建立的 Google 檔案。同步導遊權限不會轉移所有權、撤銷其他人的既有權限或擴大到全部 Drive。

儲存前重新讀取並比對快照，跨表變更使用一次 `spreadsheets.batchUpdate`；不是多人伺服器鎖。結果不明、拒絕或衝突後先重新讀取／登入，不直接重送。

建置輸出為 `frontend/dist/`。History 路由支援 `/trip/T001` 與舊 hash 網址轉換；Pages 的 `404.html` 先導回入口再還原路徑，初次深層請求仍可能是 HTTP 404。部署整份輸出，保留 `404.html` 與 `.nojekyll`。`.github/workflows/pages.yml` 在 `main` 推送或手動觸發時，先執行 `npm ci` 與 `npm run check` 再部署；本機 `.env.local` 不會自動帶入 Actions。

## 尚待確認

AI 擴充其他資料表或頁面、服務端用量限制、個人代墊／商家退款與公共餘款用途尚未確認。iOS Safari 固定底部分頁列與正式服務問題的追蹤，以 [AGENTS.md 最後一節](AGENTS.md#待確認事項與參考報告) 為準，不自動把歷史建議當成下一項工作。
