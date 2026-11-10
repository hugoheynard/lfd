import type { InvoiceSellerFacts } from "../services/invoice-issuance-blockers.js";

/**
 * Les entités émettrices **en service**, telles que la facture les juge
 * (plan `facture-emise.md`) — lues par le dossier de
 * facturation pour dire ce qui empêcherait d'émettre.
 *
 * Un port à part de `LegalEntityReader` (la vue d'écran) et de
 * `CreditorReader` (la copie qui refuse une entité qui ne peut pas encaisser) :
 * le dossier veut justement VOIR une entité incomplète pour dire ce qui lui
 * manque, et n'a l'usage d'aucun autre champ (ISP).
 */
export abstract class InvoiceIssuersReader {
  /** Les entités non archivées, les plus anciennes d'abord. */
  abstract activeIssuers(): Promise<readonly InvoiceSellerFacts[]>;
}
