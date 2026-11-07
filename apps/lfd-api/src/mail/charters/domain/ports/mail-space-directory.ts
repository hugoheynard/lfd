import type { MailCharterSettings, MailLocale, MailSpace } from "@lfd/mail-blocks";

/**
 * Port de **ce que le code dit d'un espace** (plan
 * `plan-editeur-par-blocs.md`, § 25) : ses e-mails (lus de la charte de
 * chaque modèle, `internal` rangé dans `lfd`), ses langues (celles de ses
 * e-mails), et sa charte de départ (les constantes du rendu). Aucune table
 * lue. Un port pour que l'application s'éprouve sur un registre réduit.
 */
export abstract class MailSpaceDirectory {
  /** Les clés du registre des e-mails de l'espace, dans l'ordre du registre. */
  abstract templatesOf(space: MailSpace): readonly string[];
  /** Les langues de l'espace : l'union de celles de ses e-mails, dans l'ordre des langues. */
  abstract localesOf(space: MailSpace): readonly MailLocale[];
  /** La charte de départ : celle que les e-mails rendent tant qu'aucune n'est publiée. */
  abstract startingSettings(space: MailSpace): MailCharterSettings;
}
