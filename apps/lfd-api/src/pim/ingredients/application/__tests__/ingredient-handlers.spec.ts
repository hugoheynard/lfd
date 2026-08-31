import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import { AppellationAggregate } from "../../domain/entities/appellation.entity.js";
import {
  AppellationNotFoundError,
  IngredientKeyTakenError,
  IngredientNotFoundError,
} from "../../domain/errors/ingredient-errors.js";
import {
  CreateIngredientCommand,
  CreateIngredientHandler,
  RemoveIngredientCommand,
  RemoveIngredientHandler,
  UpdateIngredientCommand,
  UpdateIngredientHandler,
} from "../ingredient-handlers.js";
import {
  InMemoryAppellationRepository,
  InMemoryIngredientRepository,
} from "./in-memory-repositories.js";

/** Une appellation posée directement dans le faux dépôt, sans passer par son handler. */
function seedAppellation(appellations: InMemoryAppellationRepository, code: string, id: string) {
  return appellations.add(
    AppellationAggregate.open({ id, code, label: { fr: "Beaufort" }, scheme: "AOP", active: true }),
  );
}

const BASE_PAYLOAD = {
  key: "beurre-de-savoie",
  name: { fr: "Beurre de Savoie" },
  description: null,
  origin: "Savoie, France",
  appellationCode: null,
};

describe("CreateIngredientHandler", () => {
  it("déclare un ingrédient sans appellation quand le code n'est pas fourni", async () => {
    const ingredients = new InMemoryIngredientRepository();

    const key = await new CreateIngredientHandler(
      ingredients,
      new InMemoryAppellationRepository(),
      new RecordingJournal(),
      new FixedIdGenerator(),
      new DirectUnitOfWork(),
    ).execute(new CreateIngredientCommand(BASE_PAYLOAD));

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
    ).execute(new CreateIngredientCommand({ ...BASE_PAYLOAD, appellationCode: "aop-beaufort" }));

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
      ).execute(new CreateIngredientCommand({ ...BASE_PAYLOAD, appellationCode: "aop-inconnue" })),
    ).rejects.toBeInstanceOf(AppellationNotFoundError);

    expect(ingredients.at(BASE_PAYLOAD.key)).toBeUndefined();
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
    await handler.execute(new CreateIngredientCommand(BASE_PAYLOAD));

    await expect(handler.execute(new CreateIngredientCommand(BASE_PAYLOAD))).rejects.toBeInstanceOf(
      IngredientKeyTakenError,
    );
  });
});

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
    ).execute(new CreateIngredientCommand({ ...BASE_PAYLOAD, appellationCode: "aop-beaufort" }));
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
    ).execute(new CreateIngredientCommand(BASE_PAYLOAD));

    // L'écran renvoie la fiche entière à chaque enregistrement : sans ce
    // filtre, l'historique serait surtout fait de gestes sans effet.
    await new UpdateIngredientHandler(
      ingredients,
      appellations,
      journal,
      new DirectUnitOfWork(),
    ).execute(
      new UpdateIngredientCommand(key, {
        name: BASE_PAYLOAD.name,
        description: BASE_PAYLOAD.description,
        origin: BASE_PAYLOAD.origin,
      }),
    );

    expect(journal.types()).toEqual([]);
  });

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
    ).execute(new CreateIngredientCommand(BASE_PAYLOAD));

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
