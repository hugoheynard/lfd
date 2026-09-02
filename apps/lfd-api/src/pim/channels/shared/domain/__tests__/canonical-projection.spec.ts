import {
  CATALOG_SNAPSHOT_VERSION,
  type CatalogSnapshot,
  type SyncCategory,
  type SyncProduct,
  type SyncVariant,
} from "@lfd/catalog-sync";

import { canonicalProjection, projectionFingerprint } from "../canonical-projection.js";

/**
 * **La pièce dont tout le chantier dépend**, et le seul test qui puisse la
 * prouver : deux projections d'un catalogue identique doivent rendre la même
 * empreinte, y compris quand la base a rendu ses lignes dans un autre ordre.
 *
 * Si ces cas passent, le push peut refuser sur l'empreinte. S'ils échouent, il
 * refuse **toujours**, et la garantie devient un blocage permanent.
 */

const variant = (sku: string, over: Partial<SyncVariant> = {}): SyncVariant => ({
  sku,
  name: `Déclinaison ${sku}`,
  priceMillicents: 210_000,
  weightGrams: 80,
  isDefault: true,
  position: 0,
  vatRatePercent: 5.5,
  allergens: ["AU"],
  allergenLabels: { labels: [{ category: "gluten", label: "gluten" }], incomplete: false },
  ...over,
});

const product = (sku: string, variants: SyncVariant[] = [variant(`${sku}-1`)]): SyncProduct => ({
  id: `p_${sku}`,
  sku,
  name: `Produit ${sku}`,
  categoryId: "c_vie",
  kind: "daily",
  variants,
});

const category = (id: string, over: Partial<SyncCategory> = {}): SyncCategory => ({
  id,
  name: `Famille ${id}`,
  slug: id,
  parentId: null,
  position: 0,
  ...over,
});

const snapshot = (over: Partial<CatalogSnapshot> = {}): CatalogSnapshot => ({
  version: CATALOG_SNAPSHOT_VERSION,
  // Une date absolue est ici LE SUJET du test, et elle n'est jamais comparée à
  // l'horloge — seulement à une autre date de la fixture. C'est l'exception
  // étroite que le CLAUDE.md autorise.
  generatedAt: "2026-01-01T00:00:00.000Z",
  categories: [category("c_vie"), category("c_pat")],
  products: [product("VIE-001"), product("PAT-002")],
  ...over,
});

