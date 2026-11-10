import { orderCategoryColor, type SiteColorSet } from "../order-category-color.js";

const SITE: SiteColorSet = {
  pickupColorB2b: "#fdd835",
  pickupColorB2c: "#fb8c00",
  deliveryColorB2b: "#1e88e5",
  deliveryColorB2c: "#8e24aa",
};

describe("orderCategoryColor — la couleur d'une commande (plan du tri et des couleurs, §4)", () => {
  it.each([
    ["pickup", "pro", "#fdd835"],
    ["pickup", "public", "#fb8c00"],
    ["delivery", "pro", "#1e88e5"],
    ["delivery", "public", "#8e24aa"],
  ] as const)(
    "%s / %s → la couleur du site pour ce mode et cette clientèle",
    (method, clientele, color) => {
      expect(orderCategoryColor(method, clientele, SITE)).toBe(color);
    },
  );

  it("clientèle inconnue : aucune couleur, jamais une teinte devinée", () => {
    expect(orderCategoryColor("pickup", null, SITE)).toBeNull();
  });

  it("sans site résolu (retrait d'avant le site, aucun départ) : aucune couleur", () => {
    expect(orderCategoryColor("delivery", "pro", null)).toBeNull();
  });

  it("couleur non posée sur le site : aucune couleur", () => {
    expect(orderCategoryColor("pickup", "pro", { ...SITE, pickupColorB2b: null })).toBeNull();
  });
});
