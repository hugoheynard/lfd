import {
  CUSTOMER_REFUSAL_PHRASES,
  customerRefusalOf,
  tooLatePhraseOf,
} from "../customer-cancellation-refusal.js";
import { guestLinkExpiresAt, guestLinkIsLive } from "../guest-cancellation-link.js";

describe("les refus de la règle staff, dits à un client (C6.7)", () => {
  it.each([
    [{ kind: "already_cancelled", at: null } as const, "already_cancelled"],
    [{ kind: "ready" } as const, "ready"],
    [{ kind: "fulfilled" } as const, "fulfilled"],
    [{ kind: "inscribed", day: "2030-01-15" } as const, "in_preparation"],
    [{ kind: "paid_just_now" } as const, "paid_just_now"],
    [{ kind: "refund_in_flight", amountCents: 500 } as const, "payment_in_progress"],
    [{ kind: "voucher_remainder_cancelled", remainderValueCents: 100 } as const, "voucher_reused"],
  ])("%o → %s", (block, refusal) => {
    expect(customerRefusalOf(block)).toBe(refusal);
  });

  it("tait l'autre commande d'un reliquat déjà engagé", () => {
    const refusal = customerRefusalOf({
      kind: "voucher_remainder_engaged",
      remainderValueCents: 100,
      order: { id: "ord_2", number: "CMD-0002" },
      otherCancellable: true,
    });
    expect(refusal).toBe("voucher_reused");
    expect(CUSTOMER_REFUSAL_PHRASES.voucher_reused).not.toContain("CMD-0002");
  });

  it("ne dit pas qu'un brouillon existe : l'appelant répond 404", () => {
    expect(customerRefusalOf({ kind: "draft" })).toBeNull();
  });

  it("aucune phrase client ne nomme le fournil", () => {
    for (const phrase of Object.values(CUSTOMER_REFUSAL_PHRASES)) {
      expect(phrase.toLowerCase()).not.toContain("fournil");
    }
  });

  it("« trop tard » dit jusqu'à quand, en heure de Paris", () => {
    expect(tooLatePhraseOf(new Date("2030-01-14T07:30:00.000Z"))).toContain(
      "jusqu'au 14/01 à 08:30",
    );
  });
});

describe("la borne du lien d'invité (C6.4, Q-C6.9)", () => {
  const placedAt = new Date("2030-01-10T10:00:00.000Z");

  it("vit 90 jours après la date de retrait, jusqu'à minuit de Paris", () => {
    const expiry = guestLinkExpiresAt("2030-01-15", placedAt);
    expect(expiry).toEqual(new Date("2030-04-14T22:00:00.000Z"));
    expect(guestLinkIsLive("2030-01-15", placedAt, expiry)).toBe(true);
    expect(guestLinkIsLive("2030-01-15", placedAt, new Date(expiry.getTime() + 1))).toBe(false);
  });

  it("compte depuis la passation sans date", () => {
    expect(guestLinkExpiresAt(null, placedAt)).toEqual(new Date("2030-04-10T10:00:00.000Z"));
  });
});
