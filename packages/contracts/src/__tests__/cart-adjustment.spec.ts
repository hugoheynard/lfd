import { cartAdjustmentCents, discountCentsOf } from "../cart-adjustment.js";

/**
 * L'ajustement de panier sert **deux choses opposées** : ce qu'un point de
 * retrait retire, et ce qu'une zone de livraison ajoute. Les deux se calculent
 * pareil ; une seule se borne.
 */
describe("cartAdjustmentCents — le montant brut, remise comme frais", () => {
  it("rend un pourcentage du sous-total, arrondi au centime", () => {
    // 1000 × 20,00 % = 200.
    expect(cartAdjustmentCents({ mode: "percent", bp: 2000 }, 1000)).toBe(200);
  });

  it("rend un montant fixe tel quel, sans regarder le sous-total", () => {
    expect(cartAdjustmentCents({ mode: "amount", cents: 5000 }, 1000)).toBe(5000);
  });

  /**
   * Une course peut coûter plus cher qu'un petit panier — douze euros de
   * transport sur dix euros de marchandise est une commande ordinaire. C'est
   * pour ça que cette fonction-ci ne borne rien.
   */
  it("laisse des FRAIS dépasser le panier qu'ils accompagnent", () => {
    expect(cartAdjustmentCents({ mode: "amount", cents: 1200 }, 1000)).toBe(1200);
  });
});

/**
 * 🔴 **Régression : une remise en montant fixe pouvait dépasser ce qu'elle
 * remisait.**
 *
 * Un point de retrait remisant 50 € sur un panier de 10 € enregistrait une
 * remise de 50 € à côté d'un sous-total de 10 € : la ligne ne s'additionnait
 * pas. Et elle contredisait le devis de la boutique, que `ventilateVat` bornait
 * déjà de son côté — le client voyait −10 €, la commande gardait −50 €.
 */
describe("discountCentsOf — une remise est bornée à ce qu'elle remise", () => {
  it("borne un montant fixe au sous-total", () => {
    expect(discountCentsOf({ mode: "amount", cents: 5000 }, 1000)).toBe(1000);
  });

  it("laisse passer un montant fixe qui tient dans le panier", () => {
    expect(discountCentsOf({ mode: "amount", cents: 150 }, 1000)).toBe(150);
  });

  /**
   * En pourcentage la borne ne mord jamais : `bp` est plafonné à 10 000 par le
   * schéma, donc un taux ne peut pas dépasser son assiette. Le cas est ici pour
   * que ça reste vrai le jour où quelqu'un touchera à ce plafond.
   */
  it("ne change rien à un pourcentage, même au maximum", () => {
    expect(discountCentsOf({ mode: "percent", bp: 10000 }, 1000)).toBe(1000);
  });

  it("ne rend rien sur un panier vide", () => {
    expect(discountCentsOf({ mode: "amount", cents: 5000 }, 0)).toBe(0);
  });
});
