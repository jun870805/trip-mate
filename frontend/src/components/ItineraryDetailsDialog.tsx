import { itineraryTags } from "../data/itinerary";
import { displayMultiline } from "../data/display-text";
import { useEffect, useId, useRef } from "react";
import type { Row } from "../data/portal";
import { CloseButton } from "./CloseButton";
import { ItineraryNotes } from "./ItineraryNotes";
import { MarkdownContent } from "./MarkdownContent";
import { ItineraryTag } from "./ItineraryTag";
import styles from "./ItineraryDetailsDialog.module.css";

export function ItineraryDetailsDialog({
  row,
  subtitle,
  onClose,
}: {
  row: Row;
  subtitle: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  const tags = itineraryTags([row]);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  function close() {
    ref.current?.close();
    onClose();
  }
  return (
    <dialog
      ref={ref}
      className={`catalog-dialog no-print ${styles.dialog}`}
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <div className={styles.content}>
        <div className={`dialog-heading ${styles.heading}`}>
          <h2 id={title}>{displayMultiline(row["標題"])}</h2>
          <CloseButton onClick={close} />
        </div>
        {subtitle && <ItineraryNotes note={subtitle} />}
        {tags.length > 0 && (
          <div className={styles.tag}>
            {tags.map((tag) => (
              <ItineraryTag key={tag} tag={tag} />
            ))}
          </div>
        )}
        <div className={`panel ${styles.body}`}>
          <MarkdownContent text={row["內文"] || ""} />
        </div>
      </div>
    </dialog>
  );
}
