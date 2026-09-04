import {
  CATALOG_SNAPSHOT_VERSION,
  catalogSnapshotSchema,
  storedCatalogSnapshotSchema,
  syncVariantSchema,
} from "../snapshot.js";

/**
 * Ce que ces tests éprouvent, ce n'est pas Zod : c'est que **les refus promis par
 * la doc sont réellement des refus**. Chacun correspond à une phrase de
 * `architecture-catalogue-synchronise.md` — si l'un tombe, c'est la doc qui ment.
 */

const variant = {
  // Traverse depuis la v7 : une règle de rang « déclinaison » vise cet
  // identifiant-là, et le SKU seul ne permettrait pas de la rattacher.
  id: "var_1",
  sku: "VIE-001-1",
  name: "Croissant",
  priceMillicents: 200,
  weightGrams: null,
  isDefault: true,
  position: 0,
  vatRatePercent: 5.5,
  allergens: ["AW"],
  allergenLabels: { labels: [{ category: "milk", label: "Lait" }], incomplete: false },
};

const snapshot = {
  version: CATALOG_SNAPSHOT_VERSION,
  generatedAt: "2026-08-17T09:00:00+02:00",
  categories: [
    {
      id: "cat_vien",
      name: "Viennoiseries",
      slug: "viennoiseries",
      parentId: null,
      position: 0,
      vatRatePercent: 5.5,
      allergens: ["AW"],
    },
  ],
  products: [
    {
      id: "prd_1",
      sku: "VIE-001",
      name: "Croissant",
      categoryId: "cat_vien",
      kind: "daily",
      variants: [variant],
    },
  ],
  // L'échelle traverse depuis la v7 — vide est le cas courant, et il est net.
  orderTimeLimits: [],
};

