import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { CalendarIcon, MapPin, Building2, Users, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { insertSessionSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface SessionSetupWizardProps {
  onSessionCreated: () => void;
}

const sessionFormSchema = insertSessionSchema.extend({
  date: z.string().min(1, "Date is required"),
  venueLocation: z.string().nullish().transform(val => val || ""),
});

type SessionFormData = z.infer<typeof sessionFormSchema>;

export function SessionSetupWizard({ onSessionCreated }: SessionSetupWizardProps) {
  const [step, setStep] = useState<'session' | 'players'>('session');
  const [sessionData, setSessionData] = useState<SessionFormData | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const handleSessionSubmit = (data: SessionFormData) => {
    setSessionData(data);
    setStep('players');
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

    setIsCreating(true);
    setImportError(null);

    try {
      // Read CSV content directly instead of parsing it
      const csvContent = await selectedFile.text();

      // Use apiRequest which includes auth headers
      const result = await apiRequest('POST', '/api/players/import', { csvContent });
      
      setImportResult({
        imported: result.added || 0,
        duplicates: result.duplicates || 0
      });
    } catch (err: any) {
      const message = err?.error || err?.message || "Failed to import players from CSV";
      setImportError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateSession = async () => {
    if (!sessionData) return;

    setIsCreating(true);
    setImportError(null);

    try {
      // Prepare payload with proper date and location handling
      const payload = {
        ...sessionData,
        date: sessionData.date, // Send as string, backend will parse
        venueLocation: sessionData.venueLocation || null, // Convert empty string to null
      };

      // Use apiRequest which includes auth headers
      await apiRequest('POST', '/api/sessions', payload);

      onSessionCreated();
    } catch (err: any) {
      const message = err?.error || err?.message || "Failed to create session";
      setImportError(message);
      setIsCreating(false);
    }
  };

  const handleSkipImport = () => {
    handleCreateSession();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl sm:text-3xl font-bold text-center">
            {step === 'session' ? 'Start New Session' : 'Add Players (Optional)'}
          </CardTitle>
          <CardDescription className="text-center">
            {step === 'session' 
              ? 'Set up your badminton session details' 
              : 'Import your player roster or skip to add players later'}
          </CardDescription>
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
              <Tabs defaultValue="csv" className="w-full">
                <TabsList className="grid w-full grid-cols-2 min-h-12 sm:min-h-10">
                  <TabsTrigger value="csv" className="min-h-12 sm:min-h-10" data-testid="tab-csv-import">
                    CSV Upload
                  </TabsTrigger>
                  <TabsTrigger value="skip" className="min-h-12 sm:min-h-10" data-testid="tab-skip-import">
                    Skip for Now
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="csv" className="space-y-4 mt-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="csv-file" className="text-base font-medium">
                        Upload Player Roster (CSV)
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        CSV must include: Name, Gender, Level. Optional: ExternalId
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
                        onClick={handleCreateSession}
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
