# 可移植 AI 模組

這是可移植的 TypeScript Agent，另提供選用的 React 聊天面板。核心可由其他前端或測試程式呼叫，不依賴旅程資料模型、Google Sheets、路由、Vite 環境變數或 React；`ui/` 的 React 元件亦不依賴本專案業務。旅程頁已有懸浮入口、桌面側欄與手機聊天窗。

## 責任與依賴方向

```text
應用／未來 Chat UI
  ├─ createAgent → Controller → Provider → LLM
  └─ Tool Pack → Host Adapter → 原有資料服務
                   ↑
             準備預覽 → 使用者確認 → 重驗授權／快照 → 提交
```

| 檔案 | 責任 |
| --- | --- |
| `contracts.ts` | Context、訊息、檔案、工具、Provider、預覽及狀態契約 |
| `core/registry.ts` | 工具白名單、重名檢查、依權限輸出模型可見宣告、Zod JSON Schema |
| `prompts/base-rules.ts` | `BASE_RULES`：回答主題、委婉婉拒、資料可信邊界、確認及憑證規則 |
| `core/errors.ts`、`core/diagnostics.ts` | 可移植 ProviderRequestError／ProviderRateLimitError／ProviderModelUnavailableError，錯誤分類與憑證遮蔽／長度限制 |
| `core/controller.ts` | 有上限的模型／工具循環、單一待確認操作、取消及生命週期 |
| `providers/firebase.ts` | Firebase SDK 請求／回應與 Schema 映射，保留原始模型內容及簽章等附帶資訊 |
| `providers/firebase-runtime.ts` | 明確、延遲建立 Firebase App／App Check／模型；不在 import 時連線 |
| `files/intake.ts` | 本機文字與 XLSX 抽取、PDF／圖片 inline data、檔案限制 |
| `ui/ChatPanel.tsx`、`.module.css` | 可複製聊天面板、輸入、附件、狀態及預覽插槽 |
| `ui/presentation.ts`、`dialog-focus.ts` | 隱藏內部工具／文件內容的訊息投影，以及 dialog Tab 邊界焦點循環 |
| `tests/` | 無真實憑證的核心、Provider 映射及檔案測試 |

旅程整合放在 `../features/trip-ai/`，**不屬於可複製核心**。核心不能反向 import 該目錄或 `../data/`。

## 複製到另一個專案

1. 複製整個 `ai/` 目錄，保留相對路徑及 `.ts` import。
2. 安裝本專案 `package.json`／lockfile 中使用的 `zod`、`@firebase/app`、`@firebase/app-check`、`@firebase/ai`、`fflate`、`read-excel-file` 相容版本。只使用核心時，可直接匯入 `core/controller.ts` 與 `contracts.ts`；Provider 及檔案模組可依需要移除。
3. TypeScript 啟用 `strict`、`allowImportingTsExtensions`，由 Vite 等 bundler 處理；執行環境需要 `AbortController`、`structuredClone`、`crypto.randomUUID`。檔案流程另需 `File`、`TextDecoder`、`btoa`。
4. 建立自己的 Tool Pack 與 Host。Host 封裝既有資料來源，持有憑證並執行最終授權／衝突檢查。
5. 注入 Provider、工具及 `getContext`。使用可選 UI 時另安裝 React／react-dom，保留 `ChatPanel.module.css` 並讓 bundler 支援 CSS Modules。訂閱狀態後傳入 `ChatPanel`，dialog、關閉／縮小控制、主題變數與業務變更預覽由新專案提供。不使用 localStorage 保存聊天或輸入。

最小可執行例子，不需要 Firebase 或旅遊資料：

```ts
import { z } from 'zod';
import { createAgent } from './ai/core/controller.ts';
import type { Provider, Tool } from './ai/contracts.ts';

let name = '原名稱';
const tools: Tool[] = [{
  name: 'rename', description: '準備修改名稱', risk: 'write',
  schema: z.strictObject({ name: z.string().min(1) }),
  enabled: context => context.permissions.includes('write'),
  async prepare(input) {
    const next = (input as { name: string }).name;
    const before = name;
    return {
      preview: { summary: '修改名稱', changes: [
        { operation: 'update', target: 'name', before, after: next },
      ] },
      async commit() {
        if (name !== before) return { status: 'conflict', message: '資料已更新' };
        name = next;
        return { status: 'success', data: { name } };
      },
    };
  },
}];

// 示範 Provider 只用於測試，不代表已連上模型。
const provider: Provider = {
  async generate(request) {
    return request.messages.length === 1
      ? { parts: [{ call: { name: 'rename', args: { name: '新名稱' } } }] }
      : { parts: [{ text: '已收到工具實際結果。' }] };
  },
};
const agent = createAgent({
  provider, tools,
  getContext: () => ({ scope: 'profile', scopeId: 'self',
    locale: 'zh-TW', permissions: ['write'] }),
});
await agent.send('修改名稱');
const preview = agent.getState().pending;
// UI 此時呈現 preview，還沒有寫入。只有使用者按確認時才呼叫：
if (preview) await agent.approve(preview.id);
agent.dispose();
```

