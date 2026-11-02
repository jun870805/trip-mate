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
- `reject` 將 `cancelled` 結果送回模型，不執行 commit。重複確認或舊 approval ID 拒絕。提交參數保留在私有 closure 中，不從模型或 UI 重新取值。
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
6. 完成真實模型請求、Function Calling、App Check、PDF／圖片抽取及失敗情境驗證，再接 UI。尚未執行這些正式服務驗證。

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

工具：`itinerary_get_summary`、`itinerary_get_activities`、`itinerary_search`、`itinerary_missing_maps`、`itinerary_add`、`itinerary_update`、`itinerary_delete`、`itinerary_move`、`itinerary_import`、`itinerary_apply_maps`。行程建議先查真實資料，由模型提供附限制的建議文字；採納後再走寫入工具。沒有即時地點搜尋或道路路線最佳化。

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
  enterToSend // 所有尺寸皆 Enter 送出、Shift＋Enter 換行
  error={state.error}
  preview={renderApplicationPreview(state.pending)}
  previewId={state.pending?.id}
  onSend={async (text, files) => {
    const parts = await prepareFiles(files);
    await agent.send(text, parts);
  }}
/>
```

上例的 state、statusLabel、結果格式化與 preview renderer 由 Host 提供。本專案處理中狀態為「思考中...」並搭配旋轉指示，遵循減少動態效果。輸入框與一般訊息角色名稱只保留無障礙標示，placeholder 為「問問 AI助手」。`enterToSend` 預設 true，桌面／手機皆 Enter 送出、Shift＋Enter 換行；組字中的 Enter 不送出，Ctrl／Command＋Enter 仍可送出。其他專案可明確設 false 保留一般 Enter 換行。模板提示詞點擊直接呼叫 onSend，與表單共用鎖定及防重送流程，不夾帶未送出的附件。`renderMessage` 可注入專案自己的安全 Markdown renderer；預設為純文字。不要顯示 Provider `opaque`、Function Call／Response 原文或文件抽取 JSON。旅程 Host 額外移除非超級使用者可見文字中的業務 ID，依真實工具結果顯示儲存狀態，且模型 Markdown 不自動載入遠端圖片。

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

本專案另有旅程端 `features/trip-ai/guest-email.ts` 與 `emailjs.ts`，不屬於可移植核心。寄信工具使用獨立 `contact_guide` 權限及既有 prepare／approve／reject 流程；不授予訪客行程寫入權，也不擴充核心的郵件相依。確認後重驗訪客身份／旅程讀取，以 EmailJS 固定模板提交，不傳模型指定收件人。郵件預覽使用 `EmailPreview.tsx`，實際接受結果與 Sheets 儲存結果分開。

啟用需要公開 EmailJS 設定及固定的第一位導遊 To 範本，見 [訪客郵件設定](../../../docs/setup-email.md)。不設定也可使用原有 AI 查詢／導遊編輯。測試使用替身，沒有真實投遞驗證。
