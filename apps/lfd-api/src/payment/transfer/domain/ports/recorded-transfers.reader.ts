import type { RecordedTransferView } from "../../../channels/requests/bank-transfers.js";

/** Les virements enregistrés depuis un instant, et leurs parts. */
export abstract class RecordedTransfersReader {
  /** Du plus ancien au plus récent (`recorded_at`, puis l'identifiant). */
  abstract recordedSince(since: Date): Promise<readonly RecordedTransferView[]>;
}
