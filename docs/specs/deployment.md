# GitHub Pages 與驗證

部署、路由與 CI 檢查範圍。

## GitHub Pages 與驗證

- 使用 History 路由、站內 URL 無 `#`，支援站內導覽、上一頁／下一頁及舊 hash 網址轉換；`/trip/T001` 預設總覽，`/demo/...` 須導遊登入。
- 建置產生 `404.html`／`.nojekyll`；有效深層網址導回入口並以 replaceState 還原路徑、query、fragment，不用瀏覽器暫存。不接受跨站／專案外還原，無效路徑停留 404、不循環；初次仍是 HTTP 404，非伺服器 rewrite。
- `VITE_BASE_PATH` 支援 `/` 或 `/repository-name/`；預設本機 `/`、Actions 依 repo 名推算，username.github.io 為 `/`，自訂網域明確設 `/`。所有素材、下載與站內連結使用同一 base。
- `.github/workflows/pages.yml` 由 main 推送或手動觸發，npm ci＋npm run check 後部署 frontend/dist。API Key 用 repository secret，其餘目錄 ID／OAuth Client ID／email 清單／base 用同名 variables；email 清單填 JSON、不加 shell 外層單引號，本機 env 不自動帶入 Actions。
- Pages Source 用 GitHub Actions；正式網址須加入 API Key referrers／OAuth origins，origins 不含專案路徑。
- `npm run check` 包含資料／AI 覆蓋率、AI 可移植邊界與打包、畫面渲染、Excel／Apps Script、型別／正式建置及 Pages 資源／404 無循環檢查。真實 OAuth／Drive、手機觸控及 PDF 排版需實際環境驗證，不以靜態渲染代替。
