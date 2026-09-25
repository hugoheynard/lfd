import { awaitsCardPayment, paymentUrlFor } from "../payment-link.js";

describe("paymentUrlFor", () => {
  it("compose le lien vers l'espace client", () => {
    expect(paymentUrlFor("https://boutique.lfc.fr", "order_1")).toBe(
      "https://boutique.lfc.fr/commandes/order_1/regler",
    );
  });

  it("ne double pas la barre oblique quand la racine en porte déjà une", () => {
    expect(paymentUrlFor("https://boutique.lfc.fr/", "order_1")).toBe(
      "https://boutique.lfc.fr/commandes/order_1/regler",
    );
  });

  it("rend null sans racine configurée — plutôt qu'une URL inventée", () => {
    // Le commercial voit alors « pas de lien » et le dit au client, au lieu de
    // lui dicter une adresse qui ne mène nulle part.
    expect(paymentUrlFor(null, "order_1")).toBeNull();
    expect(paymentUrlFor("   ", "order_1")).toBeNull();
  });

  it("échappe l'identifiant plutôt que de le coller tel quel", () => {
    expect(paymentUrlFor("https://boutique.lfc.fr", "a/b")).toBe(
      "https://boutique.lfc.fr/commandes/a%2Fb/regler",
    );
  });
});

describe("awaitsCardPayment", () => {
  it("retient un règlement en attente ou refusé, sur une commande vivante", () => {
    expect(awaitsCardPayment("placed", "pending")).toBe(true);
    expect(awaitsCardPayment("ready", "failed")).toBe(true);
  });

  it("écarte une commande annulée : on ne fait pas payer ce qu'on ne fabriquera pas", () => {
    expect(awaitsCardPayment("cancelled", "pending")).toBe(false);
    expect(awaitsCardPayment("cancelled", "failed")).toBe(false);
  });

  it("écarte un règlement payé, sans objet ou remboursé", () => {
    expect(awaitsCardPayment("placed", "paid")).toBe(false);
    expect(awaitsCardPayment("placed", "not_required")).toBe(false);
    expect(awaitsCardPayment("placed", "refunded")).toBe(false);
  });
});
