import {
  MARKETING_CONSENT_TEXT_VERSIONS,
  PUBLISHED_MARKETING_TEXT_VERSIONS,
} from "../marketing-consent.values.js";
import {
  newsletterSignupPayloadSchema,
  societyConsentAnswerSchema,
  subscribeMarketingPayloadSchema,
} from "../marketing-consent.js";
import { placeOrderPayloadSchema } from "../order.js";
import { placeShopOrderPayloadSchema } from "../shop-order.js";

/**
 * Les contrats du consentement marketing (plan de désinscription, C2, C3,
 * C5) : la version du texte affiché est une version publiée, la case reste
 * facultative sur les deux passations, et la lettre porte son champ piège.
 */
const ANSWER = {
  accepted: true,
  textVersion: MARKETING_CONSENT_TEXT_VERSIONS.society,
  locale: "fr",
};
const CONTENT = {
  idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  expectedTotalCents: 4230,
  fulfillmentMethod: "pickup",
  pickupAddressId: "pickup_1",
  requestedDeliveryDate: "2026-12-24",
  lines: [{ sku: "VIE-001", quantity: 2 }],
  salesTerms: null,
};
const GUEST = { buyer: { firstName: "Camille", email: "c@exemple.fr", phone: "0600000000" } };

describe("les versions des textes des cases", () => {
  it("la version courante de chaque case est publiée", () => {
    for (const box of ["society", "partners", "newsletter"] as const) {
      expect(PUBLISHED_MARKETING_TEXT_VERSIONS[box]).toContain(
        MARKETING_CONSENT_TEXT_VERSIONS[box],
      );
    }
  });

  it("refuse une version qu'aucun texte n'a portée, ou celle d'une autre case", () => {
    expect(
      societyConsentAnswerSchema.safeParse({ ...ANSWER, textVersion: "society.v0" }).success,
    ).toBe(false);
    expect(
      societyConsentAnswerSchema.safeParse({
        ...ANSWER,
        textVersion: MARKETING_CONSENT_TEXT_VERSIONS.newsletter,
      }).success,
    ).toBe(false);
  });

  it("refuse une langue que la boutique ne parle pas", () => {
    expect(societyConsentAnswerSchema.safeParse({ ...ANSWER, locale: "de" }).success).toBe(false);
  });
});

describe("la case des offres à la passation", () => {
  it("est facultative sur les deux passations", () => {
    expect(placeOrderPayloadSchema.parse(CONTENT).marketingConsent).toBeUndefined();
    expect(
      placeShopOrderPayloadSchema.parse({ ...CONTENT, ...GUEST }).marketingConsent,
    ).toBeUndefined();
  });

  it("est portée telle quelle quand elle est là", () => {
    expect(
      placeOrderPayloadSchema.parse({ ...CONTENT, marketingConsent: ANSWER }).marketingConsent,
    ).toEqual(ANSWER);
    expect(
      placeShopOrderPayloadSchema.parse({ ...CONTENT, ...GUEST, marketingConsent: ANSWER })
        .marketingConsent,
    ).toEqual(ANSWER);
  });
});

describe("« Mes préférences » et la lettre", () => {
  it("refuse une société que la boutique ne sert pas", () => {
    expect(
      subscribeMarketingPayloadSchema.safeParse({
        space: "lfd",
        textVersion: MARKETING_CONSENT_TEXT_VERSIONS.society,
        locale: "fr",
      }).success,
    ).toBe(false);
  });

  it("la lettre : une adresse bien formée, et le champ piège facultatif", () => {
    const base = {
      email: " c@exemple.fr ",
      textVersion: MARKETING_CONSENT_TEXT_VERSIONS.newsletter,
      locale: "it",
    };
    expect(newsletterSignupPayloadSchema.parse(base)).toEqual({ ...base, email: "c@exemple.fr" });
    expect(newsletterSignupPayloadSchema.parse({ ...base, website: "x" }).website).toBe("x");
    expect(
      newsletterSignupPayloadSchema.safeParse({ ...base, email: "pas-une-adresse" }).success,
    ).toBe(false);
  });
});
