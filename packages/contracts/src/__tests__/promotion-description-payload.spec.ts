import { promotionTermsPayloadSchema } from "../promotions.js";

/**
 * La description interne d'une promotion (`documentation/promotions/promotions.md`,
 * § 2.1) : FORME seule. Le vide, les espaces de bord et la borne de 1 000
 * caractères sont l'affaire de l'agrégat, qui les nomme.
 */
const TERMS = {
  internalName: "Labo et vallée",
  label: { fr: "−10 %", en: null, it: null },
  reason: null,
  effect: { kind: "percent_off", value: 1000 },
  ownFloor: null,
  validFrom: "2026-11-01T00:00:00.000Z",
  validTo: null,
  audiences: [{ kind: "everyone", companyId: null }],
  fulfillment: { kind: "displayed_price" },
  scope: { mode: "all_except", rules: [] },
  conditions: [],
};

describe("promotionTermsPayloadSchema — la description", () => {
  it("est facultative : un éditeur d'avant ne l'envoie pas", () => {
    const parsed = promotionTermsPayloadSchema.parse(TERMS);
    expect(parsed.description).toBeUndefined();
  });

  it.each([null, "", "  Pour le fournil  "])("accepte la forme %p telle quelle", (description) => {
    expect(promotionTermsPayloadSchema.parse({ ...TERMS, description }).description).toBe(
      description,
    );
  });

  it("refuse ce qui n'est pas un texte", () => {
    expect(promotionTermsPayloadSchema.safeParse({ ...TERMS, description: 42 }).success).toBe(
      false,
    );
  });
});