describe("la forme canonique d'une projection", () => {
  it("rend la même empreinte pour deux projections identiques", () => {
    expect(projectionFingerprint(snapshot())).toBe(projectionFingerprint(snapshot()));
  });

  /**
   * 🔴 Le cas qui justifie la fonction entière. `generatedAt` est posé à
   * l'émission : sans son retrait, deux projections séparées d'une milliseconde
   * donnent deux empreintes, et le push refuse toujours.
   */
  it("ignore `generatedAt` — l'instant d'émission n'est pas du contenu", () => {
    const tôt = snapshot({ generatedAt: "2026-01-01T00:00:00.000Z" });
    const tard = snapshot({ generatedAt: "2026-06-30T23:59:59.999Z" });

    expect(projectionFingerprint(tôt)).toBe(projectionFingerprint(tard));
    expect(canonicalProjection(tôt)).not.toHaveProperty("generatedAt");
  });

  /**
   * L'ordre PHYSIQUE : `position` est un `Int @default(0)` sans unicité, donc
   * Postgres départage par l'ordre de stockage, qui change après un `UPDATE`.
   * Une empreinte sensible à ça refuserait un push parce que quelqu'un a
   * enregistré une fiche sans rien y changer.
   */
  it("ignore l'ordre des produits rendu par la base", () => {
    const a = snapshot({ products: [product("VIE-001"), product("PAT-002")] });
    const b = snapshot({ products: [product("PAT-002"), product("VIE-001")] });

    expect(projectionFingerprint(a)).toBe(projectionFingerprint(b));
  });

  it("ignore l'ordre des familles rendu par la base", () => {
    const a = snapshot({ categories: [category("c_vie"), category("c_pat")] });
    const b = snapshot({ categories: [category("c_pat"), category("c_vie")] });

    expect(projectionFingerprint(a)).toBe(projectionFingerprint(b));
  });

  it("ignore l'ordre des déclinaisons rendu par la base", () => {
    const un = variant("VIE-001-1");
    const deux = variant("VIE-001-2", { isDefault: false });
    const a = snapshot({ products: [product("VIE-001", [un, deux])] });
    const b = snapshot({ products: [product("VIE-001", [deux, un])] });

    expect(projectionFingerprint(a)).toBe(projectionFingerprint(b));
  });

  /**
   * 🔴 La contrepartie, et c'est elle qui rend le tri légitime : trier neutralise
   * l'ordre physique, **jamais** l'ordre métier. Celui-ci vit dans `position`,
   * qui est dans le payload — le déplacer change donc le contenu, et l'empreinte
   * avec.
   *
   * Sans ce cas, rien ne distinguerait « on ignore le bruit » de « on est
   * devenu aveugle ».
   */
  it("VOIT un réordonnancement décidé, porté par `position`", () => {
    const avant = snapshot({
      products: [product("VIE-001", [variant("VIE-001-1", { position: 0 })])],
    });
    const après = snapshot({
      products: [product("VIE-001", [variant("VIE-001-1", { position: 3 })])],
    });

    expect(projectionFingerprint(avant)).not.toBe(projectionFingerprint(après));
  });

  it("voit un prix qui change", () => {
    const cher = snapshot({
      products: [product("VIE-001", [variant("VIE-001-1", { priceMillicents: 999_000 })])],
    });

    expect(projectionFingerprint(snapshot())).not.toBe(projectionFingerprint(cher));
  });

  /** Le champ dont une erreur ne se rattrape pas : il doit peser dans l'empreinte. */
  it("voit une déclaration d'allergènes qui change", () => {
    const déclaré = snapshot({
      products: [product("VIE-001", [variant("VIE-001-1", { allergens: ["AU", "AN"] })])],
    });
    const aucun = snapshot({
      products: [product("VIE-001", [variant("VIE-001-1", { allergens: [] })])],
    });
    const sansFiche = snapshot({
      products: [product("VIE-001", [variant("VIE-001-1", { allergens: null })])],
    });

    const empreintes = new Set([
      projectionFingerprint(déclaré),
      projectionFingerprint(aucun),
      projectionFingerprint(sansFiche),
    ]);
    // Trois états, trois empreintes : `[]` affirme « aucun allergène », `null`
    // avoue « pas de fiche ». Les confondre transformerait une ignorance en
    // affirmation.
    expect(empreintes.size).toBe(3);
  });

  it("voit un article qui entre ou qui sort", () => {
    const deux = projectionFingerprint(snapshot());
    const trois = projectionFingerprint(
      snapshot({ products: [product("VIE-001"), product("PAT-002"), product("BOI-003")] }),
    );

    expect(deux).not.toBe(trois);
  });

  /**
   * Le tri se fait sur l'IDENTIFIANT, jamais sur le nom : un nom se corrige, et
   * une empreinte qui bougerait parce qu'on a réparé une faute de frappe ferait
   * refuser un push qui n'envoie rien d'autre. Le renommage change bien le
   * contenu — mais il ne doit pas changer l'ORDRE.
   */
  it("trie par identifiant, pas par nom", () => {
    const renommé = snapshot({
      categories: [category("c_vie", { name: "AAA — renommée" }), category("c_pat")],
    });

    expect(canonicalProjection(renommé).categories.map((c) => c.id)).toEqual(["c_pat", "c_vie"]);
  });

  /** Une fonction pure ne mute pas ce qu'on lui donne — ici, le tableau de l'appelant. */
  it("ne mute pas le snapshot reçu", () => {
    const source = snapshot();
    const ordreInitial = source.products.map((p) => p.sku);

    canonicalProjection(source);

    expect(source.products.map((p) => p.sku)).toEqual(ordreInitial);
    expect(source).toHaveProperty("generatedAt");
  });
});
