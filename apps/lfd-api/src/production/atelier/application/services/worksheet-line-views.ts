import type {
  ProductionWorksheetView,
  QualityLineStatus,
  WorkshopLine,
  WorkshopWaitingOrders,
} from "@lfd/contracts";

import type { OvenWaitingOrders } from "../../../channels/packing/oven-waiting-orders.reader.js";
import { deadlinesOf } from "../../../day/index.js";
import type { TrancheThreshold } from "../../../day/index.js";
import type { WorksheetGroup } from "../../domain/services/production-worksheet-groups.js";
import type { WorksheetLine } from "../../domain/services/production-worksheet.js";

/**
 * **L'affichage d'une ligne de la fiche d'atelier** : la traduction du
 * domaine (en `Date`) vers le contrat (en ISO), et les marques que la ligne
 * lit hors de la journée — ses paliers, sa pastille qualité, ce qui attend le
 * four. Des fonctions pures : la lecture les reçoit déjà chargées.
 */

/** Ce que la ligne lit hors de la journée : ses tranches, son verdict. */
export interface LineMarks {
  /** `null` = tranches illisibles : la ligne part sans paliers. */
  readonly tranches: ReadonlyMap<string, readonly TrancheThreshold[]> | null;
  readonly quality: ReadonlyMap<string, QualityLineStatus>;
  /** `null` = le colisage n'a pas répondu : aucune ligne n'affirme rien. */
  readonly waiting: ReadonlyMap<string, OvenWaitingOrders> | null;
}

/** Le domaine parle en `Date`, le contrat en ISO. La traduction vit ici. */
export function lineViewOf(marks: LineMarks): (line: WorksheetLine) => WorkshopLine {
  return (line) => ({
    ...lineView(line),
    deadlines:
      marks.tranches === null
        ? []
        : deadlinesOf(line.quantity, marks.tranches.get(line.sku) ?? []).map((step) => ({
            ...step,
          })),
    quality: marks.quality.get(line.sku) ?? null,
    waitingOrders: waitingOf(marks.waiting, line.sku),
  });
}

/** Une copie au contrat ; `null` = aucune commande, ou colisage muet. */
function waitingOf(
  waiting: ReadonlyMap<string, OvenWaitingOrders> | null,
  sku: string,
): WorkshopWaitingOrders | null {
  const found = waiting?.get(sku);
  return found === undefined
    ? null
    : { count: found.count, earliestHandover: found.earliestHandover };
}

function lineView(line: WorksheetLine): WorkshopLine {
  return {
    sku: line.sku,
    productName: line.productName,
    quantity: line.quantity,
    saleUnit: line.saleUnit,
    containerLabel: line.containerLabel,
    done: line.done,
    initials: line.initials,
    doneAt: line.doneAt?.toISOString() ?? null,
    produced: line.produced,
    remaining: line.remaining,
    surplus: line.surplus,
    batches: line.batches.map((batch) => ({
      id: batch.id,
      quantity: batch.quantity,
      recordedAt: batch.recorded.at.toISOString(),
      initials: batch.recorded.initials === "" ? null : batch.recorded.initials,
      pendingReturn: batch.pendingReturn,
    })),
    pendingReturn: line.pendingReturn,
    container:
      line.container === null
        ? null
        : {
            unitsPerContainer: line.container.unitsPerContainer,
            singular: line.container.singular,
          },
  };
}

export function groupView(
  group: WorksheetGroup,
  viewOf: (line: WorksheetLine) => WorkshopLine,
): ProductionWorksheetView["groups"][number] {
  return {
    ...group,
    lines: group.lines.map(viewOf),
    pending: group.pending.map(viewOf),
    done: group.done.map(viewOf),
  };
}
