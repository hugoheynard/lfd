import type { MailAudience, MailFamily } from '@lfd/contracts';
import type { MailNature } from '@lfd/mail-blocks';

/** Les intitulés des e-mails vivent dans `@lfd/mail-blocks` : une seule source, que l'API lit aussi. */
export { labeledMailTemplates, mailLabel, mailWhoAndWhen, type MailLabel } from '@lfd/mail-blocks';

export const AUDIENCE_ORDER: readonly MailAudience[] = ['customer', 'team', 'agency'];
export const AUDIENCE_TITLES: Readonly<Record<MailAudience, string>> = {
  customer: 'Clients',
  team: 'Équipe',
  agency: 'Agence',
};

/** La pastille de la nature d'un e-mail (plan de désinscription, U1). */
export const MAIL_NATURE_LABELS: Readonly<Record<MailNature, string>> = {
  transactional: 'Transactionnel',
  marketing: 'Marketing',
};

export const FAMILY_ORDER: readonly MailFamily[] = [
  'order',
  'payment',
  'billing',
  'account',
  'team',
];
export const FAMILY_TITLES: Readonly<Record<MailFamily, string>> = {
  order: 'Commande',
  payment: 'Paiement',
  billing: 'Facturation',
  account: 'Compte',
  team: 'Vie de l’équipe',
};

/** Les parties d'un e-mail qu'on reconnaît à la tête de leur chemin. */
const PATH_HEADS: Readonly<Record<string, string>> = {
  subject: 'Objet',
  kicker: 'Titre header',
  title: 'Titre',
  intro: 'Introduction',
  greeting: 'Salutation',
  cta: 'Bouton',
  footer: 'Pied de l’e-mail',
};

/**
 * Le nom d'un texte dans son e-mail : « Titre — paid » pour `title.paid`, le
 * chemin tel quel quand sa tête n'est pas une partie connue.
 */
export function pathLabel(path: string): string {
  const [head = '', ...rest] = path.split('.');
  const name = PATH_HEADS[head];
  if (name === undefined) {
    return path;
  }
  return rest.length === 0 ? name : `${name} — ${rest.join('.')}`;
}
