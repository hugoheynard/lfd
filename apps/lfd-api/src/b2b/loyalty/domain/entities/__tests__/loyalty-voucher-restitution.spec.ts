import {
  LoyaltyVoucherNotLapsableError,
  LoyaltyVoucherNotMergeableError,
  LoyaltyVoucherRemainderSettledError,
} from "../../errors/voucher-restitution-errors.js";
import { LoyaltyHolder } from "../../value-objects/loyalty-holder.js";
import { LoyaltyReason } from "../../value-objects/loyalty-reason.js";
import { LoyaltySettings } from "../../value-objects/loyalty-settings.js";
import { LoyaltyVoucher } from "../loyalty-voucher.js";

/**
 * La restitution sur l'agrégat (doc `documentation/commandes/annulation/annulation-par-le-staff.md`,
 * C3b.4) : `reinstate`, `mergeBackInto`, `lapse`, et `release` resserré.
 */

// Les instants ne sont comparés qu'entre eux et à la date limite du bon.
const ISSUED = new Date("2026-01-10T09:00:00.000Z");
const DAY = 86_400_000;
const LIMIT = new Date(ISSUED.getTime() + 30 * DAY);
const BEFORE = new Date(ISSUED.getTime() + DAY);

/** `v1` (1 000) engagé, rechargé tel que la base le rend. */
function reservedParent(): LoyaltyVoucher {
  const voucher = LoyaltyVoucher.issue({
    id: "v1",
    holder: LoyaltyHolder.of("user", "u1"),
    steps: 2,
    settings: LoyaltySettings.of({
      pointsPerStep: 1_000,
      stepValueCents: 500,
      openToPublic: true,
      openToPro: false,
      voucherValidityDays: 30,
    }),
    issuedAt: ISSUED,
  });
  voucher.reserve(BEFORE);
  return LoyaltyVoucher.reconstitute(voucher.toPersistence());
}

/** Le parent soldé, et son reliquat de 600 — rechargés. */
function settled(): { parent: LoyaltyVoucher; child: LoyaltyVoucher } {
  const parent = reservedParent();
  const outcome = parent.leaveRemainder({ id: "r1", appliedCents: 400, at: BEFORE });
  if (outcome.kind !== "issued") {
    throw new TypeError("un reliquat aurait dû naître");
  }
  return {
    parent: LoyaltyVoucher.reconstitute(parent.toPersistence()),
    child: LoyaltyVoucher.reconstitute(outcome.voucher.toPersistence()),
  };
}

const reinstate = (parent: LoyaltyVoucher, remainder: LoyaltyVoucher | null, at = BEFORE) =>
  parent.reinstate({ remainder, at, orderId: "o1", engagedElsewhere: false });

