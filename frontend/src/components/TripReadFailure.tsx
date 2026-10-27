import { displayDate } from "../data/display-date";
import { appHref } from "../hooks/useRoute";
import type { Trip } from "../data/portal";
import type { GuideSession } from "../data/guide-auth";
import { Icon, ErrorBox, GuideTools } from "./ui";

export function TripReadFailure({
  trip,
  message,
  accessDenied,
  session,
  retry,
}: {
  trip: Trip;
  message: string;
  accessDenied: boolean;
  session: GuideSession | null;
  retry: () => void;
}) {
  return (
    <>
      <section className="trip-heading no-print">
        <a className="back-link" href={appHref()}>
          <Icon name="back" size={16} />
          所有旅程
        </a>
        <h1>{trip.name}</h1>
        <p className="trip-meta">
          <span>{trip.destination}</span>
          <span>
            {displayDate(trip.start)} - {displayDate(trip.end)}
          </span>
        </p>
      </section>
      <section aria-labelledby="unavailable-overview-title">
        <h2 id="unavailable-overview-title">旅程總覽</h2>
        <ErrorBox
          title={accessDenied ? "此旅程暫不開放觀看" : undefined}
          message={
            session
              ? accessDenied
                ? "旅程試算表目前無法公開讀取，請確認共用設定。"
                : message
              : "請稍後再試，或聯絡導遊。"
          }
          retry={retry}
        />
        {accessDenied && session && (
          <p className="muted">
            請在 Google Sheets
            的「共用」將一般存取權設為「知道連結的任何人／檢視者」，再重新讀取。
          </p>
        )}
      </section>
      <GuideTools session={session} />
    </>
  );
}
