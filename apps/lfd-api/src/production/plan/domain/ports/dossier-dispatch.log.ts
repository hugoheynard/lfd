/**
 * Un envoi du dossier à une personne : la journée, l'instant d'origine (la
 * clôture, ou un retirage) et la ligne de la liste.
 */
export interface DossierDispatchSlot {
  /** `AAAA-MM-JJ`. */
  readonly serviceDay: string;
  readonly occasionAt: Date;
  readonly recipientId: string;
}

/** Ce que l'envoi a donné. */
export type DossierDispatchOutcome =
  | { readonly kind: "sent"; readonly providerId: string | null }
  | { readonly kind: "failed"; readonly failure: string };

/**
 * **La trace d'envoi du dossier du jour** (plan `dossier-prod-du-jour.md`,
 * lot E3) — l'idempotence d'un fait livré au moins une fois.
 *
 * Deux écritures ciblées, et c'est voulu : une trace n'a pas d'invariant à
 * garder, et l'unicité est tenue par la base (clé primaire, `ON CONFLICT DO
 * NOTHING`), pas par un agrégat qu'on chargerait — même figure que la
 * tentative d'arrêt automatique.
 */
export abstract class DossierDispatchLog {
  /**
   * Prend l'envoi. `false` : il a déjà été pris — servi, échoué ou en cours —
   * et ne repart pas.
   *
   * @param planVersion la version du plan que le papier joint imprime, lue sur
   *   la journée chargée par l'abonné (`plan-historique-des-tirages.md`,
   *   § 7 Q2) ; absente ou `null` : journée sans version.
   */
  abstract claim(
    slot: DossierDispatchSlot,
    recipientName: string,
    at: Date,
    planVersion?: number | null,
  ): Promise<boolean>;

  /**
   * Note ce que l'envoi a donné — **une issue, une fois** : seul un envoi
   * encore `pending` est réglé. Déjà réglé, il reste tel quel, sans erreur :
   * un `failed` noté après un `sent` (une panne après la remise au service
   * d'e-mails) ne fait pas mentir la trace sur un dossier parti.
   */
  abstract settle(
    slot: DossierDispatchSlot,
    outcome: DossierDispatchOutcome,
    at: Date,
  ): Promise<void>;
}
