import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import {
  AllergenStore,
  InMemoryAllergenCatalogueReader,
} from "../../../allergens/application/__tests__/in-memory-allergens.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import {
  ArchivedIngredientAllergenError,
  IngredientNotFoundError,
  UnknownIngredientAllergenError,
} from "../../domain/errors/ingredient-errors.js";
import { CreateIngredientCommand, CreateIngredientHandler } from "../ingredient-handlers.js";
import {
  SetIngredientAllergensCommand,
  SetIngredientAllergensHandler,
} from "../set-ingredient-allergens.js";
import {
  InMemoryAppellationRepository,
  InMemoryIngredientRepository,
} from "./in-memory-repositories.js";

/**
 * L'instant d'archivage — jamais comparé à l'horloge, seulement à `null` : ce
 * qui compte est qu'une entrée soit retirée, pas quand. `new Date(0)` le dit
 * sans écrire un jour du calendrier, comme les suites du référentiel à côté.
 */
const ARCHIVED_AT = new Date(0);

/**
 * Un référentiel minuscule mais complet des cas qui décident : l'annexe II, le
 * hors obligation UE (D4) et une entrée archivée (D2 bis).
 */
function seedReference(): AllergenStore {
  const store = new AllergenStore();
  const treeNuts = store.seedOfficialCategory("alg_cat_tree_nuts", "tree_nuts", "tree_nuts");
  const nonEu = store.seedOfficialCategory("alg_cat_non_eu", "non_eu", null);
  store.seedOfficialEntry("alg_SH", "SH", treeNuts.id);
  store.seedOfficialEntry("alg_BWD", "BWD", nonEu.id);
  // Une entrée MAISON, archivée : c'est la seule qui puisse l'être — une entrée
  // officielle refuse `archive()`, et le trigger le tient en base.
  store.seedHouseEntry("alg_old", "RETIRED_HOUSE_CODE", treeNuts.id, ARCHIVED_AT);
  return store;
}

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

interface Fixture {
  readonly ingredients: InMemoryIngredientRepository;
  readonly journal: RecordingJournal;
  readonly handler: SetIngredientAllergensHandler;
}

async function fixture(): Promise<Fixture> {
  const ingredients = new InMemoryIngredientRepository();
  await declare(ingredients, "praline");
  const journal = new RecordingJournal();
  const handler = new SetIngredientAllergensHandler(
    ingredients,
    new InMemoryAllergenCatalogueReader(seedReference()),
    journal,
    new DirectUnitOfWork(),
  );
  return { ingredients, journal, handler };
}

