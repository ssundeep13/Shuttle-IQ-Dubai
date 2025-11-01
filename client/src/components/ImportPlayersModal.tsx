import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ImportPlayersModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (url: string) => Promise<{ imported: number; skipped: number; skippedDetails?: any[] }>;
}

export function ImportPlayersModal({ open, onClose, onImport }: ImportPlayersModalProps) {
  const [url, setUrl] = useState("https://shuttleiq.ssundeep13.repl.co/api/players");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; skippedDetails?: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    setResult(null);

    try {
      const importResult = await onImport(url);
      setResult(importResult);
      
      if (importResult.imported === 0 && importResult.skipped === 0) {
        setError("No players found to import");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import players");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setUrl("https://shuttleiq.ssundeep13.repl.co/api/players");
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]" data-testid="modal-import-players">
        <DialogHeader>
          <DialogTitle>Import Players from External ShuttleIQ</DialogTitle>
          <DialogDescription>
            Import players from another ShuttleIQ instance. Enter the API URL to fetch players.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="import-url">API URL</Label>
            <Input
              id="import-url"
              placeholder="https://shuttleiq.ssundeep13.repl.co/api/players"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isImporting}
              className="min-h-12 sm:min-h-10"
              data-testid="input-import-url"
            />
            <p className="text-xs text-muted-foreground">
              Only URLs from approved ShuttleIQ instances on replit.com, replit.app, or repl.co domains are allowed.
            </p>
          </div>

          {error && (
            <Alert variant="destructive" data-testid="alert-import-error">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert className="border-success/20 bg-success/10" data-testid="alert-import-success">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <AlertDescription className="text-success">
                <div className="font-semibold">Import Complete!</div>
                <div className="text-sm mt-1">
                  {result.imported > 0 && (
                    <div data-testid="text-imported-count">
                      ✓ {result.imported} player{result.imported !== 1 ? 's' : ''} imported successfully
                    </div>
                  )}
                  {result.skipped > 0 && (
                    <div className="text-warning" data-testid="text-skipped-count">
                      ⚠ {result.skipped} player{result.skipped !== 1 ? 's' : ''} skipped
                    </div>
                  )}
                  {result.imported === 0 && result.skipped === 0 && (
                    <div>No new players to import</div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
            className="min-h-12 sm:min-h-10"
            data-testid="button-cancel-import"
          >
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={isImporting || !url}
              className="min-h-12 sm:min-h-10"
              data-testid="button-confirm-import"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Import Players
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
