/**
 * **Ce payeur a-t-il déjà eu une commande au compte ?** — la première
 * condition du mode immédiat (plan `plan-changement-de-mode-immediat.md`,
 * §3.2). La lecture est LARGE exprès : un faux « non » programme le
 * changement, un faux « oui » ferait une période fausse.
 */
export abstract class PayerOrderHistoryReader {
  /**
   * Vrai dès qu'une commande au compte, non annulée, touche ce payeur : passée
   * par lui, par un site qui le suit ou l'a suivi, ou facturée à lui.
   */
  abstract hasEverOrdered(payerCompanyId: string): Promise<boolean>;
}
