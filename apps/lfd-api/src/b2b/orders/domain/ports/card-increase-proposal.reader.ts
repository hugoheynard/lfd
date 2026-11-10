import type { CardIncreaseProposal } from "../entities/card-increase-proposal.js";

/**
 * **Lire le projet de hausse d'une commande, sans verrou** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.4, §2.5) —
 * port de lecture, distinct du dépôt (ISP) : les gestes le lisent HORS
 * transaction pour décider de ce qu'ils demandent au prestataire (annuler
 * l'intention d'un projet remplacé ou abandonné, relire celle qu'on paie),
 * puis rejugent sous le verrou par le dépôt.
 */
export abstract class CardIncreaseProposalReader {
  /** Le projet vivant de la commande (`awaiting_payment | ready | stalled`), un au plus (R5). */
  abstract liveOf(orderId: string): Promise<CardIncreaseProposal | null>;
}
