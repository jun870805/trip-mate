import styles from "./TripClocks.module.css";
import { useEffect, useState } from "react";
import { formatClockTime } from "../data/timezone";
export function TripClocks({ timezone }: { timezone: string }) {
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
    <div className={styles["trip-clocks"]} aria-label="台灣與目的地目前時間">
      <p>
        <span>台灣現在</span>
        <time dateTime={now.toISOString()}>
          {formatClockTime(now, "Asia/Taipei")}
        </time>
      </p>
      <p>
        <span>目的地現在</span>
        <time dateTime={now.toISOString()}>
          {formatClockTime(now, timezone)}
        </time>
      </p>
    </div>
  );
}
