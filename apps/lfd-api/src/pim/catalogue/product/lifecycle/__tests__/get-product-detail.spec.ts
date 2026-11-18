import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../../../staff/directory/domain/staff-author-directory.js";
import { DirectPimContents } from "../../../../changes/application/__tests__/direct-pim-contents.js";
import { Category } from "../../../category/domain/entities/category.js";
import { CategoryRepository } from "../../../category/domain/ports/category.repository.js";
import {
  DetachmentLineageReader,
  type LineageProduct,
} from "../../domain/ports/detachment-lineage.reader.js";
import {
  EditorialReader,
  type ProductEditorialView,
  type ProductMediaRecord,
} from "../../domain/ports/editorial-reader.js";
import { ReadinessRepository } from "../../domain/ports/readiness.repository.js";
import {
  FakeProductHistory,
  FakeProducts,
  FakeReadiness,
  NOW,
  PRODUCT_ID,
  snapshot,
} from "../../readiness/__tests__/readiness-doubles.js";
import { GetProductDetailHandler, GetProductDetailQuery } from "../get-product-detail.js";

class NoEditorial extends EditorialReader {
  findByProduct(): Promise<null> {
    return Promise.resolve(null);
  }
  findByProducts(): Promise<ReadonlyMap<string, ProductEditorialView>> {
    return Promise.resolve(new Map());
  }
  mediaOf(): Promise<readonly []> {
    return Promise.resolve([]);
  }
  mediaOfProducts(): Promise<ReadonlyMap<string, readonly ProductMediaRecord[]>> {
    return Promise.resolve(new Map());
  }
}

class OneCategory extends CategoryRepository {
  private readonly category = Category.open({
    id: "cat_1",
    name: { fr: "Cafés" },
    parentId: null,
    position: 0,
  });
  findById(): Promise<Category | null> {
    return Promise.resolve(this.category);
  }
  findBySlugFr(): Promise<Category | null> {
    return Promise.resolve(null);
  }
  listAll(): Promise<Category[]> {
    return Promise.resolve([this.category]);
  }
  listChildren(): Promise<Category[]> {
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
  countActiveChildren(): Promise<number> {
    return Promise.resolve(0);
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(0);
  }
}

class NobodyKnown extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    return Promise.resolve(StaffAuthors.none());
  }
}

class NoLineage extends DetachmentLineageReader {
  originOf(): Promise<null> {
    return Promise.resolve(null);
  }
  productsNamed(): Promise<ReadonlyMap<string, LineageProduct>> {
    return Promise.resolve(new Map());
  }
}

/** Un dépôt qui ne date aucun contenu : la fiche a disparu entre deux lectures. */
class UndatedReadiness extends FakeReadiness {
  override contentUpdatedAt(): Promise<Date | null> {
    return Promise.resolve(null);
  }
}

function handlerOver(readiness: ReadinessRepository): GetProductDetailHandler {
  return new GetProductDetailHandler(
    new FakeProducts(snapshot("draft")),
    new NoEditorial(),
    readiness,
    new FakeProductHistory(),
    new FixedClock(NOW),
    new NobodyKnown(),
    new OneCategory(),
    new NoLineage(),
    new DirectPimContents(),
  );
}

describe("GetProductDetailHandler — contentUpdatedAt", () => {
  it("sert la date du contenu en ISO quand le dépôt la connaît", async () => {
    const detail = await handlerOver(new FakeReadiness()).execute(
      new GetProductDetailQuery(PRODUCT_ID),
    );

    expect(detail?.contentUpdatedAt).toBe(NOW.toISOString());
  });

  /**
   * Régression : la vue inventait `new Date(0)` (1970) quand le dépôt ne datait
   * aucun contenu, et l'écran affichait une date que personne n'avait posée.
   */
  it("sert `null` plutôt qu'une date inventée quand le dépôt ne date rien", async () => {
    const detail = await handlerOver(new UndatedReadiness()).execute(
      new GetProductDetailQuery(PRODUCT_ID),
    );

    expect(detail?.contentUpdatedAt).toBeNull();
  });
});