正式 Host 的 `commit` 必須重查當前帳號、權限、原資料與業務限制。範例的記憶體字串不能替代伺服器授權。

## Controller API 與確認流程

```ts
const unsubscribe = agent.subscribe(() => {
  const state = agent.getState(); // 深拷貝，呼叫方無法改動內部待提交參數
  // UI 消費 status、messages、pending、results、error。
});
await agent.send('使用者的訊息');
// 等待使用者明確操作後：
await agent.approve(approvalId); // 只傳 ID，不接受 UI 回傳另一份修改參數
// 或 await agent.reject(approvalId);
unsubscribe();
agent.dispose();
```

狀態：`idle → running → awaiting_confirmation → committing → running → idle`，錯誤為 `error`，卸載為 `disposed`。

- 預設每次使用者訊息最多 5 次模型請求、10 次工具呼叫，同時只有一個待確認操作。模型同次提出多項寫入會被拒絕；批次操作必須由單一已註冊批次工具準備。
- 預設文字輸入 20,000 字元、對話 80 則內部訊息；送出模型前訊息序列化資料最多 16 MiB。Function Call／Response 也算內部訊息。達上限請建立新 agent，不默默刪掉需要配對的工具歷史。
- `getContext` 每次處理與確認時重新取得；scope／scopeId 不同即拒絕。切換資源必須 dispose 舊 agent，再建立新 agent。
- 工具名稱白名單、嚴格 Zod schema、當前權限都由應用檢查；模型無法透過參數傳入另一個 scope，未知欄位必須由工具採 `z.strictObject` 拒絕。
- `reject` 記錄 `cancelled` 結果，不執行 commit；預設繼續交給模型回覆。工具可設 `finishAfterDecision: true`，在成功／取消後直接結束該輪，由 Host 顯示工具結果，避免模型重複提出已處理的操作；失敗仍進入錯誤狀態。重複確認或舊 approval ID 拒絕。提交參數保留在私有 closure 中，不從模型或 UI 重新取值。
- `cancel()` 中止目前推論／準備、清除對話與待確認操作；寫入中禁止 cancel。`dispose()` 可在卸載時呼叫，但已送出的寫入仍可能完成，不能視為回滾。Host 的結果處理仍會執行。
- 訂閱函式拋錯不影響執行。結果以 `results` 的實際工具狀態為準，不能僅根據模型說「完成」顯示已儲存。
- 沒有自動重送、持久化對話、表單草稿、beforeunload 或背景排程。未來 UI 的「縮小」應僅隱藏視窗並保留 agent；不要自動呼叫 approve。

## 新增工具或更換 Provider

工具使用 `read`、`write` 或 `destructive` 風險：唯讀實作 `execute`；寫入實作 `prepare`，回傳 `{ preview, commit }`。`commit(context, signal)` 在發出實際寫入前檢查 signal；送出後的 Abort 不能視為回滾。preview 包含 summary、逐筆 changes（操作、目標、before／after）與 warnings。不要在 prepare 寫入。

工具的 schema 同時用於執行前驗證及產生 Provider 宣告。Firebase adapter 目前支援物件、陣列、字串、字串 enum、整數、數字與布林；不支援遞迴 `$ref`、union／anyOf。模型端只收到適用的 Schema 提示，Zod 執行時驗證才是完整約束來源。`enabled` 必須檢查 Host 提供的權限；不能使用模型自稱的角色。

Provider 只需實作 `generate(ProviderRequest)`，回傳文字與／或工具呼叫的 parts。工具結果由 Controller 以 `result` part 回傳下一輪。Provider 不直接執行工具或資料寫入。SDK 特有簽章、thought parts 等原始回應可放在 `opaque`，下一輪原樣送回同一 Provider；核心不解讀或顯示它。

