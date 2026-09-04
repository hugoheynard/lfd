import {
  carriesAllergenChange,
  diffDelivery,
  type DeliveredItem,
  type SkuChange,
} from "../delivery-diff.js";

/**
 * Ce que ces cas tiennent : **une arrivée dit ce qu'elle change, sans regarder
 * les commandes**.
 *
 * C'est toute la raison d'être de ce calcul. Le nommage des commandes touchées
 * ne voit que ce qui a été commandé ; une correction d'allergène sur un article
 * que personne n'a pris ne lui produit aucune ligne — et c'est le cas
 * majoritaire.
 */

const item = (sku: string, over: Partial<DeliveredItem> = {}): DeliveredItem => ({
  sku,
  name: `Article ${sku}`,
  priceMillicents: 210_000,
  vatRatePercent: 5.5,
  weightGrams: 80,
  categoryId: "c_vie",
  allergens: ["AU"],
  orderTimeLimit: null,
  ...over,
});

const skus = (changes: readonly SkuChange[]): string[] => changes.map((change) => change.sku);

describe("le diff d'une arrivée", () => {
  it("ne dit rien d'un catalogue identique", () => {
    const catalogue = [item("A"), item("B")];

    expect(diffDelivery(catalogue, catalogue)).toEqual([]);
  });

  it("nomme les champs qui diffèrent, jamais un simple « a changé »", () => {
    const changes = diffDelivery(
      [item("A", { priceMillicents: 300_000, name: "Renommé" })],
      [item("A")],
    );

    expect(changes).toEqual([{ sku: "A", kind: "changed", fields: ["name", "price"] }]);
  });

  it("voit un article qui entre", () => {
    const changes = diffDelivery([item("A"), item("B")], [item("A")]);

    expect(changes).toEqual([{ sku: "B", kind: "added", fields: [] }]);
  });

  /**
   * 🔴 Un retrait est une ABSENCE dans l'arrivée : il ne s'exprime pas dans une
   * liste de lignes entrantes. C'est pour ça que la réception porte le snapshot
   * ENTIER — sans lui, « ce qui sort » ne serait pas validable.
   */
  it("voit un article qui sort, alors qu'il n'est nulle part dans l'arrivée", () => {
    const changes = diffDelivery([item("A")], [item("A"), item("B")]);

    expect(changes).toEqual([{ sku: "B", kind: "removed", fields: [] }]);
  });

  it("rend une liste triée, pour qu'un écran ne change pas d'ordre entre deux lectures", () => {
    const changes = diffDelivery([item("C"), item("A", { name: "x" })], [item("A"), item("B")]);

    expect(skus(changes)).toEqual(["A", "B", "C"]);
  });

  describe("les allergènes", () => {
    /** Un réordonnancement ne change rien à ce qu'un client lit. */
    it("ignore l'ordre des codes", () => {
      const changes = diffDelivery(
        [item("A", { allergens: ["AN", "AU"] })],
        [item("A", { allergens: ["AU", "AN"] })],
      );

      expect(changes).toEqual([]);
    });

    /**
     * 🔴 `null` contre `[]` DOIT différer. « Pas de fiche réglementaire » n'est
     * pas « aucun allergène » : l'un est un silence, l'autre une affirmation
     * qu'un client a le droit de lire. Les confondre transformerait une
     * ignorance en affirmation, sur le seul champ qui ne se rattrape pas.
     */
    it("distingue « pas de fiche » de « aucun allergène »", () => {
      const silence = diffDelivery(
        [item("A", { allergens: null })],
        [item("A", { allergens: [] })],
      );
      const affirmation = diffDelivery(
        [item("A", { allergens: [] })],
        [item("A", { allergens: null })],
      );

      expect(silence).toEqual([{ sku: "A", kind: "changed", fields: ["allergens"] }]);
      expect(affirmation).toEqual([{ sku: "A", kind: "changed", fields: ["allergens"] }]);
    });

    it("voit un allergène ajouté comme un allergène retiré", () => {
      const ajouté = diffDelivery(
        [item("A", { allergens: ["AU", "AN"] })],
        [item("A", { allergens: ["AU"] })],
      );

      expect(ajouté[0]?.fields).toEqual(["allergens"]);
    });
  });

  describe("l'escalade à la réception", () => {
    it("sonne quand une déclaration d'allergène bouge", () => {
      const changes = diffDelivery(
        [item("A", { allergens: ["AU", "AN"] })],
        [item("A", { allergens: ["AU"] })],
      );

      expect(carriesAllergenChange(changes)).toBe(true);
    });

    /** Un article qui entre porte une déclaration que personne n'a relue. */
    it("sonne aussi pour un article qui ENTRE", () => {
      expect(carriesAllergenChange(diffDelivery([item("A")], []))).toBe(true);
    });

    /**
     * Et ne sonne pas pour le reste : une arrivée « prix et textes » dort sans
     * drame. Une cloche qui sonne pour tout cesse d'être lue, précisément avant
     * celle qui comptait.
     */
    it("ne sonne pas pour un prix, un nom ou un retrait", () => {
      const prix = diffDelivery([item("A", { priceMillicents: 1 })], [item("A")]);
      const nom = diffDelivery([item("A", { name: "x" })], [item("A")]);
      const retrait = diffDelivery([], [item("A")]);

      expect(carriesAllergenChange(prix)).toBe(false);
      expect(carriesAllergenChange(nom)).toBe(false);
      expect(carriesAllergenChange(retrait)).toBe(false);
    });
  });
});

