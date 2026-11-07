import type { MailAudience, MailEditorListItem, MailFamily } from '@lfd/mail-blocks';

import { AUDIENCE_ORDER, AUDIENCE_TITLES, FAMILY_ORDER, FAMILY_TITLES } from './mail-labels';

export interface MailTemplateFamilyGroup {
  readonly family: MailFamily;
  readonly title: string;
  readonly mails: readonly MailEditorListItem[];
}

export interface MailTemplateAudienceGroup {
  readonly audience: MailAudience;
  readonly title: string;
  readonly families: readonly MailTemplateFamilyGroup[];
}

/**
 * Le rangement de la liste de l'éditeur (§ 6) : par destinataire, puis par
 * moment — les intitulés de `mail-labels`, venus de l’ancien écran des textes.
 * L'ordre du serveur (celui du registre) est gardé dans chaque moment ; un
 * groupe vide n'apparaît pas.
 */
export function groupMailTemplates(
  mails: readonly MailEditorListItem[],
): readonly MailTemplateAudienceGroup[] {
  return AUDIENCE_ORDER.map((audience) => ({
    audience,
    title: AUDIENCE_TITLES[audience],
    families: FAMILY_ORDER.map((family) => ({
      family,
      title: FAMILY_TITLES[family],
      mails: mails.filter((mail) => mail.audience === audience && mail.family === family),
    })).filter((group) => group.mails.length > 0),
  })).filter((group) => group.families.length > 0);
}
