import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { IngredientNotFoundError } from "../../domain/errors/ingredient-errors.js";
import { CreateIngredientCommand, CreateIngredientHandler } from "../create-ingredient.js";
import { RemoveIngredientCommand, RemoveIngredientHandler } from "../remove-ingredient.js";
import {
  InMemoryAppellationRepository,
  InMemoryIngredientRepository,
} from "./in-memory-repositories.js";
import { INGREDIENT_PAYLOAD } from "./ingredient-fixtures.js";

describe("RemoveIngredientHandler", () => {
  it("journalise l'effacement avant de retirer la fiche", async () => {
    const ingredients = new InMemoryIngredientRepository();
    const appellations = new InMemoryAppellationRepository();
    const journal = new RecordingJournal();
    const key = await new CreateIngredientHandler(
      ingredients,
      appellations,
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    ).execute(new CreateIngredientCommand(INGREDIENT_PAYLOAD));

    await new RemoveIngredientHandler(ingredients, journal, new DirectUnitOfWork()).execute(
      new RemoveIngredientCommand(key),
    );

    expect(journal.types()).toEqual(["ingredient.deleted"]);
    expect(ingredients.at(key)).toBeUndefined();
  });

  it("jette si l'ingrédient à effacer n'existe pas", async () => {
    await expect(
      new RemoveIngredientHandler(
        new InMemoryIngredientRepository(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(new RemoveIngredientCommand("absent")),
    ).rejects.toBeInstanceOf(IngredientNotFoundError);
  });
});
