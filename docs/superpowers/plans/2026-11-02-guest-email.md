# Guest itinerary request email implementation plan

**Goal:** 未登入訪客可將行程調整需求預覽並確認後透過 EmailJS 轉交第一位導遊。
**Architecture:** 獨立旅程端 email tool，沿用核心 prepare / approve / reject；不新增核心旅程相依。EmailJS 使用固定 API 與 public key，收件人由 GuideConfig 第一筆固定，服務範本 To 必須手動固定相同信箱。
**Tech Stack:** TypeScript、Zod、React、fetch、EmailJS REST、Node tests、Playwright API doubles。

- [x] `guest-email.test.ts`：驗證訪客權限、範例／已登入拒絕、取消零請求、確認單次、身份／來源重查、模型不能指定收件人、API 失敗／未知不重送。
- [x] `emailjs.ts`：公開設定解析、固定端點 JSON 請求、大小／timeout／冷卻與明確成功狀態驗證；無 secret、無自動 retry。
- [x] `guest-email.ts`：模型只能整理需求及自願提供的姓名／回覆信箱；prepare 鎖定副本，commit 重讀公開旅程與身份再送。
- [x] `host.ts` / `index.ts` / `TripAIEntry.tsx`：訪客 email permission、工具／專用提示詞、明確 env allowlist。
- [x] `EmailPreview.tsx` / `preview.ts`：收件人、主旨、完整本文；確認寄送／取消，服務接受結果與 Sheets 修改結果分開。
- [x] `.env.example` / Pages workflow / setup-email.md / README / AGENTS：設定服務與固定收件人範本，公開金鑰、來源限制、用量及純前端限制。
- [x] 執行 AI 覆蓋率、完整 check 與瀏覽器替身測試；不寄真實郵件、不改雲端／部署。

使用者已明確授權實作，直接在本階段完成；EmailJS 帳號設定由使用者依交付文件完成。

結果：npm run check 通過（227 項資料、52 項 AI／旅程測試），AI 行／分支／函式覆蓋皆超過 80%；Chrome headless 寄信替身流程通過。EmailJS 帳號與真實投遞留待使用者依 setup-email.md 設定，不宣稱已完成外部設定。
