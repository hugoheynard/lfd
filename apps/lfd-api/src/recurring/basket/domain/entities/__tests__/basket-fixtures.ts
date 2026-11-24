import type { Recurrence } from "@lfd/contracts";

import { BasketLine } from "../../value-objects/basket-line.js";
import { IsoDate } from "../../value-objects/iso-date.js";
import { Basket, type OpenBasketInput } from "../basket.js";

/** Un jour, depuis `AAAA-MM-JJ`. */
export const day = (raw: string): IsoDate => IsoDate.fromString(raw);

/** Les CGV pro acceptées à l'ouverture. */
export const PRO_TERMS = { key: "salesTermsPro", revision: 3, fileId: "file_cgv_3" } as const;

/**
 * Un panier hebdomadaire de société, en retrait, ouvert par `user_1` pour
 * `chalet` ; `overrides` remplace ce que le test fait varier.
 */
export function openBasket(
  overrides: Partial<OpenBasketInput> & { readonly cadence?: Recurrence } = {},
): Basket {
  return Basket.open({
    id: "basket_1",
    buyerUserId: "user_1",
    companyId: "chalet",
    fromOrderId: null,
    cadence: "weekly",
    startDate: day("2026-11-02"),
    endDate: null,
    routing: {
      method: "pickup",
      deliveryAddress: null,
      pickupAddressId: "point_1",
      window: { start: "08:00", end: "10:00" },
    },
    note: "Porte de derrière",
    lines: [BasketLine.create("PAN-001", 4), BasketLine.create("CRO-002", 6)],
    salesTerms: PRO_TERMS,
    ...overrides,
  });
}
