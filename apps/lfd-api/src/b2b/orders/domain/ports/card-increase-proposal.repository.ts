import type { CardIncreaseProposal } from "../entities/card-increase-proposal.js";

/**
 * **Le dépôt des projets de hausse par carte** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.3) — port
 * d'écriture : il prend et rend l'agrégat.
 *
 * 🔴 **Ordre des verrous** : l'appelant tient DÉJÀ le verrou de la commande
 * (`OrderLock.lock` ou `OrderRevisionRepository.lock`) quand il appelle une
 * lecture `lock*` — `orders`, puis le projet, puis `card-payment`. Les deux
 * lectures posent le `FOR UPDATE` du projet dans l'unité de travail ambiante.
 */
export abstract class CardIncreaseProposalRepository {
  /** Le projet de ce paiement de complément (`payment_id` unique), sous `FOR UPDATE`. */
  abstract lockByPayment(paymentId: string): Promise<CardIncreaseProposal | null>;

  /** Le projet vivant de la commande (R5 : un au plus), sous `FOR UPDATE`. */
  abstract lockLiveOf(orderId: string): Promise<CardIncreaseProposal | null>;

  /**
   * Écrit l'agrégat : une naissance s'insère ; une transition s'écrit
   * **conditionnée** sur l'état relu (`WHERE state = expectedState`).
   *
   * @returns `false` si la condition n'a rien trouvé — un autre geste est
   *   passé entre-temps ; rien n'est écrit.
   */
  abstract save(proposal: CardIncreaseProposal): Promise<boolean>;
}
