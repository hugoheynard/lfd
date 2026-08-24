import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { VatRateNotFoundError } from "../../../../commerce/domain/errors/commerce-errors.js";
import { VatRate } from "../../../../commerce/domain/entities/vat-rate.js";
import {
  VatRateRepository,
  type VatRateUsage,
} from "../../../../commerce/domain/ports/vat-rate.repository.js";
import { PimIdGenerator } from "../../../../infra/id/pim-id-generator.js";
import { Category, type CategorySnapshot } from "../../domain/entities/category.js";
import {
  CategoryArchivedParentError,
  CategoryCycleError,
  CategoryFrozenError,
  CategoryHasActiveChildrenError,
  CategoryHasActiveProductsError,
  CategoryNotFoundError,
  CategoryOrderMismatchError,
  CategorySlugTakenError,
  CategoryVatWithoutChannelError,
  CategoryUnknownLocationError,
} from "../../domain/errors/category-errors.js";
import { CategoryRepository } from "../../domain/ports/category.repository.js";
import { KnownLocationsReader } from "../../domain/ports/known-locations.reader.js";
import { ProductCountReader } from "../../domain/ports/product-count.reader.js";
import type { SalesChannels } from "../../../shared/domain/value-objects/sales-channels.js";
import { ArchiveCategoryCommand, ArchiveCategoryHandler } from "../archive-category.js";
import { CreateCategoryCommand, CreateCategoryHandler } from "../create-category.js";
import { ListCategoriesHandler } from "../list-categories.js";
import { MoveCategoryCommand, MoveCategoryHandler } from "../move-category.js";
import { RenameCategoryCommand, RenameCategoryHandler } from "../rename-category.js";
import { ReorderCategoriesCommand, ReorderCategoriesHandler } from "../reorder-categories.js";
import {
  SetCategoryChannelsCommand,
  SetCategoryChannelsHandler,
} from "../set-category-channels.js";
import { SetCategoryVatCommand, SetCategoryVatHandler } from "../set-category-vat.js";
import { SalesContextRegistry } from "../../../shared/domain/ports/sales-context.registry.js";
import type { SalesContext } from "../../../shared/domain/value-objects/sales-context.js";

/**
 * Le faux dépôt garde des **agrégats**, pas des lignes : c'est ce que le port
 * rend depuis qu'il ne porte plus une méthode par mutation. Il reconstitue à
 * chaque lecture, pour qu'un test ne puisse pas passer parce qu'il tient la
 * même instance que le handler — ce que la vraie base ne fera jamais.
 */
class InMemoryCategories extends CategoryRepository {
  readonly stored = new Map<string, CategorySnapshot>();
  transactions = 0;

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
  countActiveChildren(parentId: string): Promise<number> {
    const live = [...this.stored.values()].filter(
      (row) => row.parentId === parentId && !row.isArchived,
    );
    return Promise.resolve(live.length);
  }
  /**
   * `max(position) + 1`, comme le vrai dépôt — et **pas** `siblings.length`.
   *
   * Les deux coïncident tant que les rangs sont contigus. Ils divergent dès
   * qu'il y a un trou, et un déplacement en laisse un : sur `[0, 2]`, le compte
   * rend `2`, qui est déjà pris, là où la base rend `3`. Un double qui ne ment
   * pas assez pour qu'on le remarque fait passer des tests sur un état que la
   * production ne produit jamais.
   */
  nextPosition(parentId: string | null): Promise<number> {
    const siblings = [...this.stored.values()].filter((row) => row.parentId === parentId);
    const highest = siblings.reduce((max, row) => Math.max(max, row.position), -1);
    return Promise.resolve(highest + 1);
  }

  findBySlugFr(slugFr: string): Promise<Category | null> {
    const found = [...this.stored.values()].find((row) => row.slug.fr === slugFr);
    return Promise.resolve(found === undefined ? null : Category.reconstitute(found));
  }

