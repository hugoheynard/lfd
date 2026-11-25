import type { LineStepStatus } from "../entities/line-step.js";
import {
  FinishingWorkstationIsNotAStepError,
  WorkstationNotOnLineError,
} from "../errors/line-step-errors.js";

/**
 * **Les étapes d'une ligne** (
 * `documentation/fournil/plan-produit-sur-plusieurs-postes.md`, § 2.6) — des
 * fonctions pures. Les postes d'une ligne se lisent sur la carte courante :
 * ceux qui ne finissent pas le produit sont ses étapes.
 */

/** Un poste du produit d'une ligne, tel que la carte le tient. */
export interface LineStation {
  readonly workstationId: string;
  readonly finishes: boolean;
}

/**
 * Le poste est-il une étape de la ligne ? Le geste d'une étape le vérifie
 * avant d'écrire.
 *
 * @throws {FinishingWorkstationIsNotAStepError} le poste finit la ligne.
 * @throws {WorkstationNotOnLineError} le poste n'est pas un poste du produit.
 */
export function assertStepOf(
  stations: readonly LineStation[],
  workstationId: string,
  sku: string,
): void {
  const station = stations.find((candidate) => candidate.workstationId === workstationId);
  if (station === undefined) {
    throw new WorkstationNotOnLineError(sku);
  }
  if (station.finishes) {
    throw new FinishingWorkstationIsNotAStepError(sku);
  }
}

/**
 * Les postes d'étape qui n'ont pas coché, dans l'ordre reçu : une étape en
 * rouge, décochée ou jamais touchée attend ; une étape cochée d'un poste qui
 * a quitté le produit n'est plus attendue, elle n'est simplement pas lue.
 */
export function pendingStepsOf(
  stations: readonly LineStation[],
  statusOf: (workstationId: string) => LineStepStatus | undefined,
): readonly string[] {
  return stations
    .filter((station) => !station.finishes && statusOf(station.workstationId) !== "done")
    .map((station) => station.workstationId);
}
