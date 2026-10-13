import { deliveryStopColor } from "../delivery-stop-color.js";

const COLORS = { pro: "#1e88e5", public: "#fdd835" };

describe("deliveryStopColor — la couleur d'un arrêt de livraison (L5)", () => {
  it("la couleur de livraison du départ pour la clientèle de la commande", () => {
    expect(deliveryStopColor("pro", COLORS)).toBe("#1e88e5");
    expect(deliveryStopColor("public", COLORS)).toBe("#fdd835");
  });

  it("clientèle inconnue : aucune couleur, jamais une teinte devinée", () => {
    expect(deliveryStopColor(null, COLORS)).toBeNull();
  });

  it("couleur non posée : aucune couleur", () => {
    expect(deliveryStopColor("pro", { pro: null, public: "#fdd835" })).toBeNull();
  });
});
