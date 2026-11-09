import type { MailNature, MailSpace } from "@lfd/mail-blocks";

import type { MailSpaceSenderState } from "../mail-space-sender.js";

/**
 * Port de **lecture** des identités d'envoi : la page d'un espace, et le
 * rappel du démarrage. Les états sont rendus tels que rangés ; c'est le
 * lecteur qui les fait relire par l'agrégat.
 */
export abstract class MailSenderReader {
  /** L'état rangé de l'espace pour cette nature, `null` s'il n'a jamais été réglé. */
  abstract stateOf(space: MailSpace, nature: MailNature): Promise<MailSpaceSenderState | null>;

  /**
   * Les espaces qui ont une identité `transactional` rangée — celle qui
   * remplace la configuration ; une identité marketing absente se replie sur
   * elle, jamais directement sur la configuration.
   */
  abstract configuredSpaces(): Promise<readonly MailSpace[]>;
}
