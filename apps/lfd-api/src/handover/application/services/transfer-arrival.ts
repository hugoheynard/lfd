import type { HandoverSubject } from "../../channels/commerce/handover-subject.reader.js";
import { TransferStatusReader } from "../../../delivery/channels/handover/index.js";
import {
  TransferNotReceivedError,
  TransferNotYetComposedError,
} from "../../domain/errors/handover-errors.js";

/**
 * **La marchandise est-elle au site ?** (plan du transfert interne, §6.1–6.2,
 * lot T2) — posée au moment de remettre. Une commande portée par un transfert
 * non reçu est refusée ; un retrait d'un site servi par transfert qu'aucun
 * transfert ne porte ENCORE l'est aussi (lot T3, faille F4 : passé avant la
 * clôture, il se remettait sans refus) ; une autre commande se remet comme
 * avant.
 *
 * Comme la retenue qualité, c'est une VÉRIFICATION lue sans verrou commun avec
 * la réception : une réception concurrente ne fait que rendre le refus
 * superflu, jamais l'inverse (un transfert reçu ne redevient pas prévu).
 *
 * Le refus est RENDU, pas levé (2026-11-03) : le geste le lève, l'aperçu du
 * départ incomplet au comptoir (C1b) le dit avant. `null` : la marchandise
 * est au site, ou ne voyage pas.
 */
export async function transferRefusalOf(
  transfers: TransferStatusReader,
  subject: HandoverSubject,
): Promise<TransferNotYetComposedError | TransferNotReceivedError | null> {
  const status = (await transfers.statusOf([subject.orderId])).get(subject.orderId);
  if (status?.state === "awaiting") {
    return new TransferNotYetComposedError(status.siteLabel);
  }
  if (status !== undefined && status.state !== "received") {
    return new TransferNotReceivedError(status.siteLabel);
  }
  return null;
}
