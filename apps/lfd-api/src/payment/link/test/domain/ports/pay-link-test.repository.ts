import type { PayLinkTest } from "../pay-link-test.js";

/**
 * **Les essais**, en écriture (`payment.pay_link_test`). Prend et rend
 * l'agrégat ; sous une unité de travail, il écrit dans la transaction de
 * l'appelant.
 */
export abstract class PayLinkTestRepository {
  /** Ajoute un essai neuf. */
  abstract add(test: PayLinkTest): Promise<void>;

  /** L'essai, relu sous le verrou de sa ligne (`FOR UPDATE`) ; `null` s'il n'existe pas. */
  abstract loadLocked(id: string): Promise<PayLinkTest | null>;

  /** L'essai, sans verrou ; `null` s'il n'existe pas. */
  abstract load(id: string): Promise<PayLinkTest | null>;

  /** Écrit l'état de l'essai. */
  abstract save(test: PayLinkTest): Promise<void>;

  /**
   * **Le verrou de l'envoi** — un verrou consultatif de transaction, sur une
   * clé fixe : deux envois concurrents se suivent, et le compte du jour lu
   * ensuite ne peut pas être dépassé.
   *
   * @throws {PayLinkTestLockOutsideTransactionError} hors d'une transaction.
   */
  abstract lockSending(): Promise<void>;

  /** Combien d'essais ont été envoyés le jour de Paris qui contient `instant`. */
  abstract countSentOnParisDayOf(instant: Date): Promise<number>;
}
