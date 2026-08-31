import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import {
  AllergenCategoryKeyTakenError,
  AllergenCategoryNotFoundError,
  AllergenCategoryStillCitedError,
  OfficialAllergenCategoryLockedError,
} from "../../domain/errors/allergen-errors.js";
import { ArchiveAllergenCategoryCommand } from "../archive-allergen-category.js";
import { ArchiveAllergenCategoryHandler } from "../archive-allergen-category.js";
import {
  ArchiveAllergenEntryCommand,
  ArchiveAllergenEntryHandler,
} from "../archive-allergen-entry.js";
import {
  CreateAllergenCategoryCommand,
  CreateAllergenCategoryHandler,
} from "../create-allergen-category.js";
import {
  CreateAllergenEntryCommand,
  CreateAllergenEntryHandler,
} from "../create-allergen-entry.js";
import {
  MoveAllergenCategoryCommand,
  MoveAllergenCategoryHandler,
} from "../move-allergen-category.js";
import {
  RenameAllergenCategoryCommand,
  RenameAllergenCategoryHandler,
} from "../rename-allergen-category.js";
import {
  RestoreAllergenCategoryCommand,
  RestoreAllergenCategoryHandler,
} from "../restore-allergen-category.js";
import {
  AllergenStore,
  InMemoryAllergenCatalogueReader,
  InMemoryAllergenCategoryRepository,
  InMemoryAllergenEntryRepository,
} from "./in-memory-allergens.js";

/**
 * L'instant du geste. Absolu, et c'est l'exception étroite de `CLAUDE.md` §5 :
 * il n'est jamais comparé à l'horloge, seulement à lui-même — le handler
 * enregistre ce que le `Clock` lui donne, et le test relit la même constante.
 */
const NOW = new Date("2026-09-02T10:00:00.000Z");

class StubIds extends PimIdGenerator {
  private count = 0;
  next(): string {
    this.count += 1;
    return `alg_cat_test_${this.count}`;
  }
}

interface Harness {
  readonly store: AllergenStore;
  readonly journal: RecordingJournal;
  readonly create: CreateAllergenCategoryHandler;
  readonly rename: RenameAllergenCategoryHandler;
  readonly move: MoveAllergenCategoryHandler;
  readonly archive: ArchiveAllergenCategoryHandler;
  readonly restore: RestoreAllergenCategoryHandler;
  readonly createEntry: CreateAllergenEntryHandler;
  readonly archiveEntry: ArchiveAllergenEntryHandler;
}

function harness(): Harness {
  const store = new AllergenStore();
  const categories = new InMemoryAllergenCategoryRepository(store);
  const entries = new InMemoryAllergenEntryRepository(store);
  const reader = new InMemoryAllergenCatalogueReader(store);
  const journal = new RecordingJournal();
  const uow = new DirectUnitOfWork();
  const ids = new StubIds();
  return {
    store,
    journal,
    create: new CreateAllergenCategoryHandler(categories, ids, journal, uow),
    rename: new RenameAllergenCategoryHandler(categories, journal, uow),
    move: new MoveAllergenCategoryHandler(categories, journal, uow),
    archive: new ArchiveAllergenCategoryHandler(
      categories,
      reader,
      journal,
      new FixedClock(NOW),
      uow,
    ),
    restore: new RestoreAllergenCategoryHandler(categories, journal, uow),
    createEntry: new CreateAllergenEntryHandler(entries, categories, ids, journal, uow),
    archiveEntry: new ArchiveAllergenEntryHandler(entries, journal, new FixedClock(NOW), uow),
  };
}

