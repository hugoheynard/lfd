import { promotionTermsPayloadSchema } from "../promotions.js";

/**
 * Le texte d'une promotion sur les vignettes
 * (`documentation/promotions/plan-texte-de-la-vignette.md`) : FORME seule. Le
 * vide, les espaces de bord, la traduction sans français et la borne de 60
 * caractères sont l'affaire de l'agrégat, qui les nomme.
 */
const TERMS = {
  internalName: "Folie Coffee",
  label: { fr: "−20 %", en: null, it: null },
  reason: null,
  effect: { kind: "percent_off", value: 2000 },
  ownFloor: null,
  validFrom: "2026-11-01T00:00:00.000Z",
  validTo: null,
  audiences: [{ kind: "everyone", companyId: null }],
  fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
  scope: { mode: "all_except", rules: [] },
  conditions: [],
};

describe("promotionTermsPayloadSchema — le texte des vignettes", () => {
  it("est facultatif : un éditeur d'avant ne l'envoie pas", () => {
    expect(promotionTermsPayloadSchema.parse(TERMS).tileText).toBeUndefined();
  });

  it.each([
    null,
    { fr: "", en: null, it: null },
    { fr: "  −20 % client Folie Coffee ", en: "−20%", it: null },
  ])("accepte la forme %p telle quelle", (tileText) => {
    expect(promotionTermsPayloadSchema.parse({ ...TERMS, tileText }).tileText).toEqual(tileText);
  });

  it("refuse une langue manquante ou ce qui n'est pas un texte", () => {
    expect(
      promotionTermsPayloadSchema.safeParse({ ...TERMS, tileText: { fr: "x", en: null } }).success,
    ).toBe(false);
    expect(
      promotionTermsPayloadSchema.safeParse({ ...TERMS, tileText: { fr: 42, en: null, it: null } })
        .success,
    ).toBe(false);
  });
});
