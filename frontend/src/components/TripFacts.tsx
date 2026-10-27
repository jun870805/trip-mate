import { useEffect, useState } from "react";
import { formatTimezoneDifference } from "../data/timezone";
import { Icon } from "./ui";
import styles from "./TripFacts.module.css";

export function TripFacts({
  timezone,
  rate,
  currency,
}: {
  timezone: string;
  rate: number;
  currency: string;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 15000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <div className={styles.facts} aria-label="旅程匯率與時差">
      <p>
        <Icon name="exchange" size={16} />
        <span>
          匯率：1 TWD = {rate} {currency}
        </span>
      </p>
      <p>
        <Icon name="clock" size={16} />
        <span>{formatTimezoneDifference(now, timezone)}</span>
      </p>
    </div>
  );
}
