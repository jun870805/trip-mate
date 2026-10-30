import type { CSSProperties } from "react";
import { itineraryTagHue } from "../data/itinerary-tag-color";
import styles from "./ItineraryTag.module.css";

export function ItineraryTag({
  tag,
  allTags,
}: {
  tag: string;
  allTags?: readonly string[];
}) {
  return (
    <span
      className={`badge ${styles.tag}`}
      style={{ "--tag-hue": itineraryTagHue(tag, allTags) } as CSSProperties}
    >
      {tag}
    </span>
  );
}
