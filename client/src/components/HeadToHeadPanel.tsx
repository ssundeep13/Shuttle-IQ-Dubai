// Player Challenges C4.1 — head-to-head panel on a public profile.
//
// Sits directly below the navy player card and above Community Personality.
// Row 1: the two players' avatars (viewer ringed navy, viewed player ringed
// teal, initials fallback) beside "You 68 · Akhila 74" and the record line
// ("Met 3 times · Akhila leads 2–1"). Row 2: the ChallengeButton, full width.
// Skeleton while the record loads; if the record endpoint fails the button
// still renders on its own — history must never block challenging.
// Hidden on your own profile and for viewers without a linked player.
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { MKT, FF_BODY, FF_DISPLAY } from '@/pages/marketplace/LandingComponents';
import { Skeleton } from '@/components/ui/skeleton';
import { ChallengeButton, inkTint } from '@/components/ChallengeButton';
import { recordLine, scoreLine } from '@shared/utils/headToHeadCopy';

export interface HeadToHeadView {
  met: number;
  myWins: number;
  theirWins: number;
  last: { myScore: number; theirScore: number; playedAt: string } | null;
  me: { name: string; skillScore: number; tierLabel: string };
  them: { name: string; skillScore: number; tierLabel: string };
}

const AVATAR = 44;

function Avatar({ name, photoUrl, ring, testId, imgTestId, style }: {
  name: string;
  photoUrl?: string | null;
  ring: string;
  testId: string;
  imgTestId: string;
  style?: CSSProperties;
}) {
  const initial = (name ?? '').trim().charAt(0).toUpperCase();
  return (
    <div
      data-testid={testId}
      className="rounded-full flex items-center justify-center overflow-hidden shrink-0"
      style={{
        width: AVATAR, height: AVATAR, background: MKT.cream, color: MKT.navy,
        border: `2px solid ${ring}`, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 16, ...style,
      }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" data-testid={imgTestId} />
      ) : initial}
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: '#fff',
  border: `1px solid ${inkTint(0.1)}`,
  borderRadius: 9,
  padding: 16,
};

export function HeadToHeadPanel({
  playerId,
  playerName,
  playerPhotoUrl,
  viewerPlayerId,
  viewerPhotoUrl,
}: {
  playerId: string;
  playerName: string;
  playerPhotoUrl?: string | null;
  viewerPlayerId: string | null | undefined;
  viewerPhotoUrl?: string | null;
}) {
  const hidden = !viewerPlayerId || viewerPlayerId === playerId;
  const { data, isPending, isError } = useQuery<HeadToHeadView>({
    queryKey: ['/api/marketplace/players', playerId, 'head-to-head'],
    queryFn: () => apiRequest('GET', `/api/marketplace/players/${playerId}/head-to-head`),
    enabled: !hidden,
    retry: 1,
  });

  if (hidden) return null;

  return (
    <section data-testid="head-to-head-panel" className="mb-6 w-full max-w-full" style={cardStyle} aria-label="Head to head">
      {isPending && !isError && (
        <div data-testid="h2h-skeleton" className="flex items-center gap-3">
          <div className="flex shrink-0">
            <Skeleton className="rounded-full" style={{ width: AVATAR, height: AVATAR }} />
            <Skeleton className="rounded-full" style={{ width: AVATAR, height: AVATAR, marginLeft: -10 }} />
          </div>
          <div className="flex-1 min-w-0">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3.5 w-52 max-w-full mt-2" />
          </div>
        </div>
      )}

      {data && (
        <div className="flex items-center gap-3">
          <div className="flex shrink-0">
            <Avatar name={data.me.name} photoUrl={viewerPhotoUrl} ring={MKT.navy} testId="avatar-h2h-viewer" imgTestId="img-h2h-viewer" />
            <Avatar name={data.them.name} photoUrl={playerPhotoUrl} ring={MKT.teal} testId="avatar-h2h-player" imgTestId="img-h2h-player" style={{ marginLeft: -10 }} />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="truncate"
              style={{ fontFamily: FF_BODY, fontWeight: 700, fontSize: 16, lineHeight: 1.25, color: MKT.ink, margin: 0 }}
              data-testid="text-h2h-scores"
            >
              {scoreLine(data.me.skillScore, data.them.name, data.them.skillScore)}
            </p>
            <p
              className="truncate"
              style={{ fontFamily: FF_BODY, fontWeight: 400, fontSize: 14, lineHeight: 1.3, color: MKT.inkSub, margin: '4px 0 0' }}
              data-testid="text-h2h-record"
            >
              {recordLine(data, data.them.name.trim().split(/\s+/)[0] || data.them.name)}
            </p>
          </div>
        </div>
      )}

      <div className={data || isPending ? 'mt-3' : ''}>
        <ChallengeButton playerId={playerId} playerName={playerName} viewerPlayerId={viewerPlayerId} />
      </div>
    </section>
  );
}
