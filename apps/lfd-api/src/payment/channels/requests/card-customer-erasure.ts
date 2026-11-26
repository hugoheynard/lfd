/**
 * **Effacer chez le prestataire les clients d'une personne qui supprime son
 * compte** (plan `documentation/payment/plan-pointage-stripe.md`, lot 5) —
 * déclaré par `payment`, à appeler par le parcours « supprimer mon compte »
 * (`documentation/legal/plan-supprimer-mon-compte.md`, lot S1), qui n'est pas
 * encore bâti : ce port n'a ni appelant ni adaptateur.
 *
 * Le contrat que l'adaptateur devra tenir, même figure que la file des
 * libellés (`payment.card_intent_relabel`) :
 * - **dans** la transaction de l'appelant, une ligne par compte de
 *   `payment.card_customer` de cette personne est mise en file ; aucun appel
 *   réseau ici ;
 * - **après** validation, `customers.del` sur chaque compte, hors transaction,
 *   repris par un balayage borné tant qu'il n'a pas abouti ; un client déjà
 *   supprimé chez le prestataire vaut un succès (idempotent) ;
 * - la correspondance `payment.card_customer` part une fois le client effacé ;
 * - rien n'est journalisé que des identifiants : ni nom, ni adresse e-mail.
 */
export abstract class CardCustomerErasure {
  /**
   * Met en file l'effacement de tous les clients du prestataire rattachés à
   * cette personne, sur chaque compte d'encaissement. Sans effet si elle n'en
   * a aucun, ou si l'effacement est déjà en file.
   */
  abstract eraseCustomersOf(userId: string): Promise<void>;
}
