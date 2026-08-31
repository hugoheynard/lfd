import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import {
  AllergenCodeInvalidError,
  AllergenCodeTakenError,
  AllergenEntryNotFoundError,
  ArchivedAllergenCategoryError,
  OfficialAllergenEntryLockedError,
} from "../../domain/errors/allergen-errors.js";
import {
  ArchiveAllergenCategoryCommand,
  ArchiveAllergenCategoryHandler,
} from "../archive-allergen-category.js";
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
  RestoreAllergenEntryCommand,
  RestoreAllergenEntryHandler,
} from "../restore-allergen-entry.js";
import {
  ReviseAllergenEntryCommand,
  ReviseAllergenEntryHandler,
} from "../revise-allergen-entry.js";
import {
  AllergenStore,
  InMemoryAllergenCatalogueReader,
  InMemoryAllergenCategoryRepository,
  InMemoryAllergenEntryRepository,
} from "./in-memory-allergens.js";

/** Cf. la suite jumelle : absolue, mais jamais comparée à l'horloge. */
const NOW = new Date("2026-09-02T10:00:00.000Z");

class StubIds extends PimIdGenerator {
  private count = 0;
  next(): string {
    this.count += 1;
    return `alg_test_${this.count}`;
  }
}

interface Harness {
  readonly store: AllergenStore;
  readonly journal: RecordingJournal;
  readonly createCategory: CreateAllergenCategoryHandler;
  readonly archiveCategory: ArchiveAllergenCategoryHandler;
  readonly create: CreateAllergenEntryHandler;
  readonly revise: ReviseAllergenEntryHandler;
  readonly archive: ArchiveAllergenEntryHandler;
  readonly restore: RestoreAllergenEntryHandler;
}

function harness(): Harness {
  const store = new AllergenStore();
  const categories = new InMemoryAllergenCategoryRepository(store);
  const entries = new InMemoryAllergenEntryRepository(store);
  const reader = new InMemoryAllergenCatalogueReader(store);
  const journal = new RecordingJournal();
  const uow = new DirectUnitOfWork();
  const ids = new StubIds();
  const clock = new FixedClock(NOW);
  return {
    store,
    journal,
    createCategory: new CreateAllergenCategoryHandler(categories, ids, journal, uow),
    archiveCategory: new ArchiveAllergenCategoryHandler(categories, reader, journal, clock, uow),
    create: new CreateAllergenEntryHandler(entries, categories, ids, journal, uow),
    revise: new ReviseAllergenEntryHandler(entries, categories, journal, uow),
    archive: new ArchiveAllergenEntryHandler(entries, journal, clock, uow),
    restore: new RestoreAllergenEntryHandler(entries, categories, journal, uow),
  };
}

/** Une catégorie maison prête à accueillir, et son identifiant. */
async function houseCategory(h: Harness, key = "exotiques"): Promise<string> {
  return h.createCategory.execute(
    new CreateAllergenCategoryCommand({ key, name: { fr: "Exotiques" } }),
  );
}

describe("CreateAllergenEntryHandler", () => {
  it("déclare une entrée maison sous une catégorie vivante", async () => {
    const h = harness();
    const categoryId = await houseCategory(h);

    const id = await h.create.execute(
      new CreateAllergenEntryCommand({
        code: "X-NOIX-TIGRE",
        name: { fr: "Noix tigrée", en: "Tiger nut" },
        categoryId,
      }),
    );

    expect(h.store.entries.get(id)).toMatchObject({
      code: "X-NOIX-TIGRE",
      categoryId,
      official: false,
      archivedAt: null,
    });
  });

  it("refuse un code déjà porté — un code est une identité de stockage", async () => {
    const h = harness();
    const categoryId = await houseCategory(h);
    h.store.seedOfficialCategory("alg_cat_tree_nuts", "tree_nuts", "tree_nuts");
    h.store.seedOfficialEntry("alg_SH", "SH", "alg_cat_tree_nuts");

    await expect(
      h.create.execute(
        new CreateAllergenEntryCommand({ code: "SH", name: { fr: "Ma noisette" }, categoryId }),
      ),
    ).rejects.toBeInstanceOf(AllergenCodeTakenError);
  });

  it("refuse un code qui n'a pas la forme d'un code", async () => {
    // Le refus vient du value object, pas du contrôleur : le domaine se protège
    // quel que soit le chemin d'entrée.
    const h = harness();
    const categoryId = await houseCategory(h);

    await expect(
      h.create.execute(
        new CreateAllergenEntryCommand({
          code: "noix tigrée",
          name: { fr: "Noix tigrée" },
          categoryId,
        }),
      ),
    ).rejects.toBeInstanceOf(AllergenCodeInvalidError);
  });

  it("refuse de ranger un allergène sous une catégorie archivée", async () => {
    const h = harness();
    const categoryId = await houseCategory(h);
    await h.archiveCategory.execute(new ArchiveAllergenCategoryCommand(categoryId));

    await expect(
      h.create.execute(
        new CreateAllergenEntryCommand({ code: "X-CACHE", name: { fr: "Caché" }, categoryId }),
      ),
    ).rejects.toBeInstanceOf(ArchivedAllergenCategoryError);
  });
});

