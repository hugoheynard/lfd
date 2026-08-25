/**
 * Un **fait** tel qu'un émetteur le décrit : ce qui s'est passé, sur quoi, et
 * le strict nécessaire pour le relire.
 *
 * Le reste — qui, quand, sous quelle trace, avec quelle clé d'idempotence — est
 * dérivé du contexte par l'adaptateur. Un émetteur qui devrait le fournir
 * finirait par se tromper, ou par mentir.
 */
export interface JournalFact {
  /** Le fait, en vocabulaire métier : `company.payment_terms_granted`. */
  readonly type: string;
  /** La chose dont il parle (`company`, `product`, `vat_rate`…). */
  readonly subjectType: string;
  readonly subjectId: string;
  /** Ce qu'il faut pour le relire sans rouvrir la base. Reste petit. */
  readonly payload: Record<string, unknown>;
  /** Temps **métier**, si l'émetteur en connaît un autre que maintenant. */
  readonly occurredAt?: Date;
}

/**
 * Un événement de domaine **qui est aussi un fait** — il sait se décrire au
 * journal.
 *
 * C'est le point de la manœuvre. Le référentiel journalise dans ses handlers :
 * une dizaine de lignes par geste, parce que ses faits portent des diffs que
 * seul le handler sait calculer. Les comptes clients n'en ont pas besoin : leurs
 * faits sont des **actes nommés**, que l'événement porte déjà. Le handler garde
 * donc sa ligne d'origine — `await this.events.publishTraced(new …Event(…))` —
 * et c'est l'événement qui dit ce qu'il inscrit.
 *
 * Un seul objet, deux usages : les abonnés continuent de le recevoir, le
 * journal en tire sa ligne. Écrire la charge utile deux fois — une pour le bus,
 * une pour le journal — était la vraie source de dérive.
 */
export interface JournaledEvent {
  journalFact(): JournalFact;
}

/** Un événement sait-il se journaliser ? */
export function isJournaledEvent(event: object): event is JournaledEvent {
  return typeof (event as Partial<JournaledEvent>).journalFact === "function";
}
