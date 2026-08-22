import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { TvaRateNotFoundError } from "../../../../commerce/domain/errors/commerce-errors.js";
import { TvaRate } from "../../../../commerce/domain/entities/tva-rate.js";
import { TvaRateRepository } from "../../../../commerce/domain/ports/tva-rate.repository.js";
import { PimIdGenerator } from "../../../../infra/id/pim-id-generator.js";
import { Category, type CategorySnapshot } from "../../domain/entities/category.js";
import {
  CategoryArchivedParentError,
  CategoryCycleError,
  CategoryFrozenError,
  CategoryHasActiveProductsError,
  CategoryNotFoundError,
  CategoryOrderMismatchError,
} from "../../domain/errors/category-errors.js";
import { CategoryRepository } from "../../domain/ports/category.repository.js";
import type { SalesChannels } from "../../../shared/domain/value-objects/sales-channels.js";
import { ArchiveCategoryCommand, ArchiveCategoryHandler } from "../archive-category.js";
import { CreateCategoryCommand, CreateCategoryHandler } from "../create-category.js";
import { ListCategoriesHandler, ListCategoriesQuery } from "../list-categories.js";
import { MoveCategoryCommand, MoveCategoryHandler } from "../move-category.js";
import { RenameCategoryCommand, RenameCategoryHandler } from "../rename-category.js";
import { ReorderCategoriesCommand, ReorderCategoriesHandler } from "../reorder-categories.js";
import {
  SetCategoryChannelsCommand,
  SetCategoryChannelsHandler,
} from "../set-category-channels.js";
import { SetCategoryTvaCommand, SetCategoryTvaHandler } from "../set-category-tva.js";

/**
 * Le faux dépôt garde des **agrégats**, pas des lignes : c'est ce que le port
 * rend depuis qu'il ne porte plus une méthode par mutation. Il reconstitue à
 * chaque lecture, pour qu'un test ne puisse pas passer parce qu'il tient la
 * même instance que le handler — ce que la vraie base ne fera jamais.
 */
class InMemoryCategories extends CategoryRepository {
  readonly stored = new Map<string, CategorySnapshot>();
  activeProducts = 0;
  transactions = 0;
  /** Ce que la lecture de liste joindra. Vide = aucune famille n'a de fiche. */
  countsByCategory: ReadonlyMap<string, number> = new Map();

  findById(id: string): Promise<Category | null> {
    const snapshot = this.stored.get(id);
    return Promise.resolve(snapshot === undefined ? null : Category.reconstitute(snapshot));
  }
  listAll(): Promise<Category[]> {
    return Promise.resolve(
      [...this.stored.values()].map((snapshot) => Category.reconstitute(snapshot)),
    );
  }
  add(category: Category): Promise<void> {
    return this.save(category);
  }
  save(category: Category): Promise<void> {
    const snapshot = category.snapshot();
    this.stored.set(snapshot.id, snapshot);
    return Promise.resolve();
  }
  saveAll(categories: readonly Category[]): Promise<void> {
    this.transactions += 1;
    for (const category of categories) {
      const snapshot = category.snapshot();
      this.stored.set(snapshot.id, snapshot);
    }
    return Promise.resolve();
  }
  countActiveProducts(): Promise<number> {
    return Promise.resolve(this.activeProducts);
  }
  activeProductCounts(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(this.countsByCategory);
  }
  nextPosition(parentId: string | null): Promise<number> {
    const siblings = [...this.stored.values()].filter((row) => row.parentId === parentId);
    return Promise.resolve(siblings.length);
  }

  /** Confort de lecture pour les assertions. */
  at(id: string): CategorySnapshot {
    const snapshot = this.stored.get(id);
    if (snapshot === undefined) {
      throw new Error(`famille ${id} absente du faux dépôt`);
    }
    return snapshot;
  }
}

class InMemoryRegimes extends TvaRateRepository {
  private readonly rows: TvaRate[] = [];

  listAll(): Promise<TvaRate[]> {
    return Promise.resolve([...this.rows]);
  }
  findById(id: string): Promise<TvaRate | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  findByTag(tag: string): Promise<TvaRate | null> {
    return Promise.resolve(this.rows.find((r) => r.tag === tag) ?? null);
  }
  add(rate: TvaRate): Promise<void> {
    this.rows.push(rate);
    return Promise.resolve();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  remove(id: string): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows.splice(index, 1);
    }
    return Promise.resolve();
  }
}

/** Deux emplacements quelconques : ce sont des ids, plus des clés fixes. */
const ALL_OPEN: SalesChannels = {
  boutiques: {
    emp_village: { emporter: true, surPlace: true },
    emp_val: { emporter: true, surPlace: false },
  },
  b2b: false,
};

