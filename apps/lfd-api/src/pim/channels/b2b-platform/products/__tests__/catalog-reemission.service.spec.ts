import { AppConfig } from "../../../../../platform/config/app-config.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { tarte } from "../../../../catalogue/product/application/__tests__/audience-doubles.js";
import { CatalogEmitter } from "../../../../catalogue/shared/domain/ports/catalog-emitter.js";
import {
  CatalogFactsReader,
  type CatalogFamilyRecord,
} from "../../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import { CatalogRulesEmitter } from "../../../../order-time-limitation/domain/ports/catalog-rules.emitter.js";
import { B2bCatalogReemission } from "../catalog-reemission.service.js";

/**
 * Réémettre (C3, 2a6) : une transaction par fiche, les familles d'abord, et
 * une fiche en échec n'arrête pas les autres.
 */

class Switches extends AppConfig {
  constructor(private readonly open: boolean) {
    super();
  }
  override catalogFactsEnabled(): boolean {
    return this.open;
  }
  override publicationEnabled(): boolean {
    return true;
  }
}

/** Chaque `run` est une transaction : le test compte ce qui s'émet DANS chacune. */
class CountingUnitOfWork extends UnitOfWork {
  readonly transactions: string[][] = [];
  current: string[] | null = null;

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.current = [];
    try {
      return await work();
    } finally {
      this.transactions.push(this.current);
      this.current = null;
    }
  }
}

class TracingEmitter extends CatalogEmitter {
  constructor(
    private readonly uow: CountingUnitOfWork,
    private readonly failing: ReadonlySet<string> = new Set(),
  ) {
    super();
  }
  emitProducts(ids: readonly string[]): Promise<void> {
    if (ids.some((id) => this.failing.has(id))) {
      return Promise.reject(new RangeError("verrou refusé"));
    }
    this.uow.current?.push(...ids.map((id) => `product:${id}`));
    return Promise.resolve();
  }
  emitCategories(ids: readonly string[]): Promise<void> {
    this.uow.current?.push(...ids.map((id) => `category:${id}`));
    return Promise.resolve();
  }
}

class TracingRules extends CatalogRulesEmitter {
  constructor(private readonly uow: CountingUnitOfWork) {
    super();
  }
  emitRules(): Promise<void> {
    this.uow.current?.push("rules");
    return Promise.resolve();
  }
}

class TableFacts extends CatalogFactsReader {
  constructor(
    private readonly productIds: readonly string[],
    private readonly familyIds: readonly string[],
  ) {
    super();
  }
  products(): Promise<ProductRecord[]> {
    return Promise.resolve([tarte()]);
  }
  families(): Promise<CatalogFamilyRecord[]> {
    return Promise.resolve([]);
  }
  productIdsOfFamilies(familyIds: readonly string[]): Promise<string[]> {
    return Promise.resolve(familyIds.includes("cat_1") ? ["p_1", "p_2"] : []);
  }
  allProductIds(): Promise<string[]> {
    return Promise.resolve([...this.productIds]);
  }
  allFamilyIds(): Promise<string[]> {
    return Promise.resolve([...this.familyIds]);
  }
}

function setup(open: boolean, failing: readonly string[] = []) {
  const uow = new CountingUnitOfWork();
  const reemission = new B2bCatalogReemission(
    new Switches(open),
    new TableFacts(["p_1", "p_2", "p_3"], ["cat_1", "cat_2"]),
    new TracingEmitter(uow, new Set(failing)),
    uow,
    new TracingRules(uow),
  );
  return { uow, reemission };
}

describe("B2bCatalogReemission", () => {
  it("ne fait rien, pas même lire la liste, quand les faits sont fermés", async () => {
    const { uow, reemission } = setup(false);

    await reemission.productsOfCategories(["cat_1"]);
    const report = await reemission.everything();

    expect(uow.transactions).toEqual([]);
    expect(report).toEqual({ categories: 0, products: 0, failedProducts: [] });
  });

  it("réémet les fiches d'une famille, une transaction chacune", async () => {
    const { uow, reemission } = setup(true);

    await reemission.productsOfCategories(["cat_1"]);

    expect(uow.transactions).toEqual([["product:p_1"], ["product:p_2"]]);
  });

  it("émet tout : les familles d'abord, puis chaque fiche, puis les règles", async () => {
    const { uow, reemission } = setup(true);

    const report = await reemission.everything();

    expect(uow.transactions).toEqual([
      ["category:cat_1"],
      ["category:cat_2"],
      ["product:p_1"],
      ["product:p_2"],
      ["product:p_3"],
      // Lot 2b : les règles EN DERNIER, dans leur propre transaction — la
      // plateforme les descend sur des articles qui portent leur déclinaison.
      ["rules"],
    ]);
    expect(report).toEqual({ categories: 2, products: 3, failedProducts: [] });
  });

  /** Le geste qui a demandé la réémission est déjà validé : lever le ferait rejouer. */
  it("nomme la fiche en échec et continue avec les suivantes", async () => {
    const { uow, reemission } = setup(true, ["p_2"]);

    const report = await reemission.everything();

    expect(report.failedProducts).toEqual(["p_2"]);
    expect(uow.transactions).toContainEqual(["product:p_3"]);
  });
});
