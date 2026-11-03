import type { CatalogPricing } from "@lfd/contracts";

import { TechnicalError } from "../../../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { UnknownSkuError } from "../../../../catalog/domain/errors/unknown-sku.error.js";
import { CanonicalPriceHistoryReader } from "../../../../catalog/domain/ports/canonical-price-history.reader.js";
import {
  InvalidOrderFulfillmentError,
  PickupClosedAtRequestedTimeError,
  PickupClosedForAudienceError,
} from "../../../domain/errors/order-errors.js";
import type { OrderContent } from "../order-content.js";
import { loadedOrRefused, type PricingRequest } from "../pricing-context.service.js";
import { CountedPoints, LABO, pricingContextOf, ZONE } from "./pricing-context.doubles.js";
import { PRICED_AT } from "./shop-cart-quoting.doubles.js";

/**
 * `PricingContext` — plan `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md`,
 * § 2.1 : charger une fois, et rendre les refus de lecture en DONNÉES que
 * l'appelant lève à son rang.
 */
const CONTENT: OrderContent = {
  fulfillmentMethod: "pickup",
  deliveryAddress: null,
  deliveryAddressId: null,
  pickupAddressId: LABO.id,
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
    ...over,
  };
}

describe("PricingContext — ce que le chiffrage consomme, chargé une fois", () => {
  it("retrait : lignes tarifées, rangement, point figé, promotions, mode du port", async () => {
    const { loader } = pricingContextOf({ deliveryVatMode: "follows_goods" });

    const { context, audience, keptRefusals } = loadedOrRefused(await loader.load(request()));

    expect(context.lines.map((line) => [line.sku, line.unitPriceMillicents])).toEqual([
      ["PAI-001", 200_000],
    ]);
    expect(context.known.get("PAI-001")?.productId).toBe("p_pain");
    expect(context.route).toMatchObject({
      method: "pickup",
      point: { siteId: LABO.id, label: LABO.label },
    });
    expect(context.promotions.at).toEqual(PRICED_AT);
    expect(context.promotions.facts.fulfillment).toEqual({ method: "pickup", pickupId: LABO.id });
    expect(context.deliveryVatMode).toBe("follows_goods");
    expect(context.replayed).toBeNull();
    expect(audience).toBe("b2c");
    expect(keptRefusals).toEqual([]);
  });

  it("coursier : la zone déduite du code postal, son barème et le mode créneau global", async () => {
    const { loader } = pricingContextOf();
    const address = { ...LABO, label: "" };

    const { context } = loadedOrRefused(
      await loader.load(
        request({
          content: { ...CONTENT, fulfillmentMethod: "delivery", deliveryAddress: address },
        }),
      ),
    );

    expect(context.route).toMatchObject({ method: "delivery", zoneId: ZONE.id, fee: ZONE.fee });
    expect(context.promotions.facts.fulfillment).toEqual({ method: "delivery", zoneId: ZONE.id });
  });

  it("révision : le mode du port FIGÉ l'emporte sur celui du jour (É9), et la commande est rejouée", async () => {
    const { loader, deliveryVat } = pricingContextOf({ deliveryVatMode: "standard" });
    const revised = { lines: [], discounts: [] };

    const { context } = loadedOrRefused(
      await loader.load(request({ revised, frozenDeliveryVatMode: "follows_goods" })),
    );

    expect(context.deliveryVatMode).toBe("follows_goods");
    expect(context.replayed).toBe(revised);
    // Lu quand même : le chargement lit ce que la composition lisait.
    expect(deliveryVat.reads).toBe(1);
  });
});

