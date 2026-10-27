import { useEffect, useState } from "react";
import { dateInTimezone } from "../data/timezone";
export function useTripToday(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 60000);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [timezone]);
  return dateInTimezone(now, timezone);
}
