import type { TransferAllocationView } from "../../../channels/requests/bank-transfers.js";
import type { MovementSubject } from "../../../channels/subjects/movement-subject.js";

/** Les parts de virement de sujets donnés, par lot, en une requête. */
export abstract class TransferAllocationsReader {
  /** Une part par sujet réglé ; un sujet sans virement est absent. */
  abstract allocationsOf(
    subjects: readonly MovementSubject[],
  ): Promise<readonly TransferAllocationView[]>;
}
