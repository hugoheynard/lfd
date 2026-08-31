import { ListAllergenCatalogueHandler } from "../list-allergen-catalogue.js";
import {
  ReadAllergenReferenceHandler,
  ReadAllergenReferenceQuery,
} from "../read-allergen-reference.js";
import { AllergenStore, InMemoryAllergenCatalogueReader } from "./in-memory-allergens.js";

/**
 * Un référentiel réduit mais **complet en natures** : une catégorie de l'annexe
 * II, la catégorie officielle sans mention INCO (« hors obligation UE »), et une
 * catégorie maison. C'est la combinaison sur laquelle D2 se trompe.
 */
function seeded(): AllergenStore {
  const store = new AllergenStore();
  store.seedOfficialCategory("alg_cat_tree_nuts", "tree_nuts", "tree_nuts");
  store.seedOfficialCategory("alg_cat_non_eu", "non_eu", null);
  store.seedOfficialEntry("alg_SH", "SH", "alg_cat_tree_nuts");
  store.seedOfficialEntry("alg_BWD", "BWD", "alg_cat_non_eu");
  return store;
}

/** Une catégorie maison et son entrée — ce que le back-office sait créer. */
function withHouse(store: AllergenStore): void {
  store.categories.set("cat_maison", {
    id: "cat_maison",
    key: "exotiques",
    name: { fr: "Fruits à coque exotiques" },
    incoCategory: null,
    official: false,
    position: 100,
    archivedAt: null,
  });
  store.entries.set("ent_maison", {
    id: "ent_maison",
    code: "X-SOUCHET",
    name: { fr: "Souchet" },
    categoryId: "cat_maison",
    official: false,
    archivedAt: null,
  });
}

function codesOf(store: AllergenStore, scope: "eu" | "world"): Promise<string[]> {
  return new ReadAllergenReferenceHandler(new InMemoryAllergenCatalogueReader(store))
    .execute(new ReadAllergenReferenceQuery(scope, "fr"))
    .then((reference) => reference.entries.map((entry) => entry.code));
}

describe("ReadAllergenReferenceHandler — le périmètre (D2)", () => {
  it("sort du catalogue `eu` les codes officiels hors obligation UE", async () => {
    const store = seeded();

    expect(await codesOf(store, "eu")).toEqual(["SH"]);
    expect((await codesOf(store, "world")).sort()).toEqual(["BWD", "SH"]);
  });

  /**
   * Le point sur lequel D2 a été redressé : `eu` ne veut pas dire « porte une
   * catégorie de l'annexe II ». Filtrer sur `incoCategory !== null` rendrait un
   * allergène maison créable et jamais cochable — le formulaire produit démarre
   * sur `eu`.
   */
  it("garde les allergènes maison dans le catalogue `eu`", async () => {
    const store = seeded();
    withHouse(store);

    expect((await codesOf(store, "eu")).sort()).toEqual(["SH", "X-SOUCHET"]);
  });

  it("ne prête jamais de mention réglementaire à un allergène maison", async () => {
    // Il est déclarable, et il n'apparaîtra pas comme une mention de l'annexe II :
    // c'est exactement la séparation que D1 protège.
    const store = seeded();
    withHouse(store);

    const reference = await new ReadAllergenReferenceHandler(
      new InMemoryAllergenCatalogueReader(store),
    ).execute(new ReadAllergenReferenceQuery("eu", "fr"));

    expect(reference.entries.find((entry) => entry.code === "X-SOUCHET")).toEqual({
      code: "X-SOUCHET",
      label: "Souchet",
      incoCategory: null,
      incoLabel: null,
    });
    expect(reference.entries.find((entry) => entry.code === "SH")).toMatchObject({
      incoCategory: "tree_nuts",
      incoLabel: "tree_nuts",
    });
  });
});

