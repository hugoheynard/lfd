import type { CustomerAudience, RequestKind } from "@lfd/contracts";

import {
  RequestReasonNotFoundError,
  RequestReasonUnavailableError,
} from "../../domain/errors/contact-errors.js";
import type { RequestReason } from "../../domain/request-reason.js";
import type { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";

/**
 * Le motif choisi, s'il est proposé par CE formulaire à CE public — la garde
 * commune aux envois (`demandes-clients.md`, §6.5).
 *
 * @throws {RequestReasonNotFoundError} il n'existe pas.
 * @throws {RequestReasonUnavailableError} autre formulaire, autre public, inactif ou archivé.
 */
export async function offeredReason(
  reasons: RequestReasonRepository,
  reasonId: string,
  kind: RequestKind,
  audience: CustomerAudience,
): Promise<RequestReason> {
  const reason = await reasons.load(reasonId);
  if (reason === null) {
    throw new RequestReasonNotFoundError(reasonId);
  }
  if (!reason.isOfferedFor(kind, audience)) {
    throw new RequestReasonUnavailableError(reasonId);
  }
  return reason;
}
