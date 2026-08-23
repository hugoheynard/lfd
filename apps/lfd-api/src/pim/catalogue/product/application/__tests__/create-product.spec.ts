import { v7 as uuidV7 } from "uuid";

import { PimIdGenerator } from "../../../../infra/id/pim-id-generator.js";
import { Category } from "../../../category/domain/entities/category.js";
import { CategoryArchivedError } from "../../../category/domain/errors/category-errors.js";
import { CategoryRepository } from "../../../category/domain/ports/category.repository.js";
import type { SalesChannels } from "../../../shared/domain/value-objects/sales-channels.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { EditorialRepository } from "../../domain/ports/editorial.repository.js";
import { NutritionRepository } from "../../domain/ports/nutrition.repository.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import type { SkuAvailability } from "../../domain/services/sku-generator.js";
import { Sku } from "../../domain/value-objects/sku.value-object.js";
import {
  CreateProductCommand,
  CreateProductHandler,
  type CreateProductInput,
} from "../create-product.js";

const NO_CHANNELS: SalesChannels = { boutiques: {}, b2b: false };

class FakeProductRepository extends ProductRepository {
  readonly written: ProductSnapshot[] = [];

  findById(): Promise<Product | null> {
    return Promise.resolve(null);
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve([]);
  }
  add(product: Product): Promise<void> {
    this.written.push(product.snapshot());
    return Promise.resolve();
  }
  save(product: Product): Promise<void> {
    return this.add(product);
  }

  get last(): ProductSnapshot {
    const found = this.written.at(-1);
    if (found === undefined) {
      throw new Error("aucun produit écrit");
    }
    return found;
  }
}

class FakeCategoryRepository extends CategoryRepository {
  private static family(id: string, isArchived: boolean): Category {
    return Category.reconstitute({
      id,
      name: { fr: "Viennoiseries" },
      slug: { fr: "viennoiseries" },
      parentId: null,
      position: 0,
      isArchived,
      channelPreset: NO_CHANNELS,
      emporterTvaId: null,
      surPlaceTvaId: null,
      b2bTvaId: null,
    });
  }

  findById(id: string): Promise<Category | null> {
    if (id === "cat_active" || id === "cat_archived") {
      return Promise.resolve(FakeCategoryRepository.family(id, id === "cat_archived"));
    }
    return Promise.resolve(null);
  }
  listAll(): Promise<Category[]> {
    return Promise.resolve([]);
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  saveAll(): Promise<void> {
    return Promise.resolve();
  }
  findBySlugFr(): Promise<Category | null> {
    return Promise.resolve(null);
  }
  listChildren(): Promise<Category[]> {
    return Promise.resolve([]);
  }
  countActiveChildren(): Promise<number> {
    return Promise.resolve(0);
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(0);
  }
}

class SilentNutrition extends NutritionRepository {
  declare(): Promise<void> {
    return Promise.resolve();
  }
}

class SilentEditorial extends EditorialRepository {
  save(): Promise<void> {
    return Promise.resolve();
  }
  replaceMedia(): Promise<void> {
    return Promise.resolve();
  }
}

/** Vrais UUID v7 : la référence dérive de leur queue, un id figé la figerait aussi. */
class RealIds extends PimIdGenerator {
  next(): string {
    return uuidV7();
  }
}

function setup(taken: readonly string[] = []): {
  handler: CreateProductHandler;
  products: FakeProductRepository;
} {
  const products = new FakeProductRepository();
  const set = new Set(taken);
  const availability: SkuAvailability = {
    isTaken: (candidate: Sku): Promise<boolean> => Promise.resolve(set.has(candidate.value)),
  };

  return {
    products,
    handler: new CreateProductHandler(
      products,
      new FakeCategoryRepository(),
      new SilentNutrition(),
      new SilentEditorial(),
      new RealIds(),
      availability,
    ),
  };
}

function input(over: Partial<CreateProductInput> = {}): CreateProductInput {
  return { nameFr: "Croissant au beurre", kind: "daily", categoryId: "cat_active", ...over };
}

describe("CreateProductHandler — la référence proposée", () => {
  it("propose une référence opaque quand le champ est laissé vide", async () => {
    const { handler, products } = setup();

    await handler.execute(new CreateProductCommand(input()));

    expect(products.last.sku).toMatch(/^P-[A-Z2-9]{6}$/u);
  });

  /**
   * Le cœur du changement. L'ancienne forme dérivait la référence du slug de famille
   * et du nom : deux produits homonymes dans la même famille se disputaient la même
   * racine, et la référence annonçait une famille qu'un reclassement pouvait démentir.
   */
  it("ne dérive la référence ni du nom du produit ni de sa famille", async () => {
    const { handler, products } = setup();

    await handler.execute(new CreateProductCommand(input()));
    await handler.execute(new CreateProductCommand(input()));

    const [first, second] = products.written;
    expect(first?.sku).not.toBe(second?.sku);
    expect(first?.sku).not.toContain("VIEN");
    expect(first?.sku).not.toContain("CROISS");
  });

  it("donne à la déclinaison par défaut la référence du produit, suffixée par son rang", async () => {
    const { handler, products } = setup();

    await handler.execute(new CreateProductCommand(input()));

    const { sku, variants } = products.last;
    expect(variants[0]?.sku).toBe(`${sku}-1`);
  });

  // La reprise d'un ancien catalogue ou un format imposé par un tiers passe par là —
  // c'est la porte de sortie qui rend l'opacité du défaut acceptable.
  it("honore une référence saisie à la main", async () => {
    const { handler, products } = setup();

    await handler.execute(new CreateProductCommand(input({ sku: "vien-croiss" })));

    expect(products.last.sku).toBe("VIEN-CROISS");
    expect(products.last.variants[0]?.sku).toBe("VIEN-CROISS-1");
  });

  it("re-tire tant que la référence proposée est prise", async () => {
    const { handler, products } = setup();
    const first = await handler
      .execute(new CreateProductCommand(input()))
      .then(() => products.last.sku);

    const { handler: second, products: written } = setup([first]);
    await second.execute(new CreateProductCommand(input()));

    expect(written.last.sku).not.toBe(first);
  });

  it("refuse une famille archivée avant d'écrire quoi que ce soit", async () => {
    const { handler, products } = setup();

    await expect(
      handler.execute(new CreateProductCommand(input({ categoryId: "cat_archived" }))),
    ).rejects.toThrow(CategoryArchivedError);
    expect(products.written).toHaveLength(0);
  });
});
