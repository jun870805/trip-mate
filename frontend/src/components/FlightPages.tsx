import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { Row } from "../data/portal";
import { displayDate } from "../data/display-date";
import { Icon } from "./Icon";
import styles from "./FlightPages.module.css";

export function FlightPages({
  rows,
  children,
}: {
  rows: Row[];
  children: (row: Row, controls: ReactNode) => ReactNode;
}) {
  const id = useId();
  const [selected, setSelected] = useState(rows[0]?.["航班ID"]);
  const active = rows.some((row) => row["航班ID"] === selected)
    ? selected
    : rows[0]?.["航班ID"];
  if (!rows.length) return null;
  const first = rows[0];
  const label = `${displayDate(first["出發時間"].slice(0, 10))} ${first["出發機場"]} - ${first["抵達機場"]}`;
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <div className={styles.cards} aria-live="polite">
        {rows.map((row, index) => (
          <div
            id={`${id}-${index}`}
            key={row["航班ID"]}
            className={`${styles.page} ${row["航班ID"] !== active ? styles.hidden : ""}`}
          >
            {children(
              row,
              rows.length > 1 ? (
                <div
                  className={`${styles.pages} no-print`}
                  role="group"
                  aria-label="航班切換"
                >
                  <button
                    type="button"
                    aria-label="上一班航班"
                    disabled={index === 0}
                    aria-controls={`${id}-${Math.max(0, index - 1)}`}
                    onClick={() =>
                      setSelected(rows[Math.max(0, index - 1)]["航班ID"])
                    }
                  >
                    <Icon name="back" size={16} />
                  </button>
                  <output aria-label="航班頁碼">
                    {index + 1}/{rows.length}
                  </output>
                  <button
                    type="button"
                    aria-label="下一班航班"
                    disabled={index === rows.length - 1}
                    aria-controls={`${id}-${Math.min(rows.length - 1, index + 1)}`}
                    onClick={() =>
                      setSelected(
                        rows[Math.min(rows.length - 1, index + 1)]["航班ID"],
                      )
                    }
                  >
                    <Icon name="forward" size={16} />
                  </button>
                </div>
              ) : null,
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
