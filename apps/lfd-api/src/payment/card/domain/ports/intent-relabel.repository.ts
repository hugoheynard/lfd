import type { IntentRelabel } from "../entities/intent-relabel.js";

/**
 * **Le port d'écriture des libellés à poser** (plan
 * `documentation/payment/le-pointage-stripe.md`, § 3) — table
 * `payment.card_intent_relabel`, une ligne par paiement. Il prend et rend
 * l'agrégat ; la file du balayage est un port à part (`IntentRelabelQueue`).
 */
export abstract class IntentRelabelRepository {
  /** Le libellé de ce paiement ; `null` : aucun. */
  abstract load(paymentId: string): Promise<IntentRelabel | null>;

  /**
   * Écrit l'agrégat : la ligne neuve, ou son état **si la révision lue est
   * encore celle de la base** (`loadedRevision`). Rend `false` sinon — un
   * libellé plus récent l'a remplacé, ou une autre ligne neuve l'a précédé :
   * rien n'est écrit, sans erreur qui annulerait la transaction de l'appelant.
   */
  abstract save(relabel: IntentRelabel): Promise<boolean>;
}