describe("ReadAllergenReferenceHandler — l'archivage (D2 bis)", () => {
  it("cesse de proposer une entrée archivée, dans les deux périmètres", async () => {
    const store = seeded();
    withHouse(store);
    const entry = store.entries.get("ent_maison");
    if (entry === undefined) {
      throw new Error("fixture incohérente");
    }
    store.entries.set("ent_maison", { ...entry, archivedAt: new Date(0) });

    expect(await codesOf(store, "eu")).toEqual(["SH"]);
    expect((await codesOf(store, "world")).sort()).toEqual(["BWD", "SH"]);
  });

  it("cesse de proposer les entrées d'une catégorie archivée", async () => {
    const store = seeded();
    withHouse(store);
    const category = store.categories.get("cat_maison");
    if (category === undefined) {
      throw new Error("fixture incohérente");
    }
    store.categories.set("cat_maison", { ...category, archivedAt: new Date(0) });

    expect(await codesOf(store, "eu")).toEqual(["SH"]);
  });

  it("continue de RECONNAÎTRE un code archivé", async () => {
    // Ne pas proposer n'est pas refuser : une déclaration enregistrée hier cite
    // ce code, et la relire ne doit pas invalider l'étiquette d'un produit déjà
    // servi.
    const store = seeded();
    withHouse(store);
    const entry = store.entries.get("ent_maison");
    if (entry === undefined) {
      throw new Error("fixture incohérente");
    }
    store.entries.set("ent_maison", { ...entry, archivedAt: new Date(0) });

    const known = await new InMemoryAllergenCatalogueReader(store).knownCodes();

    expect(known.has("X-SOUCHET")).toBe(true);
  });

  it("continue de RECONNAÎTRE un code dont c'est la CATÉGORIE qui est archivée", async () => {
    // `knownCodes()` reconnaît par entrée, pas par famille : une catégorie
    // rangée ne doit pas invalider au passage les codes qu'elle accueille — la
    // même déclaration déjà enregistrée serait sinon rejetée pour une raison
    // que le staff qui archive une catégorie n'a pas décidée.
    const store = seeded();
    withHouse(store);
    const category = store.categories.get("cat_maison");
    if (category === undefined) {
      throw new Error("fixture incohérente");
    }
    store.categories.set("cat_maison", { ...category, archivedAt: new Date(0) });

    const known = await new InMemoryAllergenCatalogueReader(store).knownCodes();

    expect(known.has("X-SOUCHET")).toBe(true);
  });
});

describe("ListAllergenCatalogueHandler", () => {
  it("montre TOUT, archivage compris — c'est d'ici qu'on restaure", async () => {
    const store = seeded();
    withHouse(store);
    const category = store.categories.get("cat_maison");
    if (category === undefined) {
      throw new Error("fixture incohérente");
    }
    const archivedAt = new Date(0);
    store.categories.set("cat_maison", { ...category, archivedAt });

    const views = await new ListAllergenCatalogueHandler(
      new InMemoryAllergenCatalogueReader(store),
    ).execute();

    expect(views.map((view) => view.key)).toEqual(["tree_nuts", "non_eu", "exotiques"]);
    expect(views[2]).toMatchObject({
      official: false,
      archivedAt: archivedAt.toISOString(),
      entries: [{ code: "X-SOUCHET", official: false, archivedAt: null }],
    });
  });

  it("montre aussi une entrée archivée — pas seulement une catégorie archivée", async () => {
    // La catégorie précédente prouve le cas « famille rangée ». Celui-ci est
    // distinct : une entrée seule peut être archivée sous une catégorie bien
    // vivante, et l'écran d'où l'on restaure doit la voir aussi.
    const store = seeded();
    withHouse(store);
    const entry = store.entries.get("ent_maison");
    if (entry === undefined) {
      throw new Error("fixture incohérente");
    }
    const archivedAt = new Date(0);
    store.entries.set("ent_maison", { ...entry, archivedAt });

    const views = await new ListAllergenCatalogueHandler(
      new InMemoryAllergenCatalogueReader(store),
    ).execute();

    const house = views.find((view) => view.key === "exotiques");
    expect(house?.entries).toEqual([
      {
        id: "ent_maison",
        code: "X-SOUCHET",
        name: { fr: "Souchet" },
        official: false,
        archivedAt: archivedAt.toISOString(),
      },
    ]);
  });
});
