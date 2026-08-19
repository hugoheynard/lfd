import { attainmentBp, isoRevenueRatioBp, observedRatioBp, requiredVolume } from "../elasticity.js";

describe("le ratio iso-chiffre", () => {
  /** Le chiffre que le commercial doit avoir sous les yeux : −20 % ⇒ ×1,25. */
  it("traduit une remise de 20 % en ×1,25", () => {
    expect(isoRevenueRatioBp(200, 160)).toBe(12_500);
  });

  it("vaut ×1 quand le prix ne bouge pas", () => {
    expect(isoRevenueRatioBp(200, 200)).toBe(10_000);
  });

  /**
   * Un supplément est une altération comme une autre : la formule reste la même
   * et rend un ratio inférieur à 1 — on peut vendre moins pour le même chiffre.
   */
  it("rend un ratio inférieur à 1 quand le prix MONTE", () => {
    expect(isoRevenueRatioBp(200, 250)).toBe(8_000);
  });

  /**
   * Un article offert n'atteint le chiffre d'origine à aucun volume. `Infinity`
   * aurait traversé les écrans en « ×∞ », ou en `NaN` après un arrondi.
   */
  it("n'a pas de valeur sur un article passé à zéro", () => {
    expect(isoRevenueRatioBp(200, 0)).toBeNull();
  });

  it("refuse un prix d'arrivée négatif", () => {
    expect(isoRevenueRatioBp(200, -50)).toBeNull();
  });
});

describe("le volume à atteindre", () => {
  it("applique le ratio au volume de référence", () => {
    expect(requiredVolume(400, 12_500)).toBe(500);
  });

  /**
   * Arrondi au SUPÉRIEUR : vendre 124,3 croissants n'existe pas, et arrondir au
   * plus proche annoncerait un objectif atteint alors qu'il manque une unité.
   */
  it("arrondit au supérieur — il manque toujours l'unité entamée", () => {
    expect(requiredVolume(99, 12_500)).toBe(124); // 123,75
  });

  it("n'a pas d'objectif sans volume de référence", () => {
    expect(requiredVolume(0, 12_500)).toBeNull();
  });

  it("n'a pas d'objectif quand le ratio n'en a pas", () => {
    expect(requiredVolume(400, null)).toBeNull();
  });
});

describe("l'atteinte de l'objectif", () => {
  it("dit 100 % quand l'objectif est atteint pile", () => {
    expect(attainmentBp(500, 500)).toBe(10_000);
  });

  it("dit où on en est en dessous", () => {
    expect(attainmentBp(460, 500)).toBe(9_200);
  });

  /**
   * Sans objectif il n'y a pas d'écart à mesurer. Rendre `0 %` ferait passer une
   * absence de mesure pour un échec — l'erreur exactement inverse.
   */
  it("ne rend pas zéro quand il n'y a pas d'objectif", () => {
    expect(attainmentBp(460, null)).toBeNull();
  });
});

describe("le ratio observé", () => {
  it("compare le volume réalisé à sa référence", () => {
    expect(observedRatioBp(400, 500)).toBe(12_500);
  });

  it("dit la baisse quand le volume a reculé", () => {
    expect(observedRatioBp(400, 300)).toBe(7_500);
  });

  /**
   * Un article neuf n'a pas d'historique. Le traiter comme un ratio de zéro
   * dirait « la baisse n'a rien produit » là où la vérité est « on ne sait pas
   * encore » — et c'est cette nuance qui décide du plancher appliqué.
   */
  it("n'a pas de valeur sans référence", () => {
    expect(observedRatioBp(0, 500)).toBeNull();
  });
});
