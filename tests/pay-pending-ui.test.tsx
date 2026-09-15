// My games cards for a drop-in that still has to be paid: a "Pay AED <amount>" button on the hero and the agenda row
// (the detail card already had one for promotions), the promotion deadline where one exists, nothing for a confirmed
// seat or an IQ Pass hold (which has its own Complete payment flow).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/marketplace/IqPassPromo', () => ({ IqPassProgressLine: () => null }));

const { NextGameCard, AgendaRow, isPayableDropIn, payByLabel } = await import('@/components/marketplace/MyGames');

const NOW = new Date('2026-09-15T14:00:00.000Z').getTime();
const booking = (over: Record<string, unknown> = {}) => ({
  id: 'b-1', userId: 'u-1', sessionId: 's-1', status: 'pending', paymentMethod: 'ziina', amountAed: 49, spotsBooked: 1, walletAmountUsed: 0, packId: null, promotedAt: null,
  ziinaPaymentIntentId: 'pi_1', createdAt: new Date(NOW - 3_600_000), cancelledAt: null, cancellationReason: null,
  session: { id: 's-1', title: 'Bright Riders School Dubai Session', venueName: 'Bright Riders School Dubai', date: new Date('2026-09-15T00:00:00.000Z'), startTime: '20:00', endTime: '22:00', priceAed: 49, capacity: 24, status: 'upcoming' },
  ...over,
}) as any;

describe('isPayableDropIn / payByLabel', () => {
  it('pending and pending_payment Ziina drop-ins are payable; confirmed, cash and IQ Pass rows are not', () => {
    expect(isPayableDropIn(booking())).toBe(true);
    expect(isPayableDropIn(booking({ status: 'pending_payment' }))).toBe(true);
    expect(isPayableDropIn(booking({ status: 'confirmed' }))).toBe(false);
    expect(isPayableDropIn(booking({ status: 'waitlisted' }))).toBe(false);
    expect(isPayableDropIn(booking({ paymentMethod: 'cash' }))).toBe(false);
    expect(isPayableDropIn(booking({ status: 'pending_payment', packId: 'pk-1' }))).toBe(false);
  });
  it('the deadline label exists only for a promotion (promotedAt + 4 h, Dubai time)', () => {
    expect(payByLabel(booking())).toBeNull();
    expect(payByLabel(booking({ status: 'pending_payment', promotedAt: new Date('2026-09-15T13:47:00.000Z') }))).toBe('Pay by 9:47 pm');
  });
});

describe('NextGameCard (hero)', () => {
  it('an unpaid pending drop-in → "Pay AED 49" that fires onPay; no deadline line', () => {
    const onPay = vi.fn();
    render(<NextGameCard booking={booking()} area={null} seat={null} passLine={null} onMove={() => {}} onPay={onPay} now={NOW} />);
    const btn = screen.getByTestId('button-pay-hero-b-1');
    expect(btn).toHaveTextContent('Pay AED 49');
    fireEvent.click(btn);
    expect(onPay).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('text-pay-deadline-b-1')).toBeNull();
  });
  it('a promotion awaiting payment → the button plus "Pay by HH:mm"; busy → disabled "Opening payment…"', () => {
    const b = booking({ status: 'pending_payment', promotedAt: new Date('2026-09-15T13:47:00.000Z') });
    const { rerender } = render(<NextGameCard booking={b} area={null} seat={null} passLine={null} onMove={() => {}} onPay={() => {}} now={NOW} />);
    expect(screen.getByTestId('text-pay-deadline-b-1')).toHaveTextContent('Pay by 9:47 pm');
    rerender(<NextGameCard booking={b} area={null} seat={null} passLine={null} onMove={() => {}} onPay={() => {}} payBusy now={NOW} />);
    expect(screen.getByTestId('button-pay-hero-b-1')).toBeDisabled();
    expect(screen.getByTestId('button-pay-hero-b-1')).toHaveTextContent(/Opening payment/);
  });
  it('a confirmed seat and an IQ Pass hold show no pay button', () => {
    render(<NextGameCard booking={booking({ status: 'confirmed' })} area={null} seat={null} passLine={null} onMove={() => {}} onPay={() => {}} now={NOW} />);
    expect(screen.queryByTestId('button-pay-hero-b-1')).toBeNull();
    render(<NextGameCard booking={booking({ id: 'b-2', status: 'pending_payment', packId: 'pk-1' })} area={null} seat={null} passLine={null} onMove={() => {}} onPay={() => {}} now={NOW} />);
    expect(screen.queryByTestId('button-pay-hero-b-2')).toBeNull();
  });
});

describe('AgendaRow', () => {
  it('an unpaid pending drop-in → "Pay AED 49" next to Details, firing onPay', () => {
    const onPay = vi.fn();
    render(<AgendaRow booking={booking()} area={null} seat={null} open={false} onToggle={() => {}} onMove={() => {}} onPay={onPay}><div /></AgendaRow>);
    const btn = screen.getByTestId('button-pay-b-1');
    expect(btn).toHaveTextContent('Pay AED 49');
    fireEvent.click(btn);
    expect(onPay).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('button-details-b-1')).toBeInTheDocument();
  });
  it('a promotion shows its deadline in the row; a confirmed seat shows no pay button', () => {
    render(<AgendaRow booking={booking({ status: 'pending_payment', promotedAt: new Date('2026-09-15T13:47:00.000Z') })} area={null} seat={null} open={false} onToggle={() => {}} onMove={() => {}} onPay={() => {}}><div /></AgendaRow>);
    expect(screen.getByTestId('text-pay-deadline-b-1')).toHaveTextContent('Pay by 9:47 pm');
    render(<AgendaRow booking={booking({ id: 'b-3', status: 'confirmed' })} area={null} seat={null} open={false} onToggle={() => {}} onMove={() => {}} onPay={() => {}}><div /></AgendaRow>);
    expect(screen.queryByTestId('button-pay-b-3')).toBeNull();
  });
});
