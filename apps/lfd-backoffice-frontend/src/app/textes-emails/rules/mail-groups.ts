import type { MailAudience, MailCopyMailView, MailFamily } from '@lfd/contracts';

import { AUDIENCE_ORDER, AUDIENCE_TITLES, FAMILY_ORDER, FAMILY_TITLES } from './mail-labels';

export interface MailFamilyGroup {
  readonly family: MailFamily;
  readonly title: string;
  readonly mails: readonly MailCopyMailView[];
}

export interface MailAudienceGroup {
  readonly audience: MailAudience;
  readonly title: string;
  readonly families: readonly MailFamilyGroup[];
}

/**
 * Le rangement de la liste (C8) : par destinataire, puis par moment. L'ordre
 * du serveur est gardé dans chaque moment ; un groupe vide n'apparaît pas.
 */
export function groupMails(mails: readonly MailCopyMailView[]): readonly MailAudienceGroup[] {
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