describe("CreateAllergenCategoryHandler", () => {
  it("ouvre une catégorie maison, jamais réglementaire", async () => {
    const { create, store } = harness();

    const id = await create.execute(
      new CreateAllergenCategoryCommand({
        key: "fruits-coque-exotiques",
        name: { fr: "Fruits à coque exotiques", en: "Exotic nuts" },
      }),
    );

    // Une catégorie créée à l'écran ne peut pas se faire passer pour une
    // mention de l'annexe II : la règle n'est pas vérifiée, elle est
    // inexprimable — `declare()` ne prend pas de `incoCategory`.
    expect(store.categories.get(id)).toMatchObject({
      key: "fruits-coque-exotiques",
      incoCategory: null,
      official: false,
      archivedAt: null,
    });
  });

  it("refuse une clé déjà portée par une autre catégorie", async () => {
    const { create, store } = harness();
    store.seedOfficialCategory("alg_cat_gluten", "gluten", "gluten");

    await expect(
      create.execute(
        new CreateAllergenCategoryCommand({ key: "gluten", name: { fr: "Mon gluten" } }),
      ),
    ).rejects.toBeInstanceOf(AllergenCategoryKeyTakenError);
  });
});

describe("RenameAllergenCategoryHandler", () => {
  it("renomme une catégorie maison", async () => {
    const { create, rename, store } = harness();
    const id = await create.execute(
      new CreateAllergenCategoryCommand({ key: "exotiques", name: { fr: "Exotiques" } }),
    );

    await rename.execute(new RenameAllergenCategoryCommand(id, { fr: "Fruits exotiques" }));

    expect(store.categories.get(id)?.name).toEqual({ fr: "Fruits exotiques" });
  });

  it("refuse de renommer une catégorie officielle — son libellé est une mention légale", async () => {
    const { rename, store, journal } = harness();
    store.seedOfficialCategory("alg_cat_tree_nuts", "tree_nuts", "tree_nuts");
    const before = store.categories.get("alg_cat_tree_nuts");

    await expect(
      rename.execute(new RenameAllergenCategoryCommand("alg_cat_tree_nuts", { fr: "Noix" })),
    ).rejects.toBeInstanceOf(OfficialAllergenCategoryLockedError);

    // Le refus vient de l'agrégat, avant l'unité de travail : un 409 qui aurait
    // quand même écrit ou journalisé serait un faux dans l'historique.
    expect(store.categories.get("alg_cat_tree_nuts")).toBe(before);
    expect(journal.types()).toEqual([]);
  });

  it("jette si la catégorie n'existe pas", async () => {
    const { rename } = harness();

    await expect(
      rename.execute(new RenameAllergenCategoryCommand("absente", { fr: "X" })),
    ).rejects.toBeInstanceOf(AllergenCategoryNotFoundError);
  });
});

describe("MoveAllergenCategoryHandler", () => {
  it("range même une catégorie officielle : l'ordre n'a pas de portée réglementaire", async () => {
    const { move, store, journal } = harness();
    store.seedOfficialCategory("alg_cat_gluten", "gluten", "gluten");

    await move.execute(new MoveAllergenCategoryCommand("alg_cat_gluten", 42));

    expect(store.categories.get("alg_cat_gluten")?.position).toBe(42);
    expect(journal.types()).toEqual(["allergen_category.reordered"]);
  });
});

