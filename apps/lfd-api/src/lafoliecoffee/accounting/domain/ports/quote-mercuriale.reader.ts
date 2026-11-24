/**
 * **La mercuriale qu'un devis de période cite** (QD4) — déclaré par la
 * comptabilité, implémenté par la tarification, relié par `appBootstrap`
 * (`QuoteMercurialeModule`) : la comptabilité ne lit pas les tables du tarif.
 */
export abstract class QuoteMercurialeReader {
  /**
   * Le nom de la mercuriale qui agit chez ce payeur à cet instant, ou `null`
   * (aucune, ou suspendue : elle ne tient alors aucun prix convenu).
   */
  abstract labelAt(payerCompanyId: string, at: Date): Promise<string | null>;
}
