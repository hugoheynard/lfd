import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import { PIM_EVENTS } from "../../../../journal/pim-journal.js";
import {
  ArchivedProductReadinessError,
  ProductNotDeclaredReadyError,
  ProductNotFoundError,
} from "../../domain/errors/product-errors.js";
import type { ProductSnapshot } from "../../domain/entities/product.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import {
  WithdrawProductReadinessCommand,
  WithdrawProductReadinessHandler,
} from "../withdraw-product-readiness.js";
import { FakeProducts, FakeReadiness, NOW, PRODUCT_ID, snapshot } from "./readiness-doubles.js";

/**
 * **Retirer la signature** (décision de Hugo, 2026-10-26) — l'inverse de la
 * déclaration : même trace au journal, mêmes refus de principe.
 */
function build(status: ProductSnapshot["status"] = "draft", signed = true) {
  const readiness = new FakeReadiness();
  if (signed) {
    readiness.declared = { readyAt: NOW, readyBy: "staff_hugo" };
  }
  const journal = new RecordingJournal();
  const emitter = new RecordingCatalogEmitter();
  const handler = new WithdrawProductReadinessHandler(
    new FakeProducts(snapshot(status)),
    readiness,
    journal,
    new DirectUnitOfWork(),
    emitter,
  );
  return { handler, readiness, journal, emitter };
}

describe("WithdrawProductReadiness", () => {
  it("retire la signature, la trace, et réémet la fiche", async () => {
    const { handler, readiness, journal, emitter } = build();

    await handler.execute(new WithdrawProductReadinessCommand(PRODUCT_ID));

    expect(readiness.declared).toBeNull();
    expect(journal.entries.map((entry) => entry.type)).toEqual([PIM_EVENTS.productReadyWithdrawn]);
    expect(emitter.products).toEqual([[PRODUCT_ID]]);
  });

  it("refuse une fiche qui n'est pas signée, sans rien tracer", async () => {
    const { handler, journal } = build("draft", false);

    await expect(
      handler.execute(new WithdrawProductReadinessCommand(PRODUCT_ID)),
    ).rejects.toBeInstanceOf(ProductNotDeclaredReadyError);
    expect(journal.entries).toEqual([]);
  });

  it("refuse une fiche archivée, et garde sa signature", async () => {
    const { handler, readiness } = build("archived");

    await expect(
      handler.execute(new WithdrawProductReadinessCommand(PRODUCT_ID)),
    ).rejects.toBeInstanceOf(ArchivedProductReadinessError);
    expect(readiness.declared).not.toBeNull();
  });

  it("refuse un produit inconnu", async () => {
    const handler = new WithdrawProductReadinessHandler(
      new FakeProducts(null),
      new FakeReadiness(),
      new RecordingJournal(),
      new DirectUnitOfWork(),
      new RecordingCatalogEmitter(),
    );

    await expect(
      handler.execute(new WithdrawProductReadinessCommand(PRODUCT_ID)),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
