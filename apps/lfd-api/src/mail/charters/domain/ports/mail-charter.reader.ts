import type { MailSpace } from "@lfd/mail-blocks";

import type { MailSpaceCharterState, PublishedMailCharter } from "../mail-space-charter.js";

/**
 * Port de lecture de **la page « Charte »** (ISP : distinct du port
 * d'écriture) : l'état d'un espace pour l'ouvrir, ses versions pour
 * l'historique. Pas de cache : quelques personnes l'ouvrent, et elles
 * doivent voir l'état exact.
 */
export abstract class MailCharterReader {
  /** `null` : jamais réglée — la charte de départ. */
  abstract stateOf(space: MailSpace): Promise<MailSpaceCharterState | null>;
  /** Les versions publiées, de la plus récente à la plus ancienne. */
  abstract versions(space: MailSpace): Promise<readonly PublishedMailCharter[]>;
}
