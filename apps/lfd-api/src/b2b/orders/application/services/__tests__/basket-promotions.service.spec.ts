import {
  FixedBasketPromotions,
  FixedCompanyStatuses,
  FixedPrincipals,
} from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { PromotionAudienceFactsResolver } from "../../../../promotions/application/promotion-audience-facts.resolver.js";
import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import { BasketPromotionReader } from "../../../../promotions/domain/ports/basket-promotion.reader.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { TechnicalError } from "../../../../../platform/shared/errors/app-error.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import type { BasketPromotionOutcome } from "../../../domain/services/basket-promotion-choice.js";
import { BasketPromotions, type BasketPromotionRequest } from "../basket-promotions.service.js";

/**
 * **Le point panier** (plan des promotions, § 13.5 et § 13.11, lots L5 et
 * L12) : la promotion panier du point retenu. Les cas `legacy` et `shadow`
 * sont retirés avec l'ancien chemin (L12) ; l'échec d'une lecture, qu'avalait
 * l'ombre, remonte désormais.
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

/** Ce que la reprise de la remise du site rend : 20 % de 10 €. */
const EXPECTED: Omit<BasketPromotionOutcome, "promotionId" | "label" | "applied"> = {
  discountCents: 200,
  discountAdjustment: { mode: "percent", bp: 2000 },
  ineligibleSkus: new Set(),
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

function subject(reader: BasketPromotionReader = new FixedBasketPromotions([REPRISE])) {
  const service = new BasketPromotions(
    reader,
    new PromotionAudienceFactsResolver(new FixedCompanyStatuses(), new FixedPrincipals()),
    new FixedLineClassifications({}),
    new FixedClock(NOW),
  );
  return { service };
}

describe("BasketPromotions.resolve", () => {
  it("rend la promotion du point, de la forme de `ResolvedPickup`", async () => {
    const { service } = subject();

    const served = await service.resolve(REQUEST);

    expect(served).toEqual({
      ...EXPECTED,
      promotionId: "pd_pk_coeur_b2c",
      // Le libellé figé : le commun, aucune audience n'ayant le sien (L8b).
      label: { fr: "−20 % sur tout", en: "−20 % sur tout", it: "−20 % sur tout" },
      // La remise unique, seule de la liste (M7).
      applied: [
        {
          promotionId: "pd_pk_coeur_b2c",
          adjustment: EXPECTED.discountAdjustment,
          label: { fr: "−20 % sur tout", en: "−20 % sur tout", it: "−20 % sur tout" },
          ineligibleSkus: new Set(),
          discountCents: 200,
        },
      ],
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
    const { service } = subject(new FixedBasketPromotions([both]));
    const registered = await service.resolve({
      ...REQUEST,
      buyer: { ...REQUEST.buyer, buyerKind: "registered" },
    });
    const pro = await service.resolve({
      ...REQUEST,
      buyer: { ...REQUEST.buyer, companyId: "co_1", companyStatus: "active" },
    });
    const guest = await service.resolve(REQUEST);

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

  it("rien pour un autre point", async () => {
    const { service } = subject();

    const served = await service.resolve({
      ...REQUEST,
      buyer: { ...REQUEST.buyer, fulfillment: { method: "pickup", pickupId: "pk_autre" } },
    });

    expect(served.discountCents).toBe(0);
    expect(served.promotionId).toBeNull();
  });

  it("rien pour un pro actif : la reprise vise « tous sauf les pros actifs »", async () => {
    const { service } = subject();
    const pros = {
      ...REQUEST,
      buyer: { ...REQUEST.buyer, companyId: "co_1", companyStatus: "active" as const },
    };

    const served = await service.resolve(pros);

    expect(served.discountCents).toBe(0);
    expect(served.promotionId).toBeNull();
  });

  /** L12 : l'ombre avalait cet échec ; sans ancien chemin, il n'y a rien à servir à la place. */
  it("une promotion illisible fait remonter l'erreur, sans remise inventée", async () => {
    const { service } = subject(new FailingBasketPromotions());

    await expect(service.resolve(REQUEST)).rejects.toThrow(
      "La promotion pd_x est illisible en base.",
    );
  });
});

describe("BasketPromotions.resolve — retrait, point, livraison", () => {
  const ANY_BUYER = { companyId: null, companyStatus: null, buyerKind: "registered" } as const;
  const atPoint = (pickupId: string) => ({
    ...REQUEST,
    buyer: { ...ANY_BUYER, fulfillment: { method: "pickup" as const, pickupId } },
  });
  const delivering = {
    ...REQUEST,
    buyer: { ...ANY_BUYER, fulfillment: { method: "delivery" as const, pickupId: null } },
  };
  const pickupPromo = (over: Parameters<typeof livePromotion>[0]) =>
    livePromotion({ validFrom: FROM, ...over });

  it("une promotion « en retrait » vaut à tout point, jamais à la livraison", async () => {
    const { service } = subject(
      new FixedBasketPromotions([pickupPromo({ id: "retrait", fulfillment: { kind: "pickup" } })]),
    );

    expect((await service.resolve(atPoint("pk_a"))).promotionId).toBe("retrait");
    expect((await service.resolve(atPoint("pk_b"))).promotionId).toBe("retrait");
    expect((await service.resolve(delivering)).promotionId).toBeNull();
  });

  it("une promotion « en livraison » ne vaut pas au retrait", async () => {
    const { service } = subject(
      new FixedBasketPromotions([pickupPromo({ id: "livr", fulfillment: { kind: "delivery" } })]),
    );

    expect((await service.resolve(delivering)).promotionId).toBe("livr");
    expect((await service.resolve(atPoint("pk_a"))).promotionId).toBeNull();
  });

  // Le point précis bat « le retrait » même moins généreux — et seulement à SON point.
  it("le point précis bat « le retrait », et seulement à son point", async () => {
    const { service } = subject(
      new FixedBasketPromotions([
        pickupPromo({ id: "a_retrait", fulfillment: { kind: "pickup" } }),
        pickupPromo({
          id: "z_point",
          fulfillment: { kind: "pickup_point", pickupId: "pk_a" },
          effect: { kind: "percent_off", basisPoints: 100 },
        }),
      ]),
    );

    expect((await service.resolve(atPoint("pk_a"))).promotionId).toBe("z_point");
    expect((await service.resolve(atPoint("pk_b"))).promotionId).toBe("a_retrait");
  });

  it("invité et inscrit : un public « inscrits » ne remise que l'inscrit", async () => {
    const { service } = subject(
      new FixedBasketPromotions([
        pickupPromo({
          id: "inscrits",
          audience: { kind: "individuals_registered" },
          fulfillment: { kind: "pickup" },
        }),
      ]),
    );
    const as = (buyerKind: "guest" | "registered") => ({
      ...REQUEST,
      buyer: { ...REQUEST.buyer, buyerKind },
    });

    expect((await service.resolve(as("registered"))).discountCents).toBe(200);
    const guest = await service.resolve(as("guest"));
    expect(guest.discountCents).toBe(0);
    expect(guest.promotionId).toBeNull();
  });

  it("un public « invités » ne remise que l'invité", async () => {
    const { service } = subject(
      new FixedBasketPromotions([
        pickupPromo({
          id: "invites",
          audience: { kind: "individuals_guest" },
          fulfillment: { kind: "pickup" },
        }),
      ]),
    );

    expect((await service.resolve(REQUEST)).promotionId).toBe("invites");
    expect(
      (
        await service.resolve({
          ...REQUEST,
          buyer: { ...REQUEST.buyer, buyerKind: "registered" },
        })
      ).promotionId,
    ).toBeNull();
  });

  // La fenêtre se juge à l'instant du `Clock` : début inclus, fin exclue.
  it.each<[string, Date | null, Date, boolean]>([
    ["début = maintenant (inclus)", null, NOW, true],
    ["début = une ms après", null, new Date(NOW.getTime() + 1), false],
    ["fin = maintenant (exclue)", FROM, NOW, false],
    ["fin = une ms après", FROM, new Date(NOW.getTime() + 1), true],
  ])("fenêtre : %s", async (_label, from, edge, applies) => {
    const promo =
      from === null
        ? pickupPromo({ id: "w", validFrom: edge, fulfillment: { kind: "pickup" } })
        : pickupPromo({ id: "w", validFrom: from, validTo: edge, fulfillment: { kind: "pickup" } });
    const { service } = subject(new FixedBasketPromotions([promo]));

    expect((await service.resolve(REQUEST)).promotionId).toBe(applies ? "w" : null);
  });

  it("une promotion en pause depuis maintenant ne remise plus", async () => {
    const { service } = subject(
      new FixedBasketPromotions([
        pickupPromo({ id: "p", fulfillment: { kind: "pickup" }, suspendedFrom: NOW }),
      ]),
    );

    expect((await service.resolve(REQUEST)).promotionId).toBeNull();
  });

  // Le rangement du catalogue n'est lu que si une portée l'exige ; fourni par
  // la passation (`known`), il n'est pas relu.
  it("ne lit le catalogue que pour une portée à règles, et jamais s'il est fourni", async () => {
    const classes = new FixedLineClassifications({});
    const scoped = pickupPromo({
      id: "scoped",
      fulfillment: { kind: "pickup" },
      scope: {
        mode: "only",
        rules: [{ target: "category", targetId: "c_pains", eligible: true, targetRank: null }],
      },
    });
    const plain = pickupPromo({ id: "plain", fulfillment: { kind: "pickup" } });
    const build = (promotions: readonly LivePromotion[]) =>
      new BasketPromotions(
        new FixedBasketPromotions(promotions),
        new PromotionAudienceFactsResolver(new FixedCompanyStatuses(), new FixedPrincipals()),
        classes,
        new FixedClock(NOW),
      );

    await build([plain]).resolve(REQUEST);
    expect(classes.asked).toEqual([]);
    await build([scoped]).resolve({ ...REQUEST, known: new Map() });
    expect(classes.asked).toEqual([]);
    await build([scoped]).resolve(REQUEST);
    expect(classes.asked).toEqual([["PAI-001"]]);
  });
});
