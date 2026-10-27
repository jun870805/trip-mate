# 部署到 GitHub Pages

專案已提供 `.github/workflows/pages.yml`，在推送到 `main` 或手動執行時完成檢查、建置與部署。這份說明假設一般專案網址為 `https://你的帳號.github.io/trip-mate/`；請換成實際帳號與 repository 名稱。

## 1. 上傳完整專案到 GitHub

建立 repository，例如 `trip-mate`，將專案原始碼、根目錄的 package.json／package-lock.json、frontend、scripts 與 `.github/workflows/pages.yml` 一起推送到 `main`。不要只上傳 frontend，也不用手動上傳 dist。

本機的 `frontend/.env.local` 不會跟著上傳；線上建置的設定要在下一步另填。`.env.local`、node_modules、dist 與 docs/private 已在 .gitignore 排除；不要強制加入私鑰或 Google OAuth Client Secret。若某個檔案先前已被追蹤，.gitignore 不會自動移除它。

若使用 GitHub Desktop，使用 Add Local Repository 加入目前專案，Publish repository，再提交與推送。若使用終端機，先確認遠端指向自己的 GitHub repository，再執行一般 git add／commit／push；本工具尚未替你執行遠端部署。

## 2. 在 GitHub 設定建置用環境變數

進入 repository → Settings → Secrets and variables → Actions。

在 **Secrets** 分頁按 New repository secret：

| 名稱 | 值 |
| --- | --- |
| VITE_GOOGLE_SHEETS_API_KEY | 本機正在使用的 Google Sheets API Key |

在 **Variables** 分頁按 New repository variable：

| 名稱 | 值 |
| --- | --- |
| VITE_GOOGLE_SHEETS_CATALOG_ID | 旅程目錄 Spreadsheet ID，不是單趟旅程 ID |
| VITE_GOOGLE_CLIENT_ID | Google OAuth Web Client ID（以 .apps.googleusercontent.com 結尾） |
| VITE_GUIDE_EMAILS | `["你的email@gmail.com"]`，可放多個 email |
| VITE_BASE_PATH | 一般專案可留空；使用自訂網域時填 `/` |

GitHub 網頁的值直接貼上，不要加 shell 使用的外層單引號。例如 email 清單填 `["a@gmail.com","b@gmail.com"]`，不要填 `'["a@gmail.com"]'`。

只查看資料時可不設 Client ID，email 可設 `[]`；要使用導遊功能則兩者都要正確設定。API Key 與目錄 ID 未填時 workflow 會停止，避免部署空白設定。

`VITE_` 值會編進前端網站，即使存在 GitHub Secrets，瀏覽器仍可讀到；不可把 Client Secret 或服務帳號私鑰放進去。API Key 應使用網站來源與 API 限制。

## 3. 開啟 GitHub Pages

repository → Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。

不必選 main 的 /docs，不必建立 gh-pages 分支。實際上傳的是 workflow 產生的 frontend/dist。

## 4. 在 Google Cloud 加入正式網站

沿用本機正在使用的 Google Cloud 專案與 OAuth 用戶端：

- 確認已啟用 Google Sheets API；網站建立試算表及設定共用另需 Google Drive API。
- API Key 的 Application restrictions 使用 Websites／HTTP referrers，加入 `https://你的帳號.github.io/*`；保留原有 localhost 規則供本機使用。API restrictions 限制為 Google Sheets API。
- OAuth Web Client 的 Authorized JavaScript origins 加入 `https://你的帳號.github.io`，不要包含 `/trip-mate/`、`/*` 或任何路徑；可保留原有 localhost 來源。
- OAuth 應用若仍在 Testing，將導遊 email 加入測試使用者。此專案使用 Google Identity Services 彈窗取得 token，不需要額外設定旅程路由為 redirect URI。
- 旅程目錄與要公開查看的旅程試算表設為「知道連結的任何人／檢視者」。目錄編輯權限授予指定導遊帳號。

## 5. 觸發部署

推送 workflow 與專案到 main 後，開啟 repository 的 Actions → Deploy GitHub Pages 查看結果。也可點 Run workflow 手動執行。

如果第一次推送時 Pages 或變數還沒設定，設定完成後重新 Run workflow 即可。環境變數日後有變動，也要重新執行，因為它們在建置時編入網站。

成功後在 Settings → Pages 的 Visit site，或 workflow 的 github-pages 環境網址開啟網站。一般網址為 `https://你的帳號.github.io/trip-mate/`。

## 6. 部署後確認

1. 首頁能列出自己的旅程。
2. 直接開啟 `https://你的帳號.github.io/trip-mate/trip/T001`，並重新整理，確認能正確導回旅程。
3. 圖示、樣式與範本下載正常。
4. 導遊登入成功，可以編輯清單；請選擇有目錄編輯權限的帳號。
5. PDF 匯出與手機操作在實際瀏覽器確認。

一般專案的 /repository-name/ 前綴由 GitHub Actions 自動推算；若圖片、CSS 或網址指向根路徑，確認 VITE_BASE_PATH 沒有誤填 `/`。設定自訂網域時則使用 `/`，並在 Google API Key 與 OAuth origins 加入該網域。

來源：[GitHub Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Vite GitHub Pages 部署](https://vite.dev/guide/static-deploy.html#github-pages)、[Google JavaScript origins 設定](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)。
