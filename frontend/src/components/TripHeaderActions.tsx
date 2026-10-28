import { IconTextLink } from "./IconTextLink";
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
      <div className="back-link">
        <IconTextLink href={appHref()} icon="back" external={false}>
          所有旅程
        </IconTextLink>
      </div>
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
