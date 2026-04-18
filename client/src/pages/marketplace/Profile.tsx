import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { User, Link2, Search, Check, Mail, Phone, LogOut, ShieldCheck, ArrowLeft, HelpCircle, Pencil } from 'lucide-react';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import { motion } from 'framer-motion';
import { usePageTitle } from '@/hooks/usePageTitle';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

interface PlayerSearchResult {
  id: string;
  name: string;
  shuttleIqId: string;
  level: string;
  skillScore: number;
}

export default function Profile() {
  usePageTitle('Profile');
  const { user, logout } = useMarketplaceAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [otpFlow, setOtpFlow] = useState<{ player: PlayerSearchResult; destination: string; channel: 'email' | 'phone'; availableChannels: string[] } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [previewFlow, setPreviewFlow] = useState<{
    player: PlayerSearchResult;
    destination: string;
    channel: 'email' | 'phone';
    availableChannels: string[];
    maskedEmail: string | null;
    maskedPhone: string | null;
  } | null>(null);
  // Self-service contact change sub-flow (within OTP flow)
  const [contactEdit, setContactEdit] = useState<
    | { mode: 'form'; field: 'email' | 'phone'; value: string }
    | { mode: 'verify'; field: 'email' | 'phone'; destination: string; code: string }
    | null
  >(null);
  // Self-service marketplace account email/phone update (Account Details card)
  const [accountEdit, setAccountEdit] = useState<
    | { mode: 'form'; field: 'email' | 'phone'; value: string }
    | { mode: 'verify'; field: 'email' | 'phone'; destination: string; code: string }
    | null
  >(null);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setSearching(true);
    try {
      const results = await apiRequest<PlayerSearchResult[]>('GET', `/api/marketplace/search-players?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(results);
    } catch (err) {
      toast({ title: 'Search failed', variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const resetLinkUI = () => {
    setSearchResults([]);
    setSearchQuery('');
    setOtpFlow(null);
    setOtpCode('');
    setPreviewFlow(null);
    setContactEdit(null);
  };

  // apiRequest throws a plain object `{ error, status }` (not a true Error) —
  // be defensive and look at both shapes.
  const errorMessage = (err: unknown): string => {
    if (!err) return 'Something went wrong';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    const e = err as { error?: string; message?: string };
    return e.error || e.message || 'Something went wrong';
  };
  const errorStatus = (err: unknown): number | undefined => {
    if (err && typeof err === 'object') return (err as { status?: number }).status;
    return undefined;
  };
  const isOwnershipNotVerified = (err: unknown): boolean => {
    const code = err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
    if (code === 'OWNERSHIP_NOT_VERIFIED') return true;
    // Fallback for older clients/responses that don't set `code`.
    return errorStatus(err) === 403 && /verify this player profile belongs to you/i.test(errorMessage(err));
  };

  const linkMutation = useMutation({
    mutationFn: async (player: PlayerSearchResult) => {
      try {
        await apiRequest('POST', '/api/marketplace/link-player', { playerId: player.id });
        return { linked: true as const };
      } catch (err) {
        if (isOwnershipNotVerified(err)) {
          // Fetch a preview of where the code would go BEFORE sending anything,
          // so the user can confirm the contact (or bail out if it's wrong).
          const preview = await apiRequest<{
            destination: string;
            channel: string;
            availableChannels?: string[];
            maskedEmail: string | null;
            maskedPhone: string | null;
          }>('GET', `/api/marketplace/link-player/contact-preview?playerId=${encodeURIComponent(player.id)}`);
          return {
            linked: false as const,
            destination: preview.destination,
            channel: preview.channel,
            availableChannels: preview.availableChannels ?? [],
            maskedEmail: preview.maskedEmail,
            maskedPhone: preview.maskedPhone,
          };
        }
        throw err;
      }
    },
    onSuccess: (result, player) => {
      if (result.linked) {
        toast({ title: 'Player linked!' });
        queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
        resetLinkUI();
      } else {
        setPreviewFlow({
          player,
          destination: result.destination,
          channel: result.channel as 'email' | 'phone',
          availableChannels: result.availableChannels,
          maskedEmail: result.maskedEmail,
          maskedPhone: result.maskedPhone,
        });
      }
    },
    onError: (err) => {
      toast({ title: 'Link failed', description: errorMessage(err), variant: 'destructive' });
    },
  });

  const sendCodeMutation = useMutation({
    mutationFn: async ({ playerId, channel }: { playerId: string; channel: 'email' | 'phone' }) => {
      return apiRequest<{ destination: string; channel: string; availableChannels?: string[] }>(
        'POST',
        '/api/marketplace/link-player/request-otp',
        { playerId, channel },
      );
    },
    onSuccess: (resp) => {
      if (!previewFlow) return;
      setOtpFlow({
        player: previewFlow.player,
        destination: resp.destination,
        channel: resp.channel as 'email' | 'phone',
        availableChannels: resp.availableChannels ?? previewFlow.availableChannels,
      });
      setOtpCode('');
      setPreviewFlow(null);
      toast({ title: 'Verification code sent', description: `Check ${resp.destination}.` });
    },
    onError: (err) => {
      toast({ title: 'Could not send code', description: errorMessage(err), variant: 'destructive' });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({ playerId, code }: { playerId: string; code: string }) => {
      return apiRequest('POST', '/api/marketplace/link-player/verify-otp', { playerId, code });
    },
    onSuccess: () => {
      toast({ title: 'Player linked!' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
      resetLinkUI();
    },
    onError: (err) => {
      toast({ title: 'Verification failed', description: errorMessage(err), variant: 'destructive' });
    },
  });

  const requestContactChangeMutation = useMutation({
    mutationFn: async ({ playerId, field, newValue }: { playerId: string; field: 'email' | 'phone'; newValue: string }) => {
      return apiRequest<{ destination: string; field: 'email' | 'phone' }>(
        'POST',
        '/api/marketplace/link-player/contact-change/request-otp',
        { playerId, field, newValue },
      );
    },
    onSuccess: (resp, vars) => {
      toast({ title: 'Verification code sent', description: `Check ${resp.destination}.` });
      setContactEdit({ mode: 'verify', field: vars.field, destination: resp.destination, code: '' });
    },
    onError: (err) => {
      toast({ title: 'Could not send code', description: errorMessage(err), variant: 'destructive' });
    },
  });

  const verifyContactChangeMutation = useMutation({
    mutationFn: async ({ playerId, code }: { playerId: string; code: string }) => {
      return apiRequest('POST', '/api/marketplace/link-player/contact-change/verify-otp', { playerId, code });
    },
    onSuccess: () => {
      toast({ title: 'Contact updated and player linked!' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
      resetLinkUI();
    },
    onError: (err) => {
      toast({ title: 'Verification failed', description: errorMessage(err), variant: 'destructive' });
    },
  });

  const requestAccountChangeMutation = useMutation({
    mutationFn: async ({ field, newValue }: { field: 'email' | 'phone'; newValue: string }) => {
      return apiRequest<{ destination: string; field: 'email' | 'phone' }>(
        'POST',
        '/api/marketplace/account/contact-change/request-otp',
        { field, newValue },
      );
    },
    onSuccess: (resp, vars) => {
      toast({ title: 'Verification code sent', description: `Check ${resp.destination}.` });
      setAccountEdit({ mode: 'verify', field: vars.field, destination: resp.destination, code: '' });
    },
    onError: (err) => {
      toast({ title: 'Could not send code', description: errorMessage(err), variant: 'destructive' });
    },
  });

  const verifyAccountChangeMutation = useMutation({
    mutationFn: async ({ code }: { code: string }) => {
      return apiRequest('POST', '/api/marketplace/account/contact-change/verify-otp', { code });
    },
    onSuccess: () => {
      toast({ title: 'Account updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
      setAccountEdit(null);
    },
    onError: (err) => {
      toast({ title: 'Verification failed', description: errorMessage(err), variant: 'destructive' });
    },
  });

  const resendOtpMutation = useMutation({
    mutationFn: async ({ playerId, channel }: { playerId: string; channel?: 'email' | 'phone' }) => {
      return apiRequest<{ destination: string; channel: string; availableChannels?: string[] }>(
        'POST',
        '/api/marketplace/link-player/request-otp',
        channel ? { playerId, channel } : { playerId },
      );
    },
    onSuccess: (resp) => {
      toast({ title: 'New code sent', description: `Check ${resp.destination}.` });
      setOtpFlow((cur) => cur ? { ...cur, destination: resp.destination, channel: resp.channel as 'email' | 'phone' } : cur);
      setOtpCode('');
    },
    onError: (err) => {
      toast({ title: 'Could not resend code', description: errorMessage(err), variant: 'destructive' });
    },
  });

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp} className="mb-8">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Profile</h1>
        </motion.div>

        <motion.div variants={fadeInUp} className="flex items-center gap-4 mb-8">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-secondary text-secondary-foreground font-bold text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-semibold" data-testid="text-profile-name">{user?.name}</h2>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            {user?.linkedPlayer && (
              <Badge variant="secondary" className="mt-1 text-xs">{getTierDisplayName(user.linkedPlayer.level)}</Badge>
            )}
          </div>
        </motion.div>

        <div className="space-y-6">
          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-secondary" /> Account Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">Name</div>
                    <div className="text-sm font-medium" data-testid="text-user-name">{user?.name}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">Email</div>
                    <div className="text-sm font-medium" data-testid="text-user-email">{user?.email}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAccountEdit({ mode: 'form', field: 'email', value: '' })}
                    data-testid="button-edit-account-email"
                    aria-label="Edit email"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">Phone</div>
                    <div className="text-sm font-medium" data-testid="text-user-phone">
                      {user?.phone || <span className="text-muted-foreground">Not set</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAccountEdit({ mode: 'form', field: 'phone', value: '' })}
                    data-testid="button-edit-account-phone"
                    aria-label="Edit phone"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                {accountEdit && (
                  <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3" data-testid="section-account-contact-change">
                    {accountEdit.mode === 'form' ? (
                      <>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <ShieldCheck className="h-4 w-4 text-secondary" />
                          Update {accountEdit.field === 'email' ? 'email' : 'phone'} on your marketplace account
                        </div>
                        <p className="text-xs text-muted-foreground">
                          We'll send a 6-digit code to the new {accountEdit.field === 'email' ? 'email' : 'phone'} you enter. The change is only applied once that code is verified.
                        </p>
                        <div className="flex gap-2">
                          <Input
                            type={accountEdit.field === 'email' ? 'email' : 'tel'}
                            placeholder={accountEdit.field === 'email' ? 'new.email@example.com' : '+971 50 123 4567'}
                            value={accountEdit.value}
                            onChange={(e) => setAccountEdit({ ...accountEdit, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && accountEdit.value.length >= 3) {
                                requestAccountChangeMutation.mutate({ field: accountEdit.field, newValue: accountEdit.value });
                              }
                            }}
                            data-testid="input-account-new-value"
                          />
                          <Button
                            onClick={() => requestAccountChangeMutation.mutate({ field: accountEdit.field, newValue: accountEdit.value })}
                            disabled={accountEdit.value.length < 3 || requestAccountChangeMutation.isPending}
                            data-testid="button-send-account-otp"
                          >
                            {requestAccountChangeMutation.isPending ? 'Sending…' : 'Send code'}
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAccountEdit(null)}
                          data-testid="button-cancel-account-edit"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <ShieldCheck className="h-4 w-4 text-secondary" />
                          Confirm new {accountEdit.field === 'email' ? 'email' : 'phone'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          We sent a code to{' '}
                          <span className="font-medium text-foreground" data-testid="text-account-otp-destination">{accountEdit.destination}</span>
                          . Enter it below to update your account. The code expires in 10 minutes.
                        </p>
                        <div className="flex gap-2">
                          <Input
                            placeholder="123456"
                            inputMode="numeric"
                            maxLength={6}
                            value={accountEdit.code}
                            onChange={(e) => setAccountEdit({ ...accountEdit, code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && accountEdit.code.length === 6) {
                                verifyAccountChangeMutation.mutate({ code: accountEdit.code });
                              }
                            }}
                            data-testid="input-account-otp"
                            className="font-mono tracking-widest text-center text-lg"
                          />
                          <Button
                            onClick={() => verifyAccountChangeMutation.mutate({ code: accountEdit.code })}
                            disabled={accountEdit.code.length !== 6 || verifyAccountChangeMutation.isPending}
                            data-testid="button-verify-account-otp"
                          >
                            {verifyAccountChangeMutation.isPending ? 'Verifying…' : 'Confirm'}
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAccountEdit({ mode: 'form', field: accountEdit.field, value: '' })}
                            data-testid="button-account-edit-back"
                          >
                            Use a different value
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAccountEdit(null)}
                            data-testid="button-account-edit-cancel"
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-secondary" /> ShuttleIQ Player Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                {user?.linkedPlayer ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-secondary/5 border border-secondary/20">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-secondary/20 text-secondary font-semibold text-sm">
                            {user.linkedPlayer.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium" data-testid="text-linked-player-name">{user.linkedPlayer.name}</div>
                          <div className="text-xs text-muted-foreground">{user.linkedPlayer.shuttleIqId}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold">{user.linkedPlayer.skillScore}</div>
                        <Badge variant="secondary" className="text-xs">{getTierDisplayName(user.linkedPlayer.level)}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <Check className="h-4 w-4" /> Linked
                    </div>
                  </div>
                ) : previewFlow ? (
                  <div className="space-y-4" data-testid="section-preview-flow">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 -ml-2"
                      onClick={resetLinkUI}
                      data-testid="button-preview-back"
                    >
                      <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ShieldCheck className="h-4 w-4 text-secondary" />
                        Verify ownership of <span data-testid="text-preview-player-name">{previewFlow.player.name}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        We'll send a 6-digit verification code to{' '}
                        <span className="font-medium text-foreground" data-testid="text-preview-destination">{previewFlow.destination}</span>
                        {' '}— the {previewFlow.channel === 'phone' ? 'phone number' : 'email'} on this player's record.
                      </p>
                      {previewFlow.availableChannels.length > 1 && (
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">Send to:</span>
                          {previewFlow.availableChannels.includes('email') && previewFlow.maskedEmail && (
                            <Button
                              type="button"
                              size="sm"
                              variant={previewFlow.channel === 'email' ? 'default' : 'outline'}
                              onClick={() => setPreviewFlow((cur) => cur ? { ...cur, channel: 'email', destination: cur.maskedEmail ?? cur.destination } : cur)}
                              data-testid="button-preview-channel-email"
                            >
                              <Mail className="h-3.5 w-3.5" /> Email
                            </Button>
                          )}
                          {previewFlow.availableChannels.includes('phone') && previewFlow.maskedPhone && (
                            <Button
                              type="button"
                              size="sm"
                              variant={previewFlow.channel === 'phone' ? 'default' : 'outline'}
                              onClick={() => setPreviewFlow((cur) => cur ? { ...cur, channel: 'phone', destination: cur.maskedPhone ?? cur.destination } : cur)}
                              data-testid="button-preview-channel-phone"
                            >
                              <Phone className="h-3.5 w-3.5" /> SMS
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => sendCodeMutation.mutate({ playerId: previewFlow.player.id, channel: previewFlow.channel })}
                        disabled={sendCodeMutation.isPending}
                        data-testid="button-send-code"
                      >
                        {sendCodeMutation.isPending ? 'Sending…' : 'Send code'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={resetLinkUI}
                        data-testid="button-preview-cancel"
                      >
                        Cancel
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
                      <HelpCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-foreground">Not your {previewFlow.channel === 'phone' ? 'number' : 'email'}?</span>{' '}
                        Don't request the code — it'll just go to someone else.{' '}
                        <a
                          href="mailto:support@shuttleiq.app?subject=Help%20linking%20my%20player%20profile"
                          className="underline text-foreground"
                          data-testid="link-contact-support"
                        >
                          Contact support
                        </a>{' '}
                        and we'll link your profile manually.
                      </div>
                    </div>
                  </div>
                ) : otpFlow ? (
                  <div className="space-y-4" data-testid="section-otp-flow">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 -ml-2"
                      onClick={resetLinkUI}
                      data-testid="button-otp-back"
                    >
                      <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ShieldCheck className="h-4 w-4 text-secondary" />
                        Verify ownership of <span data-testid="text-otp-player-name">{otpFlow.player.name}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        We sent a 6-digit code to{' '}
                        <span className="font-medium text-foreground" data-testid="text-otp-destination">{otpFlow.destination}</span>
                        {' '}— the {otpFlow.channel === 'phone' ? 'phone number' : 'email'} on this player's record. Enter it below to finish linking. The code expires in 10 minutes.
                      </p>
                      {otpFlow.availableChannels.length > 1 && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-xs text-muted-foreground">Send to:</span>
                          {otpFlow.availableChannels.includes('email') && (
                            <Button
                              type="button"
                              size="sm"
                              variant={otpFlow.channel === 'email' ? 'default' : 'outline'}
                              onClick={() => resendOtpMutation.mutate({ playerId: otpFlow.player.id, channel: 'email' })}
                              disabled={resendOtpMutation.isPending}
                              data-testid="button-otp-channel-email"
                            >
                              Email
                            </Button>
                          )}
                          {otpFlow.availableChannels.includes('phone') && (
                            <Button
                              type="button"
                              size="sm"
                              variant={otpFlow.channel === 'phone' ? 'default' : 'outline'}
                              onClick={() => resendOtpMutation.mutate({ playerId: otpFlow.player.id, channel: 'phone' })}
                              disabled={resendOtpMutation.isPending}
                              data-testid="button-otp-channel-phone"
                            >
                              SMS
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="123456"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && otpCode.length === 6) {
                            verifyOtpMutation.mutate({ playerId: otpFlow.player.id, code: otpCode });
                          }
                        }}
                        data-testid="input-otp-code"
                        className="font-mono tracking-widest text-center text-lg"
                      />
                      <Button
                        onClick={() => verifyOtpMutation.mutate({ playerId: otpFlow.player.id, code: otpCode })}
                        disabled={otpCode.length !== 6 || verifyOtpMutation.isPending}
                        data-testid="button-verify-otp"
                      >
                        {verifyOtpMutation.isPending ? 'Verifying…' : 'Verify'}
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resendOtpMutation.mutate({ playerId: otpFlow.player.id })}
                        disabled={resendOtpMutation.isPending}
                        data-testid="button-resend-otp"
                      >
                        {resendOtpMutation.isPending ? 'Sending…' : 'Resend code'}
                      </Button>
                      {!contactEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground"
                          onClick={() => setContactEdit({ mode: 'form', field: 'email', value: '' })}
                          data-testid="button-update-contact"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Wrong {otpFlow.channel === 'phone' ? 'number' : 'email'}? Update it
                        </Button>
                      )}
                    </div>

                    {contactEdit && (
                      <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3" data-testid="section-contact-change">
                        {contactEdit.mode === 'form' ? (
                          <>
                            <div className="text-sm font-medium">Update {contactEdit.field === 'email' ? 'email' : 'phone'} on the player record</div>
                            <p className="text-xs text-muted-foreground">
                              We'll send a 6-digit code to the new {contactEdit.field === 'email' ? 'email' : 'phone'} you enter. The change is only applied once that code is verified.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant={contactEdit.field === 'email' ? 'default' : 'outline'}
                                onClick={() => setContactEdit({ mode: 'form', field: 'email', value: '' })}
                                data-testid="button-contact-field-email"
                              >
                                Email
                              </Button>
                              <Button
                                size="sm"
                                variant={contactEdit.field === 'phone' ? 'default' : 'outline'}
                                onClick={() => setContactEdit({ mode: 'form', field: 'phone', value: '' })}
                                data-testid="button-contact-field-phone"
                              >
                                Phone
                              </Button>
                            </div>
                            <div className="flex gap-2">
                              <Input
                                type={contactEdit.field === 'email' ? 'email' : 'tel'}
                                placeholder={contactEdit.field === 'email' ? 'new.email@example.com' : '+971 50 123 4567'}
                                value={contactEdit.value}
                                onChange={(e) => setContactEdit({ ...contactEdit, value: e.target.value })}
                                data-testid="input-contact-new-value"
                              />
                              <Button
                                onClick={() => requestContactChangeMutation.mutate({
                                  playerId: otpFlow.player.id,
                                  field: contactEdit.field,
                                  newValue: contactEdit.value,
                                })}
                                disabled={contactEdit.value.length < 3 || requestContactChangeMutation.isPending}
                                data-testid="button-send-contact-otp"
                              >
                                {requestContactChangeMutation.isPending ? 'Sending…' : 'Send code'}
                              </Button>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setContactEdit(null)}
                              data-testid="button-cancel-contact-edit"
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-medium">Confirm new {contactEdit.field === 'email' ? 'email' : 'phone'}</div>
                            <p className="text-xs text-muted-foreground">
                              We sent a code to{' '}
                              <span className="font-medium text-foreground" data-testid="text-contact-new-destination">{contactEdit.destination}</span>
                              . Enter it below to update the player profile and finish linking.
                            </p>
                            <div className="flex gap-2">
                              <Input
                                placeholder="123456"
                                inputMode="numeric"
                                maxLength={6}
                                value={contactEdit.code}
                                onChange={(e) => setContactEdit({ ...contactEdit, code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && contactEdit.code.length === 6) {
                                    verifyContactChangeMutation.mutate({ playerId: otpFlow.player.id, code: contactEdit.code });
                                  }
                                }}
                                data-testid="input-contact-otp"
                                className="font-mono tracking-widest text-center text-lg"
                              />
                              <Button
                                onClick={() => verifyContactChangeMutation.mutate({ playerId: otpFlow.player.id, code: contactEdit.code })}
                                disabled={contactEdit.code.length !== 6 || verifyContactChangeMutation.isPending}
                                data-testid="button-verify-contact-otp"
                              >
                                {verifyContactChangeMutation.isPending ? 'Verifying…' : 'Confirm'}
                              </Button>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setContactEdit({ mode: 'form', field: contactEdit.field, value: '' })}
                              data-testid="button-contact-edit-back"
                            >
                              Use a different value
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Link your account to your ShuttleIQ player profile to unlock your scores, rankings, and match history.
                    </p>
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">What's a ShuttleIQ ID?</span> It's a unique code (e.g. SIQ-00081) assigned to you by your session organiser. Ask them if you don't have one yet — they can look it up in the admin dashboard.
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search by name or ShuttleIQ ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        data-testid="input-player-search"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleSearch}
                        disabled={searching || searchQuery.length < 2}
                        data-testid="button-search-player"
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>

                    {searchResults.length > 0 && (
                      <div className="space-y-2">
                        {searchResults.map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center justify-between gap-2 p-3 rounded-lg border hover-elevate"
                            data-testid={`row-search-result-${player.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs bg-muted font-medium">
                                  {player.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium text-sm">{player.name}</div>
                                <div className="text-xs text-muted-foreground">{player.shuttleIqId}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{getTierDisplayName(player.level)}</Badge>
                              <Button
                                size="sm"
                                onClick={() => linkMutation.mutate(player)}
                                disabled={linkMutation.isPending}
                                data-testid={`button-link-${player.id}`}
                              >
                                Link
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <LogOut className="h-4 w-4 text-secondary" /> Account
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Sign out of your ShuttleIQ account on this device.
                </p>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={logout}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4" />
                  Log Out
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
