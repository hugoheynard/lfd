import type { ClientSheet } from "@lfd/contracts";

import { specimenDataOf } from "../specimens/mail-specimens.js";
import { pickupItinerary } from "../pickup-itinerary.js";

const SHEET: ClientSheet = specimenDataOf("customer.order-ready", "fr").sheet;
const DIRECTIONS = "https://www.google.com/maps/dir/?api=1&destination=";

describe("l'itinéraire vers le point de retrait (E4, S7)", () => {
  it("vise l'adresse figée dans la commande quand le point GPS n'est pas connu", () => {
    expect(pickupItinerary(SHEET, null, "Y aller")).toEqual({
      itinerary: {
        label: "Y aller",
        url: `${DIRECTIONS}${encodeURIComponent("route de la Balme, 73150 Val d'Isère, France")}`,
      },
    });
  });

  it("vise le point GPS quand il est connu", () => {
    expect(
      pickupItinerary(SHEET, { latitude: 45.4485, longitude: 6.9806 }, "Y aller").itinerary?.url,
    ).toBe(`${DIRECTIONS}45.4485%2C6.9806`);
  });

  it("n'existe pas pour une livraison, ni pour un retrait sans adresse", () => {
    const delivery = {
      ...SHEET,
      fulfillment: { ...SHEET.fulfillment, method: "delivery" as const },
    };
    const nowhere = { ...SHEET, fulfillment: { ...SHEET.fulfillment, address: null } };
    expect(pickupItinerary(delivery, null, "Y aller")).toEqual({});
    expect(pickupItinerary(nowhere, null, "Y aller")).toEqual({});
  });
});
