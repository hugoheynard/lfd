import {
  InvalidAppliedVoucherAmountError,
  LoyaltyVoucherExpiredError,
  LoyaltyVoucherLapsedForUseError,
  LoyaltyVoucherNotAvailableError,
  LoyaltyVoucherNotReservedError,
  LoyaltyVoucherNotUsableError,
  LoyaltyVoucherReservedError,
} from "../../errors/loyalty-errors.js";
import { LoyaltyHolder } from "../../value-objects/loyalty-holder.js";
import { LoyaltyReason } from "../../value-objects/loyalty-reason.js";
import { LoyaltySettings } from "../../value-objects/loyalty-settings.js";
import { LoyaltyVoucher } from "../loyalty-voucher.js";

// Les instants ne sont comparés qu'entre eux : aucune horloge murale n'est lue.
const ISSUED = new Date("2026-01-10T09:00:00.000Z");
const DAY = 86_400_000;
const REASON = LoyaltyReason.of("demande du client");

function issue(validityDays = 365): LoyaltyVoucher {
  return LoyaltyVoucher.issue({
    id: "v1",
    holder: LoyaltyHolder.of("user", "u1"),
    steps: 2,
    settings: LoyaltySettings.of({
      pointsPerStep: 1_000,
      stepValueCents: 500,
      openToPublic: true,
      openToPro: false,
      voucherValidityDays: validityDays,
    }),
    issuedAt: ISSUED,
  });
}

describe("LoyaltyVoucher — émission", () => {
  it("fige le montant, le coût, le ratio et la date limite", () => {
    const voucher = issue();
    expect(voucher.toPersistence()).toMatchObject({
      valueCents: 1_000,
      pointsCost: 2_000,
      ratioPointsPerStep: 1_000,
      ratioStepValueCents: 500,
      status: "available",
      expiresAt: new Date(ISSUED.getTime() + 365 * DAY),
      userId: "u1",
      companyId: null,
    });
  });

  it("se relit à l'identique", () => {
    const voucher = issue();
    expect(LoyaltyVoucher.reconstitute(voucher.toPersistence()).toPersistence()).toEqual(
      voucher.toPersistence(),
    );
  });
});

describe("LoyaltyVoucher — l'expiration se lit à l'horloge", () => {
  it("est disponible la veille de sa date limite, expiré à l'instant même", () => {
    const voucher = issue(1);
    expect(voucher.statusAt(new Date(ISSUED.getTime() + DAY - 1))).toBe("available");
    expect(voucher.statusAt(new Date(ISSUED.getTime() + DAY))).toBe("expired");
  });

  it("n'écrit l'expiration qu'une fois, et seulement passé la date", () => {
    const voucher = issue(1);
    expect(voucher.expire(ISSUED)).toBe(false);
    const after = new Date(ISSUED.getTime() + DAY);
    expect(voucher.expire(after)).toBe(true);
    expect(voucher.status).toBe("expired");
    expect(voucher.expire(after)).toBe(false);
  });
});

describe("LoyaltyVoucher — annulation par le staff", () => {
  it("passe un bon disponible à « annulé », daté, signé, motivé", () => {
    const voucher = issue();
    voucher.cancel(ISSUED, "staff_1", REASON);
    expect(voucher.toPersistence()).toMatchObject({
      status: "cancelled",
      cancelledAt: ISSUED,
      cancelledByStaffId: "staff_1",
      cancellationReason: "demande du client",
    });
  });

  it("ne s'annule pas deux fois", () => {
    const voucher = issue();
    voucher.cancel(ISSUED, "staff_1", REASON);
    expect(() => voucher.cancel(ISSUED, "staff_1", REASON)).toThrow(
      LoyaltyVoucherNotAvailableError,
    );
  });

  it("ne s'annule plus passé sa date limite, même avant d'être écrit expiré", () => {
    const voucher = issue(1);
    expect(() => voucher.cancel(new Date(ISSUED.getTime() + DAY), "staff_1", REASON)).toThrow(
      LoyaltyVoucherExpiredError,
    );
    expect(voucher.status).toBe("available");
  });
});

// ─── Lot C : le bon sur la commande (plan des points, D7, C3, C4, C5) ─────────

const BEFORE_EXPIRY = new Date(ISSUED.getTime() + DAY);
const AFTER_EXPIRY = new Date(ISSUED.getTime() + 400 * DAY);

function reserved(): LoyaltyVoucher {
  const voucher = issue();
  voucher.reserve(BEFORE_EXPIRY);
  return voucher;
}

