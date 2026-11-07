import type { MailSpace } from "@lfd/mail-blocks";

import type { MailSpaceSenderState } from "../mail-space-sender.js";

/**
 * Port de **lecture** des identités d'envoi : la page d'un espace, et le
 * rappel du démarrage. Les états sont rendus tels que rangés ; c'est le
 * lecteur qui les fait relire par l'agrégat.
 */
export abstract class MailSenderReader {
  /** L'état rangé de l'espace, `null` s'il n'a jamais été réglé. */
  abstract stateOf(space: MailSpace): Promise<MailSpaceSenderState | null>;

  /** Les espaces qui ont une identité rangée. */
  abstract configuredSpaces(): Promise<readonly MailSpace[]>;
}
