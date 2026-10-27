import { appHref } from "../hooks/useRoute";
import { Icon } from "./ui";
import styles from "./TripHeaderActions.module.css";

export function TripHeaderActions({
  onRefresh,
  busy,
}: {
  onRefresh: () => void;
  busy: boolean;
}) {
  return (
    <div className={styles.row}>
      <a className="back-link" href={appHref()}>
        <Icon name="back" size={16} />
        所有旅程
      </a>
      <button
        type="button"
        className="icon-button"
        aria-label="重新讀取旅程"
        title="重新整理"
        disabled={busy}
        onClick={onRefresh}
      >
        <Icon name="refresh" />
      </button>
    </div>
  );
}
