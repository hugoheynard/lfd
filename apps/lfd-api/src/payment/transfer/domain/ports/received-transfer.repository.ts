import type { ReceivedTransfer } from "../entities/received-transfer.js";

/**
 * Port d'ÉCRITURE du virement reçu : un ajout, jamais une mise à jour (la base
 * le tient en ajout seul). Sous l'unité de travail de l'appelant.
 *
 * @throws {SubjectAlreadySettledByTransferError} un sujet déjà réglé par un virement.
 */
export abstract class ReceivedTransferRepository {
  abstract add(transfer: ReceivedTransfer): Promise<void>;
}
