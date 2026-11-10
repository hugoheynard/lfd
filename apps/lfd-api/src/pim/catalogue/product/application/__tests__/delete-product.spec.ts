import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../journal/__tests__/recording-journal.js";
import type { PimJournalEntry } from "../../../../journal/pim-journal.js";
import type { Product } from "../../domain/entities/product.js";
import {
  NotArchivedProductNotDeletableError,
  ProductNotFoundError,
} from "../../domain/errors/product-errors.js";
import { RecordingCatalogEmitter } from "../../../shared/domain/ports/__tests__/catalog-emitter-doubles.js";
import { DeleteProductCommand, DeleteProductHandler } from "../delete-product.js";
import { requireProduct } from "../product-support.js";
import { OneProduct, PRODUCT_ID, tarte } from "./audience-doubles.js";

/**
 * **Supprimer une fiche archivée** (`documentation/pim/plan-effacer-une-fiche-archivee.md`,
 * v4, points 3 et 7) : l'agrégat refuse, le handler orchestre — journal,
 * écriture, émission, dans cet ordre et dans la même unité de travail.
 */

/** Le fil des trois appels, partagé par les doubles qui y écrivent. */
type Step = "journal" | "save" | "emit";

class SequencedJournal extends RecordingJournal {
  constructor(private readonly steps: Step[]) {
    super();
  }
  override record(entry: PimJournalEntry): Promise<void> {
    this.steps.push("journal");
    return super.record(entry);
  }
}

class SequencedProducts extends OneProduct {
  constructor(
    private readonly steps: Step[],
    ...args: ConstructorParameters<typeof OneProduct>
  ) {
    super(...args);
  }
  override save(product: Product): Promise<void> {
    this.steps.push("save");
    return super.save(product);
  }
}

class SequencedEmitter extends RecordingCatalogEmitter {
  constructor(private readonly steps: Step[]) {
    super();
  }
  override emitProducts(productIds: readonly string[]): Promise<void> {
    this.steps.push("emit");
    return super.emitProducts(productIds);
  }
}

function harness(status: "draft" | "published" | "archived" | null) {
  const steps: Step[] = [];
  const products = new SequencedProducts(steps, status === null ? null : tarte({ status }));
  const journal = new SequencedJournal(steps);
  const emitter = new SequencedEmitter(steps);
  const handler = new DeleteProductHandler(products, journal, new DirectUnitOfWork(), emitter);
  return { steps, products, journal, emitter, handler };
}

describe("DeleteProductHandler", () => {
  it("journalise, écrit, puis émet — et la fiche est `deleted`, pas effacée", async () => {
    const { steps, products, journal, emitter, handler } = harness("archived");

    await handler.execute(new DeleteProductCommand(PRODUCT_ID));

    expect(steps).toEqual(["journal", "save", "emit"]);
    expect(products.stored?.status).toBe("deleted");
    expect(emitter.products).toEqual([[PRODUCT_ID]]);
    expect(journal.entries).toEqual([
      expect.objectContaining({
        type: "product.deleted",
        subjectType: "product",
        subjectId: PRODUCT_ID,
        payload: {
          subjectLabel: "Tarte au citron",
          sku: "PAT-7",
          name: { fr: "Tarte au citron" },
        },
      }),
    ]);
  });

  it.each(["draft", "published"] as const)(
    "refuse une fiche « %s » sans rien journaliser, écrire ni émettre",
    async (status) => {
      const { steps, products, handler } = harness(status);

      await expect(handler.execute(new DeleteProductCommand(PRODUCT_ID))).rejects.toThrow(
        NotArchivedProductNotDeletableError,
      );

      expect(steps).toEqual([]);
      expect(products.stored?.status).toBe(status);
    },
  );

  it("refuse une fiche inconnue (404)", async () => {
    const { steps, handler } = harness(null);

    await expect(handler.execute(new DeleteProductCommand(PRODUCT_ID))).rejects.toThrow(
      ProductNotFoundError,
    );
    expect(steps).toEqual([]);
  });

  it("refuse une seconde suppression comme une fiche inconnue : une supprimée est absente (404)", async () => {
    const { steps, handler } = harness("archived");
    await handler.execute(new DeleteProductCommand(PRODUCT_ID));

    await expect(handler.execute(new DeleteProductCommand(PRODUCT_ID))).rejects.toThrow(
      ProductNotFoundError,
    );
    expect(steps).toEqual(["journal", "save", "emit"]);
  });

  /**
   * Régression : une supprimée restait éditable par une requête forgée —
   * renommer, tarifer, déclarer prête passaient, seuls les gestes de statut
   * la refusaient (relu au rendu du lot API, 2026-11-10). La porte de
   * chargement commune la refuse désormais pour toutes les commandes.
   */
  it("refuse de charger une supprimée pour n'importe quel geste (404)", async () => {
    const products = new OneProduct(tarte({ status: "deleted" }));

    await expect(requireProduct(products, PRODUCT_ID)).rejects.toThrow(ProductNotFoundError);
  });
});