describe("ArchiveAllergenCategoryHandler", () => {
  it("archive une catégorie maison vide, à l'instant du Clock", async () => {
    const { create, archive, store } = harness();
    const id = await create.execute(
      new CreateAllergenCategoryCommand({ key: "exotiques", name: { fr: "Exotiques" } }),
    );

    await archive.execute(new ArchiveAllergenCategoryCommand(id));

    expect(store.categories.get(id)?.archivedAt).toEqual(NOW);
  });

  /**
   * La FK `Restrict` ne protège que de l'EFFACEMENT : rien en base n'empêche
   * d'archiver une catégorie sous ses entrées, qui resteraient offertes à la
   * saisie sans famille visible. Le refus ne peut donc venir que d'ici.
   */
  it("refuse d'archiver une catégorie qui accueille encore un allergène proposé", async () => {
    const { create, createEntry, archive } = harness();
    const id = await create.execute(
      new CreateAllergenCategoryCommand({ key: "exotiques", name: { fr: "Exotiques" } }),
    );
    await createEntry.execute(
      new CreateAllergenEntryCommand({
        code: "X-NOIX-TIGRE",
        name: { fr: "Noix tigrée" },
        categoryId: id,
      }),
    );

    await expect(archive.execute(new ArchiveAllergenCategoryCommand(id))).rejects.toBeInstanceOf(
      AllergenCategoryStillCitedError,
    );
  });

  /**
   * L'autre branche de la même garde : une entrée déjà archivée n'est plus
   * PROPOSÉE non plus, donc elle ne doit plus retenir la catégorie qui
   * l'accueille — sinon une famille vidée par archivage individuel resterait
   * bloquée pour toujours.
   */
  it("archive une catégorie dont l'unique entrée est déjà archivée", async () => {
    const { create, createEntry, archiveEntry, archive, store } = harness();
    const id = await create.execute(
      new CreateAllergenCategoryCommand({ key: "exotiques", name: { fr: "Exotiques" } }),
    );
    const entryId = await createEntry.execute(
      new CreateAllergenEntryCommand({
        code: "X-NOIX-TIGRE",
        name: { fr: "Noix tigrée" },
        categoryId: id,
      }),
    );
    await archiveEntry.execute(new ArchiveAllergenEntryCommand(entryId));

    await archive.execute(new ArchiveAllergenCategoryCommand(id));

    expect(store.categories.get(id)?.archivedAt).not.toBeNull();
  });

  it("refuse d'archiver une catégorie officielle — ce serait retirer une mention d'étiquette", async () => {
    const { archive, store, journal } = harness();
    store.seedOfficialCategory("alg_cat_gluten", "gluten", "gluten");
    const before = store.categories.get("alg_cat_gluten");

    await expect(
      archive.execute(new ArchiveAllergenCategoryCommand("alg_cat_gluten")),
    ).rejects.toBeInstanceOf(OfficialAllergenCategoryLockedError);

    // Le refus vient de l'agrégat, avant l'unité de travail : un 409 qui aurait
    // quand même écrit ou journalisé serait un faux dans l'historique.
    expect(store.categories.get("alg_cat_gluten")).toBe(before);
    expect(journal.types()).toEqual([]);
  });
});

describe("RestoreAllergenCategoryHandler", () => {
  it("remet une catégorie archivée au référentiel", async () => {
    const { create, archive, restore, store } = harness();
    const id = await create.execute(
      new CreateAllergenCategoryCommand({ key: "exotiques", name: { fr: "Exotiques" } }),
    );
    await archive.execute(new ArchiveAllergenCategoryCommand(id));

    await restore.execute(new RestoreAllergenCategoryCommand(id));

    expect(store.categories.get(id)?.archivedAt).toBeNull();
  });
});

describe("le journal du référentiel d'allergènes", () => {
  it("nomme chaque geste, et dit d'où l'on vient quand quelque chose bouge", async () => {
    const { create, rename, archive, restore, journal } = harness();
    const id = await create.execute(
      new CreateAllergenCategoryCommand({ key: "exotiques", name: { fr: "Exotiques" } }),
    );
    await rename.execute(new RenameAllergenCategoryCommand(id, { fr: "Fruits exotiques" }));
    await archive.execute(new ArchiveAllergenCategoryCommand(id));
    await restore.execute(new RestoreAllergenCategoryCommand(id));

    expect(journal.types()).toEqual([
      "allergen_category.created",
      "allergen_category.renamed",
      "allergen_category.archived",
      "allergen_category.restored",
    ]);
    expect(journal.entries[1]).toMatchObject({
      subjectType: "allergen_category",
      subjectId: id,
      payload: { from: { fr: "Exotiques" }, to: { fr: "Fruits exotiques" } },
    });
  });
});
