import type { ProductionDay, ProductionDaySnapshot } from "../../../day/index.js";
import { ProductionDayNotClosedError } from "../../../day/index.js";
import { productionCountPdfKey } from "../../../shared/print/index.js";
import type { PaperSlot } from "../../../shared/print/index.js";
import { dayDossierPdfKey } from "../../domain/services/day-dossier-pdf.js";

/** Le cliché d'une journée arrêtée, `closedAt` garanti. */
export type ClosedSnapshot = ProductionDaySnapshot & { readonly closedAt: Date };

/** Le cliché d'une journée arrêtée. @throws {ProductionDayNotClosedError} */
export function closedSnapshotOf(day: ProductionDay): ClosedSnapshot {
  const snapshot = day.toSnapshot();
  const closedAt = snapshot.closedAt;
  if (closedAt === null) {
    throw new ProductionDayNotClosedError(snapshot.serviceDay);
  }
  return { ...snapshot, closedAt };
}

/**
 * La place du compte à produire d'une journée, par version du plan comme le
 * dossier.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 */
export function productionCountSlotOf(day: ProductionDay): PaperSlot {
  const { serviceDay, closedAt, retaken } = closedSnapshotOf(day);
  return {
    key: productionCountPdfKey(serviceDay, closedAt, retaken?.at ?? null, day.planVersion),
    fileName: `compte-a-produire-${serviceDay}.pdf`,
  };
}

/**
 * La place du dossier du jour : **par version du plan**, le numéro lu sur la
 * journée chargée (`dayDossierPdfKey`) — un retirage, une révision ou un
 * nouvel arrêt après réouverture fabrique son dossier sans écraser celui qui
 * était parti avant. Une journée sans numéro garde la place par tirage.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 */
export function dayDossierSlotOf(day: ProductionDay): PaperSlot {
  const snapshot = closedSnapshotOf(day);
  return {
    key: dayDossierPdfKey(
      snapshot.serviceDay,
      snapshot.closedAt,
      snapshot.retaken?.at ?? null,
      day.planVersion,
    ),
    fileName: `dossier-du-jour-${snapshot.serviceDay}.pdf`,
  };
}
