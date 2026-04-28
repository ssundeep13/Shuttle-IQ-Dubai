// Reusable Claude AI matchmaking helper.
//
// Extracted from the admin "Auto Assign" path in server/routes.ts so the
// player-driven auto-matchmaking flow (server/auto-matchmaking.ts) can use
// the exact same prompt and response shape. The prompt is unchanged from
// the version that has been running in production for the admin Auto
// Assign — DO NOT modify wording lightly.
//
// The raw Anthropic call has a hard timeout (default 5s) via AbortController
// so that callers in latency-sensitive paths (player check-in fan-out)
// can still fall back to the standard algorithm if the API is slow.

export interface ClaudePromptPlayer {
  name: string;
  score: number;
  tier: string;
  gender: string;
  gamesThisSession: number;
  gamesWaited: number;
}

export interface ClaudeSessionState {
  availableCourts: number;
  avgGames: number;
  players: ClaudePromptPlayer[];
}

export interface ClaudeRawSuggestion {
  courtNumber: number;
  label: string;
  team1: { name: string; score: number; tier: string; gender: string }[];
  team2: { name: string; score: number; tier: string; gender: string }[];
  team1Avg: number;
  team2Avg: number;
  skillGap: number;
  team1Spread: number;
  team2Spread: number;
  isMixedLevels: boolean;
  isStretchMatch: boolean;
  reasoning: string;
}

export interface ClaudeMatchmakingResponse {
  suggestions: ClaudeRawSuggestion[];
}

export function buildClaudeMatchmakingPrompt(session: ClaudeSessionState): string {
  const courtCount = session.availableCourts;
  const bandSize = Math.round(100 / courtCount);

  const bandLines = Array.from({ length: courtCount }, (_, i) => {
    const from = i * bandSize + 1;
    const to = i === courtCount - 1 ? 100 : (i + 1) * bandSize;
    return `  Court ${i + 1}: players ranked ${from}% to ${to}% by score`;
  }).join('\n');

  return `You are the matchmaking engine for ShuttleIQ Dubai.
Generate one court suggestion per available court.

RULES (all mandatory):
1. Never mix tiers (lower_intermediate 70-89, upper_intermediate
   90-109, advanced 110+) unless fewer than 4 players exist in a tier
2. Within-team score spread must not exceed 20 points
3. Always minimise the skill gap between team averages —
   lowest possible gap is always the best split
4. Prioritise players with fewer games this session
5. A player who is the only one in their tier is a lone outlier.
   Include them in suggestions using these rules:
   - Pair them with the player from the adjacent tier whose score
     is closest to theirs — this minimises the within-team spread
   - Their team's within-team spread limit is relaxed to 40 points
     since a same-tier partner is unavailable
   - The opposing team must still meet the normal 20-point spread limit
   - Among all valid splits always pick the one with the lowest
     skill gap
   - Label the card "Stretch Match" in amber so the admin knows
     a same-tier partner was unavailable
   - Show the reasoning field explaining who the outlier is and
     why this is the best available pairing
   - Do NOT exclude them — they must always appear in a suggestion

COURT SKILL BAND ASSIGNMENT:
There are ${courtCount} courts. Divide all eligible players into
${courtCount} skill bands of ${bandSize}% each by score,
highest scorers in Court 1:
${bandLines}

Each court suggestion must only use players from that court's band.
If a band has fewer than 4 players, expand to the adjacent band
and flag as Mixed Levels.
Return suggestions in court order, Court 1 first.

SESSION STATE:
Available courts: ${courtCount}
Session average games played: ${session.avgGames}

Players (sorted by score descending):
${session.players
  .sort((a, b) => b.score - a.score)
  .map((p, i) => {
    const band = Math.ceil((i + 1) / session.players.length * courtCount);
    return `${p.name} | score:${p.score} | tier:${p.tier} | ` +
           `assignedCourt:${band} | ` +
           `gamesThisSession:${p.gamesThisSession} | ` +
           `gamesWaited:${p.gamesWaited}`;
  }).join('\n')}

Return ONLY valid JSON, no markdown, no other text:
{
  "suggestions": [{
    "courtNumber": 1,
    "label": "Best Match or Closest Available or Stretch Match",
    "team1": [{"name":"","score":0,"tier":"","gender":""}],
    "team2": [{"name":"","score":0,"tier":"","gender":""}],
    "team1Avg": 0,
    "team2Avg": 0,
    "skillGap": 0,
    "team1Spread": 0,
    "team2Spread": 0,
    "isMixedLevels": false,
    "isStretchMatch": false,
    "reasoning": "one sentence why this is the best split"
  }]
}`;
}

// Calls Anthropic with the matchmaking prompt and parses the response.
// Throws on any failure (timeout, non-2xx, malformed JSON, missing array).
// Caller is responsible for catching and falling back to the local algorithm.
export async function requestClaudeMatchmaking(
  session: ClaudeSessionState,
  options?: { timeoutMs?: number },
): Promise<ClaudeMatchmakingResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const timeoutMs = options?.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: buildClaudeMatchmakingPrompt(session) }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = (await response.json()) as { content: { text: string }[] };
  const rawText = data.content[0].text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(rawText) as ClaudeMatchmakingResponse;

  if (!Array.isArray(parsed.suggestions)) {
    throw new Error('AI response missing suggestions array');
  }
  return parsed;
}
