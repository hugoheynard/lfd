import type { MailDocumentStamp, MailTemplateDocumentState } from "../mail-template-document.js";

/** Une version publiée, telle que l'historique la montre — sans son document. */
export interface MailDocumentVersionRecord {
  readonly version: number;
  readonly stamp: MailDocumentStamp;
}

/**
 * Port de lecture de **l'éditeur** (ISP : distinct du port d'écriture) : les
 * documents de tous les e-mails pour la liste, celui d'un e-mail pour
 * l'ouvrir, ses versions pour l'historique. Pas de cache : quelques personnes
 * l'ouvrent, et elles doivent voir l'état exact.
 */
export abstract class MailDocumentReader {
  /** Les documents qui ont une ligne ; un e-mail absent n'a jamais été arrangé. */
  abstract all(): Promise<readonly MailTemplateDocumentState[]>;
  /** `null` : jamais arrangé. */
  abstract stateOf(template: string): Promise<MailTemplateDocumentState | null>;
  /** Les versions publiées, de la plus récente à la plus ancienne. */
  abstract versions(template: string): Promise<readonly MailDocumentVersionRecord[]>;
}
