import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import {
  AllergenStore,
  InMemoryAllergenCatalogueReader,
} from "../../../allergens/application/__tests__/in-memory-allergens.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { CreateIngredientCommand, CreateIngredientHandler } from "../ingredient-handlers.js";
import {
  ReadProductIngredientAllergensHandler,
  ReadProductIngredientAllergensQuery,
} from "../read-product-ingredient-allergens.js";
import {
  SetIngredientAllergensCommand,
  SetIngredientAllergensHandler,
} from "../set-ingredient-allergens.js";
import {
  SetProductIngredientsCommand,
  SetProductIngredientsHandler,
} from "../set-product-ingredients.js";
import {
  InMemoryAppellationRepository,
  InMemoryIngredientRepository,
  InMemoryVariantDeclarationReader,
} from "./in-memory-repositories.js";

const PRODUCT = "prd_1";

function reference(): InMemoryAllergenCatalogueReader {
  const store = new AllergenStore();
  const treeNuts = store.seedOfficialCategory("alg_cat_tree_nuts", "tree_nuts", "tree_nuts");
  const gluten = store.seedOfficialCategory("alg_cat_gluten", "gluten", "gluten");
  const nonEu = store.seedOfficialCategory("alg_cat_non_eu", "non_eu", null);
  store.seedOfficialEntry("alg_SH", "SH", treeNuts.id);
  store.seedOfficialEntry("alg_UW", "UW", gluten.id);
  store.seedOfficialEntry("alg_BWD", "BWD", nonEu.id);
  return new InMemoryAllergenCatalogueReader(store);
}

/**
 * La composition d'une fiche, montée par les gestes réels : déclarer les
 * matières, leur poser des allergènes, puis les faire citer par le produit.
 * Aucune écriture ne contourne les handlers — une donnée que le domaine ne sait
 * pas produire est une donnée que la prod ne verra pas.
 */
async function composition(
  citations: ReadonlyMap<string, readonly string[]>,
): Promise<InMemoryIngredientRepository> {
  const ingredients = new InMemoryIngredientRepository();
  const create = new CreateIngredientHandler(
    ingredients,
    new InMemoryAppellationRepository(),
    new RecordingJournal(),
    new FixedIdGenerator(),
    new DirectUnitOfWork(),
  );
  const setAllergens = new SetIngredientAllergensHandler(
    ingredients,
    reference(),
    new RecordingJournal(),
    new DirectUnitOfWork(),
  );
  for (const [key, codes] of citations) {
    await create.execute(
      new CreateIngredientCommand({
        key,
        name: { fr: key },
        description: null,
        origin: "France",
        appellationCode: null,
      }),
    );
    await setAllergens.execute(new SetIngredientAllergensCommand(key, codes));
  }
  await new SetProductIngredientsHandler(
    ingredients,
    new RecordingJournal(),
    new DirectUnitOfWork(),
  ).execute(new SetProductIngredientsCommand(PRODUCT, [...citations.keys()]));
  return ingredients;
}

