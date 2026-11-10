import type { CardIncreaseProposal } from "../entities/card-increase-proposal.js";

/**
 * **Lire le projet de hausse d'une commande, sans verrou** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.3, §2.7.4) —
 * port de lecture, distinct du dépôt (ISP) : les gestes le lisent HORS
 * transaction pour décider de ce qu'ils demandent au prestataire (annuler
 * l'intention d'un projet remplacé ou abandonné, relire celle qu'on paie),
 * puis rejugent sous le verrou par le dépôt.
 */
export abstract class CardIncreaseProposalReader {
  /** Le projet vivant de la commande (`awaiting_payment | ready | stalled`), un au plus (R5). */
  abstract liveOf(orderId: string): Promise<CardIncreaseProposal | null>;

  /** Le projet sous cet identifiant, quel que soit son état — l'exécuteur le relit hors verrou (§2.6). */
  abstract find(proposalId: string): Promise<CardIncreaseProposal | null>;
}
