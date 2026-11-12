import type { ReceivedBankTransfer } from "../entities/received-bank-transfer.js";

/**
 * Port d'ÉCRITURE du virement reçu : un ajout, jamais une mise à jour (la base
 * le tient en ajout seul). À appeler sous l'unité de travail du geste, AVANT
 * les commandes qui le citent.
 */
export abstract class ReceivedBankTransferRepository {
  abstract add(transfer: ReceivedBankTransfer): Promise<void>;
}