  listChildren(parentId: string | null): Promise<Category[]> {
    const level = [...this.stored.values()]
      .filter((row) => row.parentId === parentId)
      .sort((a, b) => a.position - b.position);
    return Promise.resolve(level.map((row) => Category.reconstitute(row)));
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

/**
 * Le compte de fiches, désormais hors du dépôt des familles. Un double séparé,
 * c'est justement le bénéfice : un test d'archivage n'a plus à feindre une
 * table de produits sur le port des familles.
 */
class StubProductCounts extends ProductCountReader {
  constructor(
    private readonly forOne = 0,
    private readonly byCategory: ReadonlyMap<string, number> = new Map(),
  ) {
    super();
  }
  countForCategory(): Promise<number> {
    return Promise.resolve(this.forOne);
  }
  countByCategory(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(this.byCategory);
  }
}

/** Un référentiel d'emplacements qui dit oui à tout — le cas nominal. */
function allLocationsKnown(): KnownLocationsReader {
  return new (class extends KnownLocationsReader {
    existing(ids: readonly string[]): Promise<ReadonlySet<string>> {
      return Promise.resolve(new Set(ids));
    }
  })();
}

/** Un référentiel VIDE : aucun identifiant cité n'existe. */
function noLocationKnown(): KnownLocationsReader {
  return new (class extends KnownLocationsReader {
    existing(): Promise<ReadonlySet<string>> {
      return Promise.resolve(new Set<string>());
    }
  })();
}

class InMemoryRegimes extends VatRateRepository {
  private readonly rows: VatRate[] = [];

  listAll(): Promise<VatRate[]> {
    return Promise.resolve([...this.rows]);
  }
  findById(id: string): Promise<VatRate | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  findByPercent(percent: number): Promise<VatRate | null> {
    return Promise.resolve(this.rows.find((r) => r.percent === percent) ?? null);
  }
  usageByRegime(): Promise<ReadonlyMap<string, VatRateUsage>> {
    return Promise.resolve(new Map());
  }
  add(rate: VatRate): Promise<void> {
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
    ids.push(
      await handler.execute(new CreateCategoryCommand({ name: { fr: `Famille ${index}` } })),
    );
  }
  return ids;
}

/** Le handler d'archivage, sans fiche active. */
function archive(repo: InMemoryCategories): ArchiveCategoryHandler {
  return new ArchiveCategoryHandler(repo, new StubProductCounts());
}

/** …avec `count` fiches actives. */
function archiveWith(repo: InMemoryCategories, count: number): ArchiveCategoryHandler {
  return new ArchiveCategoryHandler(repo, new StubProductCounts(count));
}

/** Le handler des canaux, avec un référentiel d'emplacements complaisant. */
/**
 * Le registre des contextes, tel que la base le sert. Un double plutôt qu'un
 * faux à la volée : les trois handlers le lisent, et trois copies divergeraient.
 */
const CONTEXTS: readonly SalesContext[] = [
  {
    id: "ctx_emporter",
    key: "emporter",
    label: "À emporter",
    handleSuffix: "",
    channelKey: "emporter",
    active: true,
    shopifyProjected: true,
    position: 1,
  },
  {
    id: "ctx_sur_place",
    key: "surPlace",
    label: "Sur place",
    handleSuffix: "-surplace",
    channelKey: "surPlace",
    active: true,
    shopifyProjected: false,
    position: 2,
  },
  {
    id: "ctx_b2b",
    key: "b2b",
    label: "B2B",
    handleSuffix: "-b2b",
    channelKey: "b2b",
    active: true,
    shopifyProjected: false,
    position: 3,
  },
];

const registry: SalesContextRegistry = { active: () => Promise.resolve(CONTEXTS) };

function setChannels(repo: InMemoryCategories): SetCategoryChannelsHandler {
  return new SetCategoryChannelsHandler(repo, allLocationsKnown(), registry);
}

describe("CreateCategoryHandler", () => {
  it("crée une famille avec un slug dérivé", async () => {
    const repo = new InMemoryCategories();
    const id = await new CreateCategoryHandler(repo, new SequentialIds()).execute(
      new CreateCategoryCommand({ name: { fr: "Chocolats fins" } }),
    );

    expect(repo.at(id).slug.fr).toBe("chocolats-fins");
  });

  /**
   * `MoveCategory` refusait déjà un parent archivé ; la création, non. Le front
   * filtre les archivées de sa liste de parents — c'est précisément pourquoi
   * le trou serait passé inaperçu.
   */
  it("refuse un parent ARCHIVÉ", async () => {
    const repo = new InMemoryCategories();
    const [parent] = await openRoots(repo, 1);
    await archive(repo).execute(new ArchiveCategoryCommand(parent!));

    await expect(
      new CreateCategoryHandler(repo, new SequentialIds()).execute(
        new CreateCategoryCommand({ name: { fr: "Tartes" }, parentId: parent! }),
      ),
    ).rejects.toBeInstanceOf(CategoryArchivedParentError);
  });

  it("refuse un parent inexistant", async () => {
    const repo = new InMemoryCategories();
    await expect(
      new CreateCategoryHandler(repo, new SequentialIds()).execute(
        new CreateCategoryCommand({ name: { fr: "Sous-famille" }, parentId: "absent" }),
      ),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});

describe("RenameCategoryHandler", () => {
  it("renomme et re-dérive le slug", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);

    await new RenameCategoryHandler(repo).execute(
      new RenameCategoryCommand(id!, { name: { fr: "Chocolats & pralinés" } }),
    );

    expect(repo.at(id!).slug.fr).toBe("chocolats-pralines");
  });
});

describe("ArchiveCategoryHandler", () => {
  it("refuse d’archiver une famille avec des produits actifs", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);

    await expect(
      archiveWith(repo, 2).execute(new ArchiveCategoryCommand(id!)),
    ).rejects.toBeInstanceOf(CategoryHasActiveProductsError);
  });

  /**
   * Le pendant du refus de `MoveCategory` : sans lui, il suffisait d'archiver
   * le parent pour obtenir l'état que le déplacement interdit — des familles
   * vivantes sous un parent mort.
   */
  it("refuse d’archiver une famille qui porte des sous-familles vivantes", async () => {
    const repo = new InMemoryCategories();
    const [parent, child] = await openRoots(repo, 2);
    await new MoveCategoryHandler(repo).execute(new MoveCategoryCommand(child!, parent!));

    await expect(archive(repo).execute(new ArchiveCategoryCommand(parent!))).rejects.toBeInstanceOf(
      CategoryHasActiveChildrenError,
    );
  });

  it("accepte quand les sous-familles sont elles-mêmes archivées", async () => {
    const repo = new InMemoryCategories();
    const [parent, child] = await openRoots(repo, 2);
    await new MoveCategoryHandler(repo).execute(new MoveCategoryCommand(child!, parent!));
    await archive(repo).execute(new ArchiveCategoryCommand(child!));

    await archive(repo).execute(new ArchiveCategoryCommand(parent!));

    expect(repo.at(parent!).isArchived).toBe(true);
  });

  it("archive une famille vide", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);

    await archive(repo).execute(new ArchiveCategoryCommand(id!));

    expect(repo.at(id!).isArchived).toBe(true);
  });
});

