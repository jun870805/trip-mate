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
