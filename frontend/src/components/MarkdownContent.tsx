import { safeMarkdownHtml } from "../data/markdown-html";
import { displayMultiline } from "../data/display-text";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeUrl } from "../data/portal";
import { noteLinks } from "../data/itinerary";
import { IconTextLink } from "./IconTextLink";
import styles from "./MarkdownContent.module.css";

export function MarkdownContent({
  text,
  inline = false,
}: {
  text: string;
  inline?: boolean;
}) {
  if (inline) text = displayMultiline(text);
  const components: Components = {
    a({ href, children, node }) {
      const url = safeUrl(href || "");
      if (!url) return <>{children}</>;
      const raw = text.slice(
        node?.position?.start.offset ?? 0,
        node?.position?.end.offset ?? 0,
      );
      const named = raw.startsWith("[") || node?.data?.htmlLink === true;
      const bare =
        raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
      const parts = noteLinks(bare);
      if (
        !named &&
        parts.some((part) => part.url) &&
        parts.some((part) => !part.url)
      ) {
        return (
          <>
            {parts.map((part, index) =>
              part.url ? (
                <IconTextLink
                  key={index}
                  href={part.url}
                  icon={part.kind === "map" ? "pin" : "external"}
                >
                  {part.kind === "map" ? "Google Maps" : "開啟連結"}
                </IconTextLink>
              ) : (
                part.text
              ),
            )}
          </>
        );
      }
      const map = noteLinks(url).some((part) => part.kind === "map");
      return (
        <IconTextLink
          href={url}
          icon={named ? "external" : map ? "pin" : "external"}
        >
          {named ? children : map ? "Google Maps" : "開啟連結"}
        </IconTextLink>
      );
    },
    img({ src, alt }) {
      const url = typeof src === "string" ? safeUrl(src) : "";
      return url ? (
        <img
          src={url}
          alt={alt || ""}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <>{alt}</>
      );
    },
  };
  if (inline)
    components.p = ({ children }) => (
      <span className={styles.subtitleParagraph}>{children}</span>
    );
  const content = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={inline ? [] : [safeMarkdownHtml]}
      unwrapDisallowed
      allowedElements={inline ? ["p", "a", "br", "code"] : undefined}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
  return inline ? content : <div className={styles.body}>{content}</div>;
}
