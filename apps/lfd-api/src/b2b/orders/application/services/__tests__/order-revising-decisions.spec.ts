import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  DeadlineNotRegisteredError,
  PickupClosedForAudienceError,
} from "../../../domain/errors/order-errors.js";
import {
  BOOK_ADDRESS_ID,
  content,
  LABO_POINT,
  NOW,
  placedOrder,
  revisingAt,
} from "../../commands/__tests__/revision-scene.js";
import type { OrderContent } from "../order-content.js";

/**
 * Les refus de la révision décidés par Hugo le 2026-11-03 (lot L1b de
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, § 6) :
 * É12 (la règle E1 de la passation) et É13 (la clientèle de la commande).
 */
const STAFF = { kind: "staff", staffId: "stf_1" } as const;
const CHANGE = { requireChange: true, decidedAt: NOW } as const;

/** Le retrait de la scène devient une livraison à l'adresse du carnet, à l'échéance `end`. */
function toDelivery(end: string): OrderContent {
  return content({
    fulfillmentMethod: "delivery",
    pickupAddressId: null,
    requestedWindow: { start: null, end },
    deliveryAddressId: BOOK_ADDRESS_ID,
    deliveryAddress: {
      label: "",
      ligne1: "2 rue Neuve",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
    },
  });
}

describe("OrderRevising — É12 : l'équipe révise une commande pro selon E1", () => {
  /**
   * Régression É12 : la révision par l'équipe d'une commande pro était libre de
   * l'heure, là où la passation de l'équipe suit E1. Hugo, 2026-11-03 : la
   * révision suit E1, comme la passation.
   */
  it("refuse à l'équipe une échéance que l'adresse du pro n'inscrit pas", async () => {
    const order = await placedOrder({ discountAdjustment: null, discountCents: 0 });

    await expect(
      revisingAt(new FixedClock(NOW)).compose(order, toDelivery("11:00"), STAFF, CHANGE),
    ).rejects.toBeInstanceOf(DeadlineNotRegisteredError);
  });

  it("admet l'échéance inscrite", async () => {
    const order = await placedOrder({ discountAdjustment: null, discountCents: 0 });

    const revision = await revisingAt(new FixedClock(NOW)).compose(
      order,
      toDelivery("10:00"),
      STAFF,
      CHANGE,
    );

    expect(revision.state.fulfillmentMethod).toBe("delivery");
  });

  it("laisse l'équipe libre de l'heure sur une commande de particulier", async () => {
    const order = await placedOrder({
      companyId: null,
      billedCompanyId: null,
      discountAdjustment: null,
      discountCents: 0,
    });

    const revision = await revisingAt(new FixedClock(NOW)).compose(
      order,
      toDelivery("11:00"),
      STAFF,
      CHANGE,
    );

    expect(revision.state.fulfillmentMethod).toBe("delivery");
  });
});

describe("OrderRevising — É13 : la clientèle de la commande, pas celle du jour", () => {
  const RESERVED = { ...LABO_POINT, pickupAudiences: { b2b: true, b2c: false } };
  const LATER = content({ requestedWindow: { start: "08:00", end: "09:00" } });

  /**
   * Régression É13 : la révision relisait la clientèle au statut d'AUJOURD'HUI ;
   * une commande pro au point réservé aux pros devenait irrévisable dès que la
   * société était suspendue. Hugo, 2026-11-03 : contexte figé sur la commande.
   */
  it("une commande pro garde son point réservé aux pros, société suspendue depuis", async () => {
    const order = await placedOrder();
    const revising = revisingAt(new FixedClock(NOW), {
      companyStatus: "suspended",
      point: RESERVED,
    });

    const revision = await revising.compose(order, LATER, STAFF, CHANGE);

    expect(revision.state.pickupAddress?.siteId).toBe(LABO_POINT.id);
  });

  it("une commande de particulier reste refusée au point réservé aux pros", async () => {
    const order = await placedOrder({
      salesTerms: { document: "salesTerms", revision: null, fileId: null },
    });
    const revising = revisingAt(new FixedClock(NOW), { point: RESERVED });

    await expect(revising.compose(order, LATER, STAFF, CHANGE)).rejects.toBeInstanceOf(
      PickupClosedForAudienceError,
    );
  });
});
