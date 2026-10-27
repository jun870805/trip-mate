import type { ReactNode } from "react";
import { safeUrl } from "../data/portal";
import type { GuideSession } from "../data/guide-auth";
const templateRoot = `${import.meta.env.BASE_URL}templates/`;
const templateLink = (file: string) =>
  `${templateRoot}${encodeURIComponent(file)}`;

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    itinerary: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" />
      </>
    ),
    fund: (
      <>
        <path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v11H6a3 3 0 0 1-3-3V6" />
        <path d="M20 12h-5v4h5" />
      </>
    ),
    expenses: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h3" />
      </>
    ),
    tasks: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="m7 8 2 2 3-4M14 8h3M7 15h3M14 15h3" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    back: <path d="m14 6-6 6 6 6" />,
    pin: (
      <>
        <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 6v5h-5M4 18v-5h5" />
        <path d="M6 7a7 7 0 0 1 12-1l2 5M4 13l2 5a7 7 0 0 0 12-1" />
      </>
    ),
    exchange: <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.overview}
    </svg>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function Badge({
  children,
  soft = false,
}: {
  children: ReactNode;
  soft?: boolean;
}) {
  return <span className={`badge ${soft ? "soft" : ""}`}>{children}</span>;
}
export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="stat">
      <p>{label}</p>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export function ExternalLink({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  const href = safeUrl(url);
  return href ? (
    <a className="text-link" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : null;
}
export function ErrorBox({
  message,
  retry,
  title = "目前無法讀取資料",
}: {
  message: string;
  retry: () => void;
  title?: string;
}) {
  return (
    <div className="error-box" role="alert">
      <strong>{title}</strong>
      <p>{message}</p>
      <button className="button secondary" onClick={retry}>
        重新讀取
      </button>
    </div>
  );
}
export function Templates() {
  return (
    <details className="setup">
      <summary>試算表範本與設定方式</summary>
      <div className="setup-body">
        <p>
          可下載範本手動建檔，或在「新增旅程」直接建立試算表。旅程清單可在網站編輯，其他資料在
          Google Sheets 維護。
        </p>
        <div className="button-row">
          <a
            className="button secondary"
            download
            href={templateLink("旅程目錄範本.xlsx")}
          >
            下載旅程目錄
          </a>
          <a
            className="button secondary"
            download
            href={templateLink("每趟旅程範本.xlsx")}
          >
            下載旅程範本
          </a>
          <a
            className="button secondary"
            download
            href={templateLink("建立Google試算表範本.gs")}
          >
            下載建立範本程式
          </a>
          <a
            className="button secondary"
            download
            href={templateLink("範例旅程.xlsx")}
          >
            下載範例旅程
          </a>
        </div>
        <p className="muted">
          Excel 可匯入 Google Sheets；建立範本程式可貼至 Google Apps Script
          執行，會建立兩份新檔案。詳細欄位與設定請見專案 README。
        </p>
      </div>
    </details>
  );
}

export function GuideTools({
  session,
  sampleHref,
}: {
  session: GuideSession | null;
  sampleHref?: string;
}) {
  if (!session) return null;
  return (
    <div className="guide-tools no-print">
      {sampleHref && (
        <div className="sample-actions">
          <a className="button secondary" href={sampleHref}>
            查看範例
            <Icon name="arrow" size={16} />
          </a>
        </div>
      )}
      <Templates />
      <details className="setup">
        <summary>網站設定教學</summary>
        <div className="setup-body">
          <p>
            導遊登入後可維護旅程清單，並在旅程內編輯行程、公積金、支出、收款與進度。
          </p>
          <ol className="setup-steps">
            <li>
              在首頁按「新增旅程」，填寫旅程名稱、目的地、日期與狀態。旅程 ID
              預設自動編號，建立檔案前可修改。
            </li>
            <li>
              展開「建立空白旅程試算表」，搜尋並選擇國家以帶入幣別與時區；多個選項時需自行選擇，也可手動調整或輸入
              UTC+9 等固定時差。填入匯率（1 台幣＝多少當地幣），再按「建立並填入
              ID」。新檔含全部分頁與欄位，ID 會自動填回表單。
            </li>
            <li>
              若已有試算表，也可直接貼上網址或 ID；請讓該檔「旅程設定」中的旅程
              ID 與表單一致。網站建立的新檔會自動填妥這項設定。
            </li>
            <li>
              檢查新檔已開放連結檢視，再按表單「儲存」加入旅程清單。建立檔案與儲存入口為兩個動作；取消表單不會刪除已建立的檔案。
            </li>
            <li>
              進入旅程後，按「編輯行程」「編輯帳務」或「編輯進度」維護內容。公積金消費會同步建立分攤與支出紀錄，行前收款可在同批次加入多個項目。
            </li>
            <li>
              首次使用建檔與共用功能，請在 Google Cloud 啟用 Google Drive
              API，並重新登入授權。若共用失敗，按「重新設定共用」或開啟新檔手動調整，不需要重建。
            </li>
            <li>
              修改入口資料時，按卡片上的「編輯」；旅程 ID
              建立後固定。移除入口時按「刪除」並確認，不會刪除 Google 試算表。
            </li>
            <li>
              在 Google Sheets
              修改行程等資料後，進入旅程按上方的重新整理圖示即可重新讀取。
            </li>
          </ol>
        </div>
      </details>
    </div>
  );
}
