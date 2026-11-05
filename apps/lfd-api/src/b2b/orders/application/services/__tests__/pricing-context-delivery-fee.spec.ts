import type { AdminDeliveryZoneView, DeliveryPricingTerms } from "@lfd/contracts";

import { NO_OVERRIDES } from "../../../../delivery-zones/application/__tests__/delivery-zone-fee.doubles.js";
import type { OrderContent } from "../order-content.js";
import { loadedOrRefused, type PricingRequest } from "../pricing-context.service.js";
import { LABO, pricingContextOf, ZONE } from "./pricing-context.doubles.js";

/**
 * **Le frais de livraison résolu par audience** au chargement du chiffrage
 * (plan `documentation/promotions/plan-livraison-offerte.md`, 0b) : zone >
 * global > ancien frais, avec la clientèle que le SERVEUR attribue — le
 * statut de la société à la passation (pending = pro), la clientèle figée en
 * révision. Le chargement ne chiffre rien : il rend le barème, que
 * `priceBasket` est seul à appliquer.
 */

const CONTENT: OrderContent = {
  fulfillmentMethod: "delivery",
  deliveryAddress: { ...LABO, label: "" },
  deliveryAddressId: null,
  pickupAddressId: null,
  requestedDeliveryDate: null,
  note: "",
  lines: [{ sku: "PAI-001", quantity: 2 }],
};

function request(over: Partial<PricingRequest> = {}): PricingRequest {
  return {
    content: CONTENT,
    parties: {
      companyId: null,
      placedByUserId: "user_1",
      placedByStaffId: null,
      buyerKind: "guest",
    },
    revised: null,
    caller: "checkout",
    vatMethod: "exact_ht",
    frozenDeliveryVatMode: null,
    frozenAudience: null,
    frozenDeliveryFee: null,
    ...over,
  };
}

const FOR_COMPANY: Partial<PricingRequest> = {
  parties: {
    companyId: "co_1",
    placedByUserId: "user_1",
    placedByStaffId: null,
    buyerKind: "registered",
  },
};

const PROS_FEE = { mode: "amount", cents: 500 } as const;
const INDIVIDUALS_FEE = { mode: "amount", cents: 1_200 } as const;

const GLOBAL: DeliveryPricingTerms = {
  b2b: { fee: PROS_FEE, freeDeliveryThresholdCents: null },
  b2c: { fee: INDIVIDUALS_FEE, freeDeliveryThresholdCents: null },
};

async function feeOf(
  setup: Parameters<typeof pricingContextOf>[0],
  over: Partial<PricingRequest> = {},
) {
  const { loader } = pricingContextOf(setup);
  const { context } = loadedOrRefused(await loader.load(request(over)));
  if (context.route.method !== "delivery") {
    throw new TypeError("une livraison était attendue");
  }
  return context.route.fee;
}

describe("PricingContext — le frais de livraison par audience (0b)", () => {
  /**
   * Régression attendue : sans réglage global ni remplacement, le barème est
   * EXACTEMENT l'ancien frais de la zone, pour un particulier comme pour un pro.
   */
  it("sans aucun réglage : l'ancien frais de la zone, quelle que soit la clientèle", async () => {
    await expect(feeOf({})).resolves.toEqual(ZONE.fee);
    await expect(feeOf({ companyStatus: "active" }, FOR_COMPANY)).resolves.toEqual(ZONE.fee);
  });

  it("le réglage global : un particulier paie le frais des particuliers, un pro celui des pros", async () => {
    await expect(feeOf({ deliveryPricing: GLOBAL })).resolves.toEqual(INDIVIDUALS_FEE);
    await expect(
      feeOf({ deliveryPricing: GLOBAL, companyStatus: "active" }, FOR_COMPANY),
    ).resolves.toEqual(PROS_FEE);
  });

  it("une société en cours d'inscription paie le frais des pros", async () => {
    await expect(
      feeOf({ deliveryPricing: GLOBAL, companyStatus: "pending" }, FOR_COMPANY),
    ).resolves.toEqual(PROS_FEE);
  });

  it("le remplacement de la zone l'emporte sur le global, pour son audience", async () => {
    const farther: AdminDeliveryZoneView = {
      ...ZONE,
      audienceTerms: {
        ...NO_OVERRIDES,
        b2c: { fee: { mode: "amount", cents: 2_500 }, freeDeliveryThresholdCents: null },
      },
    };

    await expect(feeOf({ zone: farther, deliveryPricing: GLOBAL })).resolves.toEqual({
      mode: "amount",
      cents: 2_500,
    });
    await expect(
      feeOf({ zone: farther, deliveryPricing: GLOBAL, companyStatus: "active" }, FOR_COMPANY),
    ).resolves.toEqual(PROS_FEE);
  });

  it("le staff qui commande pour une société : la clientèle de la SOCIÉTÉ, pas celle de l'agent", async () => {
    const forCustomer: Partial<PricingRequest> = {
      parties: {
        companyId: "co_1",
        placedByUserId: "user_client",
        placedByStaffId: "staff_1",
        buyerKind: "registered",
      },
    };

    await expect(
      feeOf({ deliveryPricing: GLOBAL, companyStatus: "active" }, forCustomer),
    ).resolves.toEqual(PROS_FEE);
  });

  /**
   * Régression (1a, Hugo, 2026-11-05) : la révision re-résolvait le barème au
   * réglage du jour ; un frais relevé après la passation renchérissait la
   * commande. Le barème figé l'emporte dans SA zone.
   */
  it("révision : le barème FIGÉ de la zone l'emporte sur le réglage du jour", async () => {
    const frozen = { mode: "amount", cents: 300 } as const;

    await expect(
      feeOf(
        { deliveryPricing: GLOBAL },
        {
          revised: { lines: [], discounts: [] },
          frozenDeliveryFee: { zoneId: ZONE.id, fee: frozen, freeDeliveryThresholdCents: null },
        },
      ),
    ).resolves.toEqual(frozen);
  });

  it("révision livrée dans une AUTRE zone : le barème du jour de cette zone", async () => {
    await expect(
      feeOf(
        { deliveryPricing: GLOBAL },
        {
          revised: { lines: [], discounts: [] },
          frozenDeliveryFee: {
            zoneId: "zone_ailleurs",
            fee: { mode: "amount", cents: 300 },
            freeDeliveryThresholdCents: null,
          },
        },
      ),
    ).resolves.toEqual(INDIVIDUALS_FEE);
  });

  it("révision : la clientèle FIGÉE choisit le frais, pas le statut du jour", async () => {
    const revised = { lines: [], discounts: [] };

    await expect(
      feeOf(
        { deliveryPricing: GLOBAL, companyStatus: "active" },
        {
          ...FOR_COMPANY,
          revised,
          frozenAudience: "b2c",
        },
      ),
    ).resolves.toEqual(INDIVIDUALS_FEE);
  });
});

