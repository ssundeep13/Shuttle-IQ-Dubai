// The ShuttleIQ wordmark — ONE definition (Design Gate 2).
//
// It used to be rendered at least seven different ways: inline true-brand hex on
// PlayerRegistry, `text-primary`/`text-chart-2` tokens on SessionsManagement,
// inline #006B5F on MarketplaceNav/Footer, a local TEAL const on the award
// screen — so the logo was literally different colours on adjacent pages.
// Everything now reads the brand tokens through this component.
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function Wordmark({
  size = 24,
  onDark = false,
  className,
  style,
  as: Tag = "span",
}: {
  /** font-size in px */
  size?: number;
  /** on a navy surface: "Shuttle" goes white, "IQ" stays teal */
  onDark?: boolean;
  className?: string;
  style?: CSSProperties;
  as?: "span" | "h1" | "div";
}) {
  return (
    <Tag
      className={cn("font-display font-bold tracking-tight leading-none whitespace-nowrap", className)}
      style={{ fontSize: size, color: onDark ? "#ffffff" : "hsl(var(--primary))", ...style }}
      data-testid="wordmark"
      aria-label="ShuttleIQ"
    >
      Shuttle
      <span data-part="iq" style={{ color: onDark ? "hsl(var(--secondary))" : "hsl(var(--secondary-text))" }}>IQ</span>
    </Tag>
  );
}
