import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import {
  IngredientArchivedError,
  IngredientNotFoundError,
} from "../../domain/errors/ingredient-errors.js";
import { ArchiveIngredientCommand, ArchiveIngredientHandler } from "../archive-ingredient.js";
import { CreateIngredientCommand, CreateIngredientHandler } from "../create-ingredient.js";
import { RestoreIngredientCommand, RestoreIngredientHandler } from "../restore-ingredient.js";
import {
  SetProductIngredientsCommand,
  SetProductIngredientsHandler,
} from "../set-product-ingredients.js";
import { RecordingCatalogEmitter } from "../../../../shared/__tests__/catalog-emitter-doubles.js";
import {
  InMemoryAppellationRepository,
  InMemoryIngredientRepository,
} from "./in-memory-repositories.js";
import { INGREDIENT_PAYLOAD } from "./ingredient-fixtures.js";

const NOW = new Date();

async function seeded(): Promise<{ ingredients: InMemoryIngredientRepository; key: string }> {
  const ingredients = new InMemoryIngredientRepository();
  const key = await new CreateIngredientHandler(
    ingredients,
    new InMemoryAppellationRepository(),
    new RecordingJournal(),
    new FixedIdGenerator(),
    new DirectUnitOfWork(),
  ).execute(new CreateIngredientCommand(INGREDIENT_PAYLOAD));
  return { ingredients, key };
}

function archiver(ingredients: InMemoryIngredientRepository, journal: RecordingJournal) {
  return new ArchiveIngredientHandler(
    ingredients,
    journal,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
  );
}

describe("ArchiveIngredientHandler / RestoreIngredientHandler", () => {
  it("archive sans effacer : la ligne reste, datée, et le fait est écrit", async () => {
    const { ingredients, key } = await seeded();
    const journal = new RecordingJournal();

    await archiver(ingredients, journal).execute(new ArchiveIngredientCommand(key));

    expect(ingredients.at(key)?.archivedAt).toBe(NOW);
    expect(journal.types()).toEqual(["ingredient.archived"]);
  });

  it("rejouée, l’archive n’écrit ni ne trace rien", async () => {
    const { ingredients, key } = await seeded();
    await archiver(ingredients, new RecordingJournal()).execute(new ArchiveIngredientCommand(key));
    const journal = new RecordingJournal();

    await archiver(ingredients, journal).execute(new ArchiveIngredientCommand(key));

    expect(journal.types()).toEqual([]);
  });

  it("restaure, et la restauration rejouée se tait", async () => {
    const { ingredients, key } = await seeded();
    await archiver(ingredients, new RecordingJournal()).execute(new ArchiveIngredientCommand(key));
    const journal = new RecordingJournal();
    const restore = new RestoreIngredientHandler(ingredients, journal, new DirectUnitOfWork());

    await restore.execute(new RestoreIngredientCommand(key));
    await restore.execute(new RestoreIngredientCommand(key));

    expect(ingredients.at(key)?.archivedAt).toBeNull();
    expect(journal.types()).toEqual(["ingredient.restored"]);
  });

  it("jette si l’ingrédient n’existe pas", async () => {
    await expect(
      archiver(new InMemoryIngredientRepository(), new RecordingJournal()).execute(
        new ArchiveIngredientCommand("absent"),
      ),
    ).rejects.toBeInstanceOf(IngredientNotFoundError);
  });
});

describe("un ingrédient archivé et la composition d’une fiche", () => {
  function composer(ingredients: InMemoryIngredientRepository) {
    return new SetProductIngredientsHandler(
      ingredients,
      new RecordingJournal(),
      new DirectUnitOfWork(),
      new RecordingCatalogEmitter(),
    );
  }

  it("ne s’ajoute plus à une fiche qui ne le citait pas", async () => {
    const { ingredients, key } = await seeded();
    await archiver(ingredients, new RecordingJournal()).execute(new ArchiveIngredientCommand(key));

    await expect(
      composer(ingredients).execute(new SetProductIngredientsCommand("prod_1", [key])),
    ).rejects.toBeInstanceOf(IngredientArchivedError);
  });

  it("reste cité par la fiche qui le citait déjà, même réordonnée", async () => {
    const { ingredients, key } = await seeded();
    const other = await new CreateIngredientHandler(
      ingredients,
      new InMemoryAppellationRepository(),
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    ).execute(new CreateIngredientCommand({ ...INGREDIENT_PAYLOAD, key: "farine-t65" }));
    await composer(ingredients).execute(new SetProductIngredientsCommand("prod_1", [key]));
    await archiver(ingredients, new RecordingJournal()).execute(new ArchiveIngredientCommand(key));

    await composer(ingredients).execute(new SetProductIngredientsCommand("prod_1", [other, key]));

    expect((await ingredients.ofProduct("prod_1")).map((row) => row.key)).toEqual([other, key]);
  });
});
