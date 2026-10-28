import { mapNotes, noteLinks } from "../data/itinerary";
import { IconTextLink } from "./IconTextLink";
import styles from "./ItineraryNotes.module.css";

export function MapLink({ url }: { url: string }) {
  const part = mapNotes(url || "").find((part) => part.url);
  return part?.url ? (
    <IconTextLink href={part.url} icon="pin">
      {part.text}
    </IconTextLink>
  ) : (
    <IconTextLink href={url} icon="pin">
      開啟地圖
    </IconTextLink>
  );
}
export function ItineraryNotes({ note }: { note: string }) {
  return (
    <p className={styles.notes}>
      {noteLinks(note).map((part, index) =>
        part.url ? (
          <IconTextLink
            key={index}
            href={part.url}
            icon={part.kind === "map" ? "pin" : "external"}
          >
            {part.kind === "map" ? "Google Maps" : "開啟連結"}
          </IconTextLink>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}
