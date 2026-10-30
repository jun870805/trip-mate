import { ItineraryTag } from "../components/ItineraryTag";
import { displayMultiline } from "../data/display-text";
import { ItineraryDetailsDialog } from "../components/ItineraryDetailsDialog";
import { MarkdownContent } from "../components/MarkdownContent";
import { TextLinkButton } from "../components/IconTextLink";
import { groupFlights } from "../data/flight-groups";
import { FlightPages } from "../components/FlightPages";
import { TripMetadata } from "../components/TripMetadata";
import { IconTextLink } from "../components/IconTextLink";
import {
  tripDates,
  itinerarySubtitle,
  hasItineraryBody,
  itineraryTags,
  matchesItineraryTag,
  tripDayNumber,
  itineraryDateLabel,
  itineraryDateText,
} from "../data/itinerary";
import { ItineraryNotes, MapLink } from "../components/ItineraryNotes";
import { flushSync } from "react-dom";
import { PdfExportDialog } from "../components/PdfExportDialog";
import itineraryStyles from "./Itinerary.module.css";
import bookingStyles from "../components/BookingCards.module.css";
import { displayDate, flightDayOffset } from "../data/display-date";
import { useTripToday } from "../hooks/useTripToday";
import { useState } from "react";
import {
  safeUrl,
  money,
  summarize,
  summarizeMembers,
  taskProgress,
} from "../data/portal";
import type { TripData } from "../data/portal";
import { Icon, Empty, Badge, Stat } from "../components/ui";
const tabs = [
  ["overview", "總覽"],
  ["itinerary", "行程"],
  ["fund", "公積金"],
  ["expenses", "支出"],
  ["tasks", "進度"],
] as const;

