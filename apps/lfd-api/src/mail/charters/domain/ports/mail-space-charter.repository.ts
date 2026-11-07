import type { MailSpace } from "@lfd/mail-blocks";

import type { MailSpaceCharter } from "../mail-space-charter.js";

/**
 * Port d'écriture de **la charte d'un espace** (plan
 * `plan-editeur-par-blocs.md`, § 25, C1) : charger l'agrégat, le ranger.
 * À appeler dans une unité de travail : la publication fait aussi monter la
 * version des textes des e-mails.
 */
export abstract class MailSpaceCharterRepository {
  /** La charte de l'espace ; `untouched` si elle n'a jamais été écrite — rien n'est écrit pour autant. */
  abstract load(space: MailSpace): Promise<MailSpaceCharter>;

  /**
   * Range la charte sur la révision chargée, et ajoute la version publiée
   * par ce geste à l'historique, en ajout seul.
   *
   * @throws {MailCharterChangedError} quelqu'un l'a écrite depuis le chargement.
   */
  abstract save(charter: MailSpaceCharter): Promise<void>;
}
