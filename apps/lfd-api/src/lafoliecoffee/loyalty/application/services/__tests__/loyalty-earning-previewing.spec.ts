import type { LoyaltyEarningBasis } from "../../../../orders/domain/ports/loyalty-earning-preview.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedLoyaltySettings, OPEN_TO_PUBLIC } from "../../commands/__tests__/loyalty-doubles.js";
import { LoyaltyEarningPreviewing } from "../loyalty-earning-previewing.js";

const NOW = new Date(10_000);
const clock = () => new FixedClock(NOW);

const BASIS: LoyaltyEarningBasis = {
  buyerUserId: "u1",
  subtotalCents: 2_340,
  discountCents: 0,
  voucherDiscountCents: 0,
};

describe("LoyaltyEarningPreviewing — « vous gagnerez N points »", () => {
  it("annonce un point par centime HT, comme le crédit", async () => {
    const preview = new LoyaltyEarningPreviewing(new FixedLoyaltySettings(OPEN_TO_PUBLIC), clock());
    await expect(preview.pointsToEarn(BASIS)).resolves.toBe(2_340);
  });

  it("retranche la remise et le bon de l'assiette, comme le crédit (plan C6)", async () => {
    const preview = new LoyaltyEarningPreviewing(new FixedLoyaltySettings(OPEN_TO_PUBLIC), clock());
    await expect(
      preview.pointsToEarn({ ...BASIS, discountCents: 340, voucherDiscountCents: 500 }),
    ).resolves.toBe(1_500);
  });

  it("n'annonce rien quand l'assiette est vide", async () => {
    const preview = new LoyaltyEarningPreviewing(new FixedLoyaltySettings(OPEN_TO_PUBLIC), clock());
    await expect(preview.pointsToEarn({ ...BASIS, voucherDiscountCents: 2_340 })).resolves.toBe(
      null,
    );
  });

  it("n'annonce rien sans réglage, ni quand le public est fermé", async () => {
    await expect(
      new LoyaltyEarningPreviewing(new FixedLoyaltySettings(null), clock()).pointsToEarn(BASIS),
    ).resolves.toBeNull();
    await expect(
      new LoyaltyEarningPreviewing(
        new FixedLoyaltySettings({ ...OPEN_TO_PUBLIC, openToPublic: false }),
        clock(),
      ).pointsToEarn(BASIS),
    ).resolves.toBeNull();
  });

  /**
   * R4 ne doit jamais éteindre l'annonce d'un panier : il n'est pas encore
   * passé, il l'est donc « maintenant » — après toute ouverture déjà posée.
   */
  it("compte le panier comme passé maintenant, après l'ouverture au public", async () => {
    const opened = new FixedLoyaltySettings(OPEN_TO_PUBLIC, {
      publicOpenedAt: NOW,
      welcomeBonusSince: null,
    });
    await expect(new LoyaltyEarningPreviewing(opened, clock()).pointsToEarn(BASIS)).resolves.toBe(
      2_340,
    );
  });
});
