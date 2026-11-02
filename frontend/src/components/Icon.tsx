import type { ReactNode } from "react";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    assistant: (
      <>
        <path d="M4 4h16v12H9l-5 4V4Z" />
        <path d="M8 8h8M8 12h5" />
      </>
    ),
    robot: <>
      <path d="M12 5V3M10.5 2.5h3M4 11H3a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1M20 11h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1" />
      <rect x="4" y="6" width="16" height="15" rx="5" />
      <circle cx="8.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9 16c1.5 2 4.5 2 6 0M6.5 14.5h1M16.5 14.5h1" />
    </>,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></>,
    minimize: <path d="M5 16h14" />,
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
    external: <path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    forward: <path d="m10 6 6 6-6 6" />,
    up: <path d="m6 14 6-6 6 6" />,
    down: <path d="m6 10 6 6 6-6" />,
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
