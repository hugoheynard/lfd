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
 * La place du compte à produire d'une journée.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 */
export function productionCountSlotOf(day: ProductionDay): PaperSlot {
  const { serviceDay } = closedSnapshotOf(day);
  return {
    key: productionCountPdfKey(serviceDay),
    fileName: `compte-a-produire-${serviceDay}.pdf`,
  };
}

/**
 * La place du dossier du jour : **par tirage arrêté**. La clé porte l'instant
 * du dernier retirage (`dayDossierPdfKey`), si bien qu'un retirage fabrique un
 * dossier complété sans écraser celui qui était parti avant.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 */
export function dayDossierSlotOf(day: ProductionDay): PaperSlot {
  const snapshot = closedSnapshotOf(day);
  return {
    key: dayDossierPdfKey(snapshot.serviceDay, snapshot.retaken?.at ?? null),
    fileName: `dossier-du-jour-${snapshot.serviceDay}.pdf`,
  };
}
