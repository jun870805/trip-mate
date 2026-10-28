import type { ReactNode } from "react";
import { safeUrl } from "../data/portal";
import { Icon } from "./Icon";
import styles from "./IconTextLink.module.css";

export function IconTextLink({
  href,
  icon,
  children,
  external = true,
}: {
  href: string;
  icon: string;
  children: ReactNode;
  external?: boolean;
}) {
  const url = external
    ? safeUrl(href)
    : href?.startsWith("/") && !href.startsWith("//")
      ? href
      : "";
  if (!url) return null;
  return (
    <a
      className={styles.link}
      href={url}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      <Icon name={icon} size={14} />
      <span>{children}</span>
    </a>
  );
}

export function TextLinkButton({
  children,
  onClick,
  label,
  opensDialog = false,
}: {
  children: ReactNode;
  onClick: () => void;
  label?: string;
  opensDialog?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${styles.link} ${styles.button}`}
      onClick={onClick}
      aria-label={label}
      aria-haspopup={opensDialog ? "dialog" : undefined}
    >
      <span>{children}</span>
    </button>
  );
}
