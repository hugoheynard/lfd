import type { MailSpace } from "@lfd/mail-blocks";

import type { MailSpaceSender } from "../mail-space-sender.js";

/**
 * Port d'écriture de **l'identité d'envoi d'un espace** (plan
 * `plan-editeur-par-blocs.md`, § 25, C3) : charger l'agrégat, le ranger. À
 * appeler dans une unité de travail : le changement fait aussi monter la
 * version des textes des e-mails, l'estampille du cache de l'envoi.
 */
export abstract class MailSpaceSenderRepository {
  /**
   * L'identité de l'espace ; `unset` s'il n'en a jamais eu — rien n'est écrit pour autant.
   *
   * @throws {StoredMailSenderUnreadableError} l'identité rangée ne tient plus.
   */
  abstract load(space: MailSpace): Promise<MailSpaceSender>;

  /**
   * Range l'identité sur la révision chargée.
   *
   * @throws {MailSenderChangedError} quelqu'un l'a écrite depuis le chargement.
   */
  abstract save(sender: MailSpaceSender): Promise<void>;
}
