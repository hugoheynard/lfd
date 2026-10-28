import {
  type SellableArticle,
  SellableArticlesReader,
} from "../../channels/commerce/sellable-articles.reader.js";
import { BatchShortcut, type BatchShortcutState } from "../../domain/entities/batch-shortcut.js";
import { ProductBatchShortcuts } from "../../domain/entities/product-batch-shortcuts.js";
import {
  BatchShortcutReader,
  type StoredBatchShortcut,
} from "../../domain/ports/batch-shortcut.reader.js";
import { BatchShortcutRepository } from "../../domain/ports/batch-shortcut.repository.js";

/** Les raccourcis en mémoire : une ligne par raccourci, retirés compris. */
export class InMemoryBatchShortcuts extends BatchShortcutRepository {
  readonly rows = new Map<string, BatchShortcutState>();
  saves = 0;

  /** Pose des lignes comme si elles avaient été écrites avant. */
  seed(...states: readonly BatchShortcutState[]): this {
    for (const state of states) {
      this.rows.set(state.id, state);
    }
    return this;
  }

  loadForSku(sku: string): Promise<ProductBatchShortcuts> {
    const live = [...this.rows.values()].filter((row) => row.sku === sku && row.removedAt === null);
    return Promise.resolve(
      ProductBatchShortcuts.restore(
        sku,
        live.map((state) => BatchShortcut.restore(state)),
      ),
    );
  }

  async loadHolding(shortcutId: string): Promise<ProductBatchShortcuts | null> {
    const row = this.rows.get(shortcutId);
    return row === undefined || row.removedAt !== null ? null : this.loadForSku(row.sku);
  }

  save(product: ProductBatchShortcuts): Promise<void> {
    this.saves += 1;
    for (const shortcut of product.changed) {
      this.rows.set(shortcut.id, shortcut.snapshot());
    }
    return Promise.resolve();
  }

  /** Le port de lecture, sur la même mémoire. */
  reader(): BatchShortcutReader {
    const rows = (): readonly BatchShortcutState[] => [...this.rows.values()];
    return new (class extends BatchShortcutReader {
      live(): Promise<readonly StoredBatchShortcut[]> {
        return Promise.resolve(
          rows()
            .filter((row) => row.removedAt === null)
            .sort((a, b) => a.sku.localeCompare(b.sku) || a.position - b.position)
            .map(({ id, sku, label, pieces, position }) => ({ id, sku, label, pieces, position })),
        );
      }
    })();
  }
}

/** Le catalogue doublé : des articles posés par le test. */
export class FixedSellableArticles extends SellableArticlesReader {
  constructor(private readonly articles: readonly SellableArticle[]) {
    super();
  }

  sellableArticles(): Promise<readonly SellableArticle[]> {
    return Promise.resolve(this.articles);
  }
}

/** Une ligne de raccourci vivante, posée par « staff-1 ». Sa date n'est comparée à aucune horloge. */
export function shortcutRow(overrides: Partial<BatchShortcutState> = {}): BatchShortcutState {
  const posedAt = new Date(Date.UTC(2000, 0, 1));
  return {
    id: "bs-1",
    sku: "VIE-001",
    label: "1 plaque",
    pieces: 24,
    position: 0,
    createdBy: { staffUserId: "staff-1", name: "Marie Dupont" },
    createdAt: posedAt,
    updatedAt: posedAt,
    removedAt: null,
    ...overrides,
  };
}
