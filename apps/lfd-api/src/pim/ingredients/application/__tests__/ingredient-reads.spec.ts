import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { CreateAppellationCommand, CreateAppellationHandler } from "../appellation-handlers.js";
import { CreateIngredientCommand, CreateIngredientHandler } from "../ingredient-handlers.js";
import { ListIngredientsHandler } from "../list-ingredients.js";
import {
  ReadProductIngredientsHandler,
  ReadProductIngredientsQuery,
} from "../read-product-ingredients.js";
import {
  SetProductIngredientsCommand,
  SetProductIngredientsHandler,
} from "../set-product-ingredients.js";
import {
  InMemoryAppellationRepository,
  InMemoryIngredientRepository,
} from "./in-memory-repositories.js";

const PRODUCT = "prd_1";
const APPELLATION = "aop-beaufort";

/**
 * Le référentiel monté par les gestes réels — ouvrir le signe officiel s'il y
 * en a un, déclarer les matières, et rien d'autre. Aucune écriture ne contourne
 * les handlers : une donnée que le domaine ne sait pas produire est une donnée
 * que la production ne verra jamais.
 *
 * Les deux dépôts sont LIÉS, comme la base les joint : c'est ce qui permet à la
 * lecture de résoudre l'appellation que l'ingrédient stocke par identifiant.
 */
async function declared(
  keys: readonly string[],
  appellationCode: string | null = null,
): Promise<InMemoryIngredientRepository> {
  const appellations = new InMemoryAppellationRepository();
  const ingredients = new InMemoryIngredientRepository(appellations);
  if (appellationCode !== null) {
    await new CreateAppellationHandler(
      appellations,
      new RecordingJournal(),
      new FixedIdGenerator("apl"),
      new DirectUnitOfWork(),
    ).execute(
      new CreateAppellationCommand({
        code: appellationCode,
        label: { fr: "Beaufort" },
        scheme: "AOP",
      }),
    );
  }
  const declare = new CreateIngredientHandler(
    ingredients,
    appellations,
    new RecordingJournal(),
    new FixedIdGenerator("ing"),
    new DirectUnitOfWork(),
  );
  for (const key of keys) {
    await declare.execute(
      new CreateIngredientCommand({
        key,
        name: { fr: key },
        description: null,
        origin: "Savoie, France",
        appellationCode,
      }),
    );
  }
  return ingredients;
}

async function cite(
  ingredients: InMemoryIngredientRepository,
  keys: readonly string[],
): Promise<void> {
  await new SetProductIngredientsHandler(
    ingredients,
    new RecordingJournal(),
    new DirectUnitOfWork(),
  ).execute(new SetProductIngredientsCommand(PRODUCT, keys));
}

describe("ListIngredientsHandler", () => {
  it("rend la matière avec son appellation déjà résolue", async () => {
    const ingredients = await declared(["beurre-de-savoie"], APPELLATION);

    const view = await new ListIngredientsHandler(ingredients).execute();

    expect(view[0]).toMatchObject({
      key: "beurre-de-savoie",
      origin: "Savoie, France",
      appellation: { code: APPELLATION, scheme: "AOP", active: true },
    });
  });

  // Le compte porté par une appellation lue À TRAVERS un ingrédient serait
  // celui de l'appellation entière, pas celui de ce rattachement : l'écran s'en
  // servirait à tort pour dire « effaçable ».
  it("n'attribue aucun compte à l'appellation lue à travers un ingrédient", async () => {
    const ingredients = await declared(["beurre-de-savoie"], APPELLATION);

    const view = await new ListIngredientsHandler(ingredients).execute();

    expect(view[0]?.appellation?.usedBy).toBe(0);
  });

  // Le fil parle en clés : ni l'identifiant technique de la matière, ni celui
  // de l'appellation qu'elle stocke n'ont à sortir.
  it("ne laisse sortir aucun identifiant technique", async () => {
    const ingredients = await declared(["beurre-de-savoie"], APPELLATION);

    const view = await new ListIngredientsHandler(ingredients).execute();

    expect(view[0]).not.toHaveProperty("id");
    expect(view[0]).not.toHaveProperty("appellationId");
    expect(view[0]?.appellation).not.toHaveProperty("id");
  });

  it("rend une matière sans signe officiel avec une appellation nulle", async () => {
    const ingredients = await declared(["farine-de-meule"]);

    const view = await new ListIngredientsHandler(ingredients).execute();

    expect(view[0]?.appellation).toBeNull();
  });

  // Ce qui RETIENT la matière voyage jusqu'à l'écran : la ligne doit annoncer
  // le refus avant le clic, pas le découvrir après.
  it("rend le nombre de fiches qui citent la matière", async () => {
    const ingredients = await declared(["beurre-de-savoie"]);
    await cite(ingredients, ["beurre-de-savoie"]);

    const view = await new ListIngredientsHandler(ingredients).execute();

    expect(view[0]?.usedBy).toBe(1);
  });
});

describe("ReadProductIngredientsHandler", () => {
  // L'ordre est une décision ÉDITORIALE : le trier par nom effacerait ce que le
  // staff a rangé à la main.
  it("garde l'ordre de citation de la fiche", async () => {
    const ingredients = await declared(["beurre-de-savoie", "farine-de-meule"]);
    await cite(ingredients, ["farine-de-meule", "beurre-de-savoie"]);

    const view = await new ReadProductIngredientsHandler(ingredients).execute(
      new ReadProductIngredientsQuery(PRODUCT),
    );

    expect(view.map((row) => row.key)).toEqual(["farine-de-meule", "beurre-de-savoie"]);
  });

  it("résout l'appellation citée — l'écran n'a pas à la re-chercher", async () => {
    const ingredients = await declared(["beurre-de-savoie"], APPELLATION);
    await cite(ingredients, ["beurre-de-savoie"]);

    const view = await new ReadProductIngredientsHandler(ingredients).execute(
      new ReadProductIngredientsQuery(PRODUCT),
    );

    expect(view[0]?.appellation).toMatchObject({ code: APPELLATION, scheme: "AOP" });
  });

  // Une fiche qui ne cite rien n'est pas une erreur : la composition est
  // éditoriale, et son absence ne dit rien de la matière réelle.
  it("rend une composition vide pour une fiche qui ne cite rien", async () => {
    const ingredients = await declared(["beurre-de-savoie"]);

    const view = await new ReadProductIngredientsHandler(ingredients).execute(
      new ReadProductIngredientsQuery(PRODUCT),
    );

    expect(view).toEqual([]);
  });
});
