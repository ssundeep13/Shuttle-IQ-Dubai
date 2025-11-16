import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { CalendarIcon, MapPin, Building2, Users, Upload, Loader2, CheckCircle2, AlertCircle, ClipboardPaste, X } from "lucide-react";
import { insertSessionSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SessionSetupWizardProps {
  onSessionCreated: () => void;
  onClose?: () => void;
}

const sessionFormSchema = insertSessionSchema.extend({
  date: z.string().min(1, "Date is required"),
  venueLocation: z.string().nullish().transform(val => val || ""),
});

type SessionFormData = z.infer<typeof sessionFormSchema>;

export function SessionSetupWizard({ onSessionCreated, onClose }: SessionSetupWizardProps) {
  const [step, setStep] = useState<'session' | 'players'>('session');
  const [sessionData, setSessionData] = useState<SessionFormData | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const form = useForm<SessionFormData>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      venueName: "",
      venueLocation: "",
      courtCount: 2,
    } as SessionFormData,
  });

  // Reset wizard state on mount to ensure fresh start for each session creation
  useEffect(() => {
    setCreatedSessionId(null);
    setSessionData(null);
    setImportResult(null);
    setImportError(null);
    setSelectedFile(null);
    setPastedText("");
    setStep('session');
    form.reset();
  }, []);

  // Add escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSessionSubmit = async (data: SessionFormData) => {
    setIsCreating(true);
    setImportError(null);

    try {
      // Create session immediately with status='draft'
      const payload = {
        ...data,
        date: data.date,
        venueLocation: data.venueLocation || null,
        status: 'draft', // Mark as draft until wizard completes
      };

      const session = await apiRequest('POST', '/api/sessions', payload);
      
      setSessionData(data);
      setCreatedSessionId(session.id);
      setStep('players');
    } catch (err: any) {
      const message = err?.error || err?.message || "Failed to create session";
      setImportError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportError(null);
      setImportResult(null);
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
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string): Array<{ name: string; gender: string; level: string; externalId?: string }> => {
    const cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    const headerFields = parseCSVLine(lines[0]);
    const header = headerFields.map(h => h.toLowerCase().replace(/^"|"$/g, ''));
    const nameIndex = header.findIndex(h => h === 'name');
    const genderIndex = header.findIndex(h => h === 'gender');
    const levelIndex = header.findIndex(h => h === 'level');
    const externalIdIndex = header.findIndex(h => h === 'externalid' || h === 'external_id' || h === 'id');

    if (nameIndex === -1 || genderIndex === -1 || levelIndex === -1) {
      throw new Error('CSV must have columns: Name, Gender, Level (optional: ExternalId)');
    }

    const players: Array<{ name: string; gender: string; level: string; externalId?: string }> = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      
      if (values.length > Math.max(nameIndex, genderIndex, levelIndex)) {
        const name = values[nameIndex]?.trim();
        const gender = values[genderIndex]?.trim();
        const level = values[levelIndex]?.trim();
        const externalId = externalIdIndex !== -1 ? values[externalIdIndex]?.trim() : undefined;
        
        if (name && gender && level) {
          players.push({ name, gender, level, externalId });
        }
      }
    }

    if (players.length === 0) {
      throw new Error('No valid player data found in CSV');
    }

    return players;
  };

  const handleImportCSV = async () => {
    if (!selectedFile) {
      setImportError("Please select a CSV file");
      return;
    }

    if (!createdSessionId) {
      setImportError("Session not created. Please go back and try again.");
      return;
    }

    setIsCreating(true);
    setImportError(null);

    try {
      // Read CSV content directly instead of parsing it
      const csvContent = await selectedFile.text();

      // Use apiRequest which includes auth headers, pass sessionId
      const result = await apiRequest('POST', '/api/players/import', { 
        csvContent,
        sessionId: createdSessionId 
      });
      
      // Invalidate queries to ensure fresh data when session starts
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      setImportResult({
        imported: result.added || 0,
        skipped: result.duplicates || 0
      });
    } catch (err: any) {
      const message = err?.error || err?.message || "Failed to import players from CSV";
      setImportError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleImportPaste = async () => {
    if (!pastedText.trim()) {
      setImportError("Please paste player data");
      return;
    }

    if (!createdSessionId) {
      setImportError("Session not created. Please go back and try again.");
      return;
    }

    setIsCreating(true);
    setImportError(null);

    try {
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

      // Use apiRequest which includes auth headers, pass sessionId
      const result = await apiRequest('POST', '/api/players/import', { 
        csvContent,
        sessionId: createdSessionId 
      });
      
      // Invalidate queries to ensure fresh data when session starts
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      setImportResult({
        imported: result.added || 0,
        skipped: result.duplicates || 0
      });
      setPastedText(""); // Clear the textarea on success
    } catch (err: any) {
      const message = err?.error || err?.message || "Failed to import players from pasted data";
      setImportError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleFinishWizard = async () => {
    if (!createdSessionId) {
      setImportError("Session not created. Please try again.");
      return;
    }

    setIsCreating(true);
    setImportError(null);

    try {
      // Promote session from 'draft' to 'active'
      await apiRequest('PATCH', `/api/sessions/${createdSessionId}`, { 
        status: 'active' 
      });

      // Reset wizard state for next use
      setCreatedSessionId(null);
      setSessionData(null);
      setImportResult(null);
      setImportError(null);
      setStep('session');
      form.reset();

      onSessionCreated();
    } catch (err: any) {
      const message = err?.error || err?.message || "Failed to activate session";
      setImportError(message);
      setIsCreating(false);
    }
  };

  const handleSkipImport = () => {
    handleFinishWizard();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl sm:text-3xl font-bold text-center">
                {step === 'session' ? 'Start New Session' : 'Add Players (Optional)'}
              </CardTitle>
              <CardDescription className="text-center mt-2">
                {step === 'session' 
                  ? 'Set up your badminton session details' 
                  : 'Import your player roster or skip to add players later'}
              </CardDescription>
            </div>
            {onClose && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={onClose}
                className="shrink-0"
                data-testid="button-close-wizard"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>

        {step === 'session' ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSessionSubmit)}>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Session Date
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field}
                          className="min-h-12 sm:min-h-10"
                          data-testid="input-session-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="venueName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Venue Name
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., Downtown Sports Center"
                          {...field}
                          className="min-h-12 sm:min-h-10"
                          data-testid="input-venue-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="venueLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Venue Location
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., 123 Main St, City"
                          {...field}
                          className="min-h-12 sm:min-h-10"
                          data-testid="input-venue-location"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="courtCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Number of Courts
                      </FormLabel>
                      <Select
                        value={field.value?.toString()}
                        onValueChange={(value) => field.onChange(parseInt(value, 10))}
                      >
                        <FormControl>
                          <SelectTrigger 
                            className="min-h-12 sm:min-h-10"
                            data-testid="select-court-count"
                          >
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                            <SelectItem key={count} value={count.toString()}>
                              {count} {count === 1 ? 'Court' : 'Courts'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>

              <CardFooter>
                <Button 
                  type="submit" 
                  className="w-full min-h-12 sm:min-h-10"
                  data-testid="button-continue-to-players"
                >
                  Continue to Players
                </Button>
              </CardFooter>
            </form>
          </Form>
        ) : (
          <>
            <CardContent className="space-y-6">
              <Tabs defaultValue="paste" className="w-full">
                <TabsList className="grid w-full grid-cols-3 min-h-12 sm:min-h-10">
                  <TabsTrigger value="paste" className="min-h-12 sm:min-h-10" data-testid="tab-paste-import">
                    Copy & Paste
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="min-h-12 sm:min-h-10" data-testid="tab-csv-import">
                    CSV Upload
                  </TabsTrigger>
                  <TabsTrigger value="skip" className="min-h-12 sm:min-h-10" data-testid="tab-skip-import">
                    Skip
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="paste" className="space-y-4 mt-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="paste-data" className="text-base font-medium">
                        Paste Player Data from Excel or Google Sheets
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Select cells from Excel/Sheets and paste here. Format:
                        <br />
                        <span className="font-mono text-xs">ShuttleIQ ID | Name | Gender | Level</span>
                      </p>
                    </div>

                    <Textarea
                      id="paste-data"
                      placeholder="Paste your player data here...&#10;Example:&#10;M001    John Doe    Male    Intermediate&#10;F002    Jane Smith    Female    Advanced"
                      value={pastedText}
                      onChange={(e) => {
                        setPastedText(e.target.value);
                        setImportError(null);
                        setImportResult(null);
                      }}
                      className="min-h-[200px] font-mono text-sm"
                      data-testid="textarea-paste-players"
                    />

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        type="button"
                        onClick={handleImportPaste}
                        disabled={!pastedText.trim() || isCreating}
                        className="min-h-12 sm:min-h-10 flex-1"
                        data-testid="button-import-paste"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <ClipboardPaste className="mr-2 h-4 w-4" />
                            Import Players
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setPastedText("")}
                        disabled={!pastedText || isCreating}
                        className="min-h-12 sm:min-h-10 sm:w-auto"
                        data-testid="button-clear-paste"
                      >
                        Clear
                      </Button>
                    </div>

                    {importError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{importError}</AlertDescription>
                      </Alert>
                    )}

                    {importResult && (
                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>
                          Successfully imported {importResult.imported} player{importResult.imported !== 1 ? 's' : ''}.
                          {importResult.skipped > 0 && ` ${importResult.skipped} player${importResult.skipped !== 1 ? 's' : ''} skipped.`}
                        </AlertDescription>
                      </Alert>
                    )}

                    {importResult && (
                      <Button
                        type="button"
                        onClick={handleFinishWizard}
                        disabled={isCreating}
                        className="w-full min-h-12 sm:min-h-10"
                        data-testid="button-start-session"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Starting Session...
                          </>
                        ) : (
                          'Start Session'
                        )}
                      </Button>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="csv" className="space-y-4 mt-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="csv-file" className="text-base font-medium">
                        Upload Player Roster (CSV)
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        CSV format: ShuttleIQ Unique ID, Name, Gender, Level
                        <br />
                        Example: M001, John Doe, Male, Intermediate
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Input
                        id="csv-file"
                        type="file"
                        accept=".csv"
                        onChange={handleFileSelect}
                        ref={fileInputRef}
                        className="min-h-12 sm:min-h-10 flex-1"
                        data-testid="input-csv-file"
                      />
                      <Button
                        type="button"
                        onClick={handleImportCSV}
                        disabled={!selectedFile || isCreating}
                        className="min-h-12 sm:min-h-10 sm:w-auto"
                        data-testid="button-import-csv"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Import
                          </>
                        )}
                      </Button>
                    </div>

                    {importError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{importError}</AlertDescription>
                      </Alert>
                    )}

                    {importResult && (
                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>
                          Successfully imported {importResult.imported} player{importResult.imported !== 1 ? 's' : ''}.
                          {importResult.skipped > 0 && ` ${importResult.skipped} duplicate${importResult.skipped !== 1 ? 's' : ''} skipped.`}
                        </AlertDescription>
                      </Alert>
                    )}

                    {importResult && (
                      <Button
                        type="button"
                        onClick={handleFinishWizard}
                        disabled={isCreating}
                        className="w-full min-h-12 sm:min-h-10"
                        data-testid="button-start-session"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Starting Session...
                          </>
                        ) : (
                          'Start Session'
                        )}
                      </Button>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="skip" className="space-y-4 mt-6">
                  <Alert>
                    <AlertDescription>
                      You can add players later using the "Add Player" button or by importing a CSV file.
                    </AlertDescription>
                  </Alert>

                  <Button
                    type="button"
                    onClick={handleSkipImport}
                    disabled={isCreating}
                    className="w-full min-h-12 sm:min-h-10"
                    data-testid="button-skip-and-start"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting Session...
                      </>
                    ) : (
                      'Start Session Without Players'
                    )}
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>

            <CardFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('session')}
                disabled={isCreating}
                className="w-full min-h-12 sm:min-h-10"
                data-testid="button-back-to-session"
              >
                Back to Session Details
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
