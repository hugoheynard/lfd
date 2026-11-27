import type { AdminPlaceOrderPayload } from "@lfd/contracts";

import { backorderConversionIntent } from "../backorder-conversion-intent.js";
import { BACKORDER, openBackorder } from "../../__tests__/backorder-conversion-doubles.js";
import {
  BUYER,
  COMPANY,
  convertPayload,
  LABO,
  STAFF,
} from "../../__tests__/backorder-conversion-scene.js";
import { backorderEntryOf } from "../../backorder-placement.js";

/**
 * **L'intention d'une transformation** : le double clic rend la même
 * commande, une saisie différente sous la même clé est refusée. Tout ce qui
 * change ce que la commande coûte ou à qui elle va doit donc changer le sujet.
 */

function entryOf(over: Partial<AdminPlaceOrderPayload> = {}, quantity = 4): AdminPlaceOrderPayload {
  return {
    ...backorderEntryOf(openBackorder({ quantity }), COMPANY, convertPayload(), []),
    ...over,
  };
}

function subjectOf(entry: AdminPlaceOrderPayload, backorderId = BACKORDER): string {
  return JSON.stringify(backorderConversionIntent(STAFF, "key_1", backorderId, entry).subject);
}

describe("backorderConversionIntent", () => {
  it("la même saisie donne le même sujet, appel après appel", () => {
    expect(subjectOf(entryOf())).toBe(subjectOf(entryOf()));
  });

  it("porte l'acteur, la clé et le geste nommé du registre", () => {
    const intent = backorderConversionIntent(STAFF, "key_1", BACKORDER, entryOf());

    expect(intent).toMatchObject({
      actorId: STAFF,
      key: "key_1",
      gesture: "orders.backorder.convert",
    });
  });

  it("deux reliquats ne partagent pas un sujet, même saisie par ailleurs identique", () => {
    expect(subjectOf(entryOf(), "bo_1")).not.toBe(subjectOf(entryOf(), "bo_2"));
  });

  it.each<[string, Partial<AdminPlaceOrderPayload>]>([
    ["l'acheteur", { buyerUserId: "usr_autre" }],
    ["le règlement", { settlement: "link" }],
    ["l'approvisionnement", { supply: "shelf" }],
    ["le mode d'acheminement", { fulfillmentMethod: "delivery" }],
    ["l'adresse de retrait", { pickupAddressId: `${LABO.id}_bis` }],
    ["le jour servi", { requestedDeliveryDate: "2099-01-01" }],
  ])("une saisie qui change %s change le sujet (même clé, autre corps : refus)", (_name, over) => {
    expect(subjectOf(entryOf(over))).not.toBe(subjectOf(entryOf()));
  });

  it("une quantité de reliquat différente change le sujet : le corps garni est empreint", () => {
    expect(subjectOf(entryOf({}, 5))).not.toBe(subjectOf(entryOf({}, 4)));
  });

  it("une saisie sans approvisionnement donne toujours le même sujet, comme la passation de l'équipe", () => {
    const { supply: _omitted, ...withoutSupply } = entryOf();
    const { supply: _again, ...sameAgain } = entryOf();

    expect(subjectOf(withoutSupply)).toBe(subjectOf(sameAgain));
  });

  it("l'acheteur du corps est celui de l'empreinte, pas un autre", () => {
    expect(entryOf().buyerUserId).toBe(BUYER);
  });
});
