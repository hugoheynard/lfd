import {
  QualityOrderDepartedError,
  QualityOrderHandedOverError,
} from "../errors/quality-record-errors.js";
import type { ScopedQualityTarget } from "./quality-check-scope.js";

/**
 * Où est passée une commande qui n'est plus au fournil : partie en livraison,
 * ou déjà retirée. Absente : toujours là.
 */
export type OrderOutOfHand = "departed" | "handed_over";

/**
 * **On ne juge que ce qu'on a sous les yeux**
 * (`documentation/livraisons/plan-a-la-porte.md`, § 10 ter, BQ — LB-Q1,
 * tranché par Hugo le 2026-10-01) : un verdict sur une commande partie ou
 * déjà retirée est refusé.
 *
 * Seule la cible **commande** est visée. Un verdict de **ligne** juge un lot
 * du fournil, qui est encore là ; s'il bloque, les commandes déjà parties qui
 * portent ce SKU sont retenues sans effet — la règle du retrait dit d'abord
 * « déjà retirée » (`plan-controle-qualite.md`, D6).
 *
 * @throws {QualityOrderDepartedError} @throws {QualityOrderHandedOverError}
 */
export function refuseOrderOutOfHand(
  scoped: ScopedQualityTarget,
  outOfHand: OrderOutOfHand | undefined,
): void {
  if (scoped.target.kind !== "order") {
    return;
  }
  if (outOfHand === "handed_over") {
    throw new QualityOrderHandedOverError(scoped.label);
  }
  if (outOfHand === "departed") {
    throw new QualityOrderDepartedError(scoped.label);
  }
}
