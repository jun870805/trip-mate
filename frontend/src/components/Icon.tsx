import type { ReactNode } from "react";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    itinerary: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" />
      </>
    ),
    fund: (
      <>
        <path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v11H6a3 3 0 0 1-3-3V6" />
        <path d="M20 12h-5v4h5" />
      </>
    ),
    expenses: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h3" />
      </>
    ),
    tasks: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="m7 8 2 2 3-4M14 8h3M7 15h3M14 15h3" />
      </>
    ),
    grip: (
      <path
        d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"
        strokeWidth="3"
      />
    ),
    home: <path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    forward: <path d="m10 6 6 6-6 6" />,
    back: <path d="m14 6-6 6 6 6" />,
    pin: (
      <>
        <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 6v5h-5M4 18v-5h5" />
        <path d="M6 7a7 7 0 0 1 12-1l2 5M4 13l2 5a7 7 0 0 0 12-1" />
      </>
    ),
    exchange: <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.overview}
    </svg>
  );
}
