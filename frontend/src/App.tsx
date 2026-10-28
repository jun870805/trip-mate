import { CloseButton } from "./components/CloseButton";
import { TripHeaderActions } from "./components/TripHeaderActions";
import { displayDate } from "./data/display-date";
import { TripMetadata } from "./components/TripMetadata";
import { TripEditing } from "./components/TripEditor";
import { useRoute, appHref } from "./hooks/useRoute";
import { readTripSections } from "./data/trip-sections";
import { useEffect, useState } from "react";
import demoBook from "./data/demo.json";
import { createPortalRepository, PortalReadError } from "./data/portal-api";
import { TripReadFailure } from "./components/TripReadFailure";
import { parseCatalog, parseCatalogView, parseTrip } from "./data/portal";
import type { Trip, TripData, Workbook } from "./data/portal";
import { Icon, Empty, Badge, ErrorBox, GuideTools } from "./components/ui";
import { Overview, Itinerary, Fund, Expenses, Tasks } from "./pages/TripViews";
import { useGuideAuth, guideConfig } from "./hooks/useGuideAuth";
import { isSuperUser } from "./data/guide-auth";
import { CatalogEditor } from "./components/CatalogEditor";
import type { EditorTarget } from "./components/CatalogEditor";
import type { SheetRows } from "./data/sheets";
import type { GuideSession } from "./data/guide-auth";

const apiKey = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY?.trim();
const catalogId = (
  import.meta.env.VITE_GOOGLE_SHEETS_CATALOG_ID ||
  import.meta.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID
)?.trim();
const configured = Boolean(apiKey && catalogId);
const repository = createPortalRepository(apiKey || "");
const sampleTrips = parseCatalog(demoBook["旅程清單"]);
const tabs = [
  ["overview", "總覽"],
  ["itinerary", "行程"],
  ["fund", "公積金"],
  ["expenses", "支出"],
  ["tasks", "進度"],
] as const;

