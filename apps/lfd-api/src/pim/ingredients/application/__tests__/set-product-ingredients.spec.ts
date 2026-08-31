import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { CreateIngredientCommand, CreateIngredientHandler } from "../ingredient-handlers.js";
import {
  SetProductIngredientsCommand,
  SetProductIngredientsHandler,
} from "../set-product-ingredients.js";
import {
  InMemoryAppellationRepository,
  InMemoryIngredientRepository,
} from "./in-memory-repositories.js";

async function declare(ingredients: InMemoryIngredientRepository, key: string): Promise<void> {
  await new CreateIngredientHandler(
    ingredients,
    new InMemoryAppellationRepository(),
    new RecordingJournal(),
    new FixedIdGenerator(),
    new DirectUnitOfWork(),
  ).execute(
    new CreateIngredientCommand({
      key,
      name: { fr: key },
      description: null,
      origin: "France",
      appellationCode: null,
    }),
  );
}

describe("SetProductIngredientsHandler", () => {
  it("remplace la liste précédente plutôt que de la compléter", async () => {
    const ingredients = new InMemoryIngredientRepository();
    await declare(ingredients, "beurre");
    await declare(ingredients, "farine");
    await declare(ingredients, "sucre");
    const handler = new SetProductIngredientsHandler(
      ingredients,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    );
    await handler.execute(new SetProductIngredientsCommand("prd_1", ["beurre", "farine"]));

    await handler.execute(new SetProductIngredientsCommand("prd_1", ["sucre"]));

    const cited = (await ingredients.ofProduct("prd_1")).map((row) => row.key);
    expect(cited).toEqual(["sucre"]);
  });

  it("retire toute citation quand la liste envoyée est vide", async () => {
    const ingredients = new InMemoryIngredientRepository();
    await declare(ingredients, "beurre");
    const handler = new SetProductIngredientsHandler(
      ingredients,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    );
    await handler.execute(new SetProductIngredientsCommand("prd_1", ["beurre"]));

    await handler.execute(new SetProductIngredientsCommand("prd_1", []));

    expect(await ingredients.ofProduct("prd_1")).toEqual([]);
  });

  describe("le journal d'une fiche déclarée", () => {
    it("reste muet quand la liste renvoyée à l'identique, ordre compris", async () => {
      const ingredients = new InMemoryIngredientRepository();
      await declare(ingredients, "beurre");
      await declare(ingredients, "farine");
      const journal = new RecordingJournal();
      const handler = new SetProductIngredientsHandler(
        ingredients,
        journal,
        new DirectUnitOfWork(),
      );
      await handler.execute(new SetProductIngredientsCommand("prd_1", ["beurre", "farine"]));

      // Le même formulaire réenregistré n'est pas un fait.
      await handler.execute(new SetProductIngredientsCommand("prd_1", ["beurre", "farine"]));

      expect(journal.types()).toEqual(["product.ingredients_saved"]);
    });

    // L'ORDRE est une décision éditoriale (« l'argument en premier ») : deux
    // appels avec le même ENSEMBLE mais un ordre différent ne sont pas le même
    // geste, et doivent laisser une trace chacun.
    it("journalise un simple réordonnancement, même si l'ensemble ne change pas", async () => {
      const ingredients = new InMemoryIngredientRepository();
      await declare(ingredients, "beurre");
      await declare(ingredients, "farine");
      const journal = new RecordingJournal();
      const handler = new SetProductIngredientsHandler(
        ingredients,
        journal,
        new DirectUnitOfWork(),
      );
      await handler.execute(new SetProductIngredientsCommand("prd_1", ["beurre", "farine"]));

      await handler.execute(new SetProductIngredientsCommand("prd_1", ["farine", "beurre"]));

      expect(journal.types()).toEqual(["product.ingredients_saved", "product.ingredients_saved"]);
      expect(journal.entries[1]).toMatchObject({
        payload: {
          changes: { ingredients: { from: ["beurre", "farine"], to: ["farine", "beurre"] } },
        },
      });
    });

    // Une fiche neuve n'a encore rien cité : demander une liste vide ne
    // change rien à ce qui est déjà en place, et ne doit donc rien journaliser.
    it("reste muet quand une fiche sans citation reçoit une liste vide", async () => {
      const ingredients = new InMemoryIngredientRepository();
      const journal = new RecordingJournal();
      const handler = new SetProductIngredientsHandler(
        ingredients,
        journal,
        new DirectUnitOfWork(),
      );

      await handler.execute(new SetProductIngredientsCommand("prd_1", []));

      expect(journal.types()).toEqual([]);
    });
  });
});
