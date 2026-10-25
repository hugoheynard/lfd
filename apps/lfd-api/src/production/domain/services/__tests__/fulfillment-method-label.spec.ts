import { fulfillmentLabelOf } from "../fulfillment-method-label.js";

/** « Retrait <site> · pro » (Hugo, 2026-10-25) : ce qui se dit, et ce qui s'omet. */
describe("fulfillmentLabelOf", () => {
  const BASE = {
    fulfillmentMethod: "pickup" as const,
    clientele: "pro" as const,
    destination: "Village",
    sheetDetails: null,
  };

  it("nomme le site et la clientèle d'un retrait", () => {
    expect(fulfillmentLabelOf(BASE)).toBe("Retrait Village · pro");
    expect(fulfillmentLabelOf({ ...BASE, clientele: "public" })).toBe(
      "Retrait Village · particulier",
    );
  });

  it("préfère le point nommé figé à l'arrêt à la destination en une ligne", () => {
    const details = {
      tradeName: "",
      legalName: "SAS",
      pickupLabel: "La Folie Coffee Village",
      address: null,
      window: null,
      contact: null,
      signatureRequired: false,
      note: "",
      recurring: false,
    };
    expect(fulfillmentLabelOf({ ...BASE, sheetDetails: details })).toBe(
      "Retrait La Folie Coffee Village · pro",
    );
  });

  it("une livraison ne nomme pas de site", () => {
    expect(fulfillmentLabelOf({ ...BASE, fulfillmentMethod: "delivery" })).toBe("Livraison · pro");
  });

  it("omet ce qu'il ne sait pas, sans rien deviner", () => {
    expect(fulfillmentLabelOf({ ...BASE, destination: "", clientele: null })).toBe("Retrait");
  });
});
