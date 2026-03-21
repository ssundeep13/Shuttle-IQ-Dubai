import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Download, AlertCircle, CheckCircle2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ImportPlayersModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (url: string) => Promise<{ imported: number; skipped: number; skippedDetails?: any[] }>;
  onImportCSV: (players: Array<{ name: string; gender: string; level: string }>) => Promise<{ imported: number; skipped: number; skippedDetails?: any[] }>;
}

export function ImportPlayersModal({ open, onClose, onImport, onImportCSV }: ImportPlayersModalProps) {
  const [url, setUrl] = useState("https://shuttleiq.ssundeep13.repl.co/api/players");
  const [isImporting, setIsImporting] = useState(false);
  const [urlResult, setUrlResult] = useState<{ imported: number; skipped: number; skippedDetails?: any[] } | null>(null);
  const [csvResult, setCsvResult] = useState<{ imported: number; skipped: number; skippedDetails?: any[] } | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    setIsImporting(true);
    setUrlError(null);
    setUrlResult(null);

    try {
      const importResult = await onImport(url);
      setUrlResult(importResult);
      
      if (importResult.imported === 0 && importResult.skipped === 0) {
        setUrlError("No players found to import");
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Failed to import players");
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setCsvError(null);
      setCsvResult(null);
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string): Array<{ name: string; gender: string; level: string }> => {
    // Strip UTF-8 BOM if present (Excel and other spreadsheets add this)
    const cleanText = text.replace(/^\uFEFF/, '');
    
    const lines = cleanText.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    // Parse header
    const headerFields = parseCSVLine(lines[0]);
    const header = headerFields.map(h => h.toLowerCase().replace(/^"|"$/g, ''));
    const nameIndex = header.findIndex(h => h === 'name');
    const genderIndex = header.findIndex(h => h === 'gender');
    const levelIndex = header.findIndex(h => h === 'level');

    if (nameIndex === -1 || genderIndex === -1 || levelIndex === -1) {
      throw new Error('CSV must have columns: Name, Gender, Level');
    }

    // Parse data rows
    const players: Array<{ name: string; gender: string; level: string }> = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      
      // Validate that all required fields are present and non-empty
      if (values.length > Math.max(nameIndex, genderIndex, levelIndex)) {
        const name = values[nameIndex]?.trim();
        const gender = values[genderIndex]?.trim();
        const level = values[levelIndex]?.trim();
        
        if (name && gender && level) {
          players.push({ name, gender, level });
        }
      }
    }

    if (players.length === 0) {
      throw new Error('No valid player data found in CSV');
    }

    return players;
  };

  const handleCSVImport = async () => {
    if (!selectedFile) {
      setCsvError('Please select a CSV file');
      return;
    }

    setIsImporting(true);
    setCsvError(null);
    setCsvResult(null);

    try {
      const text = await selectedFile.text();
      const players = parseCSV(text);
      
      if (players.length === 0) {
        setCsvError('No valid players found in CSV file');
        return;
      }

      const importResult = await onImportCSV(players);
      setCsvResult(importResult);
      
      if (importResult.imported === 0 && importResult.skipped === 0) {
        setCsvError("No players found to import");
      }
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Failed to import CSV");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setUrl("https://shuttleiq.ssundeep13.repl.co/api/players");
    setSelectedFile(null);
    setCsvResult(null);
    setUrlResult(null);
    setCsvError(null);
    setUrlError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]" data-testid="modal-import-players">
        <DialogHeader>
          <DialogTitle>Import Players</DialogTitle>
          <DialogDescription>
            Import players from a CSV file or another ShuttleIQ instance
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="csv" className="w-full">
          <TabsList className="grid w-full grid-cols-2 min-h-12 sm:min-h-10">
            <TabsTrigger value="csv" className="min-h-12 sm:min-h-9" data-testid="tab-csv-import">CSV File</TabsTrigger>
            <TabsTrigger value="url" className="min-h-12 sm:min-h-9" data-testid="tab-url-import">API URL</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">Upload CSV File</Label>
              <Input
                ref={fileInputRef}
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                disabled={isImporting}
                className="min-h-12 sm:min-h-10"
                data-testid="input-csv-file"
              />
              <p className="text-xs text-muted-foreground">
                CSV must have columns: Name, Gender, Level
              </p>
              <p className="text-xs text-muted-foreground">
                Example: <span className="font-mono">Arjun,Male,Intermediate</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Accepted levels: Novice, Beginner, Intermediate. Advanced and Professional are earned through gameplay.
              </p>
              {selectedFile && (
                <p className="text-xs text-success">
                  ✓ Selected: {selectedFile.name}
                </p>
              )}
            </div>

            {csvError && (
              <Alert variant="destructive" data-testid="alert-csv-import-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{csvError}</AlertDescription>
              </Alert>
            )}

            {csvResult && (
              <Alert className="border-success/20 bg-success/10" data-testid="alert-csv-import-success">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <AlertDescription className="text-success">
                  <div className="font-semibold">Import Complete!</div>
                  <div className="text-sm mt-1">
                    {csvResult.imported > 0 && (
                      <div data-testid="text-csv-imported-count">
                        ✓ {csvResult.imported} player{csvResult.imported !== 1 ? 's' : ''} imported successfully
                      </div>
                    )}
                    {csvResult.skipped > 0 && (
                      <div className="text-warning" data-testid="text-csv-skipped-count">
                        ⚠ {csvResult.skipped} player{csvResult.skipped !== 1 ? 's' : ''} skipped
                      </div>
                    )}
                    {csvResult.imported === 0 && csvResult.skipped === 0 && (
                      <div>No new players to import</div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isImporting}
                className="min-h-12 sm:min-h-10"
                data-testid="button-cancel-csv-import"
              >
                {csvResult ? 'Close' : 'Cancel'}
              </Button>
              {!csvResult && (
                <Button
                  onClick={handleCSVImport}
                  disabled={isImporting || !selectedFile}
                  className="min-h-12 sm:min-h-10"
                  data-testid="button-confirm-csv-import"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Import CSV
                    </>
                  )}
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="url" className="space-y-4">
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

            {urlError && (
              <Alert variant="destructive" data-testid="alert-url-import-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{urlError}</AlertDescription>
              </Alert>
            )}

            {urlResult && (
              <Alert className="border-success/20 bg-success/10" data-testid="alert-url-import-success">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <AlertDescription className="text-success">
                  <div className="font-semibold">Import Complete!</div>
                  <div className="text-sm mt-1">
                    {urlResult.imported > 0 && (
                      <div data-testid="text-url-imported-count">
                        ✓ {urlResult.imported} player{urlResult.imported !== 1 ? 's' : ''} imported successfully
                      </div>
                    )}
                    {urlResult.skipped > 0 && (
                      <div className="text-warning" data-testid="text-url-skipped-count">
                        ⚠ {urlResult.skipped} player{urlResult.skipped !== 1 ? 's' : ''} skipped
                      </div>
                    )}
                    {urlResult.imported === 0 && urlResult.skipped === 0 && (
                      <div>No new players to import</div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isImporting}
                className="min-h-12 sm:min-h-10"
                data-testid="button-cancel-url-import"
              >
                {urlResult ? 'Close' : 'Cancel'}
              </Button>
              {!urlResult && (
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
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
