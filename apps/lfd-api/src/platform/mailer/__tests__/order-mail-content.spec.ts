import { contentOf } from "../order-mail-content.js";

/**
 * Le contenu d'une commande dans les e-mails (`plan-vente-au-poids.md`, P3) :
 * une ligne au poids dit son poids — jamais « 1250 pièces ».
 */
const TEXTS = { pieces: "{count} pièces", weighed: "{name}, {weight}" };

describe("contentOf — le contenu d'une commande en une phrase", () => {
  it("à la pièce, dit le nombre de pièces comme avant", () => {
    const lines = [
      { productName: "Tradition", quantity: 12 },
      { productName: "Croissant", quantity: 3 },
    ];

    expect(contentOf(lines, TEXTS)).toBe("15 pièces");
  });

  it("dit une ligne au poids en grammes sous le kilo, en kilos au-delà", () => {
    const lines = [
      { productName: "Tradition", quantity: 2 },
      { productName: "Saumon gravlax", quantity: 1250, saleUnit: "weight" as const },
      { productName: "Graines au chocolat", quantity: 500, saleUnit: "weight" as const },
    ];

    expect(contentOf(lines, TEXTS)).toBe(
      "2 pièces · Saumon gravlax, 1,25 kg · Graines au chocolat, 500 g",
    );
  });

  it("ne dit pas « 0 pièces » d'une commande toute au poids", () => {
    const lines = [{ productName: "Saumon gravlax", quantity: 2000, saleUnit: "weight" as const }];

    expect(contentOf(lines, TEXTS)).toBe("Saumon gravlax, 2 kg");
  });
});
