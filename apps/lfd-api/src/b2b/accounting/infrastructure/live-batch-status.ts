import { DEAD_BATCH_STATUSES } from "../domain/entities/collection-batch-status.js";

/**
 * « Lot vivant » en filtre Prisma — la traduction de `isDeadBatchStatus`,
 * pour chaque lecteur qui écrivait `status: { not: "cancelled" }` (plan
 * `plan-lot-rejete-par-la-banque.md`, § 0.2). Un lot rejeté par la banque
 * n'est pas plus vivant qu'un lot annulé.
 */
export const LIVE_BATCH_STATUS = { notIn: [...DEAD_BATCH_STATUSES] };
