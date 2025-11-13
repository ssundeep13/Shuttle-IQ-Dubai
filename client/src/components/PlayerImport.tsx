import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Upload, CheckCircle, Info, ClipboardPaste } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useActiveSession } from '@/hooks/use-active-session';

export function PlayerImport() {
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasSession } = useActiveSession();

  const importMutation = useMutation({
    mutationFn: async (csvContent: string) => {
      return apiRequest('POST', '/api/players/import', { csvContent });
    },
    onSuccess: (data) => {
      // Invalidate both players and queue since import adds players to queue automatically
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: 'Import Successful',
        description: `Imported ${data.added} players. ${data.duplicates} duplicates skipped.`,
      });
      setFile(null);
      setPastedText(""); // Clear textarea only on success
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.error || 'Failed to import players',
        variant: 'destructive',
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
    } else {
      toast({
        title: 'Invalid File',
        description: 'Please select a CSV file',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async () => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvContent = e.target?.result as string;
      importMutation.mutate(csvContent);
    };
    reader.readAsText(file);
  };

  const handlePasteImport = async () => {
    if (!pastedText.trim()) return;

    // Helper function to escape CSV fields properly
    const escapeCSVField = (field: string): string => {
      field = field.trim();
      // If field contains comma, newline, or quote, wrap in quotes and escape internal quotes
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    // Convert tab-separated (from Excel) or comma-separated to CSV format
    // Don't trim the entire blob to preserve trailing delimiters (empty columns)
    const lines = pastedText.replace(/\r/g, "").split('\n').filter(line => line.trim());
    
    // Check if first line looks like a header
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('name') || firstLine.includes('gender') || firstLine.includes('level');
    
    // Build CSV with proper headers
    const csvLines = [];
    
    // Add header row - either from user's data or standard format
    if (hasHeader) {
      // User provided headers - use them (normalized)
      const headerFields = lines[0].includes('\t') 
        ? lines[0].split('\t').map(f => f.trim())
        : lines[0].split(',').map(f => f.trim());
      csvLines.push(headerFields.join(','));
    } else {
      // No header provided - add standard format
      csvLines.push('ShuttleIQ Unique ID,Name,Gender,Level');
    }
    
    // Process data rows
    const dataLines = hasHeader ? lines.slice(1) : lines;
    for (const line of dataLines) {
      const fields = line.includes('\t') 
        ? line.split('\t').map(f => f.trim())
        : line.split(',').map(f => f.trim());
      
      // Escape fields properly and join
      const escapedFields = fields.map(escapeCSVField);
      csvLines.push(escapedFields.join(','));
    }
    
    const csvContent = csvLines.join('\n');

    importMutation.mutate(csvContent);
    // Textarea will be cleared in onSuccess handler
  };

  return (
    <div className="space-y-4">
      {!hasSession && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No Active Session</AlertTitle>
          <AlertDescription>
            You must create a session first before importing players. Go to the "Session" tab to create a new session.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          CSV format: ShuttleIQ Unique ID, Name, Gender, Level
          <br />
          Example: M001, John Doe, Male, Intermediate
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="paste" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="paste" data-testid="tab-paste-import">
            Copy & Paste
          </TabsTrigger>
          <TabsTrigger value="csv" data-testid="tab-csv-upload">
            CSV Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="paste-data">Paste Player Data from Excel or Google Sheets</Label>
            <p className="text-sm text-muted-foreground">
              Select cells from Excel/Sheets and paste here. Format:
              <br />
              <span className="font-mono text-xs">ShuttleIQ ID | Name | Gender | Level</span>
            </p>
            <Textarea
              id="paste-data"
              placeholder="Paste your player data here...&#10;Example:&#10;M001    John Doe    Male    Intermediate&#10;F002    Jane Smith    Female    Advanced"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
              disabled={importMutation.isPending}
              data-testid="textarea-paste-players"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handlePasteImport}
              disabled={!pastedText.trim() || importMutation.isPending || !hasSession}
              className="flex-1"
              data-testid="button-import-paste"
            >
              {importMutation.isPending ? (
                <>Processing...</>
              ) : (
                <>
                  <ClipboardPaste className="w-4 h-4 mr-2" />
                  Import Players
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setPastedText("")}
              disabled={!pastedText || importMutation.isPending}
              data-testid="button-clear-paste"
            >
              Clear
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="csv" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">Select CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={importMutation.isPending}
              data-testid="input-csv-file"
            />
          </div>

          {file && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>Selected file:</strong> {file.name}
              </p>
              <p className="text-sm text-muted-foreground">
                Size: {(file.size / 1024).toFixed(2)} KB
              </p>
            </div>
          )}

          <Button
            onClick={handleImport}
            disabled={!file || importMutation.isPending || !hasSession}
            className="w-full"
            data-testid="button-import-players"
          >
            {importMutation.isPending ? (
              <>Processing...</>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Import Players
              </>
            )}
          </Button>
        </TabsContent>
      </Tabs>

      {importMutation.isSuccess && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Players imported successfully!
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
