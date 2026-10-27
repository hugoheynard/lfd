import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import {
  AllergenStore,
  InMemoryAllergenCatalogueReader,
} from "../../../../allergens/application/__tests__/in-memory-allergens.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import type { VariantSnapshot } from "../../domain/entities/variant.js";
import { PropagationIngredientNotFoundError } from "../../domain/errors/propagation-errors.js";
import { FixedIngredientCitations } from "../../domain/ports/__tests__/fixed-ingredient-citations.js";
import type { IngredientCitations } from "../../domain/ports/ingredient-citations.reader.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import { VariantAllergensRepository } from "../../domain/ports/variant-allergens.repository.js";
import type { CompletenessRules } from "../../domain/services/variant-completeness.js";
import type { AllergenDeclaration } from "../../domain/value-objects/nutrition-declaration.js";
import {
  ApplyIngredientAllergenPropagationCommand,
  ApplyIngredientAllergenPropagationHandler,
} from "../apply-ingredient-allergen-propagation.js";
import {
  PreviewIngredientAllergenPropagationHandler,
  PreviewIngredientAllergenPropagationQuery,
} from "../preview-ingredient-allergen-propagation.js";
import { bareVariant, tarte } from "./audience-doubles.js";

/** Plusieurs fiches, et ce qu'on y a écrit. */
class SomeProducts extends ProductRepository {
  private readonly byId: Map<string, ProductSnapshot>;
  constructor(products: readonly ProductSnapshot[]) {
    super();
    this.byId = new Map(products.map((product) => [product.id, product]));
  }
  findById(id: string): Promise<Product | null> {
    const snapshot = this.byId.get(id);
    return Promise.resolve(snapshot === undefined ? null : Product.reconstitute(snapshot));
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve([...this.byId.values()].map((s) => Product.reconstitute(s)));
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  /** Ce qu'un autre geste écrirait entre l'aperçu et l'application. */
  replace(snapshot: ProductSnapshot): void {
    this.byId.set(snapshot.id, snapshot);
  }
}

class RecordingSheets extends VariantAllergensRepository {
  readonly calls: { variantId: string; declaration: AllergenDeclaration }[] = [];
  save(variantId: string, declaration: AllergenDeclaration): Promise<void> {
    this.calls.push({ variantId, declaration });
    return Promise.resolve();
  }
}

const KEY = "farine-t65";

function sheet(declared: readonly string[] | null): VariantSnapshot["allergenSheet"] {
  return declared === null ? null : { declared, mayContain: [] };
}

function fiche(
  id: string,
  declared: readonly string[] | null,
  over: Partial<ProductSnapshot> = {},
): ProductSnapshot {
  return tarte({
    id,
    name: { fr: `Fiche ${id}` },
    variants: [bareVariant({ id: `${id}_v1`, priceCents: 3_200, allergenSheet: sheet(declared) })],
    ...over,
  });
}

function citations(
  allergens: readonly string[],
  products: readonly { id: string; other?: readonly string[] }[],
): IngredientCitations {
  return {
    ingredient: { key: KEY, name: "Farine T65", allergens },
    products: products.map((p) => ({ productId: p.id, otherCited: p.other ?? [] })),
  };
}

function reference(): InMemoryAllergenCatalogueReader {
  const store = new AllergenStore();
  store.seedOfficialCategory("alg_cat", "main", null);
  for (const code of ["GB", "UW", "SH"]) {
    store.seedOfficialEntry(`alg_${code}`, code, "alg_cat");
  }
  store.seedHouseEntry("alg_OLD", "OLD", "alg_cat", new Date());
  return new InMemoryAllergenCatalogueReader(store);
}

function harness(products: SomeProducts, cited: FixedIngredientCitations) {
  const journal = new RecordingJournal();
  const sheets = new RecordingSheets();
  const emitter = new RecordingCatalogEmitter();
  const apply = new ApplyIngredientAllergenPropagationHandler(
    cited,
    products,
    sheets,
    reference(),
    journal,
    new DirectUnitOfWork(),
    emitter,
  );
  const preview = new PreviewIngredientAllergenPropagationHandler(cited, products, reference());
  return { journal, sheets, emitter, apply, preview };
}

describe("PreviewIngredientAllergenPropagation", () => {
  it("rend par fiche les ajouts, les non renseignées, et les comptes du message", async () => {
    const products = new SomeProducts([
      fiche("p_list", ["UW"], { status: "published" }),
      fiche("p_none", []),
      fiche("p_done", ["GB"]),
      fiche("p_empty", null),
    ]);
    const cited = new FixedIngredientCitations(
      citations(["GB"], [{ id: "p_list" }, { id: "p_none" }, { id: "p_done" }, { id: "p_empty" }]),
    );

    const view = await harness(products, cited).preview.execute(
      new PreviewIngredientAllergenPropagationQuery(KEY, ["GB"], []),
    );

    expect(view.products.map((p) => p.variants[0]?.toAdd)).toEqual([["GB"], ["GB"], [], []]);
    expect(view.products[3]?.variants[0]?.undeclared).toBe(true);
    expect(view.counts).toMatchObject({
      productsTouched: 4,
      alreadyDeclared: 1,
      toReceive: 2,
      toReceivePublished: 1,
      undeclared: 1,
    });
  });

  it("ignore une fiche archivée", async () => {
    const products = new SomeProducts([fiche("p_arch", [], { status: "archived" })]);
    const cited = new FixedIngredientCitations(citations(["GB"], [{ id: "p_arch" }]));

    const view = await harness(products, cited).preview.execute(
      new PreviewIngredientAllergenPropagationQuery(KEY, ["GB"], []),
    );

    expect(view.products).toEqual([]);
    expect(view.counts.productsTouched).toBe(0);
  });

  it("ne propose rien à une déclinaison alignée : elle suit la déclaration du défaut", async () => {
    const aligned = bareVariant({
      id: "p_al_v2",
      sku: "PAT-7-2",
      isDefault: false,
      position: 1,
      regulatoryFollowsDefault: true,
      allergenSheet: sheet([]),
    });
    const base = fiche("p_al", ["UW"]);
    const products = new SomeProducts([{ ...base, variants: [...base.variants, aligned] }]);
    const cited = new FixedIngredientCitations(citations(["GB"], [{ id: "p_al" }]));

    const view = await harness(products, cited).preview.execute(
      new PreviewIngredientAllergenPropagationQuery(KEY, ["GB"], []),
    );

    expect(view.products[0]?.variants.map((v) => v.variantId)).toEqual(["p_al_v1"]);
  });

  it("garde un retrait qu'un autre ingrédient porte encore, et compte la fiche publiée qui perdrait", async () => {
    const products = new SomeProducts([
      fiche("p_lose", ["UW"], { status: "published" }),
      fiche("p_keep", ["UW"]),
    ]);
    const cited = new FixedIngredientCitations(
      citations([], [{ id: "p_lose" }, { id: "p_keep", other: ["UW"] }]),
    );

    const view = await harness(products, cited).preview.execute(
      new PreviewIngredientAllergenPropagationQuery(KEY, [], ["UW"]),
    );

    expect(view.products.map((p) => p.variants[0]?.toRemove)).toEqual([["UW"], []]);
    expect(view.counts).toMatchObject({ toLose: 1, toLosePublished: 1, keptByOtherIngredient: 1 });
  });

  it("refuse un ingrédient inconnu", async () => {
    const run = harness(new SomeProducts([]), new FixedIngredientCitations(null)).preview.execute(
      new PreviewIngredientAllergenPropagationQuery(KEY, ["GB"], []),
    );

    await expect(run).rejects.toBeInstanceOf(PropagationIngredientNotFoundError);
  });
});

describe("ApplyIngredientAllergenPropagation", () => {
  it("écrit chaque déclaration par le port dédié, trace l'ingrédient d'origine, émet une fois", async () => {
    const products = new SomeProducts([fiche("p_a", ["UW"]), fiche("p_b", [])]);
    const cited = new FixedIngredientCitations(citations(["GB"], [{ id: "p_a" }, { id: "p_b" }]));
    const run = harness(products, cited);

    await run.apply.execute(new ApplyIngredientAllergenPropagationCommand(KEY, ["GB"], []));

    expect(run.sheets.calls).toEqual([
      { variantId: "p_a_v1", declaration: { allergens: ["UW", "GB"], mayContain: [] } },
      { variantId: "p_b_v1", declaration: { allergens: ["GB"], mayContain: [] } },
    ]);
    expect(run.journal.types()).toEqual(["product.allergens_saved", "product.allergens_saved"]);
    expect(run.journal.entries[0]?.payload).toMatchObject({
      fromIngredient: { id: KEY, name: "Farine T65" },
    });
    expect(run.emitter.products).toEqual([["p_a", "p_b"]]);
  });

  it("n'écrit pas le retrait d'une déclinaison décochée", async () => {
    const products = new SomeProducts([fiche("p_a", ["UW"]), fiche("p_b", ["UW"])]);
    const cited = new FixedIngredientCitations(citations([], [{ id: "p_a" }, { id: "p_b" }]));
    const run = harness(products, cited);

    await run.apply.execute(
      new ApplyIngredientAllergenPropagationCommand(KEY, [], ["UW"], ["p_b_v1"]),
    );

    expect(run.sheets.calls.map((call) => call.variantId)).toEqual(["p_a_v1"]);
  });

  it("n'écrit rien sur une déclinaison non renseignée", async () => {
    const products = new SomeProducts([fiche("p_empty", null)]);
    const run = harness(
      products,
      new FixedIngredientCitations(citations(["GB"], [{ id: "p_empty" }])),
    );

    await run.apply.execute(new ApplyIngredientAllergenPropagationCommand(KEY, ["GB"], []));

    expect(run.sheets.calls).toEqual([]);
    expect(run.journal.entries).toEqual([]);
    expect(run.emitter.products).toEqual([]);
  });

  it("recalcule l'aperçu : une fiche déclarée entre-temps n'est pas réécrite", async () => {
    const products = new SomeProducts([fiche("p_a", [])]);
    const cited = new FixedIngredientCitations(citations(["GB"], [{ id: "p_a" }]));
    const run = harness(products, cited);
    const before = await run.preview.execute(
      new PreviewIngredientAllergenPropagationQuery(KEY, ["GB"], []),
    );
    products.replace(fiche("p_a", ["GB"]));

    await run.apply.execute(new ApplyIngredientAllergenPropagationCommand(KEY, ["GB"], []));

    expect(before.counts.toReceive).toBe(1);
    expect(run.sheets.calls).toEqual([]);
  });

  it("n'applique plus un ajout que l'ingrédient ne porte plus", async () => {
    const products = new SomeProducts([fiche("p_a", [])]);
    const run = harness(products, new FixedIngredientCitations(citations([], [{ id: "p_a" }])));

    await run.apply.execute(new ApplyIngredientAllergenPropagationCommand(KEY, ["GB"], []));

    expect(run.sheets.calls).toEqual([]);
  });

  // Décision 3 (2026-10-27) : la trace devient un allergène, sans échec global.
  it("promeut un code déclaré en trace : il quitte « peut contenir »", async () => {
    const base = fiche("p_trace", ["UW"]);
    const variant = {
      ...bareVariant({ id: "p_trace_v1", priceCents: 3_200 }),
      allergenSheet: { declared: ["UW"], mayContain: ["GB", "SH"] },
    };
    const products = new SomeProducts([{ ...base, variants: [variant] }]);
    const run = harness(
      products,
      new FixedIngredientCitations(citations(["GB"], [{ id: "p_trace" }])),
    );

    await run.apply.execute(new ApplyIngredientAllergenPropagationCommand(KEY, ["GB"], []));

    expect(run.sheets.calls[0]?.declaration).toEqual({
      allergens: ["UW", "GB"],
      mayContain: ["SH"],
    });
  });

  // Décision 4 : un code archivé exclut la déclinaison, le reste s'applique.
  it("exclut la déclinaison à qui un code archivé serait ajouté, et applique le reste", async () => {
    const products = new SomeProducts([fiche("p_a", []), fiche("p_b", ["OLD"])]);
    const run = harness(
      products,
      new FixedIngredientCitations(citations(["OLD"], [{ id: "p_a" }, { id: "p_b" }])),
    );
    const preview = await run.preview.execute(
      new PreviewIngredientAllergenPropagationQuery(KEY, ["OLD"], []),
    );

    await run.apply.execute(new ApplyIngredientAllergenPropagationCommand(KEY, ["OLD"], []));

    expect(preview.products[0]?.variants[0]?.blocked).toEqual([
      { code: "OLD", reason: "archived_allergen" },
    ]);
    expect(run.sheets.calls).toEqual([]);
  });

  /**
   * Régression nommée par le plan : une fiche qui déclarait « aucun allergène »
   * devient bloquante dès que l'ingrédient qu'elle cite porte le gluten ; la
   * propagation est le geste qui la répare (2026-10-27).
   */
  it("ajouter le gluten à un ingrédient puis propager rend activable la fiche qui déclarait aucun allergène", async () => {
    const products = new SomeProducts([fiche("p_none", [])]);
    const run = harness(
      products,
      new FixedIngredientCitations(citations(["GB"], [{ id: "p_none" }])),
    );
    const vat = { b2b: 20, takeaway: 5.5 };
    const rules: CompletenessRules = {
      activeContextKeys: ["takeaway"],
      policy: { method: "ratio_ttc", ratioBp: 9_000 },
    };
    const blocked = await products.findById("p_none");

    await run.apply.execute(new ApplyIngredientAllergenPropagationCommand(KEY, ["GB"], []));
    const written = run.sheets.calls[0]?.declaration;
    const after = fiche("p_none", written?.allergens ?? null);

    expect(blocked?.isActivatableWith(vat, rules, ["GB"])).toBe(false);
    expect(Product.reconstitute(after).isActivatableWith(vat, rules, ["GB"])).toBe(true);
  });
});