export default function App() {
  const route = useRoute();
  const guide = useGuideAuth();
  const [catalogRows, setCatalogRows] = useState<SheetRows | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [writing, setWriting] = useState(false);
  const [notice, setNotice] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [catalogErrors, setCatalogErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [tripFilter, setTripFilter] = useState("all");
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    repository
      .read(catalogId!, ["旅程清單"], controller.signal)
      .then((book) => {
        if (!controller.signal.aborted) {
          const rows = book["旅程清單"];
          const parsed = parseCatalogView(rows);
          setTrips(parsed.trips);
          setCatalogErrors(parsed.errors);
          setCatalogRows(rows);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setTrips([]);
          setCatalogRows(null);
          setError(cause instanceof Error ? cause.message : "請稍後重試。");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    document.title = "蕃薯旅遊團";
  }, []);
  const isDemo = route.source === "demo";
  const selected = (isDemo ? sampleTrips : trips).find(
    (t) => t.id === route.id,
  );
  const href = (trip: Trip) =>
    appHref(
      `/${isDemo ? "demo" : "trip"}/${encodeURIComponent(trip.id)}/overview`,
    );
  const inTrip = route.notFound || route.source === "trip" || isDemo;
  return (
    <>
      <header className="site-header no-print">
        <a className="brand" href={appHref()}>
          <img
            src={`${import.meta.env.BASE_URL}icon.png`}
            alt=""
            width="40"
            height="40"
          />
          <span>蕃薯旅遊團</span>
        </a>
        <div className="header-actions">
          <a className="header-link" href={appHref()}>
            所有旅程
          </a>
          {guide.session && (
            <span className="guide-email">{guide.session.email}</span>
          )}
          <button
            className="button secondary login-button"
            disabled={guide.busy || writing}
            onClick={guide.session ? guide.logout : guide.login}
          >
            {guide.busy ? "登入中…" : guide.session ? "登出" : "導遊登入"}
          </button>
        </div>
      </header>
      <main className="main-wrap">
        {guide.error && !editorTarget && (
          <div className="auth-message no-print" role="alert">
            <p>{guide.error}</p>
            <CloseButton onClick={guide.clearError} />
          </div>
        )}
        {notice && (
          <p className="save-notice no-print" role="status">
            {notice}
          </p>
        )}
        {isDemo && guide.session && (
          <div className="demo-banner no-print">
            <span>範例模式：所有行程與帳務皆為示範資料。</span>
            <a href={appHref()}>回到我的旅程</a>
          </div>
        )}
        {isDemo && !guide.session ? (
          <Empty>請先以導遊帳號登入後查看範例。</Empty>
        ) : inTrip && selected ? (
          <TripLoader
            key={`${route.source}:${selected.id}`}
            trip={selected}
            isDemo={isDemo}
            guideSession={guide.session}
            loginBusy={guide.busy}
            onLogin={guide.login}
            onExpired={guide.invalidate}
            onBusy={setWriting}
            tab={route.tab || "overview"}
          />
        ) : inTrip ? (
          loading && !isDemo ? (
            <Empty>正在讀取旅程…</Empty>
          ) : (
            <>
              <ErrorBox
                message={
                  error
                    ? guide.session
                      ? error
                      : "目前無法載入旅程，請稍後再試。"
                    : "找不到這趟旅程，請返回入口重新選擇。"
                }
                retry={() => setRevision((n) => n + 1)}
              />
              <a className="text-link" href={appHref()}>
                返回所有旅程
              </a>
            </>
          )
        ) : (
          <>
            <section aria-labelledby="trips-title">
              <div
                className={`section-heading catalog-toolbar${guide.session && catalogRows ? " catalog-toolbar--with-add" : ""}`}
              >
                <div className="catalog-title">
                  <h1 id="trips-title" className="page-title">
                    選擇旅程
                  </h1>
                </div>
                <div className="catalog-actions">
                  {guide.session && catalogRows && (
                    <button
                      className="button"
                      onClick={() => {
                        setNotice("");
                        setEditorTarget({ trip: null });
                      }}
                    >
                      新增旅程
                    </button>
                  )}
                  <button
                    className="icon-button catalog-refresh"
                    aria-label="重新讀取旅程"
                    disabled={loading || !configured || writing}
                    onClick={() => setRevision((n) => n + 1)}
                  >
                    <Icon name="refresh" />
                  </button>
                </div>
              </div>
              <div className="catalog-filters no-print">
                <label>
                  搜尋旅程
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="名稱或目的地"
                  />
                </label>
                <label>
                  旅程狀態
                  <select
                    value={tripFilter}
                    onChange={(event) => setTripFilter(event.target.value)}
                  >
                    <option value="all">全部旅程</option>
                    <option value="active">進行中的旅程</option>
                    <option value="ended">已結束</option>
                  </select>
                </label>
              </div>
              {guide.session && catalogErrors.length > 0 && (
                <div className="warning-box" role="status">
                  {catalogErrors.map((message, index) => (
                    <p key={index}>{message}</p>
                  ))}
                  <a
                    className="text-link"
                    href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(catalogId || "")}/edit`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    修正旅程目錄
                  </a>
                </div>
              )}
              {loading ? (
                <Empty>正在讀取旅程清單…</Empty>
              ) : error ? (
                <ErrorBox
                  message={
                    guide.session
                      ? `${error} 入口需要「旅程清單」分頁，可從下方下載範本。`
                      : "目前無法載入旅程，請稍後再試。"
                  }
                  retry={() => setRevision((n) => n + 1)}
                />
              ) : trips.length ? (
                <div className="trip-grid">
                  {!trips.some(
                    (trip) =>
                      (!query ||
                        `${trip.name} ${trip.destination}`
                          .toLowerCase()
                          .includes(query.toLowerCase())) &&
                      (tripFilter === "all" ||
                        (tripFilter === "ended"
                          ? trip.status === "已結束"
                          : trip.status !== "已結束")),
                  ) && <Empty>沒有符合條件的旅程。</Empty>}
                  {trips
                    .filter(
                      (trip) =>
                        (!query ||
                          `${trip.name} ${trip.destination}`
                            .toLowerCase()
                            .includes(query.toLowerCase())) &&
                        (tripFilter === "all" ||
                          (tripFilter === "ended"
                            ? trip.status === "已結束"
                            : trip.status !== "已結束")),
                    )
                    .map((trip) => (
                      <article className="trip-card" key={trip.id}>
                        <a className="trip-card-link" href={href(trip)}>
                          {trip.cover && (
                            <img
                              className="trip-cover"
                              src={trip.cover}
                              alt=""
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          )}
                          <div className="trip-card-body">
                            <div className="spread">
                              <span className="destination">
                                <Icon name="pin" size={16} />
                                {trip.destination}
                              </span>
                              <Badge>{trip.status}</Badge>
                            </div>
                            <h3>{trip.name}</h3>
                            <p className="muted">
                              {displayDate(trip.start)} -{" "}
                              {displayDate(trip.end)}
                            </p>
                            <span className="card-action">
                              查看旅程
                              <Icon name="arrow" size={18} />
                            </span>
                          </div>
                        </a>
                        {guide.session && catalogRows && (
                          <div className="card-edit-actions">
                            <button
                              className="quiet-button"
                              onClick={() => {
                                setNotice("");
                                setEditorTarget({ trip });
                              }}
                            >
                              編輯
                            </button>
                            <button
                              className="quiet-button delete-button"
                              onClick={() => {
                                setNotice("");
                                setEditorTarget({ trip, remove: true });
                              }}
                            >
                              刪除
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                </div>
              ) : (
                <div className="welcome-empty">
                  <Icon name="itinerary" size={32} />
                  <h3>{configured ? "還沒有旅程" : "尚未設定旅程目錄"}</h3>
                  <p>
                    {guide.session
                      ? configured
                        ? "在旅程目錄新增一列資料，或按「新增旅程」建立入口。"
                        : "完成 Google Sheets 設定後即可讀取旅程。"
                      : "目前沒有可查看的旅程。"}
                  </p>
                </div>
              )}
            </section>
            <GuideTools
              session={guide.session}
              sampleHref={appHref(`/demo/${sampleTrips[0].id}/overview`)}
            />
          </>
        )}
      </main>
      {editorTarget && catalogRows && (
        <CatalogEditor
          target={editorTarget}
          catalogId={catalogId || ""}
          before={catalogRows}
          session={guide.session}
          loginBusy={guide.busy}
          authError={guide.error}
          onLogin={guide.login}
          onExpired={guide.invalidate}
          onClose={() => setEditorTarget(null)}
          onBusy={setWriting}
          onSaved={(rows) => {
            const parsed = parseCatalogView(rows);
            setTrips(parsed.trips);
            setCatalogErrors(parsed.errors);
            setCatalogRows(rows);
            setNotice(
              editorTarget.remove ? "旅程已從清單移除。" : "旅程已儲存。",
            );
            setEditorTarget(null);
          }}
        />
      )}
    </>
  );
}

function TripLoader({
  trip,
  isDemo,
  tab,
  guideSession,
  loginBusy,
  onLogin,
  onExpired,
  onBusy,
}: {
  trip: Trip;
  isDemo: boolean;
  tab: string;
  guideSession: GuideSession | null;
  loginBusy: boolean;
  onLogin: () => void;
  onExpired: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [data, setData] = useState<TripData | null>(null);
  const [error, setError] = useState<{
    message: string;
    accessDenied: boolean;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setRefreshing(true);
    setError(null);
    const read = isDemo
      ? Promise.resolve(demoBook as Workbook)
      : readTripSections(trip, repository, controller.signal);
    read
      .then((book) => {
        if (!controller.signal.aborted) {
          setData(
            isDemo ? parseTrip(trip, book as Workbook) : (book as TripData),
          );
          setHasLoaded(true);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError({
            message: cause instanceof Error ? cause.message : "資料讀取失敗。",
            accessDenied:
              cause instanceof PortalReadError && cause.accessDenied,
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });
    return () => controller.abort();
  }, [trip, isDemo, revision]);
  const editControls = !isDemo ? (
    <TripEditing
      key="guide-trip-editing"
      trip={trip}
      tab={tab}
      session={guideSession}
      loginBusy={loginBusy}
      onLogin={onLogin}
      onExpired={onExpired}
      onBusy={onBusy}
      onSaved={() => setRevision((value) => value + 1)}
    />
  ) : null;
  if (error)
    return (
      <>
        {editControls}
        <TripReadFailure
          trip={trip}
          message={error.message}
          accessDenied={error.accessDenied}
          session={guideSession}
          retry={() => setRevision((n) => n + 1)}
        />
      </>
    );
  if (!data)
    return (
      <>
        {editControls}
        <Empty>
          {refreshing && hasLoaded
            ? "正在更新旅程資料…"
            : "正在讀取這趟旅程的行程與帳務…"}
        </Empty>
      </>
    );
  const routeRoot = appHref(
    `/${isDemo ? "demo" : "trip"}/${encodeURIComponent(trip.id)}`,
  );
  const section =
    tab === "fund" || tab === "expenses"
      ? "accounting"
      : tab === "itinerary"
        ? "itinerary"
        : tab === "tasks"
          ? "tasks"
          : null;
  const sectionError = section && data.sectionErrors?.[section];
  const errorLocation = sectionError && /^(.+?) 第 (\d+) 列/.exec(sectionError);
  const repairRange = errorLocation
    ? `#range=${encodeURIComponent(`'${errorLocation[1].replaceAll("'", "''")}'!A${errorLocation[2]}:Z${errorLocation[2]}`)}`
    : "";
  return (
    <>
      {editControls}
      <section className="trip-heading no-print">
        <TripHeaderActions
          busy={refreshing}
          onRefresh={() => setRevision((n) => n + 1)}
        />
        <div className="spread">
          <h1>{trip.name}</h1>
          <Badge>{trip.status}</Badge>
        </div>
        <TripMetadata data={data} />
      </section>
      <nav className="trip-nav no-print" aria-label="旅程功能">
        {tabs.map(([key, label]) => (
          <a
            href={`${routeRoot}/${key}`}
            key={key}
            aria-current={tab === key ? "page" : undefined}
          >
            <Icon name={key} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <div className="trip-content">
        {data.warnings.length > 0 && (
          <div className="warning-box no-print" role="status">
            {data.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}
        {sectionError && (
          <div className="error-box" role="alert">
            <strong>此功能暫時無法顯示</strong>
            <p>{guideSession ? sectionError : "請稍後再試，或聯絡導遊。"}</p>
            {guideSession && (
              <a
                className="text-link"
                target="_blank"
                rel="noreferrer"
                href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(trip.spreadsheetId)}/edit${repairRange}`}
              >
                開啟資料檢查
              </a>
            )}
          </div>
        )}
        {tab === "overview" && <Overview data={data} routeRoot={routeRoot} />}
        <div
          className={
            data.sectionErrors?.itinerary
              ? "screen-hidden no-print"
              : tab === "itinerary"
                ? ""
                : "print-only"
          }
        >
          {!data.sectionErrors?.itinerary && <Itinerary data={data} />}
        </div>
        {tab === "fund" && !sectionError && <Fund data={data} />}
        {tab === "expenses" && !sectionError && (
          <Expenses
            data={data}
            showIds={isSuperUser(guideSession, guideConfig)}
          />
        )}
        {tab === "tasks" && !sectionError && <Tasks data={data} />}
      </div>
    </>
  );
}
