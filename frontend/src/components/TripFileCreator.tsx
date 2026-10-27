import { RequiredMark } from "./RequiredMark";
import { useRef, useState } from "react";
import { DRIVE_FILE_SCOPE } from "../data/guide-auth";
import type { GuideSession } from "../data/guide-auth";
import {
  createTripFile,
  shareTripFile,
  prepareTripFile,
  TripFileApiError,
} from "../data/trip-file";
import type { CreatedTripFile } from "../data/trip-file";
import { guideConfig } from "../hooks/useGuideAuth";
import { CountrySearch } from "./CountrySearch";
import {
  countryDefaults,
  currencyLabel,
  timezoneLabel,
} from "../data/countries";
import type { Country } from "../data/countries";

export function TripFileCreator({
  name,
  tripId,
  spreadsheetId,
  session,
  loginBusy,
  beforeCreate,
  onCreated,
  onBusy,
  onLogin,
  onExpired,
}: {
  name: string;
  tripId: string;
  spreadsheetId: string;
  session: GuideSession | null;
  loginBusy: boolean;
  beforeCreate: () => void;
  onCreated: (file: CreatedTripFile) => void;
  onBusy: (busy: boolean) => void;
  onLogin: () => void;
  onExpired: () => void;
}) {
  const [currency, setCurrency] = useState("");
  const [timezone, setTimezone] = useState("");
  const [rate, setRate] = useState("");
  const [country, setCountry] = useState<Country | null>(null);
  const [manualTimezone, setManualTimezone] = useState(false);
  const [manualCurrency, setManualCurrency] = useState(false);
  const [publish, setPublish] = useState(true);
  const [created, setCreated] = useState<CreatedTripFile | null>(null);
  const [shared, setShared] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const createdRef = useRef<CreatedTripFile | null>(null);
  const preparedRef = useRef(false);
  const [suggestedValues, setSuggestedValues] = useState({
    currency: "",
    timezone: "",
  });
  const [rateNotice, setRateNotice] = useState("");
  const [manualValues, setManualValues] = useState({
    currency: "",
    timezone: "",
  });
  function clearRate() {
    if (rate) setRateNotice("國家或幣別已變更，請重新填寫匯率。");
    setRate("");
  }
  const canShare = Boolean(session?.scopes?.includes(DRIVE_FILE_SCOPE));
  async function run(mode: "create" | "resume" | "share") {
    const creating = mode === "create";
    const shouldShare = mode === "share" || publish;
    if (
      active.current ||
      !session ||
      (creating && (createdRef.current || spreadsheetId.trim()))
    )
      return;
    if (shouldShare && !canShare) {
      setError("請先重新登入並同意 Google Drive 檔案授權。");
      return;
    }
    active.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    let stage = "建立檔案";
    try {
      let file = createdRef.current;
      if (creating) {
        beforeCreate();
        file = await createTripFile(session, guideConfig, {
          tripId,
          name,
          currency,
          timezone,
          rate,
        });
        createdRef.current = file;
        setCreated(file);
        onCreated(file);
      }
      if (file && !preparedRef.current) {
        stage = "設定欄位格式";
        await prepareTripFile(session, guideConfig, file.id);
        preparedRef.current = true;
        setPrepared(true);
      }
      if (file && shouldShare) {
        stage = "共用設定";
        await shareTripFile(session, guideConfig, file.id);
        setShared(true);
      }
    } catch (cause) {
      if (cause instanceof TripFileApiError && cause.status === 401)
        onExpired();
      setError(
        createdRef.current
          ? `檔案已建立，${stage}尚未完成。${cause instanceof Error ? cause.message : "請重試設定，或開啟試算表手動調整。"}`
          : cause instanceof Error
            ? cause.message
            : "建立結果無法確認，請先到 Google 雲端硬碟檢查。",
      );
    } finally {
      active.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <details className="file-creator">
      <summary>建立空白旅程試算表</summary>
      <div className="file-creator-body">
        {!created && (
          <>
            <p className="muted">
              建立 11 個分頁與全部欄位，並自動填入旅程設定。建立後旅程 ID 固定。
            </p>
            <CountrySearch
              selected={country}
              onSelect={(selected) => {
                const defaults = countryDefaults(selected);
                setCountry(selected);
                setSuggestedValues(defaults);
                setCurrency(defaults.currency);
                setTimezone(defaults.timezone);
                clearRate();
                setManualTimezone(false);
                setManualCurrency(false);
              }}
            />
            <div className="field-pair">
              <label>
                <span>
                  當地幣別
                  <RequiredMark />
                </span>
                {country?.multipleCurrencies && !manualCurrency ? (
                  <select
                    name="newFileCurrency"
                    value={currency}
                    onChange={(event) => {
                      if (event.target.value === "__manual") {
                        setManualCurrency(true);
                        setCurrency(manualValues.currency);
                      } else {
                        setCurrency(event.target.value);
                        setSuggestedValues((current) => ({
                          ...current,
                          currency: event.target.value,
                        }));
                      }
                      clearRate();
                    }}
                  >
                    <option value="">選擇本趟記帳幣別</option>
                    {country.currencies.map((code) => (
                      <option value={code} key={code}>
                        {currencyLabel(code)}
                      </option>
                    ))}
                    <option value="__manual">手動輸入其他幣別</option>
                  </select>
                ) : (
                  <input
                    name="newFileCurrency"
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value);
                      setManualValues((current) => ({
                        ...current,
                        currency: e.target.value,
                      }));
                      clearRate();
                    }}
                    placeholder="JPY"
                    autoComplete="off"
                  />
                )}
              </label>
              <label>
                <span>
                  旅程時區
                  <RequiredMark />
                </span>
                {country?.multipleTimezones && !manualTimezone ? (
                  <select
                    name="newFileTimezone"
                    value={timezone}
                    onChange={(event) => {
                      if (event.target.value === "__manual") {
                        setManualTimezone(true);
                        setTimezone(manualValues.timezone);
                      } else {
                        setTimezone(event.target.value);
                        setSuggestedValues((current) => ({
                          ...current,
                          timezone: event.target.value,
                        }));
                      }
                    }}
                  >
                    <option value="">選擇目的地時區</option>
                    {country.timezones.map((zone) => (
                      <option value={zone} key={zone}>
                        {timezoneLabel(zone)}
                      </option>
                    ))}
                    <option value="__manual">手動輸入時區或 UTC 時差</option>
                  </select>
                ) : (
                  <input
                    name="newFileTimezone"
                    value={timezone}
                    onChange={(e) => {
                      setTimezone(e.target.value);
                      setManualValues((current) => ({
                        ...current,
                        timezone: e.target.value,
                      }));
                    }}
                    placeholder="Asia/Tokyo 或 UTC+9"
                    autoComplete="off"
                  />
                )}
              </label>
            </div>
            <p className="muted">
              可輸入 UTC+9、UTC-5、UTC+05:30。UTC 固定時差不隨夏令時間變動。
            </p>
            {country?.multipleTimezones && !manualTimezone && (
              <p className="muted">此國家有多個時區，請選擇實際目的地時區。</p>
            )}
            {country?.multipleCurrencies && !manualCurrency && (
              <p className="muted">此地有多種幣別，請選擇本趟記帳幣別。</p>
            )}
            {country?.multipleTimezones && manualTimezone && (
              <button
                type="button"
                className="quiet-button"
                onClick={() => {
                  setManualValues((current) => ({ ...current, timezone }));
                  setManualTimezone(false);
                  setTimezone(suggestedValues.timezone);
                }}
              >
                改用國家時區選單
              </button>
            )}
            {country?.multipleCurrencies && manualCurrency && (
              <button
                type="button"
                className="quiet-button"
                onClick={() => {
                  setManualValues((current) => ({ ...current, currency }));
                  setManualCurrency(false);
                  setCurrency(suggestedValues.currency);
                  clearRate();
                }}
              >
                改用國家幣別選單
              </button>
            )}
            {rateNotice && (
              <p className="muted" role="status">
                {rateNotice}
              </p>
            )}
            <label>
              <span>
                旅程匯率（1 TWD＝多少當地幣）
                <RequiredMark />
              </span>
              <input
                name="newFileRate"
                inputMode="decimal"
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value);
                  setRateNotice("");
                }}
                autoComplete="off"
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
              />
              設定為「知道連結的任何人可檢視」
            </label>
            {!publish && (
              <p className="muted">
                未開放檢視前，一般團員無法從網站讀取此檔案。
              </p>
            )}
          </>
        )}
        {created && (
          <div role="status" className="created-file">
            <p>
              檔案已建立，ID 已填入表單。
              {shared
                ? "已開放連結檢視。"
                : publish
                  ? "尚未完成連結檢視設定。"
                  : "檔案目前為私人檢視。"}
            </p>
            <a
              className="text-link"
              href={created.url}
              target="_blank"
              rel="noreferrer"
            >
              開啟新試算表
            </a>
            <p className="muted">
              請再按表單「儲存」加入旅程清單；取消表單不會刪除已建立的檔案。
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {!canShare && (publish || created) && (
          <button
            type="button"
            className="button secondary"
            onClick={onLogin}
            disabled={loginBusy || busy}
          >
            {loginBusy ? "授權中…" : "授權建立與共用"}
          </button>
        )}
        {!created ? (
          <button
            type="button"
            className="button secondary"
            onClick={() => void run("create")}
            disabled={busy || loginBusy || !session || !!spreadsheetId.trim()}
          >
            {busy ? "建立中…" : "建立並填入 ID"}
          </button>
        ) : (
          !shared && (
            <button
              type="button"
              className="button secondary"
              onClick={() => void run(prepared ? "share" : "resume")}
              disabled={busy || loginBusy || !session}
            >
              {busy
                ? "設定中…"
                : !prepared
                  ? "完成試算表設定"
                  : publish
                    ? "重新設定共用"
                    : "開放連結檢視"}
            </button>
          )
        )}
        {!created && spreadsheetId.trim() && (
          <p className="muted">
            已指定試算表。若要建立新檔，請先清空上方 ID 或網址。
          </p>
        )}
      </div>
    </details>
  );
}
