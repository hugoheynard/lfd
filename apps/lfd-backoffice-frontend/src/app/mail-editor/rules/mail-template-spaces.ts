import {
  MAIL_SPACE_LABELS,
  MAIL_SPACES,
  mailSpaceOfCharter,
  type MailEditorListItem,
  type MailSpace,
} from '@lfd/mail-blocks';

import { groupMailTemplates, type MailTemplateFamilyGroup } from './mail-template-groups';

/** Un groupe de la liste d'un espace : un destinataire, ou « Interne ». */
export interface MailSpaceGroup {
  /** `customer`, `team`, `agency`, ou `internal` pour les e-mails internes. */
  readonly key: string;
  readonly title: string;
  readonly families: readonly MailTemplateFamilyGroup[];
}

/** Un espace et ses e-mails, rangés comme la liste l'a toujours été. */
export interface MailSpaceListing {
  readonly space: MailSpace;
  readonly title: string;
  /** Ce que l'espace couvre, en une ligne. */
  readonly scope: string;
  readonly count: number;
  /** Les e-mails de l'espace qui ont un brouillon d'arrangement en attente. */
  readonly draftCount: number;
  readonly groups: readonly MailSpaceGroup[];
}

/** Le titre du groupe des e-mails internes, dans l'espace La Folie Douce (Hugo, 2026-11-07). */
export const INTERNAL_GROUP_TITLE = 'Interne';

/**
 * Ce que chaque espace couvre, dit sur sa carte. Libellé d'écran, pas une
 * donnée : le paquet ne porte que le nom (`MAIL_SPACE_LABELS`).
 */
export const MAIL_SPACE_SCOPES: Readonly<Record<MailSpace, string>> = {
  lfc: 'Les e-mails envoyés aux clients de La Folie Coffee.',
  lfd: 'Les e-mails envoyés à l’équipe, et les e-mails internes.',
};

/**
 * L'espace d'un e-mail : `space` tel que le serveur le sert (C1), sinon lu
 * de sa charte par la même règle que le serveur (`mailSpaceOfCharter`) — le
 * champ est encore facultatif dans le type.
 */
export function mailSpaceOf(mail: MailEditorListItem): MailSpace {
  return mail.space ?? mailSpaceOfCharter(mail.charter);
}

function groupsOf(mails: readonly MailEditorListItem[]): readonly MailSpaceGroup[] {
  const internal = mails.filter((mail) => mail.charter === 'internal');
  const others = mails.filter((mail) => mail.charter !== 'internal');
  const byAudience = groupMailTemplates(others).map((group) => ({
    key: group.audience,
    title: group.title,
    families: group.families,
  }));
  const internalFamilies = groupMailTemplates(internal).flatMap((group) => group.families);
  return internalFamilies.length === 0
    ? byAudience
    : [...byAudience, { key: 'internal', title: INTERNAL_GROUP_TITLE, families: internalFamilies }];
}

/**
 * **Les espaces des e-mails** (plan § 25, C2) : les deux espaces,
 * toujours, dans l'ordre de `MAIL_SPACES` — un espace sans e-mail garde
 * l'accès à sa charte. Dans chacun, le rangement par destinataire puis par
 * moment ; les e-mails internes (charte `internal`) sous « Interne », à la fin.
 */
export function groupMailSpaces(mails: readonly MailEditorListItem[]): readonly MailSpaceListing[] {
  return MAIL_SPACES.map((space) => {
    const own = mails.filter((mail) => mailSpaceOf(mail) === space);
    return {
      space,
      title: MAIL_SPACE_LABELS[space],
      scope: MAIL_SPACE_SCOPES[space],
      count: own.length,
      draftCount: own.filter((mail) => mail.hasDraft).length,
      groups: groupsOf(own),
    };
  });
}

/** Un espace et ses e-mails ; `null` si le segment de route n'est pas un espace. */
export function mailSpaceListing(
  mails: readonly MailEditorListItem[],
  space: string,
): MailSpaceListing | null {
  return groupMailSpaces(mails).find((listing) => listing.space === space) ?? null;
}
