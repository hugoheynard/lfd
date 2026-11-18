import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import {
  AppellationArchivedError,
  AppellationNotFoundError,
} from "../../domain/errors/ingredient-errors.js";
import { ArchiveAppellationCommand, ArchiveAppellationHandler } from "../archive-appellation.js";
import { CreateIngredientCommand, CreateIngredientHandler } from "../create-ingredient.js";
import { RestoreAppellationCommand, RestoreAppellationHandler } from "../restore-appellation.js";
import { UpdateIngredientCommand, UpdateIngredientHandler } from "../update-ingredient.js";
import {
  InMemoryAppellationRepository,
  InMemoryIngredientRepository,
} from "./in-memory-repositories.js";
import { INGREDIENT_PAYLOAD, seedAppellation } from "./ingredient-fixtures.js";

const NOW = new Date();
const CODE = "aop-beaufort";

function archiver(appellations: InMemoryAppellationRepository, journal: RecordingJournal) {
  return new ArchiveAppellationHandler(
    appellations,
    journal,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
  );
}

async function archivedAppellation(): Promise<InMemoryAppellationRepository> {
  const appellations = new InMemoryAppellationRepository();
  await seedAppellation(appellations, CODE, "app_1");
  await archiver(appellations, new RecordingJournal()).execute(new ArchiveAppellationCommand(CODE));
  return appellations;
}

function creator(
  ingredients: InMemoryIngredientRepository,
  appellations: InMemoryAppellationRepository,
) {
  return new CreateIngredientHandler(
    ingredients,
    appellations,
    new RecordingJournal(),
    new FixedIdGenerator(),
    new DirectUnitOfWork(),
  );
}

describe("ArchiveAppellationHandler / RestoreAppellationHandler", () => {
  it("jette si le code n’existe pas", async () => {
    await expect(
      archiver(new InMemoryAppellationRepository(), new RecordingJournal()).execute(
        new ArchiveAppellationCommand("absent"),
      ),
    ).rejects.toBeInstanceOf(AppellationNotFoundError);
  });

  it("archive sans effacer, une seule fois au journal", async () => {
    const appellations = new InMemoryAppellationRepository();
    await seedAppellation(appellations, CODE, "app_1");
    const journal = new RecordingJournal();

    await archiver(appellations, journal).execute(new ArchiveAppellationCommand(CODE));
    await archiver(appellations, journal).execute(new ArchiveAppellationCommand(CODE));

    expect(appellations.at(CODE)?.archivedAt).toBe(NOW);
    expect(journal.types()).toEqual(["appellation.archived"]);
  });

  it("restaure, et la restauration rejouée se tait", async () => {
    const appellations = await archivedAppellation();
    const journal = new RecordingJournal();
    const restore = new RestoreAppellationHandler(appellations, journal, new DirectUnitOfWork());

    await restore.execute(new RestoreAppellationCommand(CODE));
    await restore.execute(new RestoreAppellationCommand(CODE));

    expect(appellations.at(CODE)?.archivedAt).toBeNull();
    expect(journal.types()).toEqual(["appellation.restored"]);
  });
});

describe("une appellation archivée et les ingrédients", () => {
  it("ne se pose plus sur un ingrédient neuf", async () => {
    const appellations = await archivedAppellation();

    await expect(
      creator(new InMemoryIngredientRepository(), appellations).execute(
        new CreateIngredientCommand({ ...INGREDIENT_PAYLOAD, appellationCode: CODE }),
      ),
    ).rejects.toBeInstanceOf(AppellationArchivedError);
  });

  it("reste à l’ingrédient qui la portait, même réenregistré à l’identique", async () => {
    const appellations = new InMemoryAppellationRepository();
    await seedAppellation(appellations, CODE, "app_1");
    const ingredients = new InMemoryIngredientRepository();
    const key = await creator(ingredients, appellations).execute(
      new CreateIngredientCommand({ ...INGREDIENT_PAYLOAD, appellationCode: CODE }),
    );
    await archiver(appellations, new RecordingJournal()).execute(
      new ArchiveAppellationCommand(CODE),
    );

    await new UpdateIngredientHandler(
      ingredients,
      appellations,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new UpdateIngredientCommand(key, { origin: "Savoie", appellationCode: CODE }));

    expect(ingredients.at(key)?.appellationId).toBe("app_1");
  });
});