describe("la limite de commande", () => {
  /**
   * 🔴 **Régression : une arrivée annoncée « 0 changement ».**
   *
   * Le champ ne se comparait pas. Passer la limite globale de 18 h à 16 h
   * fermait deux heures de prise de commande sur toute la plateforme, et
   * l'écran de validation n'avait rien à en dire — quelqu'un devait valider à
   * l'aveugle. Un diff qui ignore un champ ne dit pas « rien n'a bougé » ; il ne
   * dit rien du tout, et c'est pire, parce qu'on le lit comme le premier.
   */
  it("signale une limite qui change d'heure", () => {
    const before = item("VIE-001", {
      orderTimeLimit: { daysBefore: 1, time: "18:00", graceMinutes: 0 },
    });
    const after = item("VIE-001", {
      orderTimeLimit: { daysBefore: 1, time: "16:00", graceMinutes: 0 },
    });

    expect(diffDelivery([after], [before])).toEqual([
      { sku: "VIE-001", kind: "changed", fields: ["orderLimit"] },
    ]);
  });

  it("signale une limite qui apparaît, et une qui disparaît", () => {
    // Les deux sens comptent : un article qui se met à fermer et un article qui
    // cesse de fermer sont l'un et l'autre une nouvelle.
    const sans = item("VIE-001", { orderTimeLimit: null });
    const avec = item("VIE-001", {
      orderTimeLimit: { daysBefore: 1, time: "18:00", graceMinutes: 0 },
    });

    expect(diffDelivery([avec], [sans])[0]?.fields).toEqual(["orderLimit"]);
    expect(diffDelivery([sans], [avec])[0]?.fields).toEqual(["orderLimit"]);
  });

  it("signale un rattrapage qui change, la limite restant la même", () => {
    // Le rattrapage décide qui peut encore passer par dérogation : le taire
    // ferait valider en croyant que rien ne bouge.
    const before = item("VIE-001", {
      orderTimeLimit: { daysBefore: 1, time: "18:00", graceMinutes: 0 },
    });
    const after = item("VIE-001", {
      orderTimeLimit: { daysBefore: 1, time: "18:00", graceMinutes: 30 },
    });

    expect(diffDelivery([after], [before])[0]?.fields).toEqual(["orderLimit"]);
  });

  it("ne signale rien quand la limite est identique", () => {
    const limite = { daysBefore: 1, time: "18:00", graceMinutes: 30 };

    expect(
      diffDelivery(
        [item("VIE-001", { orderTimeLimit: { ...limite } })],
        [item("VIE-001", { orderTimeLimit: { ...limite } })],
      ),
    ).toEqual([]);
  });
});