describe("LoyaltyVoucher.reinstate", () => {
  it("cas 1 : rendu, aucun point dans l'affaire", () => {
    const parent = reservedParent();
    expect(reinstate(parent, null)).toEqual({ kind: "returned" });
    expect(parent.toPersistence()).toMatchObject({ status: "available", pointsCost: 2_000 });
  });

  it("cas 2 : soldé sans reliquat → rendu, marque effacée", () => {
    const parent = reservedParent();
    parent.leaveRemainder({ id: "r1", appliedCents: 1_000, at: BEFORE });
    reinstate(parent, null);
    expect(parent.toPersistence()).toMatchObject({ status: "available", remainderSettledAt: null });
  });

  it("cas 3 : le reliquat est refondu, le parent retrouve valeur et date", () => {
    const { parent, child } = settled();
    expect(reinstate(parent, child).kind).toBe("merged");
    expect(child.toPersistence()).toMatchObject({
      status: "merged_back",
      mergedBackAt: BEFORE,
      mergedBackOrderId: "o1",
      valueCents: 600,
      pointsCost: 0,
      parentVoucherId: "v1",
    });
    expect(parent.toPersistence()).toMatchObject({
      status: "available",
      remainderSettledAt: null,
      valueCents: 1_000,
      expiresAt: LIMIT,
    });
  });

  it("après refusion, réengager le parent laisse un NOUVEAU reliquat", () => {
    const { parent, child } = settled();
    reinstate(parent, child);
    parent.reserve(BEFORE);
    const again = parent.leaveRemainder({ id: "r2", appliedCents: 100, at: BEFORE });
    expect(again.kind).toBe("issued");
  });

  it("cas 4 : échu → parent expiré, reliquat disponible expiré avec lui, rien rendu", () => {
    const { parent, child } = settled();
    expect(reinstate(parent, child, LIMIT)).toMatchObject({
      kind: "lapsed",
      remainderExpired: true,
    });
    expect(parent.toPersistence()).toMatchObject({ status: "expired", expiredAt: LIMIT });
    expect(child.status).toBe("expired");
  });

  it("cas 5 et 6 : refus rendus, rien ne bouge", () => {
    const { parent, child } = settled();
    child.reserve(BEFORE);
    expect(reinstate(parent, child)).toMatchObject({ kind: "blocked", cause: "remainder_engaged" });
    expect(parent.status).toBe("reserved");

    const other = settled();
    other.child.cancel(BEFORE, "staff", LoyaltyReason.of("erreur"));
    expect(reinstate(other.parent, other.child)).toMatchObject({
      kind: "blocked",
      cause: "remainder_cancelled",
    });
    expect(other.parent.status).toBe("reserved");
  });

  it("rejoué : already, sans mutation", () => {
    const { parent, child } = settled();
    reinstate(parent, child);
    const before = parent.toPersistence();
    expect(reinstate(parent, null)).toEqual({ kind: "already" });
    expect(parent.toPersistence()).toEqual(before);
  });

  it("refuse le reliquat d'un autre bon", () => {
    const { parent } = settled();
    const stranger = settled().child;
    const foreign = LoyaltyVoucher.reconstitute({
      ...stranger.toPersistence(),
      parentVoucherId: "v9",
    });
    expect(() => reinstate(parent, foreign)).toThrow(LoyaltyVoucherNotMergeableError);
  });
});

describe("LoyaltyVoucher.mergeBackInto", () => {
  it("refuse un reliquat échu, engagé ou annulé", () => {
    const echu = settled();
    expect(() => echu.child.mergeBackInto(echu.parent, LIMIT, "o1")).toThrow(
      LoyaltyVoucherNotMergeableError,
    );
    const engaged = settled();
    engaged.child.reserve(BEFORE);
    expect(() => engaged.child.mergeBackInto(engaged.parent, BEFORE, "o1")).toThrow(
      LoyaltyVoucherNotMergeableError,
    );
    const cancelled = settled();
    cancelled.child.cancel(BEFORE, "staff", LoyaltyReason.of("erreur"));
    expect(() => cancelled.child.mergeBackInto(cancelled.parent, BEFORE, "o1")).toThrow(
      LoyaltyVoucherNotMergeableError,
    );
  });
});

describe("LoyaltyVoucher.lapse", () => {
  it("refuse un bon non échu, ou non engagé", () => {
    expect(() => reservedParent().lapse(BEFORE)).toThrow(LoyaltyVoucherNotLapsableError);
    const { child } = settled();
    expect(() => child.lapse(LIMIT)).toThrow(LoyaltyVoucherNotLapsableError);
  });
});

describe("LoyaltyVoucher.release — resserré (C3b.4)", () => {
  it("refuse un bon dont le reliquat est soldé : la valeur serait doublée", () => {
    const { parent } = settled();
    expect(() => parent.release(BEFORE)).toThrow(LoyaltyVoucherRemainderSettledError);
  });
});

describe("persistedStatus — le statut chargé", () => {
  it("est celui de la base pour un bon rechargé, nul pour un bon neuf", () => {
    expect(reservedParent().persistedStatus).toBe("reserved");
    const parent = reservedParent();
    const outcome = parent.leaveRemainder({ id: "r1", appliedCents: 400, at: BEFORE });
    expect(outcome.kind === "issued" ? outcome.voucher.persistedStatus : "x").toBeNull();
  });
});
