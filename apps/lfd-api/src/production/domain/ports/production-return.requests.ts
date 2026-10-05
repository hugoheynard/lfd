import type { PackedMark } from "../entities/production-day.snapshot.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/** Une demande de retour au colisage, telle que le fournil la pose. */
export interface ReturnRequest {
  readonly requestId: string;
  readonly batchId: string;
  readonly sku: string;
  /** Ce que la fournée compte encore — des pièces, > 0. */
  readonly quantity: number;
  readonly requested: PackedMark;
}

/** Une demande qui vient de recevoir sa réponse. */
export interface AnsweredReturn {
  readonly serviceDay: string;
  readonly batchId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly returned: number;
  readonly requested: PackedMark;
}

/**
 * **Les demandes de retour du fournil au colisage** — journée `packing`
 * (plan `colisage/colisage.md`, K2, §13 B2).
 *
 * ⚠️ Des écritures ciblées, et c'est le cas que le §3.1 autorise : la demande
 * suit une annulation que la journée vient de laisser passer
 * (`batchToCancel`, sous son verrou), et la réponse est la projection d'un
 * fait du colisage, idempotente et conditionnée en base. La règle qui peut
 * refuser — « au bac ≤ reçu − rendu » — est chez le colisage, qui a décidé.
 */
export abstract class ProductionReturnRequests {
  abstract request(day: ServiceDay, request: ReturnRequest): Promise<void>;

  /**
   * Pose la réponse si la demande n'en a pas (`answered_at IS NULL`).
   *
   * @returns la demande répondue, ou `null` — inconnue ou déjà répondue (rejeu).
   */
  abstract answer(
    requestId: string,
    returned: number,
    answeredAt: Date,
  ): Promise<AnsweredReturn | null>;
}
