import { untitledKinds } from "../alert-labels.js";

describe("les titres de type, côté serveur", () => {
  /**
   * L'e-mail et la cloche sont écrits par le backend : ils ne peuvent pas aller
   * chercher un libellé de composant Angular sans inverser la dépendance. Le
   * doublon est donc assumé — ce test empêche seulement qu'il pourrisse.
   */
  it("couvrent tous les types du contrat", () => {
    expect(untitledKinds()).toEqual([]);
  });
});
