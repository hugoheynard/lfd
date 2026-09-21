import {
  carriesPublicVatChange,
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

const shot = (over: Partial<NonNullable<DeliveredItem["image"]>> = {}) => ({
  url: "https://m.example/croissant.jpg",
  alt: "Un croissant",
  width: 800,
  height: 800,
  ...over,
});

const item = (sku: string, over: Partial<DeliveredItem> = {}): DeliveredItem => ({
  sku,
  name: `Article ${sku}`,
  priceMillicents: 210_000,
  vatRatePercent: 5.5,
  publicTtcCents: 250,
  publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
  weightGrams: 80,
  categoryId: "c_vie",
  allergens: ["AU"],
  orderTimeLimit: null,
  note: null,
  image: null,
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

/**
 * 🔴 **La vitrine se relit comme le reste.**
 *
 * Sans ces comparaisons, une description ou une photo passerait en vente SANS
 * RELECTURE, pendant que l'écran de réception continuerait d'affirmer que rien
 * ne passe sans être relu. Ce sont les deux choses qu'un client lit avant
 * d'acheter, et la seule prose que la maison publie sous son nom.
 */
describe("le diff d'une arrivée › la vitrine", () => {
  it("voit une ligne de vitrine réécrite", () => {
    const before = item("VIE-001", { note: "Tourage patient" });
    const after = item("VIE-001", { note: "Tourage patient, beurre AOP" });

    expect(diffDelivery([after], [before])).toEqual([
      { sku: "VIE-001", kind: "changed", fields: ["note"] },
    ]);
  });

  /** Une ligne EFFACÉE n'est pas une ligne jamais écrite : deux nouvelles. */
  it("distingue une ligne effacée d'une ligne jamais écrite", () => {
    const never = item("VIE-001", { note: null });
    const erased = item("VIE-001", { note: "" });

    expect(diffDelivery([erased], [never])).toEqual([
      { sku: "VIE-001", kind: "changed", fields: ["note"] },
    ]);
  });

  it("voit un packshot qui change d'image", () => {
    const before = item("VIE-001", { image: shot() });
    const after = item("VIE-001", { image: shot({ url: "https://m.example/autre.jpg" }) });

    expect(diffDelivery([after], [before])).toEqual([
      { sku: "VIE-001", kind: "changed", fields: ["image"] },
    ]);
  });

  /**
   * L'alternative ne change pas l'image, mais elle change ce qu'un lecteur
   * d'écran entend. C'est un fait distinct, donc une raison de relire.
   */
  it("voit une alternative réécrite, à image inchangée", () => {
    const before = item("VIE-001", { image: shot({ alt: "Croissant" }) });
    const after = item("VIE-001", { image: shot({ alt: "Croissant au beurre, doré" }) });

    expect(diffDelivery([after], [before])).toEqual([
      { sku: "VIE-001", kind: "changed", fields: ["image"] },
    ]);
  });

  /** Les dimensions décident de la place que la grille réserve. */
  it("voit des dimensions corrigées", () => {
    const before = item("VIE-001", { image: shot({ width: 800, height: 800 }) });
    const after = item("VIE-001", { image: shot({ width: 1200, height: 800 }) });

    expect(diffDelivery([after], [before])).toEqual([
      { sku: "VIE-001", kind: "changed", fields: ["image"] },
    ]);
  });

  it("voit un visuel qui apparaît, et un qui disparaît", () => {
    const none = item("VIE-001", { image: null });
    const some = item("VIE-001", { image: shot() });

    expect(diffDelivery([some], [none])).toEqual([
      { sku: "VIE-001", kind: "changed", fields: ["image"] },
    ]);
    expect(diffDelivery([none], [some])).toEqual([
      { sku: "VIE-001", kind: "changed", fields: ["image"] },
    ]);
  });

  it("ne dit rien d'un visuel identique", () => {
    expect(
      diffDelivery([item("VIE-001", { image: shot() })], [item("VIE-001", { image: shot() })]),
    ).toEqual([]);
  });

  it("nomme les deux quand les deux bougent", () => {
    const before = item("VIE-001", { note: "Avant", image: null });
    const after = item("VIE-001", { note: "Après", image: shot() });

    expect(diffDelivery([after], [before])).toEqual([
      { sku: "VIE-001", kind: "changed", fields: ["note", "image"] },
    ]);
  });
});

/**
 * 🔴 **LE CAS QUE RIEN NE VOYAIT** (2026-09-21).
 *
 * `vatRate` porte le taux du contexte `b2b` — le seul qui traversait le fil
 * avant la v9. Passer l'à-emporter de 5,5 % à 10 % ne le touche pas, et ne
 * déplace pas l'étiquette non plus : **la relecture disait « rien n'a
 * changé »** alors que ce qu'un consommateur paie venait de bouger.
 */
describe("le prix public dans une arrivée", () => {
  const PUBLIC_55 = { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } };

  it("🔴 voit un TAUX PUBLIC bouger — que rien d'autre ne trahit", () => {
    const changes = diffDelivery(
      [
        item("VIE-001", {
          publicByContext: { takeaway: { vatRatePercent: 10, htMillicents: 227_273 } },
        }),
      ],
      [item("VIE-001", { publicByContext: PUBLIC_55 })],
    );

    expect(changes[0]?.fields).toEqual(["publicVatRate"]);
    expect(carriesPublicVatChange(changes)).toBe(true);
  });

  it("voit l'ÉTIQUETTE bouger, et ne la confond pas avec le prix pro", () => {
    const changes = diffDelivery(
      [item("VIE-001", { publicTtcCents: 270 })],
      [item("VIE-001", { publicTtcCents: 250 })],
    );

    // `price` porte le prix PRO : il n'a pas bougé ici, et ne doit pas mentir.
    expect(changes[0]?.fields).toEqual(["publicPrice"]);
    expect(carriesPublicVatChange(changes)).toBe(false);
  });

  /**
   * Un contexte de vente qui s'ouvre est une manière de vendre de plus, avec
   * son traitement fiscal. Elle compte comme un changement de taux — sinon le
   * jour où le sur place arrive, il arriverait en silence.
   */
  it("compte un CONTEXTE gagné comme un changement de taux", () => {
    const changes = diffDelivery(
      [
        item("VIE-001", {
          publicByContext: { ...PUBLIC_55, eatIn: { vatRatePercent: 10, htMillicents: 227_273 } },
        }),
      ],
      [item("VIE-001", { publicByContext: PUBLIC_55 })],
    );

    expect(changes[0]?.fields).toEqual(["publicVatRate"]);
  });

  /**
   * Le hors taxe se DÉRIVE du taux. Le comparer aussi ferait sonner deux fois
   * pour un seul changement — et un écran qui sonne deux fois pour la même
   * nouvelle est un écran qu'on cesse de lire.
   */
  it("ne sonne PAS deux fois : seul le taux est comparé, pas son dérivé", () => {
    const changes = diffDelivery(
      [
        item("VIE-001", {
          publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 1 } },
        }),
      ],
      [item("VIE-001", { publicByContext: PUBLIC_55 })],
    );

    expect(changes).toEqual([]);
  });

  /**
   * Deux lignes d'avant la v9 n'ont rien à se dire. Un `null` contre une carte,
   * si : c'est le premier push qui apporte le prix public, et il se voit.
   */
  it("distingue deux absences d'une absence qui se remplit", () => {
    const sansPrix = { publicTtcCents: null, publicByContext: null };

    expect(diffDelivery([item("VIE-001", sansPrix)], [item("VIE-001", sansPrix)])).toEqual([]);
    expect(diffDelivery([item("VIE-001")], [item("VIE-001", sansPrix)])[0]?.fields).toEqual([
      "publicPrice",
      "publicVatRate",
    ]);
  });

  /**
   * ⚠️ Contrairement aux allergènes, un article qui ENTRE ne fait pas sonner.
   * Sa déclaration d'allergène est nouvelle et personne ne l'a relue ; son
   * taux, lui, ne remplace rien — il n'y a aucune vente en cours à mal
   * facturer.
   */
  it("ne sonne pas pour un article qui ENTRE", () => {
    const changes = diffDelivery([item("VIE-002")], [item("VIE-001")]);

    expect(changes.some((change) => change.kind === "added")).toBe(true);
    expect(carriesPublicVatChange(changes)).toBe(false);
  });
});
