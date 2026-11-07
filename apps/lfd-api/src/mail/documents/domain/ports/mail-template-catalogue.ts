import type {
  MailAudience,
  MailEditorCaseView,
  MailEditorResources,
  MailFamily,
  MailPreviewSituation,
  MailTemplateDeclaration,
} from "@lfd/mail-blocks";

/** Un e-mail du registre, tel que l'éditeur le connaît : ce que le CODE en dit. */
export interface MailTemplateEntry {
  readonly template: string;
  readonly audience: MailAudience;
  readonly family: MailFamily;
  readonly declaration: MailTemplateDeclaration;
  /** Les jeux de données que l'aperçu sait rendre. */
  readonly cases: readonly MailEditorCaseView[];
  /** R1 (§ 24) : ses valeurs, ses liens, ses blocs de données, avec leurs fiches. */
  readonly resources: MailEditorResources;
  /** § 24 : les situations que l'aperçu par blocs sait rendre ; vide s'il n'en dépend pas. */
  readonly situations: readonly MailPreviewSituation[];
}

/**
 * Port des **e-mails du registre** (plan `plan-editeur-par-blocs.md`, S4c) :
 * leurs déclarations de blocs (`mailBlockDeclarationOf`), leur destinataire,
 * leur moment. Aucune table lue : c'est le code. Un port plutôt qu'un appel
 * direct, pour que l'application s'éprouve sur un registre réduit.
 */
export abstract class MailTemplateCatalogue {
  /** Dans l'ordre du registre. */
  abstract list(): readonly MailTemplateEntry[];
  /** `null` : l'e-mail n'est pas au registre de cette version. */
  abstract find(template: string): MailTemplateEntry | null;
}
