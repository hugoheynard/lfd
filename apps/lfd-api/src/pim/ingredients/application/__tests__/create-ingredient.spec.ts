import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import {
  AppellationNotFoundError,
  IngredientKeyTakenError,
} from "../../domain/errors/ingredient-errors.js";
import { CreateIngredientCommand, CreateIngredientHandler } from "../create-ingredient.js";
import {
  InMemoryAppellationRepository,
  InMemoryIngredientRepository,
} from "./in-memory-repositories.js";
import { INGREDIENT_PAYLOAD, seedAppellation } from "./ingredient-fixtures.js";

describe("CreateIngredientHandler", () => {
  it("déclare un ingrédient sans appellation quand le code n'est pas fourni", async () => {
    const ingredients = new InMemoryIngredientRepository();

    const key = await new CreateIngredientHandler(
      ingredients,
      new InMemoryAppellationRepository(),
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    ).execute(new CreateIngredientCommand(INGREDIENT_PAYLOAD));

    expect(ingredients.at(key)?.appellationId).toBeNull();
  });

  it("résout le CODE d'appellation en identifiant technique, pas en le stockant tel quel", async () => {
    const ingredients = new InMemoryIngredientRepository();
    const appellations = new InMemoryAppellationRepository();
    await seedAppellation(appellations, "aop-beaufort", "app_1");

    const key = await new CreateIngredientHandler(
      ingredients,
      appellations,
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    ).execute(
      new CreateIngredientCommand({ ...INGREDIENT_PAYLOAD, appellationCode: "aop-beaufort" }),
    );

    // Le fil parle en codes, la base joint par identifiant : les confondre
    // romprait la clé étrangère dès qu'un code change de casse ou d'espaces.
    expect(ingredients.at(key)?.appellationId).toBe("app_1");
  });

  // Le refus doit arriver AVANT toute écriture — sinon la fiche existerait
  // sans que personne n'ait pu la retrouver par son code d'appellation voulu.
  it("refuse de citer une appellation qui n'existe pas, sans rien écrire", async () => {
    const ingredients = new InMemoryIngredientRepository();
    const journal = new RecordingJournal();

    await expect(
      new CreateIngredientHandler(
        ingredients,
        new InMemoryAppellationRepository(),
        journal,
        new FixedIdGenerator(),
        new DirectUnitOfWork(),
      ).execute(
        new CreateIngredientCommand({ ...INGREDIENT_PAYLOAD, appellationCode: "aop-inconnue" }),
      ),
    ).rejects.toBeInstanceOf(AppellationNotFoundError);

    expect(ingredients.at(INGREDIENT_PAYLOAD.key)).toBeUndefined();
    expect(journal.entries).toHaveLength(0);
  });

  it("refuse deux ingrédients à la même clé", async () => {
    const ingredients = new InMemoryIngredientRepository();
    const handler = new CreateIngredientHandler(
      ingredients,
      new InMemoryAppellationRepository(),
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    );
    await handler.execute(new CreateIngredientCommand(INGREDIENT_PAYLOAD));

    await expect(
      handler.execute(new CreateIngredientCommand(INGREDIENT_PAYLOAD)),
    ).rejects.toBeInstanceOf(IngredientKeyTakenError);
  });
});