describe("PricingContext — le franco de la route (1b)", () => {
  const FRANCO: DeliveryPricingTerms = {
    b2b: { fee: PROS_FEE, freeDeliveryThresholdCents: 5_000 },
    b2c: { fee: INDIVIDUALS_FEE, freeDeliveryThresholdCents: 8_000 },
  };
  const REVISED = { revised: { lines: [], discounts: [] } } as const;

  async function thresholdOf(
    setup: Parameters<typeof pricingContextOf>[0],
    over: Partial<PricingRequest> = {},
  ) {
    const { loader } = pricingContextOf(setup);
    const { context } = loadedOrRefused(await loader.load(request(over)));
    if (context.route.method !== "delivery") {
      throw new TypeError("une livraison était attendue");
    }
    return context.route.freeDeliveryThresholdCents;
  }

  it("sans réglage : aucun seuil", async () => {
    await expect(thresholdOf({})).resolves.toBeNull();
  });

  it("à la passation : le seuil du jour de la clientèle, staff compris", async () => {
    await expect(thresholdOf({ deliveryPricing: FRANCO })).resolves.toBe(8_000);
    await expect(
      thresholdOf(
        { deliveryPricing: FRANCO, companyStatus: "active" },
        {
          parties: {
            companyId: "co_1",
            placedByUserId: "user_client",
            placedByStaffId: "staff_1",
            buyerKind: "registered",
          },
        },
      ),
    ).resolves.toBe(5_000);
  });

  it("révision dans la même zone : le seuil FIGÉ, jamais celui du jour", async () => {
    await expect(
      thresholdOf(
        { deliveryPricing: FRANCO },
        {
          ...REVISED,
          frozenDeliveryFee: {
            zoneId: ZONE.id,
            fee: INDIVIDUALS_FEE,
            freeDeliveryThresholdCents: 6_000,
          },
        },
      ),
    ).resolves.toBe(6_000);
    // Une commande passée sans franco n'en gagne pas en révision.
    await expect(
      thresholdOf(
        { deliveryPricing: FRANCO },
        {
          ...REVISED,
          frozenDeliveryFee: {
            zoneId: ZONE.id,
            fee: INDIVIDUALS_FEE,
            freeDeliveryThresholdCents: null,
          },
        },
      ),
    ).resolves.toBeNull();
  });

  it("révision livrée dans une AUTRE zone : barème ET seuil du jour de cette zone (Hugo, 2026-11-05)", async () => {
    const { loader } = pricingContextOf({ deliveryPricing: FRANCO });
    const { context } = loadedOrRefused(
      await loader.load(
        request({
          ...REVISED,
          frozenDeliveryFee: {
            zoneId: "zone_ailleurs",
            fee: { mode: "amount", cents: 300 },
            freeDeliveryThresholdCents: 1_000,
          },
        }),
      ),
    );

    expect(context.route).toMatchObject({
      fee: INDIVIDUALS_FEE,
      freeDeliveryThresholdCents: 8_000,
    });
  });
});