export function Overview({
  data,
  routeRoot,
}: {
  data: TripData;
  routeRoot: string;
}) {
  const totals = summarize(data);
  const progress = taskProgress(data.tables["開團待辦"]);
  const today = useTripToday(data.timezone);
  return (
    <section className="no-print">
      <div className="section-heading">
        <div>
          <h2>旅程總覽</h2>
        </div>
      </div>
      {data.note && <p className="trip-note">{data.note}</p>}
      <div className="stats-grid">
        {data.sectionErrors?.tasks ? (
          <p className="panel">開團進度暫時無法顯示</p>
        ) : (
          <Stat
            label="準備進度"
            value={
              progress.total
                ? `${progress.done} / ${progress.total}`
                : "尚無待辦"
            }
            note="已完成事項"
          />
        )}
        {data.sectionErrors?.accounting ? (
          <p className="panel">帳務資料暫時無法顯示</p>
        ) : (
          <>
            <Stat
              label="行前尚待收款"
              value={money(totals.outstanding, "TWD")}
              note="依實際刷卡台幣金額"
            />
            <Stat
              label="公積金現金餘額"
              value={money(totals.cash, data.currency)}
              note={`含公共餘款 ${money(totals.surplus, data.currency)}`}
            />
          </>
        )}
      </div>
      {Object.keys(data.sectionErrors || {}).length > 0 && (
        <p className="muted" role="status">
          部分功能暫時無法顯示，其他內容可繼續查看。
        </p>
      )}
      {!data.sectionErrors?.tasks && (
        <section className="panel upcoming-tasks">
          <h3>近期待辦</h3>
          {data.tables["開團待辦"]
            .filter((row) => !["已完成", "已取消"].includes(row["狀態"]))
            .sort((a, b) => a["截止日期"].localeCompare(b["截止日期"]))
            .slice(0, 3)
            .map((row) => (
              <p key={row["任務ID"]}>
                <a className="text-link" href={`${routeRoot}/tasks`}>
                  {row["事項"]}
                </a>
                {" - "}
                {displayDate(row["截止日期"])}
                {row["截止日期"] < today ? "（已逾期）" : ""}
              </p>
            ))}
          {!data.tables["開團待辦"].some(
            (row) => !["已完成", "已取消"].includes(row["狀態"]),
          ) && <p className="muted">目前沒有待完成事項。</p>}
        </section>
      )}
      <div className="overview-grid">
        {tabs.slice(1).map(([key, label]) => (
          <a
            className="feature-link panel"
            href={`${routeRoot}/${key}`}
            key={key}
          >
            <span className="feature-icon">
              <Icon name={key} size={24} />
            </span>
            <div>
              <h3>{label}</h3>
            </div>
            <Icon name="arrow" size={18} />
          </a>
        ))}
      </div>
    </section>
  );
}
export function Itinerary({ data }: { data: TripData }) {
  const today = useTripToday(data.timezone);
  const [day, setDay] = useState(() =>
    today >= data.trip.start && today <= data.trip.end ? today : "all",
  );
  const [tag, setTag] = useState("");
  const tags = itineraryTags(data.tables["每日行程"]);
  const activeTag = tags.includes(tag) ? tag : "";
  const dayPrefix = (date: string) => {
    const number = tripDayNumber(date, data.trip.start);
    return number === null ? "" : `DAY ${number} `;
  };
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailRow = data.tables["每日行程"].find(
    (row) => row["行程ID"] === detailsId,
  );
  const [printDates, setPrintDates] = useState<string[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const dates = [
    ...new Set([
      ...tripDates(data.trip.start, data.trip.end),
      ...data.tables["每日行程"].map((row) => row["日期"]),
    ]),
  ].sort();
  return (
    <section className="itinerary-section">
      <div className="print-heading">
        <h1>{data.trip.name}</h1>
        <TripMetadata data={data} />
        {printDates && printDates.length < dates.length && (
          <p className="export-dates">
            日期：{printDates.map(displayDate).join("、")}
          </p>
        )}
      </div>
      <div className="section-heading no-print">
        <div>
          <h2>旅遊行程</h2>
        </div>
        <button
          type="button"
          className={itineraryStyles.exportTrigger}
          aria-label="匯出 PDF"
          title="匯出 PDF"
          onClick={() => setExportOpen(true)}
        >
          <Icon name="download" size={20} />
        </button>
      </div>
      {exportOpen && (
        <PdfExportDialog
          dates={dates}
          initialDates={day === "all" ? dates : [day]}
          onClose={() => setExportOpen(false)}
          onConfirm={(selected) => {
            flushSync(() => {
              setPrintDates(selected);
              setExportOpen(false);
            });
            window.print();
          }}
        />
      )}
      <div className={bookingStyles["booking-stack"]}>
        <section className={bookingStyles["booking-section"]}>
          <h3>航班資訊</h3>
          {data.tables["航班"].length ? (
            groupFlights(data.tables["航班"]).map((group) => (
              <FlightPages key={group.key} rows={group.flights}>
                {(row, controls) => (
                  <article
                    className={
                      bookingStyles["detail-item"] +
                      " " +
                      bookingStyles["booking-card"]
                    }
                    key={row["航班ID"]}
                  >
                    <div className={bookingStyles["flight-card-heading"]}>
                      <span>{displayDate(row["出發時間"].slice(0, 10))}</span>
                      <span>
                        {row["航空公司"]} {row["航班編號"]}
                      </span>
                    </div>
                    <div className={bookingStyles["flight-route"]}>
                      <div>
                        <strong>{row["出發機場"]}</strong>
                        {(row["出發航廈"] || row["抵達航廈"]) && (
                          <small>{row["出發航廈"]}</small>
                        )}
                        <b>{row["出發時間"].slice(11, 16)}</b>
                      </div>
                      <Icon name="arrow" />
                      <div>
                        <strong>{row["抵達機場"]}</strong>
                        {(row["出發航廈"] || row["抵達航廈"]) && (
                          <small>{row["抵達航廈"]}</small>
                        )}
                        <b>
                          {row["抵達時間"].slice(11, 16)}
                          {flightDayOffset(
                            row["出發時間"],
                            row["抵達時間"],
                          ) && (
                            <span
                              className={bookingStyles["flight-day-offset"]}
                            >
                              {" "}
                              {flightDayOffset(
                                row["出發時間"],
                                row["抵達時間"],
                              )}
                            </span>
                          )}
                        </b>
                      </div>
                    </div>
                    {row["航廈"] && !row["出發航廈"] && !row["抵達航廈"] && (
                      <p>既有航廈資訊：{row["航廈"]}</p>
                    )}
                    {(row["行李說明"] || row["備註"]) && (
                      <div className={bookingStyles["booking-details"]}>
                        {row["行李說明"] && (
                          <p>
                            <small>行李</small>
                            <span>{row["行李說明"]}</span>
                          </p>
                        )}
                        {row["備註"] && (
                          <p>
                            <small>備註</small>
                            <span>{row["備註"]}</span>
                          </p>
                        )}
                      </div>
                    )}
                    {controls}
                  </article>
                )}
              </FlightPages>
            ))
          ) : (
            <Empty>尚未填寫航班資訊。</Empty>
          )}
        </section>
        <section className={bookingStyles["booking-section"]}>
          <h3>住宿資訊</h3>
          {data.tables["飯店"].length ? (
            data.tables["飯店"].map((row) => (
              <article
                className={
                  bookingStyles["detail-item"] +
                  " " +
                  bookingStyles["booking-card"]
                }
                key={row["住宿ID"]}
              >
                <div className={bookingStyles["hotel-content"]}>
                  <div className={bookingStyles["hotel-info"]}>
                    <strong className={bookingStyles["hotel-name"]}>
                      {row["飯店名稱"]}
                    </strong>
                    {row["副標題"] && (
                      <p className={bookingStyles["hotel-subtitle"]}>
                        {row["副標題"]}
                      </p>
                    )}
                    <div
                      className={`${bookingStyles["booking-details"]} ${bookingStyles["hotel-dates"]}`}
                    >
                      <p>
                        <small>入住</small>
                        <span>
                          {displayDate(row["入住日期"])}
                          {row["入住時間"] && ` ${row["入住時間"]}`}
                        </span>
                      </p>
                      <p>
                        <small>退房</small>
                        <span>
                          {displayDate(row["退房日期"])}
                          {row["退房時間"] && ` ${row["退房時間"]}`}
                        </span>
                      </p>
                      <p>
                        <small>地址</small>
                        <span>{row["地址"]}</span>
                      </p>
                      {row["電話"] && (
                        <p>
                          <small>電話</small>
                          <a
                            href={`tel:${row["電話"].replace(/[^+0-9,;#*]/g, "")}`}
                          >
                            {row["電話"]}
                          </a>
                        </p>
                      )}
                      {row["價格"] && (
                        <p>
                          <small>價格</small>
                          <span>{row["價格"]}</span>
                        </p>
                      )}
                      {row["備註"] && (
                        <p>
                          <small>備註</small>
                          <span>{row["備註"]}</span>
                        </p>
                      )}
                    </div>
                    {(safeUrl(row["地圖網址"]) ||
                      safeUrl(row["訂房網站網址"])) && (
                      <div className={bookingStyles["hotel-links"]}>
                        <MapLink url={row["地圖網址"]} />
                        <IconTextLink href={row["訂房網站網址"]} icon="home">
                          訂房網站
                        </IconTextLink>
                      </div>
                    )}
                  </div>
                  <div className={bookingStyles["hotel-photo"]}>
                    {safeUrl(row["飯店圖片網址"] || "") && (
                      <img
                        key={row["飯店圖片網址"]}
                        src={safeUrl(row["飯店圖片網址"])}
                        alt={`${row["飯店名稱"]}照片`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.style.visibility = "hidden";
                        }}
                      />
                    )}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <Empty>尚未填寫住宿資訊。</Empty>
          )}
        </section>
      </div>
      <div className="section-heading">
        <div>
          <h3>每日行程</h3>
          <p className="muted">所有時間均為活動所在地的當地時間。</p>
        </div>
      </div>
      {dates.length > 0 && (
        <div className={itineraryStyles.filters}>
          <label className={itineraryStyles.dateSelect}>
            <span className="sr-only">日期</span>
            <select
              aria-label="行程日期"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            >
              <option value="all">全部日期</option>
              {dates.map((date) => (
                <option key={date} value={date}>
                  {itineraryDateLabel(date, data.trip.start, data.trip.end)}
                </option>
              ))}
            </select>
          </label>
          <label className={itineraryStyles.dateSelect}>
            <span className="sr-only">行程標籤</span>
            <select
              aria-label="行程標籤"
              value={activeTag}
              onChange={(event) => setTag(event.target.value)}
            >
              <option value="">全部標籤</option>
              {tags.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {detailRow && (
        <ItineraryDetailsDialog
          row={detailRow}
          allTags={tags}
          subtitle={itinerarySubtitle(detailRow)}
          onClose={() => setDetailsId(null)}
        />
      )}
      {dates.length ? (
        dates.map((date) => (
          <section
            className={`day-group ${day !== "all" && day !== date ? "screen-hidden" : ""} ${activeTag && day === "all" && !data.tables["每日行程"].some((row) => row["日期"] === date && matchesItineraryTag(row, activeTag)) ? itineraryStyles.filteredDay : ""} ${printDates !== null && !printDates.includes(date) ? "print-excluded" : ""}`}
            key={date}
          >
            <div className="day-label">
              {dayPrefix(date) && <span>{dayPrefix(date).trim()}</span>}
              <h3>
                {itineraryDateText(
                  date,
                  data.trip.start,
                  data.trip.end,
                ).replace("(", " (")}
              </h3>
            </div>
            {!data.tables["每日行程"].some((row) => row["日期"] === date) && (
              <div
                className={activeTag ? itineraryStyles.filteredDay : undefined}
              >
                <Empty>尚未安排當日行程。</Empty>
              </div>
            )}
            {activeTag &&
              !data.tables["每日行程"].some(
                (row) =>
                  row["日期"] === date && matchesItineraryTag(row, activeTag),
              ) && <p className={`empty no-print`}>沒有符合標籤的行程。</p>}
            <div className="timeline">
              {data.tables["每日行程"]
                .filter((row) => row["日期"] === date)
                .map((row) => (
                  <article
                    className={`timeline-item ${matchesItineraryTag(row, activeTag) ? "" : itineraryStyles.filteredItem}`}
                    key={row["行程ID"]}
                  >
                    <div className="timeline-time">{row["開始時間"] || ""}</div>
                    <div
                      className={`timeline-card ${hasItineraryBody(row) ? itineraryStyles.clickableCard : ""}`}
                    >
                      <div className={`spread ${itineraryStyles.heading}`}>
                        <h4 className={itineraryStyles.title}>
                          {displayMultiline(row["標題"])}
                        </h4>
                        {itineraryTags([row]).length > 0 && (
                          <span className={itineraryStyles.tags}>
                            {itineraryTags([row]).map((tag) => (
                              <ItineraryTag
                                key={tag}
                                tag={tag}
                                allTags={tags}
                              />
                            ))}
                          </span>
                        )}
                      </div>
                      {(itinerarySubtitle(row) || hasItineraryBody(row)) && (
                        <div
                          className={`${itineraryStyles.subtitleRow} ${itinerarySubtitle(row) ? "" : "no-print"}`}
                        >
                          {itinerarySubtitle(row) && (
                            <ItineraryNotes note={itinerarySubtitle(row)} />
                          )}
                          {hasItineraryBody(row) && (
                            <div className={`${itineraryStyles.more} no-print`}>
                              <TextLinkButton
                                opensDialog
                                onClick={() => setDetailsId(row["行程ID"])}
                                label={`查看更多：${row["標題"]}`}
                              >
                                查看更多
                              </TextLinkButton>
                            </div>
                          )}
                        </div>
                      )}
                      {hasItineraryBody(row) && (
                        <div
                          className={`${itineraryStyles.printBody} print-only`}
                        >
                          <MarkdownContent text={row["內文"]} />
                        </div>
                      )}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))
      ) : (
        <Empty>尚未安排每日行程。</Empty>
      )}
    </section>
  );
}
export function Fund({ data }: { data: TripData }) {
  const [memberId, setMemberId] = useState("all");
  const totals = summarize(data);
  const transactions = data.transactions
    .filter(
      (t) =>
        memberId === "all" || t.shares.some((s) => s.memberId === memberId),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="no-print">
      <div className="section-heading">
        <div>
          <h2>公積金</h2>
          <p className="muted">
            當地貨幣儲值，每趟獨立結算，結束退還當地貨幣。
          </p>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="現金餘額"
          value={money(totals.cash, data.currency)}
          note="儲值、支出、退款及調整後"
        />
        <Stat
          label="實際消費"
          value={money(totals.fundSpend, data.currency)}
          note={`個人分攤合計 ${money(totals.allocatedSpend, data.currency)}`}
        />
        <Stat
          label="公共餘款"
          value={money(totals.surplus, data.currency)}
          note="均分向上取整的尾差，保留公共使用"
        />
      </div>
      <div className="panel balance-check">
        <h3>公積金對帳</h3>
        <p>
          個人餘額合計{" "}
          {money(
            data.members.reduce((sum, member) => sum + member.balance, 0),
            data.currency,
          )}{" "}
          ＋ 公共餘款 {money(totals.surplus, data.currency)} ＝ 現金餘額{" "}
          {money(totals.cash, data.currency)}
        </p>
      </div>
      {data.trip.status === "已結束" && (
        <section className="panel">
          <h3>結束結算</h3>
          {data.members.map((member) => (
            <p key={member.id}>
              {member.name}：
              {member.balance < 0
                ? "待補繳"
                : member.balance > 0
                  ? "待退還"
                  : "已結清"}{" "}
              {money(Math.abs(member.balance), data.currency)}
            </p>
          ))}
        </section>
      )}
      <h3 className="subheading">每位團員的餘額</h3>
      {data.members.length ? (
        <div className="member-grid">
          {data.members.map((m) => (
            <button
              className={`member-card ${memberId === m.id ? "selected" : ""}`}
              key={m.id}
              onClick={() => setMemberId(memberId === m.id ? "all" : m.id)}
              aria-pressed={memberId === m.id}
            >
              <span className="avatar">{m.name.slice(-1)}</span>
              <span>
                {m.name}
                <strong className={m.balance < 0 ? "negative" : ""}>
                  {money(m.balance, data.currency)}
                </strong>
                <small>{m.balance < 0 ? "待補繳" : "目前可退餘額"}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty>尚未填寫團員。</Empty>
      )}
      <div className="section-heading">
        <h3>收支明細</h3>
        <label className="filter-label">
          <span className="sr-only">團員</span>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="all">所有團員</option>
            {data.members.map((m) => (
              <option value={m.id} key={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted footnote">
        消費只由參與者均分，每人向上取至幣別最小單位；多出的金額留在公共餘款。
      </p>
      {transactions.length ? (
        <div className="ledger">
          {transactions.map((t) => (
            <article className="ledger-row" key={t.id}>
              <div className="ledger-main">
                <Badge soft>{t.type}</Badge>
                <div>
                  <strong>{t.title}</strong>
                  <small>{displayDate(t.date)}</small>
                </div>
                <strong className="ledger-amount">
                  {money(t.amount, data.currency)}
                </strong>
              </div>
              <div className="ledger-shares">
                {t.shares
                  .filter((s) => memberId === "all" || s.memberId === memberId)
                  .map((s) => (
                    <span key={s.memberId}>
                      {data.members.find((m) => m.id === s.memberId)?.name}{" "}
                      <b>{money(s.amount, data.currency)}</b>
                    </span>
                  ))}
              </div>
              {t.type === "支出" && (
                <small className="muted">
                  分攤合計{" "}
                  {money(
                    -t.shares.reduce((sum, s) => sum + s.amount, 0),
                    data.currency,
                  )}
                  ，公共餘款增加{" "}
                  {money(
                    -t.shares.reduce((sum, s) => sum + s.amount, 0) + t.amount,
                    data.currency,
                  )}
                </small>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty>目前沒有符合條件的收支。</Empty>
      )}
    </section>
  );
}
export function Expenses({
  data,
  showIds = false,
}: {
  data: TripData;
  showIds?: boolean;
}) {
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [memberId, setMemberId] = useState("all");
  const totals = summarize(data);
  const dues = data.dues.filter(
    (d) =>
      (memberId === "all" || d.memberId === memberId) &&
      (!unpaidOnly || d.received < d.expected),
  );
  return (
    <section className="no-print">
      <div className="section-heading">
        <div>
          <h2>支出總表</h2>
          <p className="muted">行前費用收台幣，到店支付的費用由公積金支出。</p>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="行前費用"
          value={money(totals.pretrip, "TWD")}
          note="實際刷卡台幣金額"
        />
        <Stat
          label="旅途中實際消費"
          value={money(totals.fundSpend, data.currency)}
          note="公積金支付，不重複列為待收款"
        />
        <Stat
          label="整趟參考花費"
          value={new Intl.NumberFormat("zh-TW", {
            style: "currency",
            currency: "TWD",
            maximumFractionDigits: 2,
          }).format(totals.totalTwd)}
          note={`行前費用＋當地消費 ÷ ${data.rate}；不含公共尾差`}
        />
      </div>
      <section className="panel">
        <h3>團員收款摘要</h3>
        <div className="member-summary">
          {summarizeMembers(data)
            .filter((member) => memberId === "all" || member.id === memberId)
            .map((member) => (
              <article key={member.id}>
                <strong>{member.name}</strong>
                <p>
                  應繳 {money(member.expected, "TWD")}・已繳{" "}
                  {money(member.received, "TWD")}
                </p>
                <p>
                  未繳 {money(member.outstanding, "TWD")}・超收{" "}
                  {money(member.overpaid, "TWD")}
                </p>
              </article>
            ))}
        </div>
      </section>
      <section className="panel">
        <h3>所有費用</h3>
        {data.expenses.length ? (
          <div className="expense-list">
            {data.expenses.map((e) => (
              <div className="expense-row" key={e.id}>
                <div>
                  <strong>{e.title}</strong>
                  <small>
                    {displayDate(e.date)} - {e.category}
                  </small>
                </div>
                <div>
                  <strong>{money(e.amount, e.currency)}</strong>
                  <small>{e.method}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>尚未填寫支出。</Empty>
        )}
      </section>
      <div className="section-heading">
        <div>
          <h3>行前收款狀況</h3>
          <p className="muted">
            已收 {money(totals.collected, "TWD")}・尚待收款{" "}
            {money(totals.outstanding, "TWD")}
          </p>
        </div>
        <label className="filter-label">
          <span className="sr-only">團員</span>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="all">所有團員</option>
            {data.members.map((m) => (
              <option value={m.id} key={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={unpaidOnly}
          onChange={(event) => setUnpaidOnly(event.target.checked)}
        />
        只看未收齊
      </label>
      {dues.length ? (
        <div className="collection-grid">
          {dues.map((d) => (
            <article
              className="panel collection-card"
              key={`${d.expenseId}:${d.memberId}`}
            >
              <div className="spread">
                <strong>
                  {data.members.find((m) => m.id === d.memberId)?.name}
                </strong>
                <Badge soft={d.status === "已收齊"}>{d.status}</Badge>
              </div>
              <h4>{data.expenses.find((e) => e.id === d.expenseId)?.title}</h4>
              <dl>
                <div>
                  <dt>應繳</dt>
                  <dd>{money(d.expected, "TWD")}</dd>
                </div>
                <div>
                  <dt>已收</dt>
                  <dd>{money(d.received, "TWD")}</dd>
                </div>
                <div>
                  <dt>未收</dt>
                  <dd>{money(Math.max(0, d.expected - d.received), "TWD")}</dd>
                </div>
              </dl>
              <details>
                <summary>查看繳款紀錄</summary>
                {data.tables["收款明細"]
                  .filter(
                    (r) =>
                      r["支出ID"] === d.expenseId && r["團員ID"] === d.memberId,
                  )
                  .map((r) => (
                    <p className="receipt-note" key={r["收款明細ID"]}>
                      {displayDate(r["收款日期"])}
                      {" - "}
                      {
                        data.expenses.find(
                          (expense) => expense.id === r["支出ID"],
                        )?.title
                      }
                      <br />
                      TWD {r["實收金額"]}
                      {r["備註"] && `・${r["備註"]}`}
                      <small>
                        {showIds && <>收款批次：{r["收款批次ID"]}・</>}
                        本批次合計{" "}
                        {money(
                          data.tables["收款明細"]
                            .filter(
                              (receipt) =>
                                receipt["收款批次ID"] === r["收款批次ID"],
                            )
                            .reduce(
                              (sum, receipt) =>
                                sum +
                                Math.round(Number(receipt["實收金額"]) * 100),
                              0,
                            ),
                          "TWD",
                        )}
                      </small>
                    </p>
                  ))}
                {!d.received && <p className="muted">尚無繳款紀錄。</p>}
              </details>
            </article>
          ))}
        </div>
      ) : (
        <Empty>目前沒有符合條件的行前應收款。</Empty>
      )}
    </section>
  );
}
export function Tasks({ data }: { data: TripData }) {
  const [filter, setFilter] = useState("all");
  const rows = data.tables["開團待辦"];
  const progress = taskProgress(rows);
  const today = useTripToday(data.timezone);
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 7);
  const soonDate = soon.toISOString().slice(0, 10);
  const visible = rows
    .filter(
      (r) =>
        filter === "all" ||
        (filter === "soon"
          ? !["已完成", "已取消"].includes(r["狀態"]) &&
            r["截止日期"] >= today &&
            r["截止日期"] <= soonDate
          : r["狀態"] === filter),
    )
    .sort(
      (a, b) =>
        a["截止日期"].localeCompare(b["截止日期"]) ||
        Number(a["排序"]) - Number(b["排序"]),
    );
  return (
    <section className="no-print">
      <div className="section-heading">
        <div>
          <h2>開團進度</h2>
        </div>
      </div>
      <div className="progress-panel panel">
        <div className="spread">
          <strong>
            {progress.total
              ? `已完成 ${progress.done} / ${progress.total} 項`
              : "尚無待辦"}
          </strong>
          <span>{progress.percent}%</span>
        </div>
        <progress
          value={progress.done}
          max={progress.total || 1}
          aria-label="開團準備完成度"
        />
        <small className="muted">已取消的事項不計入完成度。</small>
      </div>
      <div className="day-tabs" aria-label="待辦狀態">
        {["all", "soon", "待辦", "進行中", "已完成", "已取消"].map((status) => (
          <button
            key={status}
            aria-pressed={filter === status}
            className={filter === status ? "active" : ""}
            onClick={() => setFilter(status)}
          >
            {status === "all"
              ? "全部"
              : status === "soon"
                ? "7 天內到期"
                : status}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="tasks-list">
          {visible.map((row) => {
            const overdue =
              !["已完成", "已取消"].includes(row["狀態"]) &&
              row["截止日期"] < today;
            return (
              <article className="panel task-card" key={row["任務ID"]}>
                <div className="spread">
                  <Badge soft={row["狀態"] === "已完成"}>{row["狀態"]}</Badge>
                  {overdue && <span className="negative">已逾期</span>}
                </div>
                <h3>{row["事項"]}</h3>
                <p>截止日期：{displayDate(row["截止日期"])}</p>
                {row["完成日期"] && (
                  <p>完成日期：{displayDate(row["完成日期"])}</p>
                )}
                {row["負責團員ID"] && (
                  <p className="muted">
                    負責人：
                    {data.members.find((m) => m.id === row["負責團員ID"])?.name}
                  </p>
                )}
                {row["備註"] && <p className="muted">{row["備註"]}</p>}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty>目前沒有符合條件的事項。</Empty>
      )}
    </section>
  );
}
