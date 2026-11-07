import type { MailTemplateDocument } from "../mail-template-document.js";

/**
 * Port d'écriture du **document d'un e-mail** (plan
 * `plan-editeur-par-blocs.md`, § 5, S4c) : charger l'agrégat, le ranger.
 * À appeler dans une unité de travail : la publication range aussi les
 * phrases et la version des textes.
 */
export abstract class MailTemplateDocumentRepository {
  /** Le document de l'e-mail ; `untouched` s'il n'a jamais été écrit — rien n'est écrit pour autant. */
  abstract load(template: string): Promise<MailTemplateDocument>;

  /**
   * Range le document sur la révision chargée, et ajoute la version publiée
   * par ce geste à l'historique, en ajout seul.
   *
   * @throws {MailDocumentChangedError} quelqu'un l'a écrit depuis le chargement.
   */
  abstract save(document: MailTemplateDocument): Promise<void>;
}
