// The ShuttleIQ wordmark — ONE definition (Design Gate 2).
//
// It used to be rendered at least seven different ways: inline true-brand hex on
// PlayerRegistry, `text-primary`/`text-chart-2` tokens on SessionsManagement,
// inline #006B5F on MarketplaceNav/Footer, a local TEAL const on the award
// screen — so the logo was literally different colours on adjacent pages.
// Everything now reads the brand tokens through this component.
//
// The REVERSED wordmark (onDark, Sandeep 2026-09-24) is the one used on every navy surface — nav, footer,
// tournament banner, founding-member award, Join the Crew hero: Inter 800, −0.04em, "Shuttle" white, "IQ" in
// the navy-surface teal IQP.tealOnNavy (#5DCAA5). The brand teal is too dark on navy, so "IQ" never renders
// it there (pinned by tests/wordmark-on-navy.test.tsx).
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { IQP, IQP_FONT } from "@/lib/iqPassTokens";

export function Wordmark({
  size = 24,
  onDark = false,
  className,
  style,
  as: Tag = "span",
}: {
  /** font-size: px, or any CSS length (e.g. "1em", a clamp()) */
  size?: number | string;
  /** on a navy surface: the reversed wordmark (see above) */
  onDark?: boolean;
  className?: string;
  style?: CSSProperties;
  as?: "span" | "h1" | "div";
}) {
  const reversed: CSSProperties = { fontFamily: IQP_FONT, fontWeight: 800, letterSpacing: "-0.04em", color: IQP.white };
  return (
    <Tag
      className={cn(onDark ? "leading-none whitespace-nowrap" : "font-display font-bold tracking-tight leading-none whitespace-nowrap", className)}
      style={{ fontSize: size, ...(onDark ? reversed : { color: "hsl(var(--primary))" }), ...style }}
      data-testid="wordmark"
      aria-label="ShuttleIQ"
    >
      Shuttle
      <span data-part="iq" style={{ color: onDark ? IQP.tealOnNavy : "hsl(var(--secondary-text))" }}>IQ</span>
    </Tag>
  );
}