describe("SetCategoryChannelsHandler", () => {
  it("remplace les canaux hérités de la famille", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);

    await setChannels(repo).execute(new SetCategoryChannelsCommand(id!, ALL_OPEN));

    expect(repo.at(id!).channelPreset).toEqual(ALL_OPEN);
  });

  it("refuse une famille inexistante", async () => {
    const repo = new InMemoryCategories();
    await expect(
      setChannels(repo).execute(new SetCategoryChannelsCommand("absent", ALL_OPEN)),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  /**
   * Le mur avait une seule face : `DeleteLocation` refuse de supprimer sous
   * une famille qui coche, mais rien n'empêchait d'écrire un preset citant un
   * emplacement qui n’existe pas. L'écran l'aurait rendu invisible — il ignore
   * les clés inconnues — au lieu de le rendre faux.
   */
  it("refuse un emplacement qui n’existe pas", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);

    await expect(
      new SetCategoryChannelsHandler(repo, noLocationKnown(), registry).execute(
        new SetCategoryChannelsCommand(id!, ALL_OPEN),
      ),
    ).rejects.toBeInstanceOf(CategoryUnknownLocationError);
  });

  /** L'écriture est refusée EN ENTIER : pas de preset à moitié posé. */
  it("n’écrit rien quand un seul location est inconnu", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);
    const before = repo.at(id!).channelPreset;

    await expect(
      new SetCategoryChannelsHandler(repo, noLocationKnown(), registry).execute(
        new SetCategoryChannelsCommand(id!, ALL_OPEN),
      ),
    ).rejects.toBeInstanceOf(CategoryUnknownLocationError);
    expect(repo.at(id!).channelPreset).toEqual(before);
  });

  /** La décision « archivée = gelée » : les réglages sont refusés. */
  it("refuse de régler les canaux d’une famille archivée", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);
    await archive(repo).execute(new ArchiveCategoryCommand(id!));

    await expect(
      setChannels(repo).execute(new SetCategoryChannelsCommand(id!, ALL_OPEN)),
    ).rejects.toBeInstanceOf(CategoryFrozenError);
  });

  /** …mais le renommage, lui, reste permis : corriger une faute de frappe. */
  it("laisse renommer une famille archivée", async () => {
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);
    await archive(repo).execute(new ArchiveCategoryCommand(id!));

    await new RenameCategoryHandler(repo).execute(
      new RenameCategoryCommand(id!, { name: { fr: "Chocolats" } }),
    );

    expect(repo.at(id!).name.fr).toBe("Chocolats");
  });
});