describe("catalogSnapshotSchema", () => {
  it("accepte un snapshot complet", () => {
    expect(catalogSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("refuse une version de format inconnue plutôt que d'ingérer à moitié", () => {
    // Dérivée, jamais écrite en dur : le test disait `2`, qui est devenu la
    // version COURANTE le jour où le taux est descendu sur l'article. Un
    // numéro figé finit toujours par désigner le présent.
    const future = { ...snapshot, version: CATALOG_SNAPSHOT_VERSION + 1 };

    expect(catalogSnapshotSchema.safeParse(future).success).toBe(false);
  });

  it("refuse un produit sans déclinaison — il n'y aurait rien à vendre", () => {
    const empty = {
      ...snapshot,
      products: [{ ...snapshot.products[0], variants: [] }],
    };

    expect(catalogSnapshotSchema.safeParse(empty).success).toBe(false);
  });

  it("refuse un instant d'émission sans fuseau", () => {
    const naive = { ...snapshot, generatedAt: "2026-08-17T09:00:00" };

    expect(catalogSnapshotSchema.safeParse(naive).success).toBe(false);
  });

  it("accepte un catalogue vide — une boutique peut n'avoir encore rien publié", () => {
    const nothing = { ...snapshot, categories: [], products: [] };

    expect(catalogSnapshotSchema.safeParse(nothing).success).toBe(true);
  });
});

describe("syncVariantSchema", () => {
  it("refuse une déclinaison sans prix, au lieu de la lire en gratuite", () => {
    const priceless: Record<string, unknown> = { ...variant };
    delete priceless.priceMillicents;

    expect(syncVariantSchema.safeParse(priceless).success).toBe(false);
  });

  it("refuse un prix à virgule — l'argent est en centimes entiers", () => {
    expect(syncVariantSchema.safeParse({ ...variant, priceMillicents: 2.5 }).success).toBe(false);
  });

  it("refuse un prix négatif", () => {
    expect(syncVariantSchema.safeParse({ ...variant, priceMillicents: -1 }).success).toBe(false);
  });

  it("accepte un poids absent — tout ne se pèse pas", () => {
    expect(syncVariantSchema.safeParse({ ...variant, weightGrams: null }).success).toBe(true);
  });
});

describe("le taux de TVA de l’article", () => {
  /**
   * Depuis la v2, c'est l'ARTICLE qui porte son taux. Le rendre facultatif
   * aurait laissé un émetteur l'oublier, et le récepteur aurait facturé sur un
   * taux hérité d'une jointure — précisément ce que le déplacement corrige.
   */
  it("est obligatoire — un article muet sur sa TVA n’est pas un article", () => {
    const sansTaux: Record<string, unknown> = { ...variant };
    delete sansTaux["vatRatePercent"];

    expect(syncVariantSchema.safeParse(sansTaux).success).toBe(false);
  });

  /** `null` est une réponse : « famille non réglée », donc non vendable. */
  it("accepte `null`, qui dit « pas de taux » sans mentir", () => {
    expect(syncVariantSchema.safeParse({ ...variant, vatRatePercent: null }).success).toBe(true);
  });

  it("refuse un taux négatif", () => {
    expect(syncVariantSchema.safeParse({ ...variant, vatRatePercent: -1 }).success).toBe(false);
  });
});

describe("les allergènes de l’article", () => {
  /**
   * Les trois états doivent traverser le fil sans se confondre — c'est la seule
   * faute qui compte sur ce champ : un oubli de saisie affiché comme une
   * promesse au consommateur.
   */
  it("distingue « pas de fiche » de « fiche sans allergène »", () => {
    expect(syncVariantSchema.safeParse({ ...variant, allergens: null }).success).toBe(true);
    expect(syncVariantSchema.safeParse({ ...variant, allergens: [] }).success).toBe(true);

    const sansFiche = syncVariantSchema.parse({ ...variant, allergens: null });
    const ficheVide = syncVariantSchema.parse({ ...variant, allergens: [] });
    expect(sansFiche.allergens).toBeNull();
    expect(ficheVide.allergens).toEqual([]);
  });

  it("exige le champ : un article muet sur ses allergènes n’est pas un article sans allergène", () => {
    const muet: Record<string, unknown> = { ...variant };
    delete muet["allergens"];
    expect(syncVariantSchema.safeParse(muet).success).toBe(false);
  });

  it("refuse un code vide", () => {
    expect(syncVariantSchema.safeParse({ ...variant, allergens: [""] }).success).toBe(false);
  });
});

/**
 * **Les mentions d'étiquette, depuis la v5.** Le fil ne portait que des codes,
 * au motif que « la projection appartient à qui affiche ». Le motif est tombé :
 * le référentiel d'allergènes est devenu une donnée administrable du PIM, et le
 * récepteur n'a plus de quoi projeter (D6 de
 * `documentation/pim/data-model/05-allergenes-gs1-inco.md`).
 */
describe("les mentions d’étiquette de l’article", () => {
  it("exige le champ : un article muet dessus n’est pas un article sans allergène", () => {
    const muet: Record<string, unknown> = { ...variant };
    delete muet["allergenLabels"];

    expect(syncVariantSchema.safeParse(muet).success).toBe(false);
  });

  it("accepte `null`, qui suit « aucune fiche déclarée »", () => {
    expect(syncVariantSchema.safeParse({ ...variant, allergenLabels: null }).success).toBe(true);
  });

  it("accepte une liste VIDE et complète — la fiche affirme « aucun allergène »", () => {
    const vide = { ...variant, allergenLabels: { labels: [], incomplete: false } };

    expect(syncVariantSchema.safeParse(vide).success).toBe(true);
  });

  /**
   * Le drapeau est le cœur du champ. Sans lui, un article déclarant la seule
   * noix de coco voyagerait avec une liste vide qu'un écran lirait « sans
   * allergène » — c'est le défaut corrigé côté plateforme le 2026-08-31, et le
   * fil le rejouerait.
   */
  it("exige `incomplete` : une liste amputée ne peut pas se taire", () => {
    const sansAveu = { ...variant, allergenLabels: { labels: [] } };

    expect(syncVariantSchema.safeParse(sansAveu).success).toBe(false);
  });

  it("refuse une mention sans catégorie — la clé est ce qu’un écran groupe", () => {
    const orpheline = {
      ...variant,
      allergenLabels: { labels: [{ label: "Lait" }], incomplete: false },
    };

    expect(syncVariantSchema.safeParse(orpheline).success).toBe(false);
  });

  it("refuse un libellé vide — une mention muette ne s’imprime pas", () => {
    const muette = {
      ...variant,
      allergenLabels: { labels: [{ category: "milk", label: "" }], incomplete: false },
    };

    expect(syncVariantSchema.safeParse(muette).success).toBe(false);
  });
});

/**
 * **Régression : une arrivée en attente devenait illisible à chaque champ
 * ajouté.**
 *
 * L'inbox de revue garde un snapshot en `jsonb` jusqu'à ce qu'un humain le
 * valide, et cette attente traverse les déploiements. Le dépôt le revalidait
 * avec le schéma du FIL : ajouter `orderTimeLimit` a donc fait disparaître les
 * arrivées en attente — sans rien casser visiblement au déploiement, et donc
 * sans qu'on relie la cause à l'effet (constaté et corrigé le 2026-09-04).
 */
describe("storedCatalogSnapshotSchema — relire ce qu'on a stocké", () => {
  /** Un snapshot tel qu'une version ANTÉRIEURE du fil l'a écrit. */
  function v5(): Record<string, unknown> {
    const ancien = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
    ancien["version"] = 5;
    delete ancien["orderTimeLimits"];
    const produits = ancien["products"] as { variants: Record<string, unknown>[] }[];
    for (const produit of produits) {
      for (const declinaison of produit.variants) {
        delete declinaison["id"];
      }
    }
    return ancien;
  }

  it("relit une arrivée d'une version antérieure, champs absents compris", () => {
    const parsed = storedCatalogSnapshotSchema.safeParse(v5());
    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.variants[0]?.id).toBeUndefined();
    expect(parsed.data?.orderTimeLimits).toBeUndefined();
  });

  /**
   * 🔴 **Une v6 garde sa limite RÉSOLUE, que la v7 n'émet plus.**
   *
   * Une arrivée mise en file avant le déploiement porte la limite sur chaque
   * déclinaison ; la v7 la porte au niveau du snapshot, sous forme de règles.
   * Si le stockage cessait de relire l'ancien champ, valider cette arrivée-là
   * effacerait toutes les limites du catalogue — silencieusement, et sur la
   * seule règle qui refuse une commande en retard.
   */
  it("relit la limite résolue d'une arrivée v6", () => {
    const v6 = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
    v6["version"] = 6;
    delete v6["orderTimeLimits"];
    const produits = v6["products"] as { variants: Record<string, unknown>[] }[];
    for (const produit of produits) {
      for (const declinaison of produit.variants) {
        delete declinaison["id"];
        declinaison["orderTimeLimit"] = { daysBefore: 1, time: "18:00", graceMinutes: 0 };
      }
    }

    const parsed = storedCatalogSnapshotSchema.safeParse(v6);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.variants[0]?.orderTimeLimit).toEqual({
      daysBefore: 1,
      time: "18:00",
      graceMinutes: 0,
    });
  });

  /**
   * Le schéma du FIL, lui, reste strict : un émetteur qui oublie un champ doit
   * échouer à l'émission, pas produire une arrivée dégradée. C'est toute la
   * raison d'avoir deux schémas plutôt qu'un seul assoupli.
   */
  it("laisse le schéma du fil REFUSER ce que le stockage accepte", () => {
    expect(catalogSnapshotSchema.safeParse(v5()).success).toBe(false);
  });

  /**
   * « Connue », pas « quelconque » : le but est de relire le passé, jamais de
   * deviner l'avenir. Une arrivée d'une version qu'on ne connaît pas reste
   * refusée, comme elle l'a toujours été.
   */
  it("refuse quand même une version inconnue", () => {
    expect(storedCatalogSnapshotSchema.safeParse({ ...snapshot, version: 99 }).success).toBe(false);
  });
});
