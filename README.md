# 蕃薯旅遊團

給每年一起出國的高中同學使用的旅遊工具。手機優先、純前端，資料由 Google Sheets 維護；一般團員免登入查看，指定導遊可登入維護入口旅程清單，以及旅程內的行程、團員、帳務與待辦。

## 啟動

建議 Node.js 22.12 以上或 24 LTS，以及 npm 10 以上，在專案根目錄執行：

```sh
npm install
cp frontend/.env.example frontend/.env.local
npm run dev
```

已經有 `.env.local` 時不要再次覆蓋，直接編輯既有檔案。依終端顯示開啟本機網址。導遊登入後，首頁提供「查看範例」、試算表範本與網站設定教學；一般團員不顯示這些工具，直接開啟範例網址也需要導遊登入。範例與真實資料不混用。

## 功能

- 旅程入口：從旅程目錄選擇，每趟對應不同 Spreadsheet。
- 導遊旅程清單管理：Google 登入後新增、編輯與移除旅程入口；允許的 email 以 env JSON 清單設定。
- 旅程總覽：準備進度、行前待收款與公積金現金餘額。
- 旅遊行程：航班、飯店、按日期篩選每日行程、地圖連結。
- PDF：按「匯出 PDF」，在瀏覽器列印視窗選擇「另存為 PDF」。會輸出全部日期、航班與飯店，保留中文文字；不包含帳務及待辦。
- 公積金：當地貨幣儲值、參與者均分向上取整、個人餘額、收支與退款明細、公共餘款。
- 支出總表：實際行前台幣費用、旅途中當地消費，以及按手動匯率換算的參考總額。
- 行前收款：逐人逐項的應繳／已收／未收、部分已收與超收提示、合併收款批次紀錄。
- 開團進度：依狀態篩選事項，顯示截止日期、完成日期、負責人與逾期提示。

## 建立 Google Sheets 範本

範本已放在 `frontend/public/templates/`，導遊登入後首頁也提供下載：

