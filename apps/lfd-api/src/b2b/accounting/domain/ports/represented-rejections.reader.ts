/**
 * Ce que l'avis d'une re-présentation doit dire : « nouvelle présentation du
 * prélèvement rejeté du … » (plan `plan-retours-bancaires.md`, § 2 bis-6).
 *
 * Seule une ligne de factures émises se re-présente : ses factures sont donc
 * celles de la ligne rejetée, et c'est par elles qu'on retrouve le rejet — la
 * commande re-présentée a perdu son lien à sa ligne, le retour l'a gardé.
 */
export abstract class RepresentedRejectionsReader {
  /**
   * Par facture, le jour (`AAAA-MM-JJ`) du DERNIER retour re-présenté d'une
   * ligne qui l'encaissait. Une facture jamais rejetée est absente.
   */
  abstract rejectedDaysOf(invoiceIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
