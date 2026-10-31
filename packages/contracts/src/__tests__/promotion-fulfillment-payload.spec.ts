import { promotionTermsPayloadSchema } from "../promotions.js";

/**
 * L'acheminement d'une promotion, tel que l'éditeur l'envoie (`documentation/promotions/promotions.md`, § 2.14) : la FORME
 * seule. « Au moins un mode coché », « sélection non vide », « sans doublon »
 * sont des refus nommés de l'agrégat, pas du schéma.
 */
const TERMS = {
  internalName: "Labo et vallée",
  label: { fr: "−10 %", en: null, it: null },
  reason: null,
  effect: { kind: "percent_off", value: 1000 },
  ownFloor: null,
  stacksOverMercuriale: false,
  validFrom: "2026-11-01T00:00:00.000Z",
  validTo: null,
  audiences: [{ kind: "everyone", companyId: null }],
  scope: { mode: "all_except", rules: [] },
  conditions: [],
};

const parse = (fulfillment: unknown) =>
  promotionTermsPayloadSchema.safeParse({ ...TERMS, fulfillment });

describe("promotionTermsPayloadSchema — l'acheminement à cocher", () => {
  it.each([
    ["dans le prix affiché", { kind: "displayed_price" }],
    [
      "un point et une zone",
      { kind: "basket", pickup: { points: ["pk_1"] }, delivery: { zones: ["z_1"] } },
    ],
    ["tous les points, aucune livraison", { kind: "basket", pickup: "all", delivery: "none" }],
    // La forme passe ; c'est l'agrégat qui refuse, en le nommant.
    ["rien de coché", { kind: "basket", pickup: "none", delivery: "none" }],
    ["une sélection vide", { kind: "basket", pickup: { points: [] }, delivery: "none" }],
  ])("accepte la forme : %s", (_case, fulfillment) => {
    expect(parse(fulfillment).success).toBe(true);
  });

  it.each([
    ["l'ancien choix unique", { kind: "pickup_point", pickupId: "pk_1" }],
    ["l'ancien « tous »", { kind: "any", pickupId: null }],
    ["un mode inconnu", { kind: "basket", pickup: "some", delivery: "none" }],
    ["des zones sous le retrait", { kind: "basket", pickup: { zones: ["z"] }, delivery: "none" }],
  ])("refuse la forme : %s", (_case, fulfillment) => {
    expect(parse(fulfillment).success).toBe(false);
  });
});
