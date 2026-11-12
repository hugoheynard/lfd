/**
 * **Le verrou des changements d'un payeur** (plan
 * `le-paiement-par-virement.md`, K11) : les gestes de mode et de
 * moyen d'un payeur le prennent, dans leur transaction et AVANT de lire
 * « aucun changement en attente » (K1). Sans lui, deux gestes simultanés
 * liraient chacun l'autre absent, et écriraient tous deux.
 *
 * Un seul verrou pour les deux gestes — la ligne de la société payeuse —,
 * donc un seul ordre : pas d'interblocage possible entre eux.
 *
 * Tenu jusqu'à la fin de la transaction : à appeler sous `UnitOfWork.run`.
 */
export abstract class PayerChangeLock {
  abstract lock(payerCompanyId: string): Promise<void>;
}