describe("LoyaltyVoucher — la réservation", () => {
  it("engage un bon disponible", () => {
    expect(reserved().status).toBe("reserved");
  });

  it("refuse un bon déjà réservé : c'est la course perdue", () => {
    expect(() => reserved().reserve(BEFORE_EXPIRY)).toThrow(LoyaltyVoucherNotUsableError);
  });

  it("refuse un bon disponible mais échu", () => {
    expect(() => issue().reserve(AFTER_EXPIRY)).toThrow(LoyaltyVoucherLapsedForUseError);
  });

  it("refuse un bon annulé", () => {
    const voucher = issue();
    voucher.cancel(BEFORE_EXPIRY, "staff_1", REASON);
    expect(() => voucher.reserve(BEFORE_EXPIRY)).toThrow(LoyaltyVoucherNotUsableError);
  });

  it("un bon réservé n'expire pas, et ne s'annule pas par le staff", () => {
    const voucher = reserved();
    expect(voucher.statusAt(AFTER_EXPIRY)).toBe("reserved");
    expect(voucher.expire(AFTER_EXPIRY)).toBe(false);
    expect(() => voucher.cancel(BEFORE_EXPIRY, "staff_1", REASON)).toThrow(
      LoyaltyVoucherReservedError,
    );
  });
});

describe("LoyaltyVoucher — la libération", () => {
  it("revient disponible avant sa date limite", () => {
    const voucher = reserved();
    expect(voucher.release(BEFORE_EXPIRY)).toBe("available");
    expect(voucher.toPersistence()).toMatchObject({ status: "available", expiredAt: null });
  });

  it("passe directement à expiré après sa date limite", () => {
    const voucher = reserved();
    expect(voucher.release(AFTER_EXPIRY)).toBe("expired");
    expect(voucher.toPersistence()).toMatchObject({ status: "expired", expiredAt: AFTER_EXPIRY });
  });

  it("refuse de libérer un bon qui n'est pas engagé", () => {
    expect(() => issue().release(BEFORE_EXPIRY)).toThrow(LoyaltyVoucherNotReservedError);
  });
});

describe("LoyaltyVoucher — le reliquat", () => {
  it("rend un nouveau bon du reste : même titulaire, même date limite, aucun point", () => {
    const parent = reserved();
    const outcome = parent.leaveRemainder({ id: "v2", appliedCents: 400, at: BEFORE_EXPIRY });
    expect(outcome.kind).toBe("issued");
    if (outcome.kind !== "issued") {
      return;
    }
    expect(outcome.voucher.toPersistence()).toMatchObject({
      id: "v2",
      userId: "u1",
      valueCents: 600,
      pointsCost: 0,
      parentVoucherId: "v1",
      status: "available",
      issuedAt: BEFORE_EXPIRY,
      expiresAt: parent.expiresAt,
    });
  });

  it("ne rend rien quand tout a été imputé", () => {
    expect(reserved().leaveRemainder({ id: "v2", appliedCents: 1_000, at: BEFORE_EXPIRY })).toEqual(
      { kind: "none" },
    );
  });

  it("s'éteint si la date limite est passée à l'émission, en disant ce qui se perd", () => {
    expect(reserved().leaveRemainder({ id: "v2", appliedCents: 250, at: AFTER_EXPIRY })).toEqual({
      kind: "lapsed",
      remainderCents: 750,
    });
  });

  it("marque le bon soldé dans tous les cas, et un second solde ne refait rien", () => {
    for (const [appliedCents, at] of [
      [400, BEFORE_EXPIRY],
      [1_000, BEFORE_EXPIRY],
      [250, AFTER_EXPIRY],
    ] as const) {
      const parent = reserved();
      parent.leaveRemainder({ id: "v2", appliedCents, at });
      expect(parent.toPersistence().remainderSettledAt).toEqual(at);
      expect(parent.leaveRemainder({ id: "v3", appliedCents, at })).toEqual({ kind: "settled" });
    }
  });

  it.each([-1, 1_001, 2.5])("refuse un montant imputé de %p", (appliedCents) => {
    expect(() => reserved().leaveRemainder({ id: "v2", appliedCents, at: BEFORE_EXPIRY })).toThrow(
      InvalidAppliedVoucherAmountError,
    );
  });

  it("refuse de solder un bon qui n'est pas engagé", () => {
    expect(() => issue().leaveRemainder({ id: "v2", appliedCents: 0, at: BEFORE_EXPIRY })).toThrow(
      LoyaltyVoucherNotReservedError,
    );
  });
});
