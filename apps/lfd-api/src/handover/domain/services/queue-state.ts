import type { HandoverQueueState } from "@lfd/contracts";

import type { AttestedHandover } from "../ports/handover-attestations.reader.js";

/** Ce que la règle lit d'une commande : le statut du commerce, et le colisage. */
export interface QueueStateSource {
  readonly status: string;
  readonly readyAt: Date | null;
}

/** Ce que {@link showsInQueue} lit : le statut et le règlement, dits par le commerce. */
export interface QueuePresenceSource {
  readonly status: string;
  readonly settled: boolean;
}

/**
 * **La file montre-t-elle cette commande ?** — non pour une commande ni
 * réglée, ni retirée, ni annulée.
 *
 * 🔴 La file ne doit pas montrer attendue ce que le scan refuse
 * (`handoverBlocker`, « n'est pas réglée » — plan
 * `documentation/order/plan-carte-reglee-avant-tout.md`, §4.4). Une commande
 * carte « À régler » n'existe pour personne tant qu'elle n'est pas payée : ni
 * pour le client (ni suivi ni QR), ni au comptoir.
 *
 * Deux exceptions, et elles sont l'ordre de {@link queueStateOf} :
 * - **retirée** : le sac est parti, une commande remboursée après coup reste
 *   dans la journée qu'elle a faite ;
 * - **annulée** : la file les montrait déjà, réglées ou non — rien ne change
 *   pour elles.
 */
export function showsInQueue(
  entry: QueuePresenceSource,
  attestation: AttestedHandover | undefined,
): boolean {
  return attestation !== undefined || entry.settled || entry.status === "cancelled";
}

/**
 * **L'état tel que le retrait le lit**, et non le statut brut du commerce — le
 * même pour la file du comptoir et pour la feuille de route. Sorti du handler
 * de file le 2026-09-29 pour que les deux écrans ne puissent pas le dire
 * différemment.
 *
 * L'ordre des tests est la règle métier, pas une commodité :
 *
 * 1. 🔴 **`handed_over` gagne sur tout**, y compris sur une annulation. Une
 *    commande retirée est retirée — le sac est parti. Laisser une annulation
 *    postérieure repeindre la ligne ferait mentir l'écran sur un fait physique,
 *    et c'est exactement le jour où on a besoin de le relire.
 * 2. `cancelled` ensuite : rien ne partira, et il faut pouvoir le dire à
 *    quelqu'un qui se présente.
 * 3. `ready` quand le fournil l'a déclarée prête.
 * 4. `expected` sinon — y compris pour une commande jamais colisée, qui reste
 *    remettable (`handoverBlocker` est volontairement permissif).
 */
export function queueStateOf(
  entry: QueueStateSource,
  attestation: AttestedHandover | undefined,
): HandoverQueueState {
  if (attestation !== undefined) {
    return "handed_over";
  }
  if (entry.status === "cancelled") {
    return "cancelled";
  }
  return entry.readyAt === null ? "expected" : "ready";
}
