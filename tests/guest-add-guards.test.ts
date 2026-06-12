import { describe, it, expect } from "vitest";
import {
  findReusableInflightGuest,
  canAddGuest,
  isSweepableGuestOrphan,
  normGuestKey,
  type GuestLike,
} from "../server/guestAddGuards";

const guest = (over: Partial<GuestLike> = {}): GuestLike => ({
  id: over.id ?? "g1",
  name: over.name ?? "Shiela",
  email: over.email ?? null,
  isPrimary: over.isPrimary ?? false,
  status: over.status ?? "pending",
  cancellationToken: over.cancellationToken ?? "tok",
});

describe("normGuestKey", () => {
  it("is case- and whitespace-insensitive; null/undefined → ''", () => {
    expect(normGuestKey("  Shiela ")).toBe("shiela");
    expect(normGuestKey("SHIELA")).toBe("shiela");
    expect(normGuestKey(null)).toBe("");
    expect(normGuestKey(undefined)).toBe("");
  });
});

describe("findReusableInflightGuest (dedup)", () => {
  it("same-guest retry reuses the existing pending row (3-Shiela collapses to 1)", () => {
    const rows = [guest({ id: "primary", isPrimary: true, name: "Booker" }), guest({ id: "s1", name: "Shiela" })];
    const dup = findReusableInflightGuest(rows, " shiela ", null); // different case/space
    expect(dup?.id).toBe("s1");
  });

  it("matches on name + email together (case-insensitive)", () => {
    const rows = [guest({ id: "s1", name: "Shiela", email: "S@X.com" })];
    expect(findReusableInflightGuest(rows, "shiela", "s@x.com")?.id).toBe("s1");
    expect(findReusableInflightGuest(rows, "shiela", "other@x.com")).toBeUndefined();
  });

  it("ignores a different guest, primary slots, and non-pending rows", () => {
    const rows = [
      guest({ id: "primary", isPrimary: true, name: "Shiela" }), // primary, even if same name
      guest({ id: "conf", name: "Shiela", status: "confirmed" }), // already confirmed
      guest({ id: "canc", name: "Shiela", status: "cancelled" }), // cancelled
    ];
    expect(findReusableInflightGuest(rows, "Shiela", null)).toBeUndefined();
    expect(findReusableInflightGuest(rows, "Bob", null)).toBeUndefined();
  });
});

describe("canAddGuest (ceiling, max=1)", () => {
  it("a duplicate (reuse) is always allowed regardless of count", () => {
    expect(canAddGuest({ inflightCount: 1, isDuplicate: true, max: 1 })).toBe(true);
    expect(canAddGuest({ inflightCount: 5, isDuplicate: true, max: 1 })).toBe(true);
  });

  it("a NEW distinct guest is allowed only below the cap", () => {
    expect(canAddGuest({ inflightCount: 0, isDuplicate: false, max: 1 })).toBe(true);
    // different guest while one is already in flight → blocked (route returns 409)
    expect(canAddGuest({ inflightCount: 1, isDuplicate: false, max: 1 })).toBe(false);
  });
});

describe("isSweepableGuestOrphan (sweep predicate, 4h window)", () => {
  const WINDOW = 4 * 60 * 60 * 1000;
  const NOW = 1_000_000_000_000;
  const past = new Date(NOW - WINDOW - 1); // just past the window
  const recent = new Date(NOW - 60_000); // within the window
  // Spread overrides (not ??) so an explicit null/false override is respected.
  const ctx = (over: Partial<Parameters<typeof isSweepableGuestOrphan>[1]> = {}) => ({
    parentBookingStatus: "confirmed",
    hasCompletedPayment: false,
    nowMs: NOW,
    windowMs: WINDOW,
    ...over,
  });
  const g = (over: Partial<Parameters<typeof isSweepableGuestOrphan>[0]> = {}) => ({
    isPrimary: false,
    status: "pending",
    pendingPaymentIntentId: "intent_x" as string | null,
    createdAt: past,
    ...over,
  });

  it("INCLUDES only a past-window, unpaid, pending, intent-bearing guest on a non-cancelled booking", () => {
    expect(isSweepableGuestOrphan(g(), ctx())).toBe(true);
  });

  it("EXCLUDES confirmed guests", () => {
    expect(isSweepableGuestOrphan(g({ status: "confirmed" }), ctx())).toBe(false);
  });

  it("EXCLUDES in-window pendings (possibly mid-checkout)", () => {
    expect(isSweepableGuestOrphan(g({ createdAt: recent }), ctx())).toBe(false);
  });

  it("EXCLUDES NULL-intent rows (initial-booking slots, not add-guest)", () => {
    expect(isSweepableGuestOrphan(g({ pendingPaymentIntentId: null }), ctx())).toBe(false);
  });

  it("EXCLUDES rows on a cancelled parent booking", () => {
    expect(isSweepableGuestOrphan(g(), ctx({ parentBookingStatus: "cancelled" }))).toBe(false);
  });

  it("EXCLUDES rows whose intent has a completed payment (paid-but-unreconciled guard)", () => {
    expect(isSweepableGuestOrphan(g(), ctx({ hasCompletedPayment: true }))).toBe(false);
  });

  it("EXCLUDES primary slots", () => {
    expect(isSweepableGuestOrphan(g({ isPrimary: true }), ctx())).toBe(false);
  });
});
