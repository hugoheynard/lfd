import type { PlannedColumnView } from "@lfd/contracts";

import {
  PlannedBasketCheck,
  type PlannedBasketCheckRequest,
  type PlannedLineCheck,
} from "../../../channels/commerce/planned-basket-check.js";
import { PlannerFavoriteSkus } from "../../../channels/commerce/planner-favorite-skus.js";
import { PlannedColumn } from "../../domain/entities/planned-column.js";
import {
  PlannedColumnVersionConflictError,
  PlannedWindowTakenError,
} from "../../domain/errors/planned-column-errors.js";
import {
  PlannedColumnRepository,
  type PlannedColumnSlot,
  type PlannedColumnSweep,
} from "../../domain/ports/planned-column.repository.js";
import {
  PlannedColumnsReader,
  type PlannedColumnsWindow,
} from "../../domain/ports/planned-columns.reader.js";

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

  draftsToSweep(sweep: PlannedColumnSweep, limit: number): Promise<PlannedColumn[]> {
    const due = (day: PlannedColumn): boolean =>
      !day.serviceDay.isAfter(sweep.lastDay) ||
      (day.convertsAt !== null && day.convertsAt.getTime() <= sweep.now.getTime());
    return Promise.resolve(
      [...this.rows.values()]
        .filter((day) => day.isDraft && due(day))
        .sort((a, b) => a.serviceDay.value.localeCompare(b.serviceDay.value))
        .slice(0, limit),
    );
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

/** Les favoris de chaque société, posés à la main ; garde les sociétés demandées. */
export class FixedFavoriteSkus extends PlannerFavoriteSkus {
  readonly asked: string[] = [];

  constructor(private readonly byCompany: Readonly<Record<string, readonly string[]>> = {}) {
    super();
  }

  skusOf(companyId: string): Promise<readonly string[]> {
    this.asked.push(companyId);
    return Promise.resolve(this.byCompany[companyId] ?? []);
  }
}

/** Ce que la vérification répond pour un article, quel que soit le jour. */
export interface ScriptedLineAnswer {
  readonly closesAt?: Date | null;
  readonly blocking?: PlannedLineCheck["blocking"];
}

/**
 * Rend, pour chaque article, la réponse écrite pour son SKU (« rien ne
 * bloque, rien ne ferme » par défaut), et garde les questions.
 */
export class RecordingBasketCheck extends PlannedBasketCheck {
  readonly asked: PlannedBasketCheckRequest[] = [];

  constructor(private readonly answers: Readonly<Record<string, ScriptedLineAnswer>> = {}) {
    super();
  }

  check(request: PlannedBasketCheckRequest): Promise<readonly PlannedLineCheck[]> {
    this.asked.push(request);
    return Promise.resolve(
      request.items.map((item) => ({
        sku: item.sku,
        day: item.day,
        columnId: item.columnId,
        closesAt: this.answers[item.sku]?.closesAt ?? null,
        blocking: this.answers[item.sku]?.blocking ?? null,
        quantityIndependent: true,
      })),
    );
  }
}
