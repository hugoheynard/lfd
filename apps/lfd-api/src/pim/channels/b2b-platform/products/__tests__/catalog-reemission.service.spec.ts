import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { tarte } from "../../../../catalogue/product/application/__tests__/audience-doubles.js";
import { CatalogEmitter } from "../../../../catalogue/shared/domain/ports/catalog-emitter.js";
import {
  CatalogFactsReader,
  type CatalogFamilyRecord,
} from "../../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import { CatalogRulesEmitter } from "../../../../order-time-limitation/domain/ports/catalog-rules.emitter.js";
import { ReemissionProgress } from "../../../../catalogue/shared/domain/ports/catalog-reemission.js";
import {
  FamilyReemissionFailedError,
  RulesReemissionFailedError,
} from "../../domain/errors/reemission-errors.js";
import { B2bCatalogReemission } from "../catalog-reemission.service.js";

/**
 * Réémettre (C3, 2a6) : une transaction par fiche, les familles d'abord, et
 * une fiche en échec n'arrête pas les autres.
 */

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
    if (ids.some((id) => this.failing.has(id))) {
      return Promise.reject(new RangeError("famille refusée"));
    }
    this.uow.current?.push(...ids.map((id) => `category:${id}`));
    return Promise.resolve();
  }
}

class TracingRules extends CatalogRulesEmitter {
  constructor(
    private readonly uow: CountingUnitOfWork,
    private readonly failing = false,
  ) {
    super();
  }
  emitRules(): Promise<void> {
    if (this.failing) {
      return Promise.reject(new RangeError("règles refusées"));
    }
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

/** Note ce que la réémission dit en avançant, dans l'ordre. */
class NotedProgress extends ReemissionProgress {
  readonly notes: string[] = [];
  productEmitted(productId: string): Promise<void> {
    this.notes.push(`ok:${productId}`);
    return Promise.resolve();
  }
  productFailed(productId: string, cause: unknown): Promise<void> {
    this.notes.push(`ko:${productId}:${cause instanceof Error ? cause.message : ""}`);
    return Promise.resolve();
  }
}

function setup(failing: readonly string[] = [], rulesFail = false) {
  const uow = new CountingUnitOfWork();
  const reemission = new B2bCatalogReemission(
    new TableFacts(["p_1", "p_2", "p_3"], ["cat_1", "cat_2"]),
    new TracingEmitter(uow, new Set(failing)),
    uow,
    new TracingRules(uow, rulesFail),
  );
  return { uow, reemission };
}

describe("B2bCatalogReemission", () => {
  it("réémet les fiches d'une famille, une transaction chacune", async () => {
    const { uow, reemission } = setup();

    await reemission.productsOfCategories(["cat_1"]);

    expect(uow.transactions).toEqual([["product:p_1"], ["product:p_2"]]);
  });

  it("émet tout : les familles d'abord, puis chaque fiche, puis les règles", async () => {
    const { uow, reemission } = setup();

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
    const { uow, reemission } = setup(["p_2"]);

    const report = await reemission.everything();

    expect(report.failedProducts).toEqual(["p_2"]);
    expect(uow.transactions).toContainEqual(["product:p_3"]);
  });

  it("dit chaque fiche à l'observateur, partie ou en échec, dans l'ordre", async () => {
    const { reemission } = setup(["p_2"]);
    const progress = new NotedProgress();

    await reemission.everything(progress);

    expect(progress.notes).toEqual(["ok:p_1", "ko:p_2:verrou refusé", "ok:p_3"]);
  });

  /** Une famille en échec arrête tout AVANT la première fiche : rien n'est parti. */
  it("s'arrête sur une famille en échec, en la nommant, sans émettre de fiche", async () => {
    const { uow, reemission } = setup(["cat_2"]);

    await expect(reemission.everything()).rejects.toBeInstanceOf(FamilyReemissionFailedError);
    await expect(setup(["cat_2"]).reemission.everything()).rejects.toThrow(/cat_2/u);
    expect(uow.transactions.flat().some((entry) => entry.startsWith("product:"))).toBe(false);
  });

  /** Les règles partent en dernier : leur échec arrive après toutes les fiches. */
  it("lève une erreur nommée quand les règles échouent, après les fiches", async () => {
    const { uow, reemission } = setup([], true);

    await expect(reemission.everything()).rejects.toBeInstanceOf(RulesReemissionFailedError);
    expect(uow.transactions).toContainEqual(["product:p_3"]);
  });
});
