import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { friendlyMessage } from "@/lib/errors";
import type { Player } from "@shared/schema";

// Gate M1 — office tool for merging duplicate players. Deliberately slow:
// pick a pair, read the receipts, choose who survives, type MERGE. Every
// merge is undoable from the history below (once).

interface Receipt {
  id: string;
  name: string;
  shuttleIqId: string | null;
  gamesPlayed: number;
  wins: number;
  skillScore: number;
  tier: string;
  walletFils: number;
  linkedAccount: boolean;
  createdAt: string;
  creationPath: string;
}

interface MergeLogRow {
  id: string;
  survivorId: string;
  absorbedId: string;
  status: string;
  createdAt: string;
  undoneAt: string | null;
  walletMovedFils: number;
  absorbedName: string;
  survivorName: string;
}

function PlayerPicker({
  label,
  players,
  selectedId,
  excludeId,
  onPick,
  testId,
}: {
  label: string;
  players: Player[];
  selectedId: string | null;
  excludeId: string | null;
  onPick: (id: string) => void;
  testId: string;
}) {
  const [query, setQuery] = useState("");
  const selected = players.find((p) => p.id === selectedId);
  const matches = query.length >= 2
    ? players.filter((p) => p.id !== excludeId && p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {selected ? (
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <span className="font-medium truncate">{selected.name}</span>
          <Button variant="ghost" size="sm" onClick={() => onPick("")}>Change</Button>
        </div>
      ) : (
        <>
          <Input
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid={testId}
          />
          <div className="space-y-1">
            {matches.map((p) => (
              <Button
                key={p.id}
                variant="outline"
                className="w-full justify-start h-10"
                onClick={() => { onPick(p.id); setQuery(""); }}
              >
                <span className="truncate">{p.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{p.gamesPlayed} games</span>
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReceiptCard({ r, survives, onChoose }: { r: Receipt; survives: boolean; onChoose: () => void }) {
  return (
    <Card className={survives ? "border-primary" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="truncate">{r.name}</span>
          {survives && <Badge>Survives</Badge>}
        </CardTitle>
        <CardDescription>{r.shuttleIqId ?? r.id.slice(0, 8)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>{r.gamesPlayed} games · {r.wins} wins · {r.tier} ({r.skillScore})</p>
        <p>Wallet: AED {(r.walletFils / 100).toFixed(2)}</p>
        <p>Account: {r.linkedAccount ? "linked" : "none"}</p>
        <p>Created {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {r.creationPath}</p>
        {!survives && (
          <Button variant="outline" size="sm" className="mt-2 w-full" onClick={onChoose} data-testid={`button-survives-${r.id}`}>
            This one survives
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PlayerMergeTool() {
  const { toast } = useToast();
  const [firstId, setFirstId] = useState<string | null>(null);
  const [secondId, setSecondId] = useState<string | null>(null);
  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [undoTarget, setUndoTarget] = useState<MergeLogRow | null>(null);

  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"] });

  const bothPicked = !!firstId && !!secondId;
  const { data: preview } = useQuery<{ survivor: Receipt; absorbed: Receipt }>({
    queryKey: ["/api/admin/players/merge-preview", { survivorId: firstId, absorbedId: secondId }],
    queryFn: async () => {
      const res = await apiRequest<{ survivor: Receipt; absorbed: Receipt }>(
        "GET",
        `/api/admin/players/merge-preview?survivorId=${firstId}&absorbedId=${secondId}`,
      );
      return res;
    },
    enabled: bothPicked,
  });

  const { data: history = [] } = useQuery<MergeLogRow[]>({ queryKey: ["/api/admin/player-merges"] });

  const receipts = preview ? [preview.survivor, preview.absorbed] : [];
  const effectiveSurvivor = survivorId && receipts.some((r) => r.id === survivorId) ? survivorId : null;
  const absorbed = effectiveSurvivor ? receipts.find((r) => r.id !== effectiveSurvivor) : null;
  const survivor = effectiveSurvivor ? receipts.find((r) => r.id === effectiveSurvivor) : null;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/players"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/player-merges"] });
  };

  const mergeMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/admin/players/${effectiveSurvivor}/merge/${absorbed!.id}`),
    onSuccess: (data: any) => {
      invalidateAll();
      setConfirmOpen(false);
      setConfirmText("");
      setFirstId(null);
      setSecondId(null);
      setSurvivorId(null);
      toast({
        title: "Merge complete",
        description: `${data.survivor?.name}: ${data.survivor?.gamesPlayed} games, ${data.survivor?.wins} wins after recompute. Undo is available in the history below.`,
      });
    },
    onError: (error: any) => {
      setConfirmOpen(false);
      setConfirmText("");
      toast({ title: "Merge refused", description: friendlyMessage(error, "Merge failed — nothing was changed"), variant: "destructive" });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (logId: string) => apiRequest("POST", `/api/admin/player-merges/${logId}/undo`),
    onSuccess: () => {
      invalidateAll();
      setUndoTarget(null);
      toast({ title: "Merge undone", description: "Both players restored and recomputed." });
    },
    onError: (error: any) => {
      setUndoTarget(null);
      toast({ title: "Undo refused", description: friendlyMessage(error, "Undo failed — nothing was changed"), variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Merge duplicate players</CardTitle>
          <CardDescription>
            Pick the two records, check the receipts, choose who survives. The other player's
            games, tags, referrals and wallet balance move to the survivor; ratings are
            recomputed from the combined history. Every merge can be undone once from the
            history below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <PlayerPicker label="First player" players={players} selectedId={firstId} excludeId={secondId} onPick={(id) => { setFirstId(id || null); setSurvivorId(null); }} testId="input-merge-first" />
            <PlayerPicker label="Second player" players={players} selectedId={secondId} excludeId={firstId} onPick={(id) => { setSecondId(id || null); setSurvivorId(null); }} testId="input-merge-second" />
          </div>

          {bothPicked && receipts.length === 2 && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {receipts.map((r) => (
                  <ReceiptCard key={r.id} r={r} survives={r.id === effectiveSurvivor} onChoose={() => setSurvivorId(r.id)} />
                ))}
              </div>
              {survivor && absorbed && (
                <Button
                  className="w-full h-11"
                  onClick={() => setConfirmOpen(true)}
                  data-testid="button-open-merge-confirm"
                >
                  Merge {absorbed.name} into {survivor.name}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Merge history</CardTitle>
          <CardDescription>Most recent first. Undo restores both players exactly as they were; games played after the merge stay with the survivor.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No merges yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.absorbedName} merged into {m.survivorName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {m.walletMovedFils !== 0 && ` · AED ${(m.walletMovedFils / 100).toFixed(2)} wallet moved`}
                      {m.status === "undone" && " · undone"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={m.status === "undone" || undoMutation.isPending}
                    onClick={() => setUndoTarget(m)}
                    data-testid={`button-undo-merge-${m.id}`}
                  >
                    {m.status === "undone" ? "Undone" : "Undo"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!o) { setConfirmOpen(false); setConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm the merge</AlertDialogTitle>
            <AlertDialogDescription>
              {absorbed?.name} will be absorbed into {survivor?.name}. Games, tags, referrals
              and wallet move to {survivor?.name}; {absorbed?.name}'s record is removed and the
              rating recomputed from combined history. Type MERGE to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type MERGE"
            data-testid="input-merge-confirm"
          />
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setConfirmText(""); }}>Cancel</Button>
            <Button
              disabled={confirmText !== "MERGE" || mergeMutation.isPending}
              onClick={() => mergeMutation.mutate()}
              data-testid="button-confirm-merge"
            >
              {mergeMutation.isPending ? "Merging…" : "Merge players"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!undoTarget} onOpenChange={(o) => { if (!o) setUndoTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this merge?</AlertDialogTitle>
            <AlertDialogDescription>
              {undoTarget && `${undoTarget.absorbedName} will be restored exactly as they were before the merge. Wallet movement is reversed. Games played since the merge stay with ${undoTarget.survivorName}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setUndoTarget(null)}>Cancel</Button>
            <Button
              disabled={undoMutation.isPending}
              onClick={() => undoTarget && undoMutation.mutate(undoTarget.id)}
              data-testid="button-confirm-undo"
            >
              {undoMutation.isPending ? "Undoing…" : "Undo merge"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