class SequentialIds extends PimIdGenerator {
  private count = 0;
  next(): string {
    this.count += 1;
    return `cat_${this.count}`;
  }
}

/** Ouvre `count` familles racines, rend leurs ids dans l'ordre de création. */
async function openRoots(repo: InMemoryCategories, count: number): Promise<string[]> {
  const handler = new CreateCategoryHandler(repo, new SequentialIds());
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    ids.push(await handler.execute(new CreateCategoryCommand({ nameFr: `Famille ${index}` })));
  }
  return ids;
}

describe("CreateCategoryHandler", () => {
  it("crée une famille avec un slug dérivé", async () => {
    const repo = new InMemoryCategories();
    const id = await new CreateCategoryHandler(repo, new SequentialIds()).execute(
      new CreateCategoryCommand({ nameFr: "Chocolats fins" }),
    );

    expect(repo.at(id).slug.fr).toBe("chocolats-fins");
  });

  it("refuse un parent inexistant", async () => {
    const repo = new InMemoryCategories();
    await expect(
      new CreateCategoryHandler(repo, new SequentialIds()).execute(
        new CreateCategoryCommand({ nameFr: "Sous-famille", parentId: "absent" }),
      ),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});

describe("RenameCategoryHandler", () => {
  it("renomme et re-dérive le slug", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);

    await new RenameCategoryHandler(repo).execute(
      new RenameCategoryCommand(id!, { nameFr: "Chocolats & pralinés" }),
    );

    expect(repo.at(id!).slug.fr).toBe("chocolats-pralines");
  });
});

describe("ArchiveCategoryHandler", () => {
  it("refuse d’archiver une famille avec des produits actifs", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);
    repo.activeProducts = 2;

    await expect(
      new ArchiveCategoryHandler(repo).execute(new ArchiveCategoryCommand(id!)),
    ).rejects.toBeInstanceOf(CategoryHasActiveProductsError);
  });

  it("archive une famille vide", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);

    await new ArchiveCategoryHandler(repo).execute(new ArchiveCategoryCommand(id!));

    expect(repo.at(id!).isArchived).toBe(true);
  });
});

describe("SetCategoryChannelsHandler", () => {
  it("remplace les canaux hérités de la famille", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);

    await new SetCategoryChannelsHandler(repo).execute(
      new SetCategoryChannelsCommand(id!, ALL_OPEN),
    );

    expect(repo.at(id!).channelPreset).toEqual(ALL_OPEN);
  });

  it("refuse une famille inexistante", async () => {
    const repo = new InMemoryCategories();
    await expect(
      new SetCategoryChannelsHandler(repo).execute(
        new SetCategoryChannelsCommand("absent", ALL_OPEN),
      ),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  /** La décision « archivée = gelée » : les réglages sont refusés. */
  it("refuse de régler les canaux d’une famille archivée", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);
    await new ArchiveCategoryHandler(repo).execute(new ArchiveCategoryCommand(id!));

    await expect(
      new SetCategoryChannelsHandler(repo).execute(new SetCategoryChannelsCommand(id!, ALL_OPEN)),
    ).rejects.toBeInstanceOf(CategoryFrozenError);
  });

  /** …mais le renommage, lui, reste permis : corriger une faute de frappe. */
  it("laisse renommer une famille archivée", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);
    await new ArchiveCategoryHandler(repo).execute(new ArchiveCategoryCommand(id!));

    await new RenameCategoryHandler(repo).execute(
      new RenameCategoryCommand(id!, { nameFr: "Chocolats" }),
    );

    expect(repo.at(id!).name.fr).toBe("Chocolats");
  });
});

describe("SetCategoryTvaHandler", () => {
  it("règle les deux taux quand ils existent", async () => {
    const categories = new InMemoryCategories();
    const rates = new InMemoryRegimes();
    await rates.add(TvaRate.open({ id: "tva_5", name: "Réduit", description: "", percent: 5.5 }));
    const [id] = await openRoots(categories, 1);

    await new SetCategoryTvaHandler(categories, rates, new RecordingJournal()).execute(
      new SetCategoryTvaCommand(id!, { emporter: "tva_5", surPlace: null, b2b: null }),
    );

    expect(categories.at(id!).emporterTvaId).toBe("tva_5");
    expect(categories.at(id!).surPlaceTvaId).toBeNull();
    expect(categories.at(id!).b2bTvaId).toBeNull();
  });

  it("refuse un taux fantôme", async () => {
    const categories = new InMemoryCategories();
    const [id] = await openRoots(categories, 1);

    await expect(
      new SetCategoryTvaHandler(categories, new InMemoryRegimes(), new RecordingJournal()).execute(
        new SetCategoryTvaCommand(id!, { emporter: "tva_absent", surPlace: null, b2b: null }),
      ),
    ).rejects.toBeInstanceOf(TvaRateNotFoundError);
  });
});

