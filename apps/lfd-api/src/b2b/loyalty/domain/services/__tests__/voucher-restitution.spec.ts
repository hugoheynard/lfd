import { voucherRestitutionOf, type RestitutionVoucher } from "../voucher-restitution.js";

/**
 * La règle de la restitution (doc `documentation/commandes/annulation/annulation-par-le-staff.md`,
 * C3b.3), pure : le bon de la commande, son reliquat non refondu, l'instant.
 */

// Les instants ne sont comparés qu'entre eux et à la date limite.
const LIMIT = new Date("2026-03-01T00:00:00.000Z");
const BEFORE = new Date(LIMIT.getTime() - 1);

const voucher = (status: RestitutionVoucher["status"]): RestitutionVoucher => ({
  status,
  expiresAt: LIMIT,
});
const of = (
  parent: RestitutionVoucher,
  remainder: RestitutionVoucher | null,
  now = BEFORE,
  engagedElsewhere = false,
) => voucherRestitutionOf({ parent, remainder, now, engagedElsewhere }).kind;

describe("voucherRestitutionOf — les six issues", () => {
  it("cas 1 et 2 : parent engagé, sans reliquat, avant la date → rendu", () => {
    expect(of(voucher("reserved"), null)).toBe("returned");
  });

  it("cas 3 : reliquat disponible → refondu", () => {
    expect(of(voucher("reserved"), voucher("available"))).toBe("merged");
  });

  it("cas 4 : la date limite atteinte → échu, à l'instant exact compris", () => {
    expect(of(voucher("reserved"), null, LIMIT)).toBe("lapsed");
    expect(of(voucher("reserved"), voucher("available"), LIMIT)).toBe("lapsed");
    expect(of(voucher("reserved"), voucher("reserved"), LIMIT)).toBe("lapsed");
  });

  it("cas 5 : reliquat engagé → refus", () => {
    expect(
      voucherRestitutionOf({
        parent: voucher("reserved"),
        remainder: voucher("reserved"),
        now: BEFORE,
        engagedElsewhere: false,
      }),
    ).toMatchObject({ kind: "blocked", cause: "remainder_engaged" });
  });

  it("cas 6 : reliquat annulé par l'équipe → refus", () => {
    expect(
      voucherRestitutionOf({
        parent: voucher("reserved"),
        remainder: voucher("cancelled"),
        now: BEFORE,
        engagedElsewhere: false,
      }),
    ).toMatchObject({ kind: "blocked", cause: "remainder_cancelled" });
  });
});

describe("voucherRestitutionOf — idempotence", () => {
  it.each(["available", "expired", "cancelled"] as const)(
    "parent %s : rejeu → already",
    (status) => {
      expect(of(voucher(status), null)).toBe("already");
    },
  );

  it("parent engagé par une autre commande → already", () => {
    expect(of(voucher("reserved"), null, BEFORE, true)).toBe("already");
  });
});