describe("SetIngredientAllergensHandler", () => {
  it("pose la liste entière et la range", async () => {
    const { ingredients, handler } = await fixture();

    await handler.execute(new SetIngredientAllergensCommand("praline", ["SH", "BWD", "SH"]));

    expect(ingredients.at("praline")?.allergens).toEqual(["BWD", "SH"]);
  });

  it("remplace la liste précédente plutôt que de la compléter", async () => {
    const { ingredients, handler } = await fixture();
    await handler.execute(new SetIngredientAllergensCommand("praline", ["SH", "BWD"]));

    await handler.execute(new SetIngredientAllergensCommand("praline", ["SH"]));

    expect(ingredients.at("praline")?.allergens).toEqual(["SH"]);
  });

  it("retire tout ce qui était posé quand la liste envoyée est vide", async () => {
    const { ingredients, handler } = await fixture();
    await handler.execute(new SetIngredientAllergensCommand("praline", ["SH"]));

    await handler.execute(new SetIngredientAllergensCommand("praline", []));

    expect(ingredients.at("praline")?.allergens).toEqual([]);
  });

  it("refuse une matière qui n'existe pas", async () => {
    const { handler } = await fixture();

    await expect(
      handler.execute(new SetIngredientAllergensCommand("inconnu", ["SH"])),
    ).rejects.toThrow(IngredientNotFoundError);
  });

  it("refuse un code que le référentiel ne connaît pas", async () => {
    const { handler } = await fixture();

    await expect(
      handler.execute(new SetIngredientAllergensCommand("praline", ["ZZZ"])),
    ).rejects.toThrow(UnknownIngredientAllergenError);
  });

  // Un refus se prouve en trois temps : l'erreur nommée, ET rien d'écrit, ET
  // rien tracé — les deux tests ci-dessus s'arrêtent au premier.
  it("un code inconnu ne mute rien et ne trace rien", async () => {
    const { ingredients, journal, handler } = await fixture();
    await handler.execute(new SetIngredientAllergensCommand("praline", ["SH"]));
    const before = ingredients.at("praline");

    await expect(
      handler.execute(new SetIngredientAllergensCommand("praline", ["SH", "ZZZ"])),
    ).rejects.toBeInstanceOf(UnknownIngredientAllergenError);

    expect(ingredients.at("praline")).toEqual(before);
    expect(journal.types()).toEqual(["ingredient.allergens_saved"]); // rien de plus
  });

  // D4 : le périmètre offert à la matière est `world`. Un ingrédient énonce un
  // FAIT — le sarrasin est du sarrasin, que l'Europe l'exige ou non — et le
  // filtre européen appartient à la déclaration, pas à la matière.
  it("accepte un code hors obligation UE", async () => {
    const { ingredients, handler } = await fixture();

    await handler.execute(new SetIngredientAllergensCommand("praline", ["BWD"]));

    expect(ingredients.at("praline")?.allergens).toEqual(["BWD"]);
  });

  describe("l'archivage (D2 bis)", () => {
    it("refuse un code archivé posé à neuf", async () => {
      const { handler } = await fixture();

      await expect(
        handler.execute(new SetIngredientAllergensCommand("praline", ["RETIRED_HOUSE_CODE"])),
      ).rejects.toThrow(ArchivedIngredientAllergenError);
    });

    // Même refus, mais au complet : la matière garde exactement ce qu'elle
    // portait, et le journal ne gagne pas une ligne pour une écriture qui n'a
    // pas eu lieu.
    it("un code archivé posé à neuf ne mute rien et ne trace rien", async () => {
      const { ingredients, journal, handler } = await fixture();
      await handler.execute(new SetIngredientAllergensCommand("praline", ["SH"]));
      const before = ingredients.at("praline");

      await expect(
        handler.execute(new SetIngredientAllergensCommand("praline", ["SH", "RETIRED_HOUSE_CODE"])),
      ).rejects.toBeInstanceOf(ArchivedIngredientAllergenError);

      expect(ingredients.at("praline")).toEqual(before);
      expect(journal.types()).toEqual(["ingredient.allergens_saved"]);
    });

    // La garde s'applique CODE PAR CODE, pas à la liste entière : un archivé
    // déjà posé ne « couvre » pas un second archivé qui, lui, arrive à neuf
    // dans le même envoi. Un refus qui s'arrêterait au premier code trouvé
    // conforme laisserait passer celui-ci par erreur.
    it("refuse le seul code archivé nouveau, même mêlé à un archivé déjà posé", async () => {
      const ingredients = new InMemoryIngredientRepository();
      await declare(ingredients, "praline");
      const store = new AllergenStore();
      const treeNuts = store.seedOfficialCategory("alg_cat_tree_nuts", "tree_nuts", "tree_nuts");
      store.seedHouseEntry("alg_old_1", "OLD_1", treeNuts.id);
      store.seedHouseEntry("alg_old_2", "OLD_2", treeNuts.id);
      const handler = new SetIngredientAllergensHandler(
        ingredients,
        new InMemoryAllergenCatalogueReader(store),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      );
      await handler.execute(new SetIngredientAllergensCommand("praline", ["OLD_1"]));
      // Les deux entrées maison sont retirées du référentiel : OLD_1 était déjà
      // posé (réenregistrable), OLD_2 ne l'a jamais été (refusé à neuf).
      store.seedHouseEntry("alg_old_1", "OLD_1", treeNuts.id, ARCHIVED_AT);
      store.seedHouseEntry("alg_old_2", "OLD_2", treeNuts.id, ARCHIVED_AT);

      await expect(
        handler.execute(new SetIngredientAllergensCommand("praline", ["OLD_1", "OLD_2"])),
      ).rejects.toBeInstanceOf(ArchivedIngredientAllergenError);

      expect(ingredients.at("praline")?.allergens).toEqual(["OLD_1"]);
    });

    // L'archivage retire de ce qu'on PROPOSE, jamais de ce qu'on reconnaît :
    // une matière qui porte déjà ce code se réenregistre, sinon corriger sa
    // composition échouerait sur un allergène que personne n'a touché.
    it("laisse réenregistrer un code archivé qui y était déjà", async () => {
      const ingredients = new InMemoryIngredientRepository();
      await declare(ingredients, "praline");
      const store = seedReference();
      // Posé AVANT l'archivage : le code est alors encore proposé.
      const before = new SetIngredientAllergensHandler(
        ingredients,
        new InMemoryAllergenCatalogueReader(store),
        new RecordingJournal(),
        new DirectUnitOfWork(),
      );
      store.seedHouseEntry("alg_old", "RETIRED_HOUSE_CODE", "alg_cat_tree_nuts");
      await before.execute(new SetIngredientAllergensCommand("praline", ["RETIRED_HOUSE_CODE"]));
      store.seedHouseEntry("alg_old", "RETIRED_HOUSE_CODE", "alg_cat_tree_nuts", ARCHIVED_AT);

      await before.execute(
        new SetIngredientAllergensCommand("praline", ["RETIRED_HOUSE_CODE", "SH"]),
      );

      expect(ingredients.at("praline")?.allergens).toEqual(["RETIRED_HOUSE_CODE", "SH"]);
    });
  });

  describe("le journal", () => {
    it("inscrit un seul fait pour la liste, avant/après en codes", async () => {
      const { journal, handler } = await fixture();
      await handler.execute(new SetIngredientAllergensCommand("praline", ["SH"]));

      await handler.execute(new SetIngredientAllergensCommand("praline", ["SH", "BWD"]));

      expect(journal.types()).toEqual(["ingredient.allergens_saved", "ingredient.allergens_saved"]);
      expect(journal.entries[1]).toMatchObject({
        subjectType: "ingredient",
        subjectId: "praline",
        payload: { changes: { allergens: { from: ["SH"], to: ["BWD", "SH"] } } },
      });
    });

    // Un ensemble n'a pas d'ordre : la même liste renvoyée autrement rangée
    // n'est pas un geste, et ne doit pas laisser de trace.
    it("reste muet quand l'ensemble ne change pas, ordre de saisie compris", async () => {
      const { journal, handler } = await fixture();
      await handler.execute(new SetIngredientAllergensCommand("praline", ["SH", "BWD"]));

      await handler.execute(new SetIngredientAllergensCommand("praline", ["BWD", "SH"]));

      expect(journal.types()).toEqual(["ingredient.allergens_saved"]);
    });
  });
});
