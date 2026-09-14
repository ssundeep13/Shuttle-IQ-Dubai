// Gate BT1 — the admin force-confirm decision logic, as a pure seam so it can
// be unit-tested without express or the database.
//
// POST /api/marketplace/bookings/:id/admin-confirm takes an OPTIONAL body
//   { method?: 'cash' | 'bank_transfer', note?: string }
// Without a method the route behaves exactly as before (status → confirmed,
// payments row tied to the booking's Ziina intent, email labelled ziina).
// With a method the money came OFF-app, so: the booking's payment_method is
// rewritten to it, cash_paid is set for cash, the note lands in admin_note,
// the payments row carries NO Ziina intent id, and the email says so.
import { z } from "zod";

export const ADMIN_CONFIRM_METHODS = ["cash", "bank_transfer"] as const;
export type AdminConfirmMethod = (typeof ADMIN_CONFIRM_METHODS)[number];

export interface AdminConfirmOverride {
  method?: AdminConfirmMethod;
  note?: string;
}

const bodySchema = z.object({
  method: z.enum(ADMIN_CONFIRM_METHODS).optional(),
  note: z.string().trim().max(500).optional(),
});

export type ParsedAdminConfirmBody =
  | { ok: true; method: AdminConfirmMethod | undefined; note: string | undefined }
  | { ok: false; error: string };

export function parseAdminConfirmBody(body: unknown): ParsedAdminConfirmBody {
  const r = bodySchema.safeParse(body ?? {});
  if (!r.success) {
    const issue = r.error.issues[0];
    return { ok: false, error: `Invalid confirm body: ${issue?.path.join(".") || "body"} ${issue?.message ?? "is invalid"}` };
  }
  const note = r.data.note && r.data.note.length > 0 ? r.data.note : undefined;
  return { ok: true, method: r.data.method, note };
}

export interface AdminConfirmBookingView {
  paymentMethod: string;
  ziinaPaymentIntentId: string | null;
  amountAed: number;
}

export interface AdminConfirmPaymentView {
  status: string;
  ziinaPaymentIntentId: string | null;
}

export interface AdminConfirmPlan {
  bookingPatch: { status: "confirmed"; paymentMethod?: AdminConfirmMethod; cashPaid?: boolean; adminNote?: string };
  paymentInsert: { ziinaPaymentIntentId: string | null; amount: number; currency: "aed"; status: "completed" } | null;
  /** What the confirmation email is told the payment method was. */
  emailMethod: string;
}

/** Cash bookings keep using the cash-paid toggle — unless the admin is overriding the method. */
export function shouldRefuseCash(booking: Pick<AdminConfirmBookingView, "paymentMethod">, override: AdminConfirmOverride): boolean {
  return booking.paymentMethod === "cash" && !override.method;
}

export function planAdminConfirm(
  booking: AdminConfirmBookingView,
  override: AdminConfirmOverride,
  existingPayments: AdminConfirmPaymentView[],
): AdminConfirmPlan {
  const bookingPatch: AdminConfirmPlan["bookingPatch"] = { status: "confirmed" };
  if (override.method) {
    bookingPatch.paymentMethod = override.method;
    bookingPatch.cashPaid = override.method === "cash";
  }
  if (override.note) bookingPatch.adminNote = override.note;

  let paymentInsert: AdminConfirmPlan["paymentInsert"] = null;
  if (override.method) {
    // Off-app money: one completed row without an intent, unless something already recorded it.
    const alreadyRecorded = existingPayments.some((p) => p.status === "completed");
    if (!alreadyRecorded) {
      paymentInsert = { ziinaPaymentIntentId: null, amount: booking.amountAed, currency: "aed", status: "completed" };
    }
  } else if (booking.ziinaPaymentIntentId) {
    // Unchanged behaviour: tie the row to the Ziina intent, once.
    const alreadyRecorded = existingPayments.some((p) => p.ziinaPaymentIntentId === booking.ziinaPaymentIntentId);
    if (!alreadyRecorded) {
      paymentInsert = { ziinaPaymentIntentId: booking.ziinaPaymentIntentId, amount: booking.amountAed, currency: "aed", status: "completed" };
    }
  }

  return { bookingPatch, paymentInsert, emailMethod: override.method ?? "ziina" };
}
