import { localToInstant } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import {
  PlannedBasketCheck,
  type PlannedBasketCheckItem,
  type PlannedLineCheck,
} from "../../../channels/commerce/planned-basket-check.js";
import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import type { PlannedColumn } from "../../domain/entities/planned-column.js";
import { conversionInstant } from "../../domain/services/conversion-instant.js";

/** L'heure du gel quand aucune ligne n'a de fermeture à venir : la veille, 23 h 45 (Q9). */
const FALLBACK_TIME = "23:45";

/**
 * **Quand ces colonnes se commandent-elles ?** — l'instant de conversion de
 * chaque colonne (plan du planificateur, § 4), demandé au commerce en UNE
 * question par acheteur d'une société : les heures de fermeture de leurs
 * lignes, que `PlannedBasketCheck` rend avec les juges mêmes de la
 * passation, sans dérogation.
 *
 * Une colonne sans ligne n'a pas d'instant (`null`) : vide, elle ne se
 * commande pas, et rien ne la gèle.
 */
@Injectable()
export class ConversionSchedule {
  constructor(private readonly check: PlannedBasketCheck) {}

  /** Par id de colonne, son instant de conversion ; `null` pour une colonne vide. */
  async instantsOf(
    columns: readonly PlannedColumn[],
    now: Date,
  ): Promise<ReadonlyMap<string, Date | null>> {
    const instants = new Map<string, Date | null>();
    for (const group of byBuyer(columns)) {
      const answers = await this.closuresOf(group);
      for (const column of group) {
        instants.set(
          column.id,
          column.hasLines
            ? conversionInstant({
                closures: answers
                  .filter((answer) => answer.columnId === column.id)
                  .map((answer) => answer.closesAt),
                fallback: eveOf(column.serviceDay),
                now,
              })
            : null,
        );
      }
    }
    return instants;
  }

  private closuresOf(group: readonly PlannedColumn[]): Promise<readonly PlannedLineCheck[]> {
    const first = group[0];
    const items: PlannedBasketCheckItem[] = group.flatMap((column) =>
      column.snapshot().lines.map((line) => ({
        sku: line.sku,
        day: column.serviceDay.value,
        columnId: column.id,
        quantity: line.quantity,
      })),
    );
    if (first === undefined || items.length === 0) {
      return Promise.resolve([]);
    }
    const { companyId, buyerUserId } = first.snapshot();
    return this.check.check({ companyId, buyerUserId, items });
  }
}

/** Les colonnes groupées par (société, acheteur) : une question au commerce par groupe. */
function byBuyer(columns: readonly PlannedColumn[]): PlannedColumn[][] {
  const groups = new Map<string, PlannedColumn[]>();
  for (const column of columns) {
    const { companyId, buyerUserId } = column.snapshot();
    const key = `${companyId}/${buyerUserId}`;
    groups.set(key, [...(groups.get(key) ?? []), column]);
  }
  return [...groups.values()];
}

/** La veille du jour servi à 23 h 45, à Paris. */
function eveOf(serviceDay: IsoDate): Date {
  const eve = serviceDay.plusDays(-1).value;
  const instant = localToInstant(eve, FALLBACK_TIME);
  if (instant === null) {
    throw new PlannerEveUnreadableError(eve);
  }
  return instant;
}

/** 23 h 45 n'existe pas ce jour-là à Paris : impossible hors d'un fuseau corrompu. */
export class PlannerEveUnreadableError extends TechnicalError {
  constructor(day: string) {
    super(
      "planner.eve_unreadable",
      `L'heure ${FALLBACK_TIME} du ${day} ne se lit pas à Paris : l'instant de conversion d'une ` +
        "colonne planifiée n'a pas pu être posé. La colonne reste en brouillon ; vérifier la " +
        "base de fuseaux du serveur, puis réécrire la colonne.",
    );
  }
}
