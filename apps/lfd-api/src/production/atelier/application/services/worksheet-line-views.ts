import type {
  ProductionTrackingLevel,
  ProductionWorksheetView,
  QualityLineStatus,
  WorkshopLine,
  WorkshopLineProblem,
  WorkshopWaitingOrders,
} from "@lfd/contracts";

import type { OvenWaitingOrders } from "../../../channels/packing/oven-waiting-orders.reader.js";
import { deadlinesOf } from "../../../day/index.js";
import type { TrancheThreshold } from "../../../day/index.js";
import type { ProductionProblemState } from "../../domain/entities/production-problem.js";
import { remainderUnderCeiling } from "../../domain/services/line-remainder.js";
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
  /** Le niveau de suivi de la ligne (plan des niveaux de suivi, § 3.1), servi par SKU. */
  readonly trackingLevelOf: (sku: string) => ProductionTrackingLevel;
  /** Le problème de chaque SKU de la journée, traité ou non (§ 3.2) : le plafond survit au « traité ». */
  readonly problems: ReadonlyMap<string, ProductionProblemState>;
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
    trackingLevel: marks.trackingLevelOf(line.sku),
    ...ceilingOf(line, marks.problems.get(line.sku)),
  });
}

/**
 * Le plafond, le reste sous le plafond et le rouge ouvert d'une ligne — la
 * règle même de « Fait » (`remainderUnderCeiling`).
 */
function ceilingOf(
  line: WorksheetLine,
  problem: ProductionProblemState | undefined,
): Pick<WorkshopLine, "ceiling" | "remainingUnderCeiling" | "problem"> {
  const ceiling = problem?.produced ?? null;
  return {
    ceiling,
    remainingUnderCeiling: remainderUnderCeiling(line.quantity, ceiling, line.produced),
    problem: problem === undefined || problem.resolved !== null ? null : openProblemView(problem),
  };
}

function openProblemView(problem: ProductionProblemState): WorkshopLineProblem {
  return {
    id: problem.id,
    version: problem.version,
    expected: problem.expected,
    produced: problem.produced,
    reason: problem.reason,
    reportedAt: problem.reported.at.toISOString(),
  };
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
