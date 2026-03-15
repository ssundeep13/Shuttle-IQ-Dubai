import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CalendarIcon, MapPin, Building2, Users, Upload, Loader2, CheckCircle2, AlertCircle, ClipboardPaste, X, ShoppingBag, DollarSign, Clock, AlertTriangle } from "lucide-react";
import { insertSessionSchema, type Session } from "@shared/schema";
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

interface MarketplaceData {
  enabled: boolean;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  capacity: number;
  priceAed: number;
}

export function SessionSetupWizard({ onSessionCreated, onClose }: SessionSetupWizardProps) {
  const [step, setStep] = useState<'session' | 'marketplace' | 'players'>('session');
  const [sessionData, setSessionData] = useState<SessionFormData | null>(null);
  const [marketplaceData, setMarketplaceData] = useState<MarketplaceData>({
    enabled: false,
    title: '',
    description: '',
    startTime: '18:00',
    endTime: '21:00',
    capacity: 16,
    priceAed: 50,
  });
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState<string>("");
  const [showConflict, setShowConflict] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ['/api/sessions'],
  });

  const activeSession = sessions.find(s => s.status === 'active');
  
  const form = useForm<SessionFormData>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      venueName: "",
      venueLocation: "",
      courtCount: 2,
    } as SessionFormData,
  });

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
    setSessionData(data);
    setMarketplaceData(prev => ({
      ...prev,
      title: data.venueName + ' Session',
    }));
    setStep('marketplace');
  };

  const handleMarketplaceContinue = async () => {
    if (!sessionData) return;
    
    setIsCreating(true);
    setImportError(null);

    try {
      const payload = {
        ...sessionData,
        date: sessionData.date,
        venueLocation: sessionData.venueLocation || null,
        status: 'draft',
        marketplace: marketplaceData.enabled ? {
          enabled: true,
          title: marketplaceData.title,
          description: marketplaceData.description || null,
          startTime: marketplaceData.startTime,
          endTime: marketplaceData.endTime,
          capacity: marketplaceData.capacity,
          priceAed: marketplaceData.priceAed,
        } : undefined,
      };

      const result = await apiRequest('POST', '/api/sessions/unified', payload);
      
      setCreatedSessionId(result.session.id);
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
      const csvContent = await selectedFile.text();
      const result = await apiRequest('POST', '/api/players/import', { 
        csvContent,
        sessionId: createdSessionId 
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'], exact: false });
      
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
      const escapeCSVField = (field: string): string => {
        field = field.trim();
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      };

      const lines = pastedText.replace(/\r/g, "").split('\n').filter(line => line.trim());
      const firstLine = lines[0].toLowerCase();
      const hasHeader = firstLine.includes('name') || firstLine.includes('gender') || firstLine.includes('level');
      
      const csvLines = [];
      
      if (hasHeader) {
        const headerFields = lines[0].includes('\t') 
          ? lines[0].split('\t').map(f => f.trim())
          : lines[0].split(',').map(f => f.trim());
        csvLines.push(headerFields.join(','));
      } else {
        csvLines.push('ShuttleIQ Unique ID,Name,Gender,Level');
      }
      
      const dataLines = hasHeader ? lines.slice(1) : lines;
      for (const line of dataLines) {
        const fields = line.includes('\t') 
          ? line.split('\t').map(f => f.trim())
          : line.split(',').map(f => f.trim());
        
        const escapedFields = fields.map(escapeCSVField);
        csvLines.push(escapedFields.join(','));
      }
      
      const csvContent = csvLines.join('\n');

      const result = await apiRequest('POST', '/api/players/import', { 
        csvContent,
        sessionId: createdSessionId 
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'], exact: false });
      
      setImportResult({
        imported: result.added || 0,
        skipped: result.duplicates || 0
      });
      setPastedText("");
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

    if (activeSession && activeSession.id !== createdSessionId) {
      setShowConflict(true);
      return;
    }

    await activateSession();
  };

  const activateSession = async () => {
    if (!createdSessionId) return;

    setIsCreating(true);
    setImportError(null);
    setShowConflict(false);

    try {
      await apiRequest('PATCH', `/api/sessions/${createdSessionId}`, { 
        status: 'active' 
      });

      completeWizard();
    } catch (err: any) {
      if (err?.status === 409 || err?.error?.includes?.('already active')) {
        await queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
        setImportError("There is already an active session. End it first or save this session as upcoming.");
        setShowConflict(true);
      } else {
        const message = err?.error || err?.message || "Failed to activate session";
        setImportError(message);
      }
      setIsCreating(false);
    }
  };

  const handleEndCurrentAndActivate = async () => {
    if (!createdSessionId || !activeSession) return;

    setIsCreating(true);
    setImportError(null);
    setShowConflict(false);

    try {
      await apiRequest('PATCH', `/api/sessions/${activeSession.id}`, { 
        status: 'ended' 
      });

      await apiRequest('PATCH', `/api/sessions/${createdSessionId}`, { 
        status: 'active' 
      });

      completeWizard();
    } catch (err: any) {
      if (err?.status === 409 || err?.error?.includes?.('already active')) {
        await queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
        setImportError("There is already an active session. End it first or save this session as upcoming.");
        setShowConflict(true);
      } else {
        const message = err?.error || err?.message || "Failed to switch sessions";
        setImportError(message);
      }
      setIsCreating(false);
    }
  };

  const handleSaveAsUpcoming = async () => {
    if (!createdSessionId) return;

    setIsCreating(true);
    setImportError(null);
    setShowConflict(false);

    try {
      await apiRequest('PATCH', `/api/sessions/${createdSessionId}`, { 
        status: 'upcoming' 
      });

      completeWizard();
    } catch (err: any) {
      const message = err?.error || err?.message || "Failed to save session";
      setImportError(message);
      setIsCreating(false);
    }
  };

  const completeWizard = () => {
    setCreatedSessionId(null);
    setSessionData(null);
    setImportResult(null);
    setImportError(null);
    setShowConflict(false);
    setStep('session');
    form.reset();

    queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
    onSessionCreated();
  };

  const handleSkipImport = () => {
    handleFinishWizard();
  };

  const stepIndicator = (
    <div className="flex items-center justify-center gap-2 mb-2">
      {['session', 'marketplace', 'players'].map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            s === step ? 'bg-primary' : 
            (['session', 'marketplace', 'players'].indexOf(step) > i) ? 'bg-primary/40' : 'bg-muted-foreground/20'
          }`} />
          {i < 2 && <div className="w-6 h-px bg-muted-foreground/20" />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {stepIndicator}
              <CardTitle className="text-2xl sm:text-3xl font-bold text-center">
                {step === 'session' ? 'Start New Session' : 
                 step === 'marketplace' ? 'Marketplace Listing' :
                 'Add Players (Optional)'}
              </CardTitle>
              <CardDescription className="text-center mt-2">
                {step === 'session' 
                  ? 'Set up your badminton session details' 
                  : step === 'marketplace'
                  ? 'Optionally list this session on the marketplace for player bookings'
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
                  data-testid="button-continue-to-marketplace"
                >
                  Continue
                </Button>
              </CardFooter>
            </form>
          </Form>
        ) : step === 'marketplace' ? (
          <>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-3">
                  <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">List on Marketplace</p>
                    <p className="text-xs text-muted-foreground">Allow players to discover and book this session online</p>
                  </div>
                </div>
                <Switch
                  checked={marketplaceData.enabled}
                  onCheckedChange={(checked) => setMarketplaceData(prev => ({ ...prev, enabled: checked }))}
                  data-testid="switch-marketplace-enabled"
                />
              </div>

              {marketplaceData.enabled && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4" />
                      Listing Title
                    </Label>
                    <Input
                      value={marketplaceData.title}
                      onChange={(e) => setMarketplaceData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g., Evening Badminton Session"
                      className="min-h-12 sm:min-h-10"
                      data-testid="input-marketplace-title"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Textarea
                      value={marketplaceData.description}
                      onChange={(e) => setMarketplaceData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe the session for players..."
                      className="min-h-[80px]"
                      data-testid="input-marketplace-description"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Start Time
                      </Label>
                      <Input
                        type="time"
                        value={marketplaceData.startTime}
                        onChange={(e) => setMarketplaceData(prev => ({ ...prev, startTime: e.target.value }))}
                        className="min-h-12 sm:min-h-10"
                        data-testid="input-marketplace-start-time"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        End Time
                      </Label>
                      <Input
                        type="time"
                        value={marketplaceData.endTime}
                        onChange={(e) => setMarketplaceData(prev => ({ ...prev, endTime: e.target.value }))}
                        className="min-h-12 sm:min-h-10"
                        data-testid="input-marketplace-end-time"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Max Players
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={marketplaceData.capacity}
                        onChange={(e) => setMarketplaceData(prev => ({ ...prev, capacity: parseInt(e.target.value) || 16 }))}
                        className="min-h-12 sm:min-h-10"
                        data-testid="input-marketplace-capacity"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Price (AED)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={marketplaceData.priceAed}
                        onChange={(e) => setMarketplaceData(prev => ({ ...prev, priceAed: parseInt(e.target.value) || 0 }))}
                        className="min-h-12 sm:min-h-10"
                        data-testid="input-marketplace-price"
                      />
                    </div>
                  </div>
                </div>
              )}

              {importError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{importError}</AlertDescription>
                </Alert>
              )}
            </CardContent>

            <CardFooter className="flex gap-3">
              <Button 
                type="button"
                variant="outline"
                onClick={() => { setStep('session'); setImportError(null); }}
                disabled={isCreating}
                className="min-h-12 sm:min-h-10"
                data-testid="button-back-to-session"
              >
                Back
              </Button>
              <Button 
                type="button"
                onClick={handleMarketplaceContinue}
                disabled={isCreating || (marketplaceData.enabled && !marketplaceData.title)}
                className="flex-1 min-h-12 sm:min-h-10"
                data-testid="button-continue-to-players"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Continue to Players'
                )}
              </Button>
            </CardFooter>
          </>
        ) : (
          <>
            <CardContent className="space-y-6">
              {showConflict && activeSession && (
                <Alert className="border-orange-500/50">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <AlertDescription className="space-y-3">
                    <p>
                      There is already an active session (<strong>{activeSession.venueName}</strong>). 
                      Only one session can be active at a time.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        size="sm"
                        onClick={handleEndCurrentAndActivate}
                        disabled={isCreating}
                        className="flex-1"
                        data-testid="button-end-and-activate"
                      >
                        {isCreating ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        End Current & Activate New
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveAsUpcoming}
                        disabled={isCreating}
                        className="flex-1"
                        data-testid="button-save-upcoming"
                      >
                        {isCreating ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Save as Upcoming
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

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
                onClick={() => setStep('marketplace')}
                disabled={isCreating}
                className="w-full min-h-12 sm:min-h-10"
                data-testid="button-back-to-marketplace"
              >
                Back to Marketplace Options
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
