import type { HandoverSubject } from "../../channels/commerce/handover-subject.reader.js";
import { TransferStatusReader } from "../../../delivery/channels/handover/index.js";
import { TransferNotReceivedError } from "../../domain/errors/handover-errors.js";

/**
 * **La marchandise est-elle au site ?** (plan du transfert interne, §6.1–6.2,
 * lot T2) — posée au moment de remettre. Une commande portée par un transfert
 * non reçu est refusée ; une commande qu'aucun transfert ne porte se remet
 * comme avant.
 *
 * Comme la retenue qualité, c'est une VÉRIFICATION lue sans verrou commun avec
 * la réception : une réception concurrente ne fait que rendre le refus
 * superflu, jamais l'inverse (un transfert reçu ne redevient pas prévu).
 *
 * @throws {TransferNotReceivedError}
 */
export async function ensureArrivedAtSite(
  transfers: TransferStatusReader,
  subject: HandoverSubject,
): Promise<void> {
  const status = (await transfers.statusOf([subject.orderId])).get(subject.orderId);
  if (status !== undefined && status.state !== "received") {
    throw new TransferNotReceivedError(status.siteLabel);
  }
}
