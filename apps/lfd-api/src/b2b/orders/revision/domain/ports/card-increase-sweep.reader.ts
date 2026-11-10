/**
 * **Ce que les deux balayages des hausses reprennent** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5, §2.7.7) —
 * port de lecture à part (ISP) : des identifiants, triés par échéance,
 * bornés ; chaque reprise relit et rejuge sous ses verrous.
 */
export abstract class CardIncreaseSweepReader {
  /** Projets `ready` dont le prochain essai est dû et que personne ne tient à `wallNow`. */
  abstract dueForApply(wallNow: Date, limit: number): Promise<readonly string[]>;

  /** Projets `awaiting_payment` dont le délai de paiement est passé à `now`. */
  abstract expired(now: Date, limit: number): Promise<readonly string[]>;

  /**
   * Projets `awaiting_payment` encore dans leur délai à `now`, nés avant
   * `bornBefore` : ceux dont un paiement fait chez le prestataire a pu perdre
   * son webhook (§2.7).
   */
  abstract awaitingSince(bornBefore: Date, now: Date, limit: number): Promise<readonly string[]>;
}
