import { placeShopOrderPayloadSchema } from "../shop-order.js";

/**
 * Le contrat de la commande **sans compte**.
 *
 * Ce qu'on éprouve ici est la FORME, et elle seule : c'est tout ce qu'un
 * contrôleur valide. Les invariants — une adresse qui en est une, un prénom qui
 * tient — restent au domaine, qui les refuse quel que soit le chemin d'entrée.
 */

/** Un panier retrait valide, dont chaque cas ne change que ce qu'il éprouve. */
function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    buyer: { firstName: "Camille", email: "camille@exemple.fr", phone: "0600000000" },
    fulfillmentMethod: "pickup",
    pickupAddressId: "pickup_1",
    requestedDeliveryDate: "2026-12-24",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    ...over,
  };
}

describe("placeShopOrderPayloadSchema — qui commande", () => {
  it("accepte les trois champs que l'écran demande", () => {
    const parsed = placeShopOrderPayloadSchema.parse(payload());

    expect(parsed.buyer).toEqual({
      firstName: "Camille",
      email: "camille@exemple.fr",
      phone: "0600000000",
    });
  });

  it("REFUSE un panier sans identité", () => {
    // C'est la demande d'origine, mot pour mot : « tant qu'on a pas ces infos on
    // ne peut pas faire régler ma commande ». Sans adresse, le client n'aurait
    // ni confirmation, ni QR à présenter au comptoir.
    expect(() => placeShopOrderPayloadSchema.parse(payload({ buyer: undefined }))).toThrow();
  });

  it("REFUSE une adresse qui n'en est pas une", () => {
    expect(() =>
      placeShopOrderPayloadSchema.parse(
        payload({ buyer: { firstName: "Camille", email: "camille" } }),
      ),
    ).toThrow();
  });

  it("REFUSE un prénom vide, même avec une adresse valable", () => {
    expect(() =>
      placeShopOrderPayloadSchema.parse(
        payload({ buyer: { firstName: "  ", email: "camille@exemple.fr" } }),
      ),
    ).toThrow();
  });

  /**
   * 🔴 **Ce cas affirmait l'inverse jusqu'au 2026-09-17** — « laisse le
   * téléphone facultatif, il sert à rappeler, pas à identifier ». Il est
   * retourné, pas supprimé : c'est lui qui tient la règle désormais.
   *
   * Un client public n'a **aucun autre recours** : pas de compte, donc pas de
   * « mes commandes » ; une adresse mal tapée emporte la confirmation et le QR
   * chez un inconnu ; et au comptoir sa commande s'affiche par son prénom seul.
   * Le numéro est le dernier fil qui reste (D9).
   */
  it("REFUSE une commande sans téléphone — c'est le seul second canal", () => {
    expect(() =>
      placeShopOrderPayloadSchema.parse(
        payload({ buyer: { firstName: "Camille", email: "camille@exemple.fr" } }),
      ),
    ).toThrow();
  });

  it("REFUSE un téléphone vide tout autant qu'absent", () => {
    expect(() =>
      placeShopOrderPayloadSchema.parse(
        payload({ buyer: { firstName: "Camille", email: "camille@exemple.fr", phone: "   " } }),
      ),
    ).toThrow();
  });
});

describe("placeShopOrderPayloadSchema — ce que la surface publique n'expose pas", () => {
  it("n'accepte NI société NI mode de règlement", () => {
    // Les deux sont inexprimables, et c'est le cran au-dessus d'un refus : un
    // visiteur ne peut pas nommer une société, et il ne peut pas s'accorder un
    // crédit. Zod dépouille ce qu'il ne connaît pas — l'assertion porte donc sur
    // ce qui RESSORT, seul endroit où un champ de trop se verrait.
    const parsed = placeShopOrderPayloadSchema.parse(
      payload({ companyId: "cmp_1", settlement: "account" }),
    );

    expect(parsed).not.toHaveProperty("companyId");
    expect(parsed).not.toHaveProperty("settlement");
  });

  it("exige une clé d'idempotence, et un UUID", () => {
    // Un double clic sur une surface sans jeton ne se rattrape nulle part.
    expect(() =>
      placeShopOrderPayloadSchema.parse(payload({ idempotencyKey: undefined })),
    ).toThrow();
    expect(() => placeShopOrderPayloadSchema.parse(payload({ idempotencyKey: "abc" }))).toThrow();
  });
});

describe("placeShopOrderPayloadSchema — le panier reste celui de la caisse", () => {
  it("exige un jour de service, comme la commande connectée", () => {
    // Une commande sans jour n'entre dans aucune journée de fabrication.
    expect(() =>
      placeShopOrderPayloadSchema.parse(payload({ requestedDeliveryDate: undefined })),
    ).toThrow();
  });

  it("REFUSE un coursier sans adresse livrée", () => {
    expect(() =>
      placeShopOrderPayloadSchema.parse(
        payload({ fulfillmentMethod: "delivery", pickupAddressId: null }),
      ),
    ).toThrow();
  });

  it("REFUSE un retrait sans point choisi", () => {
    expect(() => placeShopOrderPayloadSchema.parse(payload({ pickupAddressId: null }))).toThrow();
  });

  it("REFUSE un panier vide", () => {
    expect(() => placeShopOrderPayloadSchema.parse(payload({ lines: [] }))).toThrow();
  });
});
