import type { CustomerAudience } from "@lfd/contracts";

import { OrderChangeReasonMissingError } from "../../domain/errors/order-change-errors.js";
import type { RequestReasonReader } from "../../domain/ports/request-reason.reader.js";
import type { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";
import type { RequestReason } from "../../domain/request-reason.js";
import { offeredReason } from "./offered-reason.js";

/**
 * Le motif d'une demande de modification : le PREMIER motif `order_change`
 * proposé à ce public, par rang. Le client ne choisit pas — il n'y a qu'une
 * chose à demander ; le motif dit à quelle adresse l'équipe la reçoit et avec
 * quelle priorité, comme pour toute demande.
 *
 * @throws {OrderChangeReasonMissingError} aucun n'est ouvert : l'équipe doit
 *   en créer un (Demandes clients › Motifs).
 */
export async function orderChangeReason(
  reader: RequestReasonReader,
  reasons: RequestReasonRepository,
  audience: CustomerAudience,
): Promise<RequestReason> {
  const [first] = await reader.offered("order_change", audience);
  if (first === undefined) {
    throw new OrderChangeReasonMissingError();
  }
  return offeredReason(reasons, first.id, "order_change", audience);
}
