import type { CSSProperties } from "react";
import { itineraryTagHue } from "../data/itinerary-tag-color";
import styles from "./ItineraryTag.module.css";

export function ItineraryTag({ tag }: { tag: string }) {
  return (
    <span
      className={`badge ${styles.tag}`}
      style={{ "--tag-hue": itineraryTagHue(tag) } as CSSProperties}
    >
      {tag}
    </span>
  );
}