describe("ReviseAllergenEntryHandler", () => {
  it("règle le libellé sans toucher au code", async () => {
    const h = harness();
    const categoryId = await houseCategory(h);
    const id = await h.create.execute(
      new CreateAllergenEntryCommand({
        code: "X-SOUCHET",
        name: { fr: "Noix tigrée" },
        categoryId,
      }),
    );

    await h.revise.execute(new ReviseAllergenEntryCommand(id, { name: { fr: "Souchet" } }));

    expect(h.store.entries.get(id)).toMatchObject({ code: "X-SOUCHET", name: { fr: "Souchet" } });
  });

  it("refuse de toucher une entrée officielle — c'est du droit", async () => {
    const h = harness();
    h.store.seedOfficialCategory("alg_cat_tree_nuts", "tree_nuts", "tree_nuts");
    h.store.seedOfficialEntry("alg_SH", "SH", "alg_cat_tree_nuts");
    const before = h.store.entries.get("alg_SH");

    await expect(
      h.revise.execute(
        new ReviseAllergenEntryCommand("alg_SH", { name: { fr: "Noisette du coin" } }),
      ),
    ).rejects.toBeInstanceOf(OfficialAllergenEntryLockedError);

    // Le refus vient de l'agrégat, avant l'unité de travail : un 409 qui aurait
    // quand même écrit ou journalisé serait un faux dans l'historique.
    expect(h.store.entries.get("alg_SH")).toBe(before);
    expect(h.journal.types()).toEqual([]);
  });

  it("déplace une entrée maison vers une autre catégorie vivante", async () => {
    // Le rattachement d'une entrée maison est modifiable (contrairement à
    // l'officiel) — mais ce chemin de `revise` n'avait encore aucun test.
    const h = harness();
    const categoryId = await houseCategory(h, "exotiques");
    const target = await houseCategory(h, "fruits-a-coque-maison");
    const id = await h.create.execute(
      new CreateAllergenEntryCommand({ code: "X-SOUCHET", name: { fr: "Souchet" }, categoryId }),
    );

    await h.revise.execute(new ReviseAllergenEntryCommand(id, { categoryId: target }));

    expect(h.store.entries.get(id)).toMatchObject({ categoryId: target, name: { fr: "Souchet" } });
  });

  it("refuse de déplacer une entrée vers une catégorie archivée", async () => {
    // Même garde qu'à la création (`requireLivingCategory`), mais côté
    // `revise` : l'entrée serait proposée sous une famille que l'écran, qui
    // range par catégorie, ne montre plus.
    const h = harness();
    const categoryId = await houseCategory(h, "exotiques");
    const archivedTarget = await houseCategory(h, "obsolete");
    const id = await h.create.execute(
      new CreateAllergenEntryCommand({ code: "X-SOUCHET", name: { fr: "Souchet" }, categoryId }),
    );
    await h.archiveCategory.execute(new ArchiveAllergenCategoryCommand(archivedTarget));

    await expect(
      h.revise.execute(new ReviseAllergenEntryCommand(id, { categoryId: archivedTarget })),
    ).rejects.toBeInstanceOf(ArchivedAllergenCategoryError);
  });

  it("n'inscrit rien quand le formulaire est réenregistré à l'identique", async () => {
    const h = harness();
    const categoryId = await houseCategory(h);
    const id = await h.create.execute(
      new CreateAllergenEntryCommand({ code: "X-SOUCHET", name: { fr: "Souchet" }, categoryId }),
    );
    const before = h.store.entries.get(id);

    await h.revise.execute(new ReviseAllergenEntryCommand(id, { name: { fr: "Souchet" } }));

    // Un geste sans effet n'est pas un fait — et il n'est pas non plus une
    // écriture : on ne repasse pas sur la ligne pour n'y rien changer.
    expect(h.journal.types()).toEqual(["allergen_category.created", "allergen_entry.created"]);
    // Plus fort qu'une absence de trace : `snapshot()` fabrique un objet neuf à
    // chaque écriture, donc la MÊME référence après coup prouve que le dépôt
    // n'a même pas été rappelé.
    expect(h.store.entries.get(id)).toBe(before);
  });

  it("jette si l'entrée n'existe pas", async () => {
    const h = harness();

    await expect(
      h.revise.execute(new ReviseAllergenEntryCommand("absente", { name: { fr: "X" } })),
    ).rejects.toBeInstanceOf(AllergenEntryNotFoundError);
  });
});