describe("PricingContext — les refus de lecture sont des données", () => {
  it("un SKU inconnu : rendu, pas levé — et le point n'est pas lu", async () => {
    const points = new CountedPoints();
    const { loader } = pricingContextOf({ points });

    const loaded = await loader.load(
      request({ content: { ...CONTENT, lines: [{ sku: "XXX-404", quantity: 1 }] } }),
    );

    expect(loaded.loaded).toBeNull();
    expect(loaded.refusals[0]).toBeInstanceOf(UnknownSkuError);
    expect(points.reads).toBe(0);
  });

  it("un point fermé à la clientèle : rendu par son nom", async () => {
    const closed = { ...LABO, pickupAudiences: { b2b: true, b2c: false } };
    const { loader } = pricingContextOf({ points: new CountedPoints(closed) });

    const loaded = await loader.load(request());

    expect(loaded.refusals[0]).toBeInstanceOf(PickupClosedForAudienceError);
  });

  /**
   * Régression É13 : la révision relisait la clientèle au statut d'AUJOURD'HUI,
   * et une commande pro au point réservé aux pros devenait irrévisable si la
   * société changeait de statut. Hugo, 2026-11-03 : contexte figé sur la commande.
   */
  it("révision : la clientèle FIGÉE ouvre le point réservé aux pros, quel que soit le statut du jour", async () => {
    const reserved = { ...LABO, pickupAudiences: { b2b: true, b2c: false } };
    const { loader } = pricingContextOf({ points: new CountedPoints(reserved) });

    const { audience } = loadedOrRefused(await loader.load(request({ frozenAudience: "b2b" })));

    expect(audience).toBe("b2b");
  });

  it("une tranche hors des fenêtres du point : rendue, après le point", async () => {
    const { loader } = pricingContextOf();
    const late = { start: "18:00", end: "19:00" };

    const loaded = await loader.load(request({ content: { ...CONTENT, requestedWindow: late } }));

    expect(loaded.refusals[0]).toBeInstanceOf(PickupClosedAtRequestedTimeError);
  });

  it("un coursier sans adresse : rendu, défense typée du schéma", async () => {
    const { loader } = pricingContextOf();

    const loaded = await loader.load(
      request({ content: { ...CONTENT, fulfillmentMethod: "delivery" } }),
    );

    expect(loaded.refusals[0]).toBeInstanceOf(InvalidOrderFulfillmentError);
  });

  it("l'appelant lève le premier refus, tel quel", async () => {
    const { loader } = pricingContextOf();

    const loaded = await loader.load(
      request({ content: { ...CONTENT, lines: [{ sku: "XXX-404", quantity: 1 }] } }),
    );

    expect(() => loadedOrRefused(loaded)).toThrow(UnknownSkuError);
  });

  it("une panne technique n'est pas un refus : elle remonte", async () => {
    const down = new StoreDown();
    const { loader } = pricingContextOf({ points: new CountedPoints(LABO, down) });

    await expect(loader.load(request())).rejects.toBe(down);
  });
});

describe("PricingContext — jamais d'instant passé à la porte du prix (§ 2.1)", () => {
  /**
   * Régression du 2026-10-30, rejouée au chargement : un instant explicite
   * déclenchait la lecture datée, rescellée au prix PRO de l'historique.
   */
  it("hors requête, l'horloge qui avance laisse l'invité au prix public, sans historique", async () => {
    const history = new ProOnlyHistory();
    const { loader } = pricingContextOf({ gate: { clock: new TickingClock(), history } });

    const { context } = loadedOrRefused(await loader.load(request()));

    expect(context.lines[0]?.unitPriceMillicents).toBe(200_000);
    expect(history.asked).toBe(0);
  });
});

class StoreDown extends TechnicalError {
  constructor() {
    super("test.store_down", "La base des points ne répond pas.");
  }
}

/** Le mur hors requête : chaque lecture avance d'une milliseconde. */
class TickingClock extends Clock {
  private reads = 0;
  now(): Date {
    this.reads += 1;
    return new Date(PRICED_AT.getTime() + this.reads);
  }
}

/** Un historique qui ne connaît que le prix pro — et compte qui l'interroge. */
class ProOnlyHistory extends CanonicalPriceHistoryReader {
  asked = 0;
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    this.asked += 1;
    return Promise.resolve(
      new Map([["PAI-001", { sku: "PAI-001", unitPriceMillicents: 150_000, vatRatePercent: 5.5 }]]),
    );
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(new Date(0));
  }
}
