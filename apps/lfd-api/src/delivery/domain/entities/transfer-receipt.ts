import {
  TransferAlreadyReceivedError,
  TransferReceptionReasonRequiredError,
} from "../errors/internal-transfer-errors.js";
import type { TransferReceipt, TransferState } from "./internal-transfer-state.js";

/** Un motif plus long n'est plus un motif : c'est un compte rendu. */
export const TRANSFER_RECEPTION_REASON_MAX = 500;

/**
 * **La règle de la réception** (plan du transfert interne, §3, lot T2), pure :
 * une seule réception ; depuis `planned`, elle est MANUELLE et son motif est
 * obligatoire (« venu par le personnel », « pas de tournée ce jour ») ; après
 * le départ, le motif est facultatif — la tournée dit déjà comment il est venu.
 *
 * @throws {TransferAlreadyReceivedError} @throws {TransferReceptionReasonRequiredError}
 */
export function receiptOf(
  state: TransferState,
  siteLabel: string,
  input: { readonly at: Date; readonly by: string; readonly reason: string | null },
): TransferReceipt {
  if (state === "received") {
    throw new TransferAlreadyReceivedError(siteLabel);
  }
  const reason = input.reason?.trim() ?? "";
  if (reason.length > TRANSFER_RECEPTION_REASON_MAX) {
    throw new TransferReceptionReasonRequiredError(siteLabel, TRANSFER_RECEPTION_REASON_MAX);
  }
  if (state === "planned" && reason.length === 0) {
    throw new TransferReceptionReasonRequiredError(siteLabel, TRANSFER_RECEPTION_REASON_MAX);
  }
  return { at: input.at, by: input.by, reason: reason.length === 0 ? null : reason };
}