## Firebase 正式設定

可使用 `initializeFirebaseProvider`；已有 Firebase／App Check 的專案也可以自行建立 SDK model，再用 `createFirebaseProvider(model)`，避免重複初始化。

```ts
import { initializeFirebaseProvider } from './ai/providers/firebase-runtime.ts';
const provider = await initializeFirebaseProvider({
  firebase: publicFirebaseWebConfig,
  model: configuredModelName,
  appCheckSiteKey: recaptchaEnterpriseSiteKey,
  appName: 'my-ai',
});
```

外部設定由專案管理者完成：

1. 在 Firebase console 建立或選擇專案及 Web App，啟用 Firebase AI Logic 的 Gemini Developer API 流程。
2. 取得公開 Firebase Web config；在控制台確認一個支援 Function Calling 及本次 PDF／圖片輸入的模型名稱，透過設定傳入。本模組不猜測固定 model ID。
3. 註冊 Web App 的 reCAPTCHA Enterprise App Check，加入實際網域，並對 Firebase AI Logic 啟用 enforcement。這不是 Sheets 授權替代品。
4. 在開發環境依官方方式設定 App Check Debug Provider，僅在本機初始化前配置；debug token 不提交版本控制。本模組不自動啟用 debug。
5. 設定 API 使用限制、用量／配額與費用警示；確認資料傳送符合團員與上傳文件的使用範圍。前端無法提供不可繞過的每人費用配額。
6. 在實際環境驗證模型請求、Function Calling、App Check、PDF／圖片抽取及失敗情境。本專案 UI 已接入；模擬測試不代表這些正式服務驗證已完成。

Firebase Web config 可公開；**Gemini／OpenAI／Claude 的服務 Secret 不能放進 Vite bundle**。改用需要 Secret 的 Provider 時，由受控後端／Serverless 保管 Secret，再實作新的 adapter。OAuth token 僅由 Host 持有，不傳給模型、訊息、工具輸入或日誌。

