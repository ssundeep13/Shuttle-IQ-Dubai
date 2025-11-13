import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Upload, CheckCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useActiveSession } from '@/hooks/use-active-session';

export function PlayerImport() {
  const [file, setFile] = useState<File | null>(null);
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
          CSV format: externalId, name, gender, level
          <br />
          Example: M001, John Doe, Male, Intermediate
        </AlertDescription>
      </Alert>

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