describe("ReadProductIngredientAllergensHandler", () => {
  it("rend l'union des codes des ingrédients cités, dédupliquée", async () => {
    const ingredients = await composition(
      new Map([
        ["praline", ["SH", "BWD"]],
        ["nougat", ["SH"]],
      ]),
    );
    const handler = new ReadProductIngredientAllergensHandler(
      ingredients,
      new InMemoryVariantDeclarationReader(),
    );

    const view = await handler.execute(new ReadProductIngredientAllergensQuery(PRODUCT));

    expect(view.citedByIngredients).toEqual(["BWD", "SH"]);
  });

  // Les ingrédients sont cités par le PRODUIT, la fiche réglementaire est
  // portée par la DÉCLINAISON : deux recettes différentes sous un même produit
  // reçoivent le même dérivé, et le contrat doit le montrer tel quel (D5).
  it("sert le même dérivé à toutes les déclinaisons du produit", async () => {
    const ingredients = await composition(new Map([["praline", ["SH"]]]));
    const declarations = new InMemoryVariantDeclarationReader();
    declarations.seed(PRODUCT, [
      { variantId: "var_1", allergens: [] },
      { variantId: "var_2", allergens: ["UW"] },
    ]);
    const handler = new ReadProductIngredientAllergensHandler(ingredients, declarations);

    const view = await handler.execute(new ReadProductIngredientAllergensQuery(PRODUCT));

    expect(view.variants).toEqual([
      { variantId: "var_1", declaredAllergens: [], citedNotDeclared: ["SH"] },
      { variantId: "var_2", declaredAllergens: ["UW"], citedNotDeclared: ["SH"] },
    ]);
  });

  // Le dérivé PROPOSE, il ne retire jamais : un allergène déclaré à la main —
  // contamination croisée d'atelier — n'est pas contredit par une composition
  // éditoriale qui l'ignore.
  it("ne propose jamais de retrait", async () => {
    const ingredients = await composition(new Map([["praline", ["SH"]]]));
    const declarations = new InMemoryVariantDeclarationReader();
    declarations.seed(PRODUCT, [{ variantId: "var_1", allergens: ["SH", "UW"] }]);
    const handler = new ReadProductIngredientAllergensHandler(ingredients, declarations);

    const view = await handler.execute(new ReadProductIngredientAllergensQuery(PRODUCT));

    expect(view.variants[0]).toEqual({
      variantId: "var_1",
      declaredAllergens: ["SH", "UW"],
      citedNotDeclared: [],
    });
  });

  // D5 : la reprise ne fabrique pas une fiche. Sans déclaration (`null`), il
  // n'y a rien à compléter — tirer une mention obligatoire d'une liste
  // éditoriale est le geste que l'avertissement de `Ingredient` interdit.
  it("ne propose rien à une déclinaison sans fiche déclarée", async () => {
    const ingredients = await composition(new Map([["praline", ["SH", "BWD"]]]));
    const declarations = new InMemoryVariantDeclarationReader();
    declarations.seed(PRODUCT, [{ variantId: "var_1", allergens: null }]);
    const handler = new ReadProductIngredientAllergensHandler(ingredients, declarations);

    const view = await handler.execute(new ReadProductIngredientAllergensQuery(PRODUCT));

    expect(view.variants[0]).toEqual({
      variantId: "var_1",
      declaredAllergens: null,
      citedNotDeclared: [],
    });
    // Le dérivé reste lisible à part : l'information n'est pas perdue, elle
    // n'est simplement pas offerte en reprise.
    expect(view.citedByIngredients).toEqual(["BWD", "SH"]);
  });

  // Une fiche déclarée SANS allergène (`[]`) est une affirmation, pas une
  // absence : elle se compare, là où `null` ne se compare pas.
  it("distingue « aucun allergène déclaré » de « aucune fiche »", async () => {
    const ingredients = await composition(new Map([["praline", ["SH"]]]));
    const declarations = new InMemoryVariantDeclarationReader();
    declarations.seed(PRODUCT, [
      { variantId: "var_sans_fiche", allergens: null },
      { variantId: "var_fiche_vide", allergens: [] },
    ]);
    const handler = new ReadProductIngredientAllergensHandler(ingredients, declarations);

    const view = await handler.execute(new ReadProductIngredientAllergensQuery(PRODUCT));

    expect(view.variants.map((variant) => variant.citedNotDeclared)).toEqual([[], ["SH"]]);
  });

  // Le silence du dérivé ne vaut RIEN (D5) : une fiche qui ne cite aucun
  // ingrédient rend un ensemble vide, et ce vide ne dit pas « composition
  // couverte ». Le test le fige pour que personne ne « corrige » la réponse en
  // y ajoutant un drapeau de conformité.
  it("rend un ensemble vide quand la fiche ne cite aucun ingrédient", async () => {
    const declarations = new InMemoryVariantDeclarationReader();
    declarations.seed(PRODUCT, [{ variantId: "var_1", allergens: ["UW"] }]);
    const handler = new ReadProductIngredientAllergensHandler(
      new InMemoryIngredientRepository(),
      declarations,
    );

    const view = await handler.execute(new ReadProductIngredientAllergensQuery(PRODUCT));

    expect(view).toEqual({
      productId: PRODUCT,
      citedByIngredients: [],
      variants: [{ variantId: "var_1", declaredAllergens: ["UW"], citedNotDeclared: [] }],
    });
  });
});
