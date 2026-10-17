import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { tarte } from "../../../../catalogue/product/application/__tests__/audience-doubles.js";
import { ProductNotFoundError } from "../../../../catalogue/product/domain/errors/product-errors.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import {
  RecordingCatalogEmitter,
  RecordingCatalogReemission,
} from "../../../../catalogue/shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import {
  CatalogFactsReader,
  type CatalogFamilyRecord,
} from "../../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import { ReemitCatalogCommand, ReemitCatalogHandler } from "../reemit-catalog.js";

/** « Réémettre » (2a6) : une fiche, ou tout. */

class OneFiche extends CatalogFactsReader {
  products(ids: readonly string[]): Promise<ProductRecord[]> {
    return Promise.resolve(ids.includes("prd_tarte") ? [tarte()] : []);
  }
  families(): Promise<CatalogFamilyRecord[]> {
    return Promise.resolve([]);
  }
  productIdsOfFamilies(): Promise<string[]> {
    return Promise.resolve([]);
  }
  allProductIds(): Promise<string[]> {
    return Promise.resolve(["prd_tarte"]);
  }
  allFamilyIds(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

function setup() {
  const emitter = new RecordingCatalogEmitter();
  const reemission = new RecordingCatalogReemission();
  const handler = new ReemitCatalogHandler(
    new OneFiche(),
    emitter,
    reemission,
    new DirectUnitOfWork(),
  );
  return { emitter, reemission, handler };
}

describe("ReemitCatalogHandler", () => {
  it("réémet une fiche dans sa transaction", async () => {
    const { handler, emitter } = setup();

    const report = await handler.execute(new ReemitCatalogCommand("prd_tarte"));

    expect(emitter.products).toEqual([["prd_tarte"]]);
    expect(report).toEqual({ categories: 0, products: 1, failedProducts: [] });
  });

  it("refuse une fiche inconnue", async () => {
    const { handler } = setup();

    await expect(handler.execute(new ReemitCatalogCommand("prd_absent"))).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });

  it("délègue « tout » à la réémission", async () => {
    const { handler, reemission } = setup();

    await handler.execute(new ReemitCatalogCommand(null));

    expect(reemission.everythingCalls).toBe(1);
  });
});
