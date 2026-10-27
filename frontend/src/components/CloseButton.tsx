import { Icon } from "./ui";
import styles from "./CloseButton.module.css";

export function CloseButton({
  onClick,
  disabled = false,
  label = "關閉",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon name="close" size={16} />
    </button>
  );
}
