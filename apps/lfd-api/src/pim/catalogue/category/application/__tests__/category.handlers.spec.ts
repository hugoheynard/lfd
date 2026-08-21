import { TvaRegimeNotFoundError } from "../../../../commerce/domain/errors/commerce-errors.js";
import {
  TvaRegimeRepository,
  type NewTvaRegime,
  type TvaRegimeRecord,
  type TvaRegimeUpdate,
} from "../../../../commerce/domain/ports/tva-regime.repository.js";
import { PimIdGenerator } from "../../../../infra/id/pim-id-generator.js";
import {
  CategoryHasActiveProductsError,
  CategoryNotFoundError,
} from "../../../shared/domain/errors/catalogue-errors.js";
import {
  CategoryRepository,
  type CategoryRecord,
  type NewCategory,
} from "../../domain/ports/category.repository.js";
import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { SalesChannels } from "../../../shared/domain/value-objects/sales-channels.js";
import { ArchiveCategoryCommand, ArchiveCategoryHandler } from "../archive-category.js";
import { wouldCreateCycle } from "../category-support.js";
import { CreateCategoryCommand, CreateCategoryHandler } from "../create-category.js";
import { RenameCategoryCommand, RenameCategoryHandler } from "../rename-category.js";
import {
  SetCategoryChannelsCommand,
  SetCategoryChannelsHandler,
} from "../set-category-channels.js";
import { SetCategoryTvaCommand, SetCategoryTvaHandler } from "../set-category-tva.js";

class InMemoryCategories extends CategoryRepository {
  readonly rows: CategoryRecord[] = [];
  activeProducts = 0;

  findById(id: string): Promise<CategoryRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  listAll(): Promise<CategoryRecord[]> {
    return Promise.resolve([...this.rows]);
  }
  insert(category: NewCategory): Promise<void> {
    this.rows.push({
      ...category,
      isArchived: false,
      emporterTvaId: null,
      surPlaceTvaId: null,
    });
    return Promise.resolve();
  }
  rename(id: string, name: LocalizedText, slug: LocalizedText): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows[index] = { ...this.rows[index]!, name, slug };
    }
    return Promise.resolve();
  }
  archive(id: string): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows[index] = { ...this.rows[index]!, isArchived: true };
    }
    return Promise.resolve();
  }
  setChannels(id: string, channels: SalesChannels): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows[index] = { ...this.rows[index]!, channelPreset: channels };
    }
    return Promise.resolve();
  }
  setTva(id: string, emporterTvaId: string | null, surPlaceTvaId: string | null): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows[index] = { ...this.rows[index]!, emporterTvaId, surPlaceTvaId };
    }
    return Promise.resolve();
  }
  countActiveProducts(): Promise<number> {
    return Promise.resolve(this.activeProducts);
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(this.rows.length);
  }
}

class InMemoryRegimes extends TvaRegimeRepository {
  readonly rows: TvaRegimeRecord[] = [];

  listAll(): Promise<TvaRegimeRecord[]> {
    return Promise.resolve([...this.rows]);
  }
  findById(id: string): Promise<TvaRegimeRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  findByTag(tag: string): Promise<TvaRegimeRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.tag === tag) ?? null);
  }
  insert(regime: NewTvaRegime): Promise<void> {
    this.rows.push(regime);
    return Promise.resolve();
  }
  update(id: string, update: TvaRegimeUpdate): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows[index] = { id, ...update };
    }
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

const ALL_OPEN: SalesChannels = {
  b1: { emporter: true, surPlace: true },
  b2: { emporter: true, surPlace: false },
};

class StubIds extends PimIdGenerator {
  next(): string {
    return "cat_fixed";
  }
}

