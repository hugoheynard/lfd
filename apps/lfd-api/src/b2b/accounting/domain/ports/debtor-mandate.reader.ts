import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/**
 * Ce qu'il faut d'un débiteur pour le prélever : **sa RUM, son compte, et le
 * régime que son papier autorise**.
 *
 * Ils voyagent ensemble parce qu'ils ne valent rien séparément — une RUM sans
 * IBAN ne dit pas où débiter, un IBAN sans RUM n'a aucune autorisation derrière
 * lui, et l'un comme l'autre sans le schéma du mandat ferait prélever sous un
 * régime que le débiteur n'a pas signé.
 */
export interface DebtorMandate {
  /** La RUM, telle qu'elle est imprimée sur le papier signé. */
  readonly reference: string;
  /** L'IBAN du compte à débiter, en clair — il vient d'être déscellé. */
  readonly iban: string;
  /**
   * Le BIC de la banque du débiteur, lu sur son RIB recopié. `null` quand il
   * n'est pas renseigné : le lot écrit alors `NOTPROVIDED`, jamais un BIC deviné.
   */
  readonly bic: string | null;
  /**
   * 🔴 Le schéma **du mandat**, figé à sa frappe — jamais le réglage courant de
   * l'entité. C'est lui qui décide dans quel fichier la ligne sort.
   */
  readonly scheme: SepaScheme;
  /** Le type de paiement **du mandat** (zone 12 de son papier) : il fait le `SeqTp`. */
  readonly paymentType: MandatePaymentType;
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
   * Tous schémas confondus : c'est le lot qui découpe, après avoir jugé le cycle
   * ENTIER — une lecture filtrée par schéma cacherait les sociétés sans mandat.
   *
   * En lot plutôt qu'un appel par société : un cycle porte autant de lignes que
   * de clients, et une lecture par ligne ferait payer au serveur ce qu'un écran
   * ne demande qu'une fois.
   */
  abstract activeFor(companyIds: readonly string[]): Promise<ReadonlyMap<string, DebtorMandate>>;
}
