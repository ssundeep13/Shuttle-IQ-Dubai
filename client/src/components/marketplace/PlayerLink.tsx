// Feed Gate 2 — a player's name (or avatar) that opens their public profile.
//
// Wraps wouter's Link to /marketplace/players/:playerId. When the id is null
// (legacy events whose challenge row is gone) it renders the same content as
// plain text, so nothing ever looks clickable without going somewhere. Inherits
// the surrounding colour and weight; the caller owns the typography.
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'wouter';

export function PlayerLink({
  playerId,
  name,
  children,
  style,
  className,
  testId,
}: {
  playerId: string | null | undefined;
  name: string;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  testId?: string;
}) {
  const content = children ?? name;
  if (!playerId) {
    return <span className={className} style={style} data-testid={testId ? `${testId}-text` : undefined}>{content}</span>;
  }
  return (
    <Link
      href={`/marketplace/players/${playerId}`}
      className={className}
      style={{ color: 'inherit', textDecoration: 'none', ...style }}
      aria-label={children ? name : undefined}
      data-testid={testId}
    >
      {content}
    </Link>
  );
}
