// Gate BT1 — admin "Confirm Payment" for a pending / pending_payment booking
// whose money arrived off-app. The admin must pick HOW it was paid (cash or
// bank transfer) before confirming; an optional note is stored on the booking
// as admin_note. Confirm stays disabled until a method is chosen.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type ConfirmPaymentMethod = 'cash' | 'bank_transfer';

const OPTIONS: Array<{ value: ConfirmPaymentMethod; label: string; hint: string }> = [
  { value: 'cash', label: 'Cash', hint: 'Handed over at the venue' },
  { value: 'bank_transfer', label: 'Bank transfer', hint: 'Received outside the app' },
];

export function ConfirmPaymentDialog({
  open,
  onOpenChange,
  playerName,
  amountAed,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  amountAed: number;
  pending: boolean;
  onConfirm: (method: ConfirmPaymentMethod, note: string | undefined) => void;
}) {
  const [method, setMethod] = useState<ConfirmPaymentMethod | null>(null);
  const [note, setNote] = useState('');

  const submit = () => {
    if (!method) return;
    const trimmed = note.trim();
    onConfirm(method, trimmed.length > 0 ? trimmed : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setMethod(null); setNote(''); } onOpenChange(o); }}>
      <DialogContent data-testid="dialog-confirm-payment">
        <DialogHeader>
          <DialogTitle>Confirm payment</DialogTitle>
          <DialogDescription>
            {playerName} · AED {amountAed}. How was it paid? The booking is confirmed and a payment is recorded under that method.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Payment method">
          {OPTIONS.map((o) => {
            const active = method === o.value;
            return (
              <Button
                key={o.value}
                type="button"
                variant={active ? 'default' : 'outline'}
                className="h-auto min-h-11 flex-col items-start gap-0.5 py-2"
                aria-pressed={active}
                onClick={() => setMethod(o.value)}
                data-testid={`option-method-${o.value}`}
              >
                <span className="font-semibold">{o.label}</span>
                <span className={`text-xs ${active ? 'opacity-80' : 'text-muted-foreground'}`}>{o.hint}</span>
              </Button>
            );
          })}
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional) — e.g. paid via bank transfer — confirmed by admin 11 Sep"
          maxLength={500}
          rows={2}
          data-testid="input-confirm-note"
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending} data-testid="button-confirm-payment-cancel">
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!method || pending} data-testid="button-confirm-payment-submit">
            {pending ? 'Confirming…' : 'Confirm payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
