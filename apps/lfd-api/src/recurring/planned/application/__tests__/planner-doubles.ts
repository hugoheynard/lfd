import type { PlannedColumnView, WishlistItemView } from "@lfd/contracts";

import {
  PlannedBasketCheck,
  type PlannedBasketCheckRequest,
  type PlannedLineCheck,
} from "../../../channels/commerce/planned-basket-check.js";
import { PlannedColumn } from "../../domain/entities/planned-column.js";
import {
  PlannedColumnVersionConflictError,
  PlannedWindowTakenError,
} from "../../domain/errors/planned-column-errors.js";
import {
  PlannedColumnRepository,
  type PlannedColumnSlot,
} from "../../domain/ports/planned-column.repository.js";
import {
  PlannedColumnsReader,
  type PlannedColumnsWindow,
} from "../../domain/ports/planned-columns.reader.js";
import { WishlistReader } from "../../domain/ports/wishlist.reader.js";
import { WishlistWriter } from "../../domain/ports/wishlist.writer.js";

/** Les colonnes en mémoire, avec le mur, la version et l'unicité du créneau de l'adaptateur. */
export class InMemoryPlannedColumns extends PlannedColumnRepository {
  readonly rows = new Map<string, PlannedColumn>();
  readonly versions = new Map<string, number>();
  saves = 0;

  load(companyId: string, columnId: string): Promise<PlannedColumn | null> {
    const day = this.rows.get(columnId);
    return Promise.resolve(day?.snapshot().companyId === companyId ? day : null);
  }

  loadSlot(slot: PlannedColumnSlot): Promise<PlannedColumn | null> {
    return Promise.resolve(this.live().find((day) => sameSlot(day, slot)) ?? null);
  }

  save(day: PlannedColumn, _at: Date): Promise<number> {
    const stored = this.versions.get(day.id) ?? 0;
    if (stored !== day.version) {
      return Promise.reject(new PlannedColumnVersionConflictError(day.serviceDay.value));
    }
    if (
      !day.isWithdrawn &&
      this.live().some((other) => other.id !== day.id && sameSlot(other, slotOf(day)))
    ) {
      return Promise.reject(new PlannedWindowTakenError(day.serviceDay.value));
    }
    this.saves += 1;
    // Une copie à la version écrite : comme une relecture en base au geste suivant.
    this.rows.set(day.id, PlannedColumn.reconstitute({ ...day.snapshot(), version: stored + 1 }));
    this.versions.set(day.id, stored + 1);
    return Promise.resolve(stored + 1);
  }

  private live(): PlannedColumn[] {
    return [...this.rows.values()].filter((day) => !day.isWithdrawn);
  }
}

function slotOf(day: PlannedColumn): PlannedColumnSlot {
  const { companyId, serviceDay, routing } = day.snapshot();
  return {
    companyId,
    serviceDay,
    windowStart: routing.window.start,
    windowEnd: routing.window.end,
  };
}

function sameSlot(day: PlannedColumn, slot: PlannedColumnSlot): boolean {
  const mine = slotOf(day);
  return (
    mine.companyId === slot.companyId &&
    mine.serviceDay.equals(slot.serviceDay) &&
    mine.windowStart === slot.windowStart &&
    mine.windowEnd === slot.windowEnd
  );
}

/** Une vue de colonne et la société qui la possède. */
export type OwnedColumn = PlannedColumnView & { readonly companyId: string };

/** Des vues de colonnes posées à la main ; la fenêtre et le mur filtrent. */
export class FixedPlannedColumnsReader extends PlannedColumnsReader {
  readonly asked: PlannedColumnsWindow[] = [];

  constructor(private readonly columns: readonly OwnedColumn[]) {
    super();
  }

  window(window: PlannedColumnsWindow): Promise<readonly PlannedColumnView[]> {
    this.asked.push(window);
    return Promise.resolve(
      this.columns.filter(
        (column) =>
          column.companyId === window.companyId &&
          column.day >= window.from.value &&
          column.day <= window.to.value,
      ),
    );
  }
}

interface WishlistRow {
  readonly userId: string;
  readonly companyId: string;
  readonly sku: string;
  readonly at: Date;
}

/** La liste d'envies en mémoire, idempotente comme l'adaptateur. */
export class InMemoryWishlist implements WishlistReader, WishlistWriter {
  readonly rows: WishlistRow[] = [];

  itemsOf(userId: string, companyId: string): Promise<readonly WishlistItemView[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.userId === userId && row.companyId === companyId)
        .map((row) => ({ sku: row.sku, addedAt: row.at.toISOString() })),
    );
  }

  add(userId: string, companyId: string, sku: string, at: Date): Promise<void> {
    if (this.indexOf(userId, companyId, sku) < 0) {
      this.rows.push({ userId, companyId, sku, at });
    }
    return Promise.resolve();
  }

  remove(userId: string, companyId: string, sku: string): Promise<void> {
    const index = this.indexOf(userId, companyId, sku);
    if (index >= 0) {
      this.rows.splice(index, 1);
    }
    return Promise.resolve();
  }

  private indexOf(userId: string, companyId: string, sku: string): number {
    return this.rows.findIndex(
      (row) => row.userId === userId && row.companyId === companyId && row.sku === sku,
    );
  }
}

/** Rend « rien ne bloque » pour chaque article, et garde les questions. */
export class RecordingBasketCheck extends PlannedBasketCheck {
  readonly asked: PlannedBasketCheckRequest[] = [];

  check(request: PlannedBasketCheckRequest): Promise<readonly PlannedLineCheck[]> {
    this.asked.push(request);
    return Promise.resolve(
      request.items.map((item) => ({
        ...item,
        closesAt: null,
        blocking: null,
        quantityIndependent: true,
      })),
    );
  }
}