describe("ArchiveAllergenEntryHandler", () => {
  it("retire l'entrée de ce qu'on propose, sans la retirer de ce qu'on reconnaît", async () => {
    const h = harness();
    const categoryId = await houseCategory(h);
    const id = await h.create.execute(
      new CreateAllergenEntryCommand({ code: "X-SOUCHET", name: { fr: "Souchet" }, categoryId }),
    );

    await h.archive.execute(new ArchiveAllergenEntryCommand(id));

    expect(h.store.entries.get(id)?.archivedAt).toEqual(NOW);
    // D2 bis : une déclaration enregistrée hier cite ce code, et la relire ne
    // doit pas la déclarer invalide.
    const known = await new InMemoryAllergenCatalogueReader(h.store).knownCodes();
    expect(known.has("X-SOUCHET")).toBe(true);
  });

  it("refuse d'archiver une entrée officielle — archiver, ici, c'est supprimer", async () => {
    const h = harness();
    h.store.seedOfficialCategory("alg_cat_tree_nuts", "tree_nuts", "tree_nuts");
    h.store.seedOfficialEntry("alg_SH", "SH", "alg_cat_tree_nuts");
    const before = h.store.entries.get("alg_SH");

    await expect(
      h.archive.execute(new ArchiveAllergenEntryCommand("alg_SH")),
    ).rejects.toBeInstanceOf(OfficialAllergenEntryLockedError);

    expect(h.store.entries.get("alg_SH")).toBe(before);
    expect(h.journal.types()).toEqual([]);
  });
});

describe("RestoreAllergenEntryHandler", () => {
  it("remet l'entrée à ce qu'on propose", async () => {
    const h = harness();
    const categoryId = await houseCategory(h);
    const id = await h.create.execute(
      new CreateAllergenEntryCommand({ code: "X-SOUCHET", name: { fr: "Souchet" }, categoryId }),
    );
    await h.archive.execute(new ArchiveAllergenEntryCommand(id));

    await h.restore.execute(new RestoreAllergenEntryCommand(id));

    expect(h.store.entries.get(id)?.archivedAt).toBeNull();
    expect(h.journal.types()).toContain("allergen_entry.restored");
  });

  it("refuse de restaurer sous une catégorie devenue archivée", async () => {
    // L'entrée serait offerte à la saisie sans que l'écran, qui range par
    // famille, puisse la montrer.
    const h = harness();
    const categoryId = await houseCategory(h);
    const id = await h.create.execute(
      new CreateAllergenEntryCommand({ code: "X-SOUCHET", name: { fr: "Souchet" }, categoryId }),
    );
    await h.archive.execute(new ArchiveAllergenEntryCommand(id));
    await h.archiveCategory.execute(new ArchiveAllergenCategoryCommand(categoryId));

    await expect(h.restore.execute(new RestoreAllergenEntryCommand(id))).rejects.toBeInstanceOf(
      ArchivedAllergenCategoryError,
    );
  });
});
