import {
  LoyaltyVoucherExpiredError,
  LoyaltyVoucherNotAvailableError,
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
