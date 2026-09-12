/**
 * Ce qu'il faut d'un débiteur pour le prélever : **sa RUM et son compte**.
 *
 * Les deux voyagent ensemble parce qu'ils ne valent rien séparément — une RUM
 * sans IBAN ne dit pas où débiter, un IBAN sans RUM n'a aucune autorisation
 * derrière lui. Les séparer en deux lectures laisserait écrire un lot qui a
 * l'un sans l'autre.
 */
export interface DebtorMandate {
  /** La RUM, telle qu'elle est imprimée sur le papier signé. */
  readonly reference: string;
  /** L'IBAN du compte à débiter, en clair — il vient d'être déscellé. */
  readonly iban: string;
}

/**
 * Port de lecture des **mandats des débiteurs**, déclaré par la comptabilité et
 * implémenté par `payments`.
 *
 * 🔴 **Un port, et pas une jointure.** Le lot a besoin de deux tables qui
 * appartiennent à `payments` — `payment_mandates` et `company_bank_accounts`.
 * Les lire depuis un adaptateur de la comptabilité ferait franchir une
 * frontière par le SQL, c'est-à-dire à l'endroit où le graphe d'imports ne la
 * voit pas. `lint:prisma-model-ownership` refuserait, et il aurait raison.
 *
 * ⚠️ **Cette lecture fait sortir des IBAN en clair**, et c'est la seule du
 * dépôt qui le fasse en lot. Elle existe parce qu'un `pain.008` les porte par
 * construction : la banque ne peut pas débiter un compte qu'on lui tairait. Ce
 * qu'on peut tenir, en revanche, c'est que rien d'autre ne les recopie — le CSV
 * de contrôle les masque depuis le 2026-09-12.
 */
export abstract class DebtorMandateReader {
  /**
   * Les mandats **actifs** des sociétés demandées, indexés par société.
   *
   * Une société absente de la réponse n'a pas de mandat prélevable — brouillon
   * non signé, mandat révoqué, ou RIB jamais recopié. L'absence est une réponse,
   * pas une panne : c'est au lot de décider ce qu'il en fait, et il refuse.
   *
   * En lot plutôt qu'un appel par société : un cycle porte autant de lignes que
   * de clients, et une lecture par ligne ferait payer au serveur ce qu'un écran
   * ne demande qu'une fois.
   */
  abstract activeFor(companyIds: readonly string[]): Promise<ReadonlyMap<string, DebtorMandate>>;
}
