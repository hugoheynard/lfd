import type { MailSectionOrder } from "../mail-section-order.js";

/** Port d'écriture de **l'ordre des sections d'un e-mail** — l'agrégat entier (E4). */
export abstract class MailSectionOrderRepository {
  /** L'ordre ; jamais `null` — un ordre jamais écrit se charge en révision 0. */
  abstract load(mail: string): Promise<MailSectionOrder>;

  /**
   * Enregistre, à condition que la révision en base soit encore celle d'avant
   * le geste (`revision - 1`) — un seul ordre SQL.
   *
   * @throws {MailSectionOrderChangedError} quelqu'un a écrit depuis le chargement.
   */
  abstract save(order: MailSectionOrder): Promise<void>;
}