describe("SetCategoryVatHandler", () => {
  /** Une famille qui vend, donc capable de porter un taux (invariant agrégat). */
  async function sellingCategory(categories: InMemoryCategories): Promise<string> {
    const [id] = await openRoots(categories, 1);
    await setChannels(categories).execute(new SetCategoryChannelsCommand(id!, ALL_OPEN));
    return id!;
  }

  it("règle le taux d’un canal vendu", async () => {
    const categories = new InMemoryCategories();
    const rates = new InMemoryRegimes();
    await rates.add(VatRate.open({ id: "tva_5", name: "Réduit", description: "", percent: 5.5 }));
    const id = await sellingCategory(categories);

    await new SetCategoryVatHandler(categories, rates, registry, new RecordingJournal()).execute(
      new SetCategoryVatCommand(id, { emporter: "tva_5" }),
    );

    expect(categories.at(id).vatByContext).toEqual({ emporter: "tva_5" });
  });

  it("refuse un taux fantôme", async () => {
    const categories = new InMemoryCategories();
    const id = await sellingCategory(categories);

    await expect(
      new SetCategoryVatHandler(
        categories,
        new InMemoryRegimes(),
        registry,
        new RecordingJournal(),
      ).execute(new SetCategoryVatCommand(id, { emporter: "tva_absent" })),
    ).rejects.toBeInstanceOf(VatRateNotFoundError);
  });

  /**
   * La règle tenue par l'agrégat, vue depuis le handler : aucun appelant ne
   * peut plus rattacher un taux à un canal fermé, même en sautant l'écran.
   */
  it("refuse le taux d’un canal que la famille ne vend pas", async () => {
    const categories = new InMemoryCategories();
    const rates = new InMemoryRegimes();
    await rates.add(VatRate.open({ id: "tva_5", name: "Réduit", description: "", percent: 5.5 }));
    const [id] = await openRoots(categories, 1);

    await expect(
      new SetCategoryVatHandler(categories, rates, registry, new RecordingJournal()).execute(
        new SetCategoryVatCommand(id!, { emporter: "tva_5" }),
      ),
    ).rejects.toBeInstanceOf(CategoryVatWithoutChannelError);
  });
});

