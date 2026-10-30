import type { ReactNode } from "react";
import styles from "./ItineraryCategoryMark.module.css";

/** Rounded decorative illustrations; they occupy no layout space or hit area. */
export function ItineraryCategoryMark({ category }: { category?: string }) {
  const artwork: Record<string, ReactNode> = {
    三餐: (
      <>
        <g transform="rotate(8 24 44)">
          <path
            d="M12 26V15a3 3 0 0 1 6 0v9a1.5 1.5 0 0 0 3 0V14a3 3 0 0 1 6 0v10a1.5 1.5 0 0 0 3 0v-9a3 3 0 0 1 6 0v14c0 8-5 13-12 13S12 37 12 29Z"
            fill="currentColor"
            fillOpacity=".18"
          />
          <path
            d="M20 42v23a4 4 0 0 0 8 0V42"
            fill="currentColor"
            fillOpacity=".18"
          />
          <circle cx="20" cy="31" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="28" cy="31" r="1.6" fill="currentColor" stroke="none" />
          <ellipse
            cx="16.5"
            cy="35"
            rx="2.3"
            ry="1.3"
            fill="currentColor"
            fillOpacity=".45"
            stroke="none"
          />
          <ellipse
            cx="31.5"
            cy="35"
            rx="2.3"
            ry="1.3"
            fill="currentColor"
            fillOpacity=".45"
            stroke="none"
          />
          <path d="M21 35q3 4 6 0" strokeWidth="2.3" />
        </g>
        <g transform="rotate(-8 56 44)">
          <ellipse
            cx="56"
            cy="26"
            rx="13"
            ry="17"
            fill="currentColor"
            fillOpacity=".18"
          />
          <path
            d="M51 43v21a5 5 0 0 0 10 0V43"
            fill="currentColor"
            fillOpacity=".18"
          />
          <circle cx="51.5" cy="25" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="60.5" cy="25" r="1.8" fill="currentColor" stroke="none" />
          <ellipse
            cx="47.5"
            cy="30"
            rx="2.6"
            ry="1.5"
            fill="currentColor"
            fillOpacity=".45"
            stroke="none"
          />
          <ellipse
            cx="64.5"
            cy="30"
            rx="2.6"
            ry="1.5"
            fill="currentColor"
            fillOpacity=".45"
            stroke="none"
          />
          <path d="M52.5 31q3.5 5 7 0" strokeWidth="2.3" />
        </g>
        <path
          d="M40 59c-7-5-9-8-6-10 2-2 4-1 6 1 2-2 4-3 6-1 3 2 1 5-6 10Z"
          fill="currentColor"
          fillOpacity=".22"
          strokeWidth="2.3"
        />
      </>
    ),
    活動: (
      <>
        <path d="M23 66V14M16 67h14" />
        <path
          d="M24 17q10-6 22 0t19 0v27q-9 6-20 0t-21 0Z"
          fill="currentColor"
          fillOpacity=".18"
        />
        <circle cx="39" cy="29" r="1" fill="currentColor" />
        <circle cx="49" cy="31" r="1" fill="currentColor" />
        <path d="M41 36q3 3 6 1M61 56v8M57 60h8" strokeWidth="2.5" />
      </>
    ),
    交通: (
      <>
        <rect
          x="14"
          y="16"
          width="52"
          height="47"
          rx="12"
          fill="currentColor"
          fillOpacity=".18"
        />
        <rect x="21" y="25" width="16" height="15" rx="4" />
        <rect x="43" y="25" width="16" height="15" rx="4" />
        <path d="M21 63v4M59 63v4" strokeWidth="7" />
        <circle cx="25" cy="50" r="2" fill="currentColor" />
        <circle cx="55" cy="50" r="2" fill="currentColor" />
        <path d="M35 50q5 5 10 0" strokeWidth="2.5" />
      </>
    ),
    購物: (
      <>
        <rect
          x="19"
          y="28"
          width="42"
          height="39"
          rx="10"
          fill="currentColor"
          fillOpacity=".18"
        />
        <path d="M30 30v-9a10 10 0 0 1 20 0v9" />
        <circle cx="32" cy="47" r="1.5" fill="currentColor" />
        <circle cx="48" cy="47" r="1.5" fill="currentColor" />
        <path d="M35 54q5 5 10 0M65 14v8M61 18h8" strokeWidth="2.5" />
      </>
    ),
  };
  const illustration =
    category && Object.hasOwn(artwork, category)
      ? artwork[category]
      : undefined;
  if (!illustration) return null;
  return (
    <>
      <span className="sr-only">類別：{category}</span>
      <svg
        className={styles.watermark}
        data-category-watermark={category}
        viewBox="0 0 80 80"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {illustration}
      </svg>
    </>
  );
}