官方參考：[Function Calling](https://firebase.google.com/docs/ai-logic/function-calling)、[App Check](https://firebase.google.com/docs/ai-logic/app-check)、[檔案要求](https://firebase.google.com/docs/ai-logic/input-file-requirements)。平台政策依最新官方文件及實際控制台設定確認。

## 檔案輸入

```ts
import { prepareFiles } from './ai/files/intake.ts';
const parts = await prepareFiles(selectedFiles, abortController.signal);
await agent.send('請抽取這份文件的行程；日期不明的項目先詢問。', parts);
```

| 格式 | 處理 |
| --- | --- |
| UTF-8 TXT／CSV | 原文作為不可信使用者內容；非 UTF-8 拒絕，CSV 由模型解讀，未自行執行公式 |
| XLSX | 本機讀取各分頁文字／數值／日期；公式儲存格排除並加警告，不使用快取結果；不下載外連、不執行巨集 |
| PDF、PNG、JPEG、WebP | 檢查基本檔頭後編成 inline data，由已設定的模型辨識；不是本機 OCR，也不保證掃描內容辨識正確 |

每次最多 3 檔、每檔 4 MiB；文字每檔最多 200,000 字元，XLSX 解壓 XML 最多 16 MiB／1,000 個壓縮項目、抽取最多 10,000 儲存格。超限拒絕，不默默截掉內容。這些是本模組保守限制，實際模型仍可能有更嚴格限制。基本檔頭檢查不代表完整格式驗證；加密、損壞文件可能由解析器／模型拒絕。

檔案內容與景點備註是資料，不能覆寫系統與工具政策。模型抽取仍可能出錯；寫入前的欄位／日期驗證及逐筆人工確認不可省略。上傳附件只留在 agent 記憶體，cancel／dispose 後清除；對話仍存在時會隨必要歷史傳回模型。

## 本專案旅程整合

入口為 `../features/trip-ai/index.ts`。`createConfiguredTripAgent(options, env)` 會讀取 `.env.example` 的 `VITE_AI_*` 公開設定；只有 `VITE_AI_ENABLED=true` 才初始化 Provider，否則回傳 null。現有行程頁只在使用者首次開啟 AI 彈窗時呼叫初始化；模型請求等到實際送出訊息才產生。未設定仍可開啟彈窗查看未啟用狀態，不能送出。也可以直接注入 Provider：

```ts
import { createTripAgent } from './features/trip-ai/index.ts';
const { agent, host } = createTripAgent({
  trip, source: 'trip', config: guideConfig, provider,
  getSession: () => currentGuideSession,
  readData: async () => currentSuccessfullyLoadedTripData,
  onSaved: () => refreshCurrentTrip(),
  onExpired: () => invalidateGuideSession(),
});
```

`readData` 必須沿用成功的公開讀取；資料載入中、權限拒絕、範例登出、切換旅程時不可回傳舊資料。scopeId 由 Host 固定，不接受模型指定。

工具：`itinerary_get_summary`、`itinerary_get_activities`、`itinerary_get_travel_details`、`itinerary_search`、`itinerary_missing_maps`、`itinerary_add`、`itinerary_update`、`itinerary_delete`、`itinerary_move`、`itinerary_import`、`itinerary_apply_maps`。行程建議先查真實資料，由模型提供附限制的建議文字；採納後再走寫入工具。沒有即時地點搜尋或道路路線最佳化。

範例必須傳 `source: "demo"`，強制唯讀且要求有效導遊登入；登出後拒絕讀取。正式旅程用 `source: "trip"`。

Host 沿用 `createTripEditor` 的讀取、快照、mutation、ID 與 batchUpdate，不建立第二套 Sheets CRUD。匯入及地圖補全透過 `saveItineraryBatch` 整批儲存；前端先讀後寫不構成嚴格並行交易。結果不明／拒絕／衝突後會鎖住寫入，必須重新登入／讀取並建立新對話；可呼叫 `host.reload()` 驗證新快照後解除寫入鎖。

工具只允許日期、時間、標題、副標、內文、標籤、類別；保留舊關聯、時區與額外欄。依既有編輯規則合併舊地點／地圖到副標、清除舊來源與結束時間。新 ID 自動產生。排序衝突在預覽明列清除被移動項目的時間；其他活動時間保留。匯入的疑似重複列警告，不自動刪掉。Google Maps 僅建立搜尋網址，既有連結不覆蓋、模糊名稱拒絕。

未來 UI 必須呈現旅程、日期、具體欄位前後差異、數量與 warnings，再讓人按確認；一般管理者畫面須依既有規則隱藏業務 ID。要調整預覽內容或排除部分匯入項目，先 reject，再重新準備新預覽，不能修改 getState() 的拷貝後當作已批准參數。

## 驗證與交付狀態

從 repository 根目錄執行 `npm run test:ai`、`npm run test:ai:coverage`、`npm run check:ai:bundle`、`npm run check`。測試包含獨立非旅程 Tool Pack、Provider SDK 映射、取消、範圍與授權、快照衝突、增改刪排序、匯入、補地圖與檔案限制。

UI 的桌面／手機、縮小恢復、焦點／捲動、附件、預覽取消／確認與寫後更新以模擬 Provider／Google API 驗證；這不等於真實 Firebase／App Check、實際 Google OAuth／Sheets 寫入、掃描文件辨識或部署驗證。完整外部設定見 [Firebase 設定](../../../docs/setup-ai.md)。

## React UI 接入

```tsx
import { ChatPanel } from './ai/ui/ChatPanel';
import { chatEntries } from './ai/ui/presentation';

<ChatPanel
  entries={chatEntries(state.messages, formatActualToolResult)}
  disabled={state.status !== 'idle'}
  status={statusLabel}
  thinking={state.status === 'running'} // 顯示狀態旁的 loading
  enterToSend={desktop} // 701px 起 Enter 送出；700px 以下 Enter 換行
  error={state.error}
  preview={renderApplicationPreview(state.pending)}
  previewId={state.pending?.id}
  onSend={async (text, files) => {
    const parts = await prepareFiles(files);
    await agent.send(text, parts);
  }}
/>
```

上例的 state、statusLabel、結果格式化與 preview renderer 由 Host 提供。本專案處理中狀態為「思考中... (x秒)」，滿一分鐘改顯示「思考中... (x分x秒)」，並搭配旋轉指示；每次 `thinking` 開始重新計時，使用單調時鐘與每秒更新，切回頁面校正，結束或卸載清除計時器與監聽，僅保留當次記憶體，遵循減少動態效果。輸入框與一般訊息角色名稱只保留無障礙標示，placeholder 為「問問 AI助手」。`enterToSend` 預設 true；本專案 Host 傳入桌面判斷（701px 起），桌面 Enter 送出、Shift＋Enter 換行，手機（700px 以下）Enter 換行並使用送出按鈕送出；組字中的 Enter 不送出，Ctrl／Command＋Enter 仍可送出。其他專案可明確設 false 保留一般 Enter 換行。模板提示詞點擊直接呼叫 onSend，與表單共用鎖定及防重送流程，不夾帶未送出的附件。`renderMessage` 可注入專案自己的安全 Markdown renderer；預設為純文字。不要顯示 Provider `opaque`、Function Call／Response 原文或文件抽取 JSON。旅程 Host 額外移除非超級使用者可見文字中的業務 ID，依真實工具結果顯示儲存狀態，且模型 Markdown 不自動載入遠端圖片。

本專案 `features/trip-ai/TripAIEntry.tsx` 負責 portal、桌面側欄／手機 modal 語意、背景捲動鎖、Lazy Provider 與動態 session/data ref。單一 ChatPanel 跨尺寸保留輸入；縮小／Escape 保留當次 agent，清空對話才刪除上下文、輸入與附件。儲存中禁止縮小／清空。桌面側欄不鎖背景；左側行程內文可直接展開，手機仍使用原本詳情 dialog。


## 已完成對話的保存與移植

核心不直接讀取瀏覽器或 env。Host 可呼叫 `agent.exportConversation()` 取得版本 1 checkpoint，再注入自己的 sessionStorage／其他儲存介面。恢復到新 agent 時使用 `agent.restoreConversation(checkpoint)`；新 agent 的 Provider、工具及 `getContext` 必須由目前應用重新建立，checkpoint 不含權限或可執行閉包。

```ts
const checkpoint = agent.exportConversation(); // 完成的 idle 對話，否則 null
if (checkpoint) sessionStorage.setItem(key, JSON.stringify(checkpoint));
// 重建 Provider／Tools／Context 後：
const saved = sessionStorage.getItem(key);
if (saved) agent.restoreConversation(JSON.parse(saved));
```

正式 Host 應捕捉儲存與解析錯誤並回退記憶體。本專案的 `features/trip-ai/conversation-storage.ts` 示範注入儲存與隔離 key；UI 限制為同分頁保存，關閉分頁後不保證保留。不保存 OAuth token、權限、未送出輸入、原始附件或待批准動作；附件參與後整段對話僅留記憶體，重新整理清空並要求重新上傳。

Checkpoint 保留完整配對的工具呼叫／結果，以及 Provider 自己的 opaque（如 Gemini 簽章），不是只恢復聊天泡泡。核心驗證 scope、版本、角色、工具配對、完成狀態、最多 80 則及 1 MiB；恢復本身不呼叫模型／工具。Host 另按部署 base、來源、旅程及 Spreadsheet、身份、Firebase 設定及模型隔離，登入身份離開時清除舊身份暫存。資料／權限仍以目前 Host 的讀取與寫前驗證為準。

正在處理或等待批准時只保留之前已完成的暫存，重新整理不恢復該次未完成操作；開始寫入或發生錯誤即移除暫存。清空會刪除 checkpoint 與 agent，無法移除瀏覽器暫存時明確提示；不撤銷已成功寫入的旅程內容。

AI 回覆下方左側的小型無邊框複製圖示由可移植的 `ai/ui/CopyMessageButton.tsx` 提供；僅複製該則回覆的 Markdown 文字，成功顯示短暫勾號，剪貼簿不可用／拒絕時提示手動選取。


## 提示詞維護與回答主題限制

`prompts/base-rules.ts` 的 `BASE_RULES` 限定旅遊諮詢，包含行程、景點、美食、交通、住宿、預算與旅途準備；非旅遊需求委婉婉拒並引導回旅遊，不呼叫工具。程式碼／除錯即使以旅遊網站或景點爬蟲為名，仍不提供開發內容；混合問題只回答旅遊部分。這是送給 Provider 的系統提示規則，未以關鍵字攔截代替語意判斷，也不代表已完成真實模型的遵循率評估。移植到非旅遊專案時，須同步調整此主題規則與工具範圍。


需要調整共用提示詞時，修改 [prompts/base-rules.ts](prompts/base-rules.ts) 即可，不必修改 Controller 的執行流程。此檔為一般 TypeScript 字串，沒有 env、React 或旅程資料相依，複製 `ai/` 時一起保留。

提示詞分工：

- `ai/prompts/base-rules.ts`：共用回答規則，包含旅遊主題限制、婉拒方式、不可信文件、寫入確認及憑證保護。
- `features/trip-ai/index.ts` 的 `createTripAgent`：本專案旅程專用規則，例如每日行程範圍、日期、匯入與地圖限制；透過 `createAgent({ system })` 注入。
- Controller 每次模型請求依序組合 `BASE_RULES` 與 `options.system`；額外規則是補充，不應放寬共用限制。`BASE_RULES` 仍可從 `ai/index.ts` 匯入，原本從 `core/controller.ts` 匯入的用法也保留相容。

修改後執行 `npm run test:ai` 與 `npm run check:ai:bundle`；正式網站須重新建置部署才會套用。提示詞不應包含服務憑證或私人資料；工具授權與寫入確認仍須由 Host 強制執行，不以提示詞取代。


## 訪客調整需求轉寄

本專案另有旅程端 `features/trip-ai/guest-email.ts` 與 `emailjs.ts`，不屬於可移植核心。寄信工具使用獨立 `contact_guide` 權限及既有 prepare／approve／reject 流程；不授予訪客行程寫入權，也不擴充核心的郵件相依。確認後重驗訪客身份／旅程讀取，以 EmailJS 固定模板提交，不傳模型指定收件人。郵件預覽使用 `EmailPreview.tsx`，實際接受結果與 Sheets 儲存結果分開。聊天已同意且需求足夠時直接準備預覽，不重複口頭詢問；工具設定 `finishAfterDecision: true`，成功／取消後直接顯示應用結果，不再讓模型追問寄送。

啟用需要公開 EmailJS 設定及固定的第一位導遊 To 範本，見 [訪客郵件設定](../../../docs/setup-email.md)。不設定也可使用原有 AI 查詢／導遊編輯。測試使用替身，沒有真實投遞驗證。


## 多模型與配額錯誤

Firebase runtime 的 `firebaseGenerationConfig(model)` 依模型名稱產生設定：Lite 模型（名稱含獨立 `lite` 區段，含 preview 等後綴）不傳 `thinkingConfig`，使用模型預設，讓目前 Flash-Lite 保留預設 MINIMAL；其他模型設定 `thinkingLevel: ThinkingLevel.LOW`。`maxOutputTokens` 皆維持 4096，無需新增 env；正式站需重新建置部署，實際速度仍須測量。

模型選擇屬於 Host：本專案由 `features/trip-ai/model-options.ts` 解析 `VITE_AI_DEFAULT_MODEL`（預設／推薦）與 `VITE_AI_MODELS`（額外允許的模型 JSON 陣列）。Provider config 注入選中的 model ID，不把 Vite env 帶入核心。Host 的 createConfiguredTripAgent 第三個參數可指定清單內模型，清單外名稱被拒絕。

`ChatPanel` 的 `modelSelector` 是可選 React 插槽，放在送出按鈕左側，送出期間也會停用此區控制項。模型、範圍與授權的切換規則仍由 Host 負責；模型歷史按各自 key 隔離，切換不混用 opaque。

Provider adapter 可拋出 `ProviderRateLimitError` 表示 HTTP 429，Controller 保留安全提示及 `AgentState.errorCode = 'rate_limit'`。Firebase adapter 使用 SDK 的 `customErrorData.status`（或 HTTP status）辨識，不直接輸出 SDK 物件、headers 或完整 response；以 `ProviderRequestError.details` 傳遞經遮蔽的 code／message。UI 以 `quotaExceeded` 顯示正紅色提示，不自動重試／切模型。工具提交後的真實結果仍保留，不把後續模型錯誤當作回滾或再次執行的理由。


模型 API 404 由 `ProviderModelUnavailableError` 表達，Controller 設定 `errorCode = 'model_unavailable'`，以安全提示引導換模型或聯絡導遊；不假設所有 404 都是永久不支援，也不將 400／403 一律分類為模型不存在。`ChatPanel.errorTone='danger'` 可呈現紅字；原有 `quotaExceeded` 仍保留相容。EmailJS 使用獨立 Host／結果流程，不受模型錯誤分類影響。


## API 錯誤診斷與回報

Firebase adapter 將 HTTP 或 SDK 例外轉為 `ProviderRequestError`，404／429 保留原有子類別。`details.code` 優先使用 HTTP status，再使用 SDK code，無資訊為 `unknown`；空白／被阻擋回應使用 `empty_response`。Firebase SDK 並未公開完整原始 HTTP response，因此 `details.message` 是 SDK 提供的 API 錯誤訊息，限制 2000 字，不宣稱保留完整 response。`core/diagnostics.ts` 遮蔽常見 token／API key，清除 URL 查詢參數及帳密；不序列化 SDK 物件或 request headers。

Controller 在 `state.failure` 提供 id／code／message，並在原提示後附上 `(錯誤代碼：code，錯誤訊息:message)`。此資料不放進模型訊息、opaque 或已完成對話暫存，下一輪／清空即移除。Host 可使用 `ChatPanel.errorAction` 注入回報按鈕；核心與可移植 UI 不依賴 EmailJS。

本專案 `features/trip-ai/ErrorReportButton.tsx` 延遲載入，點擊「回報錯誤」才呼叫 `error-report.ts`，沿用既有 EmailJS 公開設定與固定收件人範本。只傳最後一則真正使用者訊息（最多 6000 字，過長標示截斷）、指定 API／旅程資訊與時間，排除先前對話及附件。姓名參數為「錯誤回報」，title 為旅程名稱。每個 failure id 僅提交一次，不自動重試或透過模型寄信；設定缺漏停用，200／OK 才顯示原生成功彈窗。正式投遞仍須另行實測，見 `docs/setup-email.md`。


## 串流回答與執行進度

`ProviderRequest.onText?(delta)` 是可選公開回答文字 callback，原有只實作 `generate()` 的 Provider 可忽略。Firebase adapter 在 callback 存在時使用 SDK `generateContentStream`，逐段回傳非 thought 的文字；其他情況保留 `generateContent`。不因串流失敗改走非串流重試。聚合 response 的候選內容完整保留在 opaque（包含 thought signatures），連續公開文字合併成同一 part，工具呼叫只從完整回應解析，不能由部分參數觸發工具或寫入。

Controller 的 `activity` 為 `thinking`／`responding`／`tool`（包含內部 toolName），Host 對照 `features/trip-ai/preview.ts` 的易讀標籤，並傳入原有 status 列；思考、工具執行、回答串流共用同一次 `thinking` 計時，不因階段切換歸零。`partialText` 僅在本次 running 狀態呈現：第一段立即更新，其餘約 50ms 合併一次，限制 64000 字；正式完成後只保留一則完整訊息。取消、dispose、scope 變更或錯誤清除部分文字，忽略晚到 callback，不寫入 sessionStorage 或下次模型歷史。

`ChatPanel.partialText` 顯示純文字與換行，避免未完成 Markdown 誤成連結；完整回覆才使用既有安全 Markdown renderer 及複製按鈕。貼近底部時自動跟隨，使用者上滑閱讀時停止跟隨，再滑回底部或送出新訊息恢復。步驟只顯示實際狀態，不顯示模型內部思考、工具參數或文件抽取原文。串流改善等待回饋，不能保證降低首段延遲或總時間。Firebase 錯誤診斷保留實際 operation，郵件回報 API 路徑對應 `streamGenerateContent`。

參考：[Firebase 串流回覆](https://firebase.google.com/docs/ai-logic/stream-responses)。


## 回覆評價

Host 可用 `ChatPanel.renderMessageActions(entry)` 注入每則完整 AI 回覆的附加按鈕，放在 `CopyMessageButton` 的複製按鈕右側；可移植 UI 只提供 slot，不讀取 EmailJS 或環境設定。`questionForReply(messages, entry.id)` 依原始訊息索引找該回覆前的使用者文字，跳過工具結果與附件抽取內容，避免把較晚的問題配給舊回覆。串流 `partialText` 不顯示評價或複製操作。

本專案 `MessageFeedback.tsx` 顯示讚／倒讚：讚為當次元件本機選取，不寄信；倒讚點擊後才延遲載入 `reply-feedback.ts`／EmailJS，並固定 `title`、`subject` 為「AI回覆不佳回報」，`name` 為「回覆不佳回報」。回報只含該則可見 AI 回覆、對應問題、模型、旅程、去除查詢參數的頁面及台灣時間；問題最多 3000 字、回答最多 6000 字並遮蔽憑證。沿用既有公開設定與固定 To，沒有新的模型工具或行程寫入權限。

200／OK 後彈窗「感謝您的反饋！」；選取的圖示填滿顏色，再點一次可取消，讚／倒讚互斥；選取狀態與寄送獨立，取消或改讚不撤回／中止寄送，再次選倒讚不重寄同一元件的回報。失敗或未知結果顯示提示，不自動重試，仍可切換／取消評價。未啟用郵件時倒讚停用，讚仍可操作。評價不是持久化統計：只保留當次元件狀態，重新整理／模型切換不恢復或自動寄信。寄送行為使用模擬 API 驗證，不代表已確認真實投遞。


## 航班、住宿與行程內文交叉分析

專案提示規則獨立放在 `features/trip-ai/travel-context-rules.ts`，由 `createTripAgent` 組合至 system prompt；通用 `ai/prompts/base-rules.ts` 不綁定此專案的工具名稱。航班、住宿、集合、接送、入住／退房及跨日問題，先呼叫唯讀 `itinerary_get_travel_details`，一次取得目前旅程的全部航班、住宿，以及每日行程完整副標／內文及舊航班／住宿關聯 ID。不會自動對每次普通問答傳送整趟資料，也不額外讀 Google Sheets。

Host 僅挑選公開航班／住宿欄位，包括行李、備註、當地時間、各側航廈、入住退房等；不帶團員、帳務、憑證或未知額外欄位。工具維持 `read` 風險及原有公開資料／scope／範例登入驗證，不新增航班／住宿寫入。`itinerary_search` 同時搜尋標題、副標及內文。

提示要求閱讀非空白備註與內文、逐筆辨識多班次及多住宿，不只讀第一筆；未指定個人航班時列相關選項再確認，不猜測團員與班次對應。結構化欄位、備註或內文矛盾時列出差異並請導遊確認，不自行選一版本、不推算飛行時長或補預設時間。只摘要與問題相關的提醒，資料內容不能改變系統規則或工具權限。

整合測試驗證多航班、不同備註、住宿說明、內文搜尋及欄位排除；真實模型是否完整遵守提示仍需實際問答評估。


公積金／支出／進度的回答範圍同樣受限：先查 `itinerary_get_travel_details`，只依每日行程內文／副標或航班／住宿備註中的明確紀錄回答並說明來源；沒有足夠紀錄時回覆對應項目「尚未開放查詢」。不能把預計收款、住宿報價或安排提醒推定為實際帳務、目前餘額或待辦完成狀態。其他公積金、分攤、支出、收款、團員及待辦表仍不暴露給 AI，導遊登入也不擴大此範圍，未來再擴充。

## 旅程 UI 模擬測試

在專案根目錄啟動獨立 Vite，使用以下假設定；測試攔截模型、OAuth、Sheets 與 EmailJS，不使用真實服務或 debug token：

```sh
# 終端一
VITE_GUIDE_EMAILS='["admin@example.com","guide@example.com"]' \
VITE_GOOGLE_CLIENT_ID=test-client \
VITE_GOOGLE_SHEETS_API_KEY=test-key \
VITE_GOOGLE_SHEETS_CATALOG_ID=test-catalog \
VITE_AI_ENABLED=true \
VITE_AI_FIREBASE_CONFIG='{"apiKey":"test-public-key","projectId":"test-project","appId":"test-app"}' \
VITE_AI_DEFAULT_MODEL=test-model \
VITE_AI_MODELS='["test-model","test-model-alternative-with-long-name"]' \
VITE_AI_APP_CHECK_SITE_KEY=test-site \
VITE_EMAILJS_ENABLED=true \
VITE_EMAILJS_SERVICE_ID=service_test \
VITE_EMAILJS_TEMPLATE_ID=template_test \
VITE_EMAILJS_PUBLIC_KEY=public_test \
npm run dev --workspace frontend -- --host 127.0.0.1 --port 5193 --strictPort

# 終端二：需 Python Playwright 及可啟動的 Chromium
python3 scripts/ai_browser_smoke.py
# macOS 使用已安裝的 Chrome 時，可加入：
# --chrome '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

測試包含開啟／縮小、RWD、桌面與手機 Enter 行為、模型隔離、串流進度、工具確認、回覆評價與錯誤回報。依當次測試輸出判斷結果；真實模型品質、信件收件、Google 寫入、實體 Safari 及正式部署另行驗證。