describe("le rang d’un niveau", () => {
  /**
   * Les rangs sont **ordinaux, pas contigus**. Un déplacement laisse un trou
   * dans le niveau quitté, et c'est sans conséquence tant que le rang suivant
   * se prend au MAXIMUM et non au compte — sinon il retombe sur un rang occupé.
   */
  it("ne redonne jamais un rang déjà pris, même après un départ", async () => {
    const repo = new InMemoryCategories();
    const [ailleurs, first, second, third] = await openRoots(repo, 4);
    // `second` s'en va : la racine garde les rangs 0 et 2 pour first et third.
    await new MoveCategoryHandler(repo).execute(new MoveCategoryCommand(second!, ailleurs!));

    const [nouvelle] = await openRoots(repo, 1);

    const taken = [repo.at(first!).position, repo.at(third!).position];
    expect(taken).toEqual([1, 3]);
    expect(taken).not.toContain(repo.at(nouvelle!).position);
  });
});

describe("le slug est unique", () => {
  /**
   * Il est dérivé du nom et sert d'identifiant en aval : préfixe de famille de
   * tous les SKU, et clé projetée vers le catalogue B2B.
   */
  it("refuse une seconde famille du même nom", async () => {
    const repo = new InMemoryCategories();
    const handler = new CreateCategoryHandler(repo, new SequentialIds());
    await handler.execute(new CreateCategoryCommand({ name: { fr: "Pains" } }));

    await expect(
      handler.execute(new CreateCategoryCommand({ name: { fr: "Pains" } })),
    ).rejects.toBeInstanceOf(CategorySlugTakenError);
  });

  it("refuse un renommage qui prend le slug d’une autre", async () => {
    const repo = new InMemoryCategories();
    const handler = new CreateCategoryHandler(repo, new SequentialIds());
    await handler.execute(new CreateCategoryCommand({ name: { fr: "Pains" } }));
    const second = await handler.execute(
      new CreateCategoryCommand({ name: { fr: "Viennoiseries" } }),
    );

    await expect(
      new RenameCategoryHandler(repo).execute(
        new RenameCategoryCommand(second, { name: { fr: "Pains" } }),
      ),
    ).rejects.toBeInstanceOf(CategorySlugTakenError);
  });

  it("laisse une famille garder son propre slug en se renommant à peine", async () => {
    // « Pains » → « Pains  » dérive le même slug : ce n'est pas une collision
    // avec un voisin, c'est elle-même.
    const repo = new InMemoryCategories();
    const [id] = await openRoots(repo, 1);
    const own = repo.at(id!).slug.fr;

    await new RenameCategoryHandler(repo).execute(
      new RenameCategoryCommand(id!, { name: { fr: repo.at(id!).name.fr } }),
    );

    expect(repo.at(id!).slug.fr).toBe(own);
  });

  /** Une archivée garde ses fiches, donc son préfixe de SKU reste pris. */
  it("compte aussi les familles archivées", async () => {
    const repo = new InMemoryCategories();
    const handler = new CreateCategoryHandler(repo, new SequentialIds());
    const id = await handler.execute(new CreateCategoryCommand({ name: { fr: "Pains" } }));
    await archive(repo).execute(new ArchiveCategoryCommand(id));

    await expect(
      handler.execute(new CreateCategoryCommand({ name: { fr: "Pains" } })),
    ).rejects.toBeInstanceOf(CategorySlugTakenError);
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
    await archive(repo).execute(new ArchiveCategoryCommand(parent!));

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
    await archive(repo).execute(new ArchiveCategoryCommand(archived!));

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
      new CreateCategoryCommand({ name: { fr: "Viennoiseries" } }),
    );
    const counts = new StubProductCounts(0, new Map([[created, 3]]));

    const [row] = await new ListCategoriesHandler(repo, counts).execute();

    expect(row?.activeProductCount).toBe(3);
  });

  it("rend 0 — jamais `undefined` — pour une famille sans fiche", async () => {
    // Les familles sans fiche sont ABSENTES du groupBy. Un écran qui lirait
    // `undefined` afficherait « undefined fiche(s) » dans sa zone dangereuse.
    const repo = new InMemoryCategories();
    await new CreateCategoryHandler(repo, new SequentialIds()).execute(
      new CreateCategoryCommand({ name: { fr: "Pains" } }),
    );

    const [row] = await new ListCategoriesHandler(repo, new StubProductCounts()).execute();

    expect(row?.activeProductCount).toBe(0);
  });
});
