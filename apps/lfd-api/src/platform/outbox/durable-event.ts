/**
 * Un **fait durable** tel qu'un émetteur le décrit (plan
 * `documentation/journalisation/plan-boite-d-envoi.md`, §3 et §7).
 *
 * Le reste — identifiant, instant, trace, abonnés — est dérivé par
 * l'adaptateur : un émetteur qui devrait le fournir finirait par se tromper.
 */
export interface DurableFact {
  /**
   * Nom stable du fait (`order.handed_over`). UN par fait, quelle que soit la
   * classe qui le porte : c'est la clé de routage vers `@DurableHandler`.
   */
  readonly type: string;
  /**
   * Clé DÉTERMINISTE (`order.packed:<orderId>`), unique en base : un même fait
   * ne s'écrit qu'une fois, quel que soit le chemin qui l'annonce (§7, B1).
   */
  readonly key: string;
  /** Ce qu'il faut à l'abonné pour agir sans rouvrir la base de l'émetteur. */
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Un événement qui sait se décrire en fait durable (`publisher.publish(event.durableFact())`). */
export interface DurableEvent {
  durableFact(): DurableFact;
}

/** Ce qu'un abonné durable reçoit : le fait, et son identifiant pour s'y référer. */
export interface DurableDelivery {
  readonly eventId: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