- [旅程目錄範本.xlsx](frontend/public/templates/旅程目錄範本.xlsx)：含一筆 `T001／範例旅程` 示範入口資料；請替換旅程試算表 ID。
- [每趟旅程範本.xlsx](frontend/public/templates/每趟旅程範本.xlsx)：十一個固定分頁，每次開團複製一份。
- [建立Google試算表範本.gs](frontend/public/templates/建立Google試算表範本.gs)：貼至 [Google Apps Script](https://script.google.com/)，執行 `createTripMateTemplates`，會在你的 Google 帳號建立上述兩份新試算表。執行記錄顯示新檔案網址。此程式不覆寫既有試算表、不變更共用權限，重跑會建立另一組新檔。
- [範例旅程.xlsx](frontend/public/templates/範例旅程.xlsx)：獨立示範資料，請勿當成真實帳務。

Excel 範本可用 Google Sheets 的「檔案 → 匯入」匯入，然後確認已轉為 Google 試算表格式。完整操作與填寫示例見 [試算表設定指南](docs/setup-sheets.md)，欄位規格見 [資料結構](docs/google-sheets-schema.md)。

網站使用這兩個環境變數：

```dotenv
VITE_GOOGLE_SHEETS_API_KEY=瀏覽器用APIKey
VITE_GOOGLE_SHEETS_CATALOG_ID=旅程目錄的SpreadsheetID
```

舊設定 `VITE_GOOGLE_SHEETS_SPREADSHEET_ID` 保留作為目錄 ID 的備援；`VITE_GOOGLE_SHEETS_RANGE` 已不使用。原本只有 `Sheet1` 的舊試算表不會自動變成新結構，請依指南建立「旅程清單」分頁，或使用新的目錄 ID。

在 Google Cloud 啟用 Google Sheets API；API Key 限制為 Google Sheets API，並設定 HTTP referrer（本機例 `http://localhost:5173/*`，正式網站加入實際網域）。目錄與各趟試算表需設為「知道連結的任何人 → 檢視者」，讓第一階段網站匿名讀取。`VITE_` 變數會進入瀏覽器，不能放入私鑰或 client secret。設定變更後重新啟動開發伺服器，正式環境則需重建。

## 帳務規則

行前費用全部使用實際刷卡台幣金額，應繳與實收不受旅程匯率變動影響。公積金只收當地貨幣，結束也退還當地貨幣。

公積金支出由實際參與者同額均分，向上取至當地貨幣最小單位。例如 1,000 JPY 三人各扣 334 JPY，分攤總額為 1,002 JPY，2 JPY 保留為公共餘款。實際現金支出仍是 1,000 JPY；個人餘額總和加公共餘款應等於現金餘額。

旅程匯率為「1 TWD = 多少當地幣」，因此整趟參考台幣花費為：

```text
行前台幣支出 + 當地實際消費 ÷ 旅程匯率
```

儲值、退還餘額與公共尾差不重複列入實際旅遊消費。公積金支出必須與支出明細一對一關聯，避免總表漏記或重複計入。

## 驗證

```sh
npm run typecheck
npm test
npm run test:coverage
npm run test:render
npm run build
npm run preview
npm run templates
```

`test:render` 使用 Vite 安裝時帶入的 esbuild 與 React server renderer，檢查五個頁面的有資料／空資料輸出；不能取代瀏覽器操作測試。`test:coverage` 對資料層要求 lines/functions/branches 80%。`build` 輸出至 `frontend/dist/`，可部署到靜態主機；使用不含 `#` 的 History 路由，建置會產生 GitHub Pages 所需的 `404.html` 與 `.nojekyll`。PDF 需要瀏覽器的列印／另存功能。

另附 `scripts/browser_smoke.py`，在具備 Playwright 與可啟動 Chromium 的環境執行。測試攔截 Google API，以獨立範例驗證手機、桌面、導覽、篩選、錯誤重試與列印樣式，不接觸真實帳務。

```sh
# 終端一：使用假的測試設定，不需真實金鑰
VITE_GUIDE_EMAILS='[]' VITE_GOOGLE_SHEETS_API_KEY=test-key VITE_GOOGLE_SHEETS_CATALOG_ID=test-catalog npm run dev --workspace frontend -- --host 127.0.0.1 --port 5188 --strictPort
# 終端二：需事先安裝 Python Playwright 及其 Chromium
python3 scripts/browser_smoke.py
# 系統已有 Chrome 時，可用 --chrome 指定執行檔
```

資料層測試包含帳務、導遊 email 清單、Google 身分驗證、過期與權限拒絕、清單 CRUD 及儲存前更新檢查。另檢查五個頁面的有資料／空資料輸出、範本結構與 Apps Script 模擬執行，以及 TypeScript／Vite 正式建置。本執行環境禁止監聽本機埠，且 Chrome 啟動遭中止，因此未完成瀏覽器互動、實際 PDF 輸出及真實 Google 登入／存取驗證。

## 專案結構

```text
frontend/src/
├── App.tsx                   # 入口、旅程導覽、讀取生命週期
├── components/ui.tsx         # 共用元件與範本下載
├── components/*.module.css   # 選擇器、搜尋、旅程資訊與預訂卡片的局部樣式
├── pages/TripViews.tsx       # 總覽／行程／公積金／支出／進度
├── styles/                   # 共用元件、框架、入口、旅程頁面與表單樣式
├── data/schema.json          # 範本與網站共用固定欄位
├── data/portal-api.ts        # Google Sheets batchGet 唯讀 adapter
├── data/portal.ts            # 欄位驗證與帳務計算
├── data/demo.json            # 明確標示的獨立範例
└── index.css                 # Tailwind、全域變數與基礎樣式入口
scripts/
├── generate_templates.py     # 只用 Python 標準函式庫產生範本
├── check_render.mjs          # 頁面 render 檢查
└── browser_smoke.py          # 瀏覽器互動檢查
```

## 導遊登入與旅程清單編輯

在原本的 `frontend/.env.local` 加入以下設定，保留既有 API Key 與目錄 ID：

```dotenv
VITE_GOOGLE_CLIENT_ID=你的OAuthClientID.apps.googleusercontent.com
VITE_GUIDE_EMAILS='["your-email@gmail.com"]'
# 未來多人：VITE_GUIDE_EMAILS='["first@gmail.com","second@gmail.com"]'
```

1. 到 [Google Cloud Console](https://console.cloud.google.com/)，選擇已啟用 Google Sheets API 的專案。
2. 在 Google Auth Platform 設定 OAuth 應用程式、聯絡資訊與對象。個人測試可使用 External／Testing，並把登入用 email 加入測試使用者。
3. 建立 OAuth 用戶端，應用程式類型選「網頁應用程式」。在「已授權的 JavaScript 來源」加入實際網站來源，例如 `http://localhost:5173`；如果使用 `127.0.0.1`，另加 `http://127.0.0.1:5173`。此處填來源，不加路徑或 `/*`；與 API Key 的 HTTP referrer 格式不同。
4. 複製 **Client ID** 到 `VITE_GOOGLE_CLIENT_ID`。不要填 API Key，也不要把 Client Secret 放入前端。
5. `VITE_GUIDE_EMAILS` 必須是 JSON 陣列，以單引號包住完整值。大小寫與前後空白會正規化；未設定、空陣列或無效格式均不能編輯。此設定會隨前端公開，不能當成伺服器端權限控制。
6. `VITE_GUIDE_EMAILS` 第一個帳號是超級使用者，只有他能在網站新增、建立及刪除旅程；其他管理者仍可編輯各旅程內資料。目錄試算表請僅授予超級使用者 Google 編輯權，其他管理者保留目錄檢視權；各旅程檔案則同步全部導遊為編輯者。網站角色檢查不能取代 Google ACL。
7. 重新啟動開發伺服器；正式環境則重新建置。按「導遊登入」，選允許的 Google 帳號並同意授權。

登入後首頁會出現「新增旅程」，各旅程卡片會出現「編輯」「刪除」。一般管理者點新增或刪除會顯示「非管理員」提示；超級使用者可正常操作。可填寫試算表網址，程式會取出 ID。新增時可使用「建立空白旅程試算表」按鈕建立完整新檔並自動填入 ID，也可自行貼上既有檔案網址；既有檔案的「旅程設定」ID 須與入口旅程 ID 一致。旅程 ID 由系統預設自動編號，新增時可修改為未使用且格式正確的 ID（T001～T999，之後接 T1000）。刪除需確認，且只移除目錄紀錄，不刪除 Google 檔案。

登入使用 Google Identity Services token model 與 Google userinfo 的已驗證 email，登入 session 與 token 保存於 localStorage，重新整理後會向 Google 驗證再恢復；過期或登出後需重新登入。授權包含 `openid email`、`https://www.googleapis.com/auth/spreadsheets` 與 `https://www.googleapis.com/auth/drive.file`。Sheets scope 是 Google 提供的試算表讀寫授權；導遊可編輯目錄與旅程內資料；另可在明確按鈕操作下建立新旅程檔案並設定其共用權限。

儲存前會重新讀取清單，比對開啟編輯時的快照；偵測不同時請取消、重新讀取後再編輯。這不能取代多使用者交易鎖，目前以單一導遊為使用前提。網路中斷而不確定寫入結果時，先重新讀取，避免直接重送。

真實 OAuth consent 與 Google 檔案權限需在你的帳號中驗證；自動測試不使用真實登入或寫入雲端檔案。`scripts/guide_browser_smoke.py` 提供獨立 Google 模擬的新增／編輯／刪除操作檢查。

```sh
# 終端一：全部使用假的測試設定，Google 服務由測試攔截
VITE_GOOGLE_CLIENT_ID=test-client VITE_GUIDE_EMAILS='["guide@example.com"]' VITE_GOOGLE_SHEETS_API_KEY=test-key VITE_GOOGLE_SHEETS_CATALOG_ID=test-catalog npm run dev --workspace frontend -- --host 127.0.0.1 --port 5188 --strictPort
# 終端二：同樣需要 Python Playwright 及可啟動的 Chromium
python3 scripts/guide_browser_smoke.py
```

其他導遊編輯功能暫不實作。日後可替換 `PortalRepository` adapter 串接後端，頁面與計算維持獨立。

## ID 規則

網站新增的業務 ID 由系統自動編號，新增時可手動修改預設值，儲存前驗證格式與唯一性：旅程 `T001`、團員 `M001`、公積金交易 `F001`、支出 `E001`、收款明細 `R001`、收款批次 `B001`、航班 `A001`、住宿 `H001`、每日行程 `I001`、開團待辦 `P001`。

一般固定四個字元；超過 999 後為五個字元，例如 `T999 → T1000`。編號取現有最大流水號加一，欄位排序或中間缺號不影響編號。前綴統一定義於 `frontend/src/data/id-rules.json`，共用產生器為 `record-id.ts`；超過 9999 時會提示先確認擴碼規則。

現有試算表的舊 ID 仍可讀取、編輯，網站不會替既有資料改名；Google Spreadsheet ID 與 OAuth Client ID 等外部識別碼不適用此規則。

官方參考：[Google Sheets batchGet](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet)、[Google API 憑證](https://developers.google.com/workspace/guides/create-credentials)、[Apps Script Spreadsheet 服務](https://developers.google.com/apps-script/reference/spreadsheet/)。


## 在網站建立旅程試算表

1. 在目前 OAuth Client ID 所屬的 Google Cloud 專案啟用 **Google Drive API**（原有 Google Sheets API 也要保留）。在 Google Auth Platform 的資料存取範圍加入 `https://www.googleapis.com/auth/drive.file`，測試使用者仍包含導遊 email。
2. 重新登入導遊，授予新增的 Google Drive 檔案權限。不需要更換既有 API Key 或 OAuth Client ID，也不把 API Key 改成完整 Drive 權限。
3. 在首頁按「新增旅程」，填名稱與旅程 ID；ID 預設自動產生，可以在建檔前修改。
4. 在試算表欄位下展開「建立空白旅程試算表」，搜尋並選擇國家／地區，自動帶入單一幣別與 IANA 時區；若有多個選項需自行選擇，亦保留手動輸入，時區可填 `UTC+9`、`UTC-5`、`UTC+05:30` 等固定時差（不隨夏令時間變動）。匯率（1 TWD = 多少當地幣）仍須手動填寫；切換國家或幣別會清空匯率，避免沿用錯誤設定。
5. 選擇是否開放「知道連結的任何人可檢視」，再按「建立並填入 ID」。檔案會建立於目前導遊的 Google 雲端硬碟，包含十一個旅程分頁、固定欄位與旅程設定，其他業務列為空白。
6. 新檔 ID 會自動填回表單，旅程 ID 固定為已寫入檔案的值。按表單「儲存」後才加入入口清單。

未勾選開放檢視時，檔案維持私人，一般團員無法匿名讀取。新檔會先設定為純文字格式，避免日期與 ID 被自動改寫。若建檔成功但格式設定或共用因 API／組織政策失敗，介面保留檔案 ID 及連結，可接續完成設定、重試共用或手動調整；不會自動建立第二份。若建檔請求失去回應而無法確認結果，請先到雲端硬碟查看，再決定是否重試。取消表單不會刪除已建立的新檔。

建檔與共用的單元測試均使用模擬 API；實際 Google OAuth consent、Drive API 啟用及帳號政策仍需在你的帳號驗證。

旅程總覽會依免登入讀取結果判斷觀看狀態：Google 明確拒絕檔案存取時顯示「此旅程暫不開放觀看」，導遊另可看到共用設定指引。調整共用後按「重新讀取」即可重試。API 設定、配額與不明錯誤仍顯示一般讀取失敗，不會誤標成未開放；這不是完整 Drive 權限查詢。

完整檢查可執行 `npm run check`，依序驗證資料／API 測試與覆蓋率、畫面渲染、Excel／Apps Script 範本及正式建置。

導遊表單不提供草稿暫存；未儲存即關閉、取消或重新整理後，重新開啟須重填。已建立的雲端檔案仍會保留，可自行從 Google Drive 取得網址再次填入。公開讀取檢查不會自動開放私人檔案。

行程頁可選擇全部或目前日期匯出 PDF；航班與飯店均保留。功能資料異常時只影響對應區塊，導遊可查看修正位置；帳務異常時不顯示替代的零金額。


GitHub Pages 路由與部署：

- 旅程網址使用 `/trip/T001` 或 `/trip/T001/overview`，不再使用 `#`。站內導覽支援上一頁／下一頁；舊的 `#/trip/...` 連結仍可開啟並自動轉換。
- 建置會在 `frontend/dist/` 產生 `404.html`。直接開啟旅程或重新整理時，GitHub Pages 先載入這個頁面，再帶著原路徑導回首頁，前端使用 replaceState 還原路徑；不使用瀏覽器暫存。真正不存在的網址顯示「找不到頁面」，不重複導回。
- GitHub Actions 建置時，預設依 `GITHUB_REPOSITORY` 推算 `/repository-name/`；`username.github.io` repository 預設根路徑 `/`。
- 自訂網域請設 `VITE_BASE_PATH=/`。其他部署或本機手動建置可明確指定，例如 `VITE_BASE_PATH=/trip-mate/ npm run build`；此值也用於圖示、JS/CSS、Excel 範本及所有站內連結。本機一般開發未設定時為 `/`。
- 將整份 `frontend/dist/` 部署到 Pages，包含 `404.html` 與 `.nojekyll`。此為 GitHub Pages 404 的前端導回方式，首次深層連結請求仍會收到 HTTP 404，之後載入首頁並還原網址。
- Vite 的 GitHub Pages base 設定參考：[官方部署說明](https://vite.dev/guide/static-deploy.html#github-pages)。

完整部署步驟請見 [GitHub Pages 部署指南](docs/deploy-github-pages.md)。專案提供 `.github/workflows/pages.yml`，從 `main` 自動檢查並部署 `frontend/dist`；API Key 使用 repository secret，其他前端設定使用 repository variables。


第二階段導遊編輯：

- 進入旅程後按「編輯進度」「編輯行程」或「編輯帳務」。帳務的資料類型可切換公積金、行前費用、收款及團員；行程可切換每日行程、航班與飯店。
- 當次表單按儲存才寫入，不做草稿暫存；取消或關閉後須重填。既有 ID 固定，新 ID 自動建議且可改成合規未使用值，所有關聯用選單或團員勾選。
- 公積金消費輸入實際金額與參與者，即同步建立交易、分攤與支出總表；預覽每人扣款與公共尾差。儲值／退款填各人金額，由網站加總。調整需填原因。
- 行前費用輸入實際刷卡台幣金額與每人應繳；收款可在同一批次加入多項費用。已收款的費用須先處理收款才能刪除；被引用的團員、航班與飯店不可直接刪除。
- 旅程檔案必須授予導遊帳號實際編輯權；只有目錄可編輯並不足以編輯各旅程。私人旅程也能由具檔案權限的導遊開啟編輯，正常觀看權限不因此改變。範例模式不提供雲端編輯。
- 每次儲存先授權重新讀取、比對快照，再以一次 spreadsheets.batchUpdate 套用相關分頁。這提供同一筆變更的原子套用，但讀寫之間仍非多導遊原子鎖。
- 儲存結果不明或重新讀取失敗時，先重新讀取確認，不直接重送。介面會要求重新載入編輯資料；單純欄位驗證錯誤則留在表單修正。

新增 `scripts/trip_editor_browser_smoke.py` 供具備 Playwright 的環境驗證網站編輯，沿用上方測試 Vite 設定（guide@example.com／test-client）。所有 Google 登入與 API 皆攔截模擬，測試不寫入真實雲端。執行 `python3 scripts/trip_editor_browser_smoke.py`。

航班與每日行程直接填寫各地當地時間，不需輸入時差。旅程標題會顯示台灣與目的地目前的日期時間；目的地依旅程設定的預設時區顯示。舊航班的含偏移格式仍可讀取，新的當地時間不會自動換成台灣或瀏覽器時間。

導遊登入會按網站部署路徑分開保存至 localStorage；恢復前重新驗證 Google 帳號與指定 email，保留原 token 到期時間，不因重整延長。登出、到期或驗證失敗會清除保存資料，同一專案的分頁間會同步登入／登出。瀏覽器若阻擋儲存則僅維持當次登入並顯示提示。表單內容仍不做草稿暫存。

### 同步指定導遊的 Google 編輯權

新建旅程會自動把 `VITE_GUIDE_EMAILS` 清單中的帳號加入該旅程試算表編輯者。既有旅程在入口按「編輯」，再按「同步導遊編輯權」。執行帳號需有管理共用的權限，且檔案須可由目前 drive.file 授權操作；外部建立的舊檔案可能仍需手動共用。詳見 [設定方式](docs/setup-sheets.md#自動設定導遊編輯權)。此功能不自動修改旅程目錄檔案，也不撤銷清單外的既有 Google 權限。

### 超級使用者清單順序

```dotenv
VITE_GUIDE_EMAILS='["owner@example.com","manager@example.com"]'
```

`owner@example.com` 是唯一超級使用者；`manager@example.com` 可維護既有旅程內的行程、帳務與進度。改變第一位帳號須重新部署，且不會自動轉移試算表所有權。若仍授予一般管理者 Google 目錄編輯權，他仍能直接在 Google Sheets 修改清單；要由 Google 權限強制保護入口，目錄應只讓超級使用者編輯。

旅程試算表設定僅供超級使用者操作：一般管理者編輯入口時不顯示試算表 ID／網址、公開讀取檢查及導遊權限同步按鈕，也不能變更旅程對應的試算表。名稱、日期等基本資料與旅程內編輯功能仍依原有權限使用。既有旅程的「同步導遊編輯權」須由超級使用者登入執行。

內部業務 ID 僅對超級使用者顯示；一般管理者新增資料使用系統預設編號，編輯畫面不顯示 ID 欄位或編號說明，關聯選單只顯示名稱。已儲存 ID 仍固定，Google Sheets 與網址路由中的識別值保留。範本與設定教學僅在超級使用者登入後顯示，其他管理者仍可查看範例及編輯旅程資料。
