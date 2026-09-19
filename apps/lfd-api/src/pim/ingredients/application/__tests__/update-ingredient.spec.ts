import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import {
  AppellationNotFoundError,
  IngredientNotFoundError,
} from "../../domain/errors/ingredient-errors.js";
import { CreateIngredientCommand, CreateIngredientHandler } from "../create-ingredient.js";
import { UpdateIngredientCommand, UpdateIngredientHandler } from "../update-ingredient.js";
import {
  InMemoryAppellationRepository,
  InMemoryIngredientRepository,
} from "./in-memory-repositories.js";
import { INGREDIENT_PAYLOAD, seedAppellation } from "./ingredient-fixtures.js";

describe("UpdateIngredientHandler — les trois états de l'appellation", () => {
  async function declared(appellations: InMemoryAppellationRepository) {
    const ingredients = new InMemoryIngredientRepository();
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
    return { ingredients, key };
  }

  it("`undefined` — ne touche pas à l'appellation déjà posée", async () => {
    const appellations = new InMemoryAppellationRepository();
    const { ingredients, key } = await declared(appellations);

    await new UpdateIngredientHandler(
      ingredients,
      appellations,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new UpdateIngredientCommand(key, { origin: "Savoie" }));

    expect(ingredients.at(key)?.appellationId).toBe("app_1");
  });

  it("`null` — retire le signe déjà posé", async () => {
    const appellations = new InMemoryAppellationRepository();
    const { ingredients, key } = await declared(appellations);

    await new UpdateIngredientHandler(
      ingredients,
      appellations,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new UpdateIngredientCommand(key, { appellationCode: null }));

    expect(ingredients.at(key)?.appellationId).toBeNull();
  });

  it("une valeur — pose une autre appellation en résolvant son code", async () => {
    const appellations = new InMemoryAppellationRepository();
    const { ingredients, key } = await declared(appellations);
    await seedAppellation(appellations, "igp-savoie", "app_2");

    await new UpdateIngredientHandler(
      ingredients,
      appellations,
      new RecordingJournal(),
      new DirectUnitOfWork(),
    ).execute(new UpdateIngredientCommand(key, { appellationCode: "igp-savoie" }));

    expect(ingredients.at(key)?.appellationId).toBe("app_2");
  });

  /**
   * Régression (plan des phrases du journal, lot B) : la création citait le
   * CODE de l'appellation sous `appellation`, la modification son IDENTIFIANT
   * sous `appellationId` — deux formes pour une même citation, et aucune ne
   * disait son nom.
   */
  it("cite l'appellation NOMMÉE, sous la même clé qu'à la création", async () => {
    const appellations = new InMemoryAppellationRepository();
    const ingredients = new InMemoryIngredientRepository();
    await seedAppellation(appellations, "aop-beaufort", "app_1");
    await seedAppellation(appellations, "igp-savoie", "app_2");
    const journal = new RecordingJournal();
    const key = await new CreateIngredientHandler(
      ingredients,
      appellations,
      journal,
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    ).execute(
      new CreateIngredientCommand({ ...INGREDIENT_PAYLOAD, appellationCode: "aop-beaufort" }),
    );

    await new UpdateIngredientHandler(
      ingredients,
      appellations,
      journal,
      new DirectUnitOfWork(),
    ).execute(new UpdateIngredientCommand(key, { appellationCode: "igp-savoie" }));

    expect(journal.entries[0]?.payload).toMatchObject({
      subjectLabel: "Beurre de Savoie",
      appellation: { id: "aop-beaufort", name: "Beaufort" },
    });
    expect(journal.entries[1]?.payload).toEqual({
      subjectLabel: "Beurre de Savoie",
      changes: {
        appellation: {
          from: { id: "aop-beaufort", name: "Beaufort" },
          to: { id: "igp-savoie", name: "Beaufort" },
        },
      },
    });
  });

  // Le refus doit laisser l'appellation précédente INTACTE : sans ce test, un
  // renommage raté vers un code fautif pourrait effacer le signe en place.
  it("refuse une appellation introuvable et laisse l'ancien signe en place", async () => {
    const appellations = new InMemoryAppellationRepository();
    const { ingredients, key } = await declared(appellations);

    await expect(
      new UpdateIngredientHandler(
        ingredients,
        appellations,
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(new UpdateIngredientCommand(key, { appellationCode: "aop-inconnue" })),
    ).rejects.toBeInstanceOf(AppellationNotFoundError);

    expect(ingredients.at(key)?.appellationId).toBe("app_1");
  });

  it("jette si l'ingrédient n'existe pas", async () => {
    await expect(
      new UpdateIngredientHandler(
        new InMemoryIngredientRepository(),
        new InMemoryAppellationRepository(),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      ).execute(new UpdateIngredientCommand("absent", { origin: "Ailleurs" })),
    ).rejects.toBeInstanceOf(IngredientNotFoundError);
  });
});

describe("le journal d'un ingrédient réglé", () => {
  it("reste muet quand la révision renvoie exactement ce qui est déjà en place", async () => {
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

    // L'écran renvoie la fiche entière à chaque enregistrement : sans ce
    // filtre, l'historique serait surtout fait de gestes sans effet.
    await new UpdateIngredientHandler(
      ingredients,
      appellations,
      journal,
      new DirectUnitOfWork(),
    ).execute(
      new UpdateIngredientCommand(key, {
        name: INGREDIENT_PAYLOAD.name,
        description: INGREDIENT_PAYLOAD.description,
        origin: INGREDIENT_PAYLOAD.origin,
      }),
    );

    expect(journal.types()).toEqual([]);
  });
});