describe("MoveCategoryHandler", () => {
  it("range une famille sous une autre, en dernier", async () => {
    const repo = new InMemoryCategories();
    const [parent, moved] = await openRoots(repo, 2);

    await new MoveCategoryHandler(repo).execute(new MoveCategoryCommand(moved!, parent!));

    expect(repo.at(moved!).parentId).toBe(parent);
    expect(repo.at(moved!).position).toBe(0);
  });

  it("remonte à la racine avec un parent nul", async () => {
    const repo = new InMemoryCategories();
    const [parent, moved] = await openRoots(repo, 2);
    await new MoveCategoryHandler(repo).execute(new MoveCategoryCommand(moved!, parent!));

    await new MoveCategoryHandler(repo).execute(new MoveCategoryCommand(moved!, null));

    expect(repo.at(moved!).parentId).toBeNull();
  });

  /** L'invariant 5 du socle, enfin gardé par un verbe capable de le violer. */
  it("refuse un déplacement qui créerait un cycle", async () => {
    const repo = new InMemoryCategories();
    const [grandParent, child] = await openRoots(repo, 2);
    await new MoveCategoryHandler(repo).execute(new MoveCategoryCommand(child!, grandParent!));

    await expect(
      new MoveCategoryHandler(repo).execute(new MoveCategoryCommand(grandParent!, child!)),
    ).rejects.toBeInstanceOf(CategoryCycleError);
  });

  it("refuse de ranger une famille sous une famille archivée", async () => {
    const repo = new InMemoryCategories();
    const [parent, moved] = await openRoots(repo, 2);
    await new ArchiveCategoryHandler(repo).execute(new ArchiveCategoryCommand(parent!));

    await expect(
      new MoveCategoryHandler(repo).execute(new MoveCategoryCommand(moved!, parent!)),
    ).rejects.toBeInstanceOf(CategoryArchivedParentError);
  });
});

describe("ReorderCategoriesHandler", () => {
  it("renumérote la fratrie dans l’ordre reçu, en une transaction", async () => {
    const repo = new InMemoryCategories();
    const [first, second, third] = await openRoots(repo, 3);

    await new ReorderCategoriesHandler(repo).execute(
      new ReorderCategoriesCommand(null, [third!, first!, second!]),
    );

    expect(repo.at(third!).position).toBe(0);
    expect(repo.at(first!).position).toBe(1);
    expect(repo.at(second!).position).toBe(2);
    expect(repo.transactions).toBe(1);
  });

  it("refuse un ordre partiel plutôt que de laisser des rangs en double", async () => {
    const repo = new InMemoryCategories();
    const [first] = await openRoots(repo, 3);

    await expect(
      new ReorderCategoriesHandler(repo).execute(new ReorderCategoriesCommand(null, [first!])),
    ).rejects.toBeInstanceOf(CategoryOrderMismatchError);
  });

  /** Une famille archivée n'est ni exigée dans l'ordre, ni réécrite. */
  it("ignore les familles archivées du niveau", async () => {
    const repo = new InMemoryCategories();
    const [first, second, archived] = await openRoots(repo, 3);
    await new ArchiveCategoryHandler(repo).execute(new ArchiveCategoryCommand(archived!));

    await new ReorderCategoriesHandler(repo).execute(
      new ReorderCategoriesCommand(null, [second!, first!]),
    );

    expect(repo.at(second!).position).toBe(0);
    expect(repo.at(archived!).position).toBe(2);
  });
});

describe("ListCategoriesHandler", () => {
  it("joint le compte de fiches ACTIVES à chaque famille", async () => {
    // Il ne vit pas dans l'agrégat : une famille ne voit pas les fiches qui la
    // référencent. C'est une donnée de lecture, jointe au moment de lire.
    const repo = new InMemoryCategories();
    const created = await new CreateCategoryHandler(repo, new SequentialIds()).execute(
      new CreateCategoryCommand({ nameFr: "Viennoiseries" }),
    );
    repo.countsByCategory = new Map([[created, 3]]);

    const [row] = await new ListCategoriesHandler(repo).execute(new ListCategoriesQuery());

    expect(row?.activeProductCount).toBe(3);
  });

  it("rend 0 — jamais `undefined` — pour une famille sans fiche", async () => {
    // Les familles sans fiche sont ABSENTES du groupBy. Un écran qui lirait
    // `undefined` afficherait « undefined fiche(s) » dans sa zone dangereuse.
    const repo = new InMemoryCategories();
    await new CreateCategoryHandler(repo, new SequentialIds()).execute(
      new CreateCategoryCommand({ nameFr: "Pains" }),
    );

    const [row] = await new ListCategoriesHandler(repo).execute(new ListCategoriesQuery());

    expect(row?.activeProductCount).toBe(0);
  });
});
