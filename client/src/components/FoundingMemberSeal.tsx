// Founding Member seal — the venue badge's public mark. Renders immediately
// after a player's name wherever names render with badges today. Deliberately
// an ICON, not a text tag: it sits BESIDE the consistency BadgeTag rather than
// competing with it, so a player can hold both without a precedence rule.
//
// Committed asset, 64px source rendered at 16-20px. Boolean-driven — the
// component cannot express "not a founding member", so an absent flag is
// structurally unrenderable and no seal can leak onto the wrong name.

export default function FoundingMemberSeal({
  show,
  size = 18,
  testid,
}: {
  show: boolean | null | undefined;
  size?: number;
  testid?: string;
}) {
  if (!show) return null;
  return (
    <img
      src="/badges/founding-member-seal-64.png"
      alt="Founding Member"
      title="Founding Member"
      data-testid={testid}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    />
  );
}
