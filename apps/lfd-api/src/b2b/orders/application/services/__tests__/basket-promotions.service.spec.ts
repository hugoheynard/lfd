import {
  FixedBasketPromotions,
  FixedCompanyStatuses,
  FixedPrincipals,
  FixedPromotionsSource,
  RecordingShadowJournal,
} from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { PromotionAudienceFactsResolver } from "../../../../promotions/application/promotion-audience-facts.resolver.js";
import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import { BasketPromotionReader } from "../../../../promotions/domain/ports/basket-promotion.reader.js";
import type { PromotionsSource } from "../../../../promotions/domain/promotions-source.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { TechnicalError } from "../../../../../platform/shared/errors/app-error.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import type { BasketPromotionOutcome } from "../../../domain/services/basket-promotion-choice.js";
import { BasketPromotions, type BasketPromotionRequest } from "../basket-promotions.service.js";

/**
 * **Le point panier et sa source** (plan des promotions, § 13.5 et § 13.11,
 * lot L5) : `legacy` sert la remise du site sans rien lire, `promotions` sert
 * la promotion panier, l'ombre sert l'ancien et consigne tout écart.
 */

const NOW = new Date("2026-11-15T10:00:00.000Z");
const FROM = new Date("2026-11-01T00:00:00.000Z");

const REQUEST: BasketPromotionRequest = {
  lines: [{ sku: "PAI-001", htCents: 1_000, quantity: 2 }],
  buyer: {
    companyId: null,
    companyStatus: null,
    buyerKind: "guest",
    fulfillment: { method: "pickup", pickupId: "pk_coeur" },
  },
  known: null,
};

/** La remise du site, telle que l'ancien chemin l'a calculée : 20 % de 10 €. */
const LEGACY: BasketPromotionOutcome = {
  discountCents: 200,
  discountAdjustment: { mode: "percent", bp: 2000 },
  ineligibleSkus: new Set(),
  promotionId: null,
  label: null,
};

const REPRISE = livePromotion({
  id: "pd_pk_coeur_b2c",
  validFrom: FROM,
  audience: { kind: "everyone_but_active_pros" },
  fulfillment: { kind: "pickup_point", pickupId: "pk_coeur" },
});

class FailingBasketPromotions extends BasketPromotionReader {
  live(): Promise<readonly LivePromotion[]> {
    return Promise.reject(new UnreadableInTest());
  }

  liveAt(): Promise<readonly LivePromotion[]> {
    return Promise.reject(new UnreadableInTest());
  }
}

class UnreadableInTest extends TechnicalError {
  constructor() {
    super("promotions.unreadable_row", "La promotion pd_x est illisible en base.");
  }
}

function subject(
  source: PromotionsSource,
  reader: BasketPromotionReader = new FixedBasketPromotions([REPRISE]),
) {
  const journal = new RecordingShadowJournal();
  const service = new BasketPromotions(
    new FixedPromotionsSource(source),
    reader,
    new PromotionAudienceFactsResolver(new FixedCompanyStatuses(), new FixedPrincipals()),
    new FixedLineClassifications({}),
    journal,
    new FixedClock(NOW),
  );
  return { service, journal };
}

describe("BasketPromotions.served", () => {
  it("sous `legacy`, rend la remise du site sans lire une promotion", async () => {
    const reader = new FixedBasketPromotions([REPRISE]);
    const { service, journal } = subject("legacy", reader);

    await expect(service.served(LEGACY, REQUEST)).resolves.toBe(LEGACY);
    expect(reader.reads).toBe(0);
    expect(journal.entries).toEqual([]);
  });

  it("sous `promotions`, rend la promotion du point, de la forme de `ResolvedPickup`", async () => {
    const { service } = subject("promotions");

    const served = await service.served(LEGACY, REQUEST);

    expect(served).toEqual({
      ...LEGACY,
      promotionId: "pd_pk_coeur_b2c",
      // Le libellé figé : le commun, aucune audience n'ayant le sien (L8b).
      label: { fr: "−20 % sur tout", en: "−20 % sur tout", it: "−20 % sur tout" },
    });
  });

  it("un public à deux cibles sert à chacun la même remise et le libellé de son audience (L8b)", async () => {
    const both = livePromotion({
      id: "p_both",
      validFrom: FROM,
      audiences: [{ kind: "individuals_registered" }, { kind: "pros" }],
      audienceLabels: {
        individuals: { fr: "Merci d'être inscrit", en: "Thanks for joining", it: null },
        pros: { fr: "Offre pro", en: null, it: null },
      },
      fulfillment: { kind: "pickup_point", pickupId: "pk_coeur" },
    });
    const { service } = subject("promotions", new FixedBasketPromotions([both]));
    const registered = await service.served(LEGACY, {
      ...REQUEST,
      buyer: { ...REQUEST.buyer, buyerKind: "registered" },
    });
    const pro = await service.served(LEGACY, {
      ...REQUEST,
      buyer: { ...REQUEST.buyer, companyId: "co_1", companyStatus: "active" },
    });
    const guest = await service.served(LEGACY, REQUEST);

    expect(registered.discountCents).toBe(200);
    expect(pro.discountCents).toBe(200);
    expect(registered.label).toEqual({
      fr: "Merci d'être inscrit",
      en: "Thanks for joining",
      it: "Merci d'être inscrit",
    });
    expect(pro.label).toEqual({ fr: "Offre pro", en: "Offre pro", it: "Offre pro" });
    expect(guest.promotionId).toBeNull();
  });

  it("sous `promotions`, rien pour un autre point", async () => {
    const { service } = subject("promotions");

    const served = await service.served(LEGACY, {
      ...REQUEST,
      buyer: { ...REQUEST.buyer, fulfillment: { method: "pickup", pickupId: "pk_autre" } },
    });

    expect(served.discountCents).toBe(0);
    expect(served.promotionId).toBeNull();
  });

  it("à l'ombre, sert l'ancien et ne consigne rien quand les deux s'accordent", async () => {
    const { service, journal } = subject("shadow");

    await expect(service.served(LEGACY, REQUEST)).resolves.toBe(LEGACY);
    expect(journal.entries).toEqual([]);
  });

  it("à l'ombre, sert l'ancien et consigne l'écart de montant", async () => {
    const { service, journal } = subject("shadow");
    const pros = {
      ...REQUEST,
      buyer: { ...REQUEST.buyer, companyId: "co_1", companyStatus: "active" as const },
    };

    await expect(service.served(LEGACY, pros)).resolves.toBe(LEGACY);
    expect(journal.entries).toEqual([
      {
        point: "basket",
        pickupId: "pk_coeur",
        servedCents: 200,
        shadowCents: 0,
        shadowPromotionId: null,
      },
    ]);
  });

  it("à l'ombre, un échec du nouveau chemin est consigné et ne fait pas tomber la commande", async () => {
    const { service, journal } = subject("shadow", new FailingBasketPromotions());

    await expect(service.served(LEGACY, REQUEST)).resolves.toBe(LEGACY);
    expect(journal.entries).toEqual([
      {
        point: "failure",
        code: "promotions.unreadable_row",
        message: "La promotion pd_x est illisible en base.",
      },
    ]);
  });
});