describe("CreateCategoryHandler", () => {
  it("crée une famille avec un slug dérivé", async () => {
    const repo = new InMemoryCategories();
    const id = await new CreateCategoryHandler(repo, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: "Chocolats fins" }),
    );

    expect(id).toBe("cat_fixed");
    expect(repo.rows[0]?.slug.fr).toBe("chocolats-fins");
  });

  it("refuse un parent inexistant", async () => {
    const repo = new InMemoryCategories();
    await expect(
      new CreateCategoryHandler(repo, new StubIds()).execute(
        new CreateCategoryCommand({
          nameFr: "Sous-famille",
          parentId: "absent",
        }),
      ),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});

describe("RenameCategoryHandler", () => {
  it("renomme et re-dérive le slug", async () => {
    const repo = new InMemoryCategories();
    await new CreateCategoryHandler(repo, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: "Chocolats" }),
    );

    await new RenameCategoryHandler(repo).execute(
      new RenameCategoryCommand("cat_fixed", {
        nameFr: "Chocolats & pralinés",
      }),
    );

    expect(repo.rows[0]?.slug.fr).toBe("chocolats-pralines");
  });
});

describe("ArchiveCategoryHandler", () => {
  it("refuse d’archiver une famille avec des produits actifs", async () => {
    const repo = new InMemoryCategories();
    await new CreateCategoryHandler(repo, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: "Chocolats" }),
    );
    repo.activeProducts = 2;

    await expect(
      new ArchiveCategoryHandler(repo).execute(new ArchiveCategoryCommand("cat_fixed")),
    ).rejects.toBeInstanceOf(CategoryHasActiveProductsError);
  });

  it("archive une famille vide", async () => {
    const repo = new InMemoryCategories();
    await new CreateCategoryHandler(repo, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: "Chocolats" }),
    );

    await new ArchiveCategoryHandler(repo).execute(new ArchiveCategoryCommand("cat_fixed"));

    expect(repo.rows[0]?.isArchived).toBe(true);
  });
});

describe("SetCategoryChannelsHandler", () => {
  it("remplace les canaux hérités de la famille", async () => {
    const repo = new InMemoryCategories();
    await new CreateCategoryHandler(repo, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: "Chocolats" }),
    );

    await new SetCategoryChannelsHandler(repo).execute(
      new SetCategoryChannelsCommand("cat_fixed", ALL_OPEN),
    );

    expect(repo.rows[0]?.channelPreset).toEqual(ALL_OPEN);
  });

  it("refuse une famille inexistante", async () => {
    const repo = new InMemoryCategories();
    await expect(
      new SetCategoryChannelsHandler(repo).execute(
        new SetCategoryChannelsCommand("absent", ALL_OPEN),
      ),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});

describe("SetCategoryTvaHandler", () => {
  it("règle les deux régimes quand ils existent", async () => {
    const categories = new InMemoryCategories();
    const regimes = new InMemoryRegimes();
    await regimes.insert({
      id: "tva_5",
      name: "Réduit",
      description: "",
      percent: 5.5,
      tag: "tva-5-5",
    });
    await new CreateCategoryHandler(categories, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: "Chocolats" }),
    );

    await new SetCategoryTvaHandler(categories, regimes).execute(
      new SetCategoryTvaCommand("cat_fixed", "tva_5", null),
    );

    expect(categories.rows[0]?.emporterTvaId).toBe("tva_5");
    expect(categories.rows[0]?.surPlaceTvaId).toBeNull();
  });

  it("refuse un régime fantôme", async () => {
    const categories = new InMemoryCategories();
    const regimes = new InMemoryRegimes();
    await new CreateCategoryHandler(categories, new StubIds()).execute(
      new CreateCategoryCommand({ nameFr: "Chocolats" }),
    );

    await expect(
      new SetCategoryTvaHandler(categories, regimes).execute(
        new SetCategoryTvaCommand("cat_fixed", "tva_absent", null),
      ),
    ).rejects.toBeInstanceOf(TvaRegimeNotFoundError);
  });
});

describe("wouldCreateCycle", () => {
  it("détecte un cycle dans l’arbre des familles", () => {
    const base = {
      channelPreset: ALL_OPEN,
      emporterTvaId: null,
      surPlaceTvaId: null,
      isArchived: false,
    };
    const rows: CategoryRecord[] = [
      {
        id: "a",
        name: { fr: "A" },
        slug: { fr: "a" },
        parentId: null,
        position: 0,
        ...base,
      },
      {
        id: "b",
        name: { fr: "B" },
        slug: { fr: "b" },
        parentId: "a",
        position: 0,
        ...base,
      },
    ];
    expect(wouldCreateCycle(rows, "a", "b")).toBe(true);
    expect(wouldCreateCycle(rows, "b", "a")).toBe(false);
  });
});
