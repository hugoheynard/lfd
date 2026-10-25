import type { MailAudience, MailFamily } from '@lfd/contracts';

/** Ce que l'écran dit d'un e-mail : son intitulé, qui le reçoit, quand il part. */
export interface MailLabel {
  readonly title: string;
  readonly recipient: string;
  readonly moment: string;
}

/**
 * **Les intitulés des 31 e-mails du registre** (`B2bMails`,
 * `apps/lfd-api/src/platform/mailer/mail-templates.ts`, relu le 2026-10-25) —
 * la clé technique reste au survol. Une clé que l'écran ne connaît pas
 * s'affiche telle quelle (`mailLabel`) : un e-mail neuf reste éditable avant
 * d'avoir son intitulé.
 */
const MAIL_LABELS: Readonly<Record<string, MailLabel>> = {
  'customer.order-placed': {
    title: 'Commande passée',
    recipient: 'Le client',
    moment: 'quand il passe sa commande',
  },
  'customer.order-ready': {
    title: 'Commande prête',
    recipient: 'Le client',
    moment: 'quand sa commande est prête, au comptoir ou en livraison',
  },
  'customer.delivery-en-route': {
    title: 'Livraison en route',
    recipient: 'Le client',
    moment: 'au départ de la tournée qui le livre',
  },
  'customer.order-placed-with-your-email': {
    title: 'Commande passée avec votre adresse',
    recipient: 'Le titulaire du compte',
    moment: 'quand quelqu’un commande sans se connecter avec son adresse',
  },
  'customer.payment-failed': {
    title: 'Paiement refusé',
    recipient: 'Le client',
    moment: 'quand son paiement en ligne est refusé',
  },
  'customer.payment-expired': {
    title: 'Paiement arrivé trop tard',
    recipient: 'Le client',
    moment: 'quand la clôture de la journée annule sa commande impayée',
  },
  'customer.order-payment-link': {
    title: 'Lien de règlement',
    recipient: 'L’acheteur',
    moment: 'quand la comptabilité lui renvoie le lien pour payer',
  },
  'customer.order-cancelled': {
    title: 'Commande annulée',
    recipient: 'Le client',
    moment: 'quand sa commande est annulée',
  },
  'customer.order-change-applied': {
    title: 'Modification demandée — appliquée',
    recipient: 'Le client qui l’a demandée',
    moment: 'quand l’équipe applique sa demande de modification',
  },
  'customer.order-change-refused': {
    title: 'Modification demandée — refusée',
    recipient: 'Le client qui l’a demandée',
    moment: 'quand l’équipe refuse sa demande de modification, avec son mot',
  },
  'customer.order-shortfall': {
    title: 'Commande incomplète — écrit par l’équipe',
    recipient: 'Le client qui a passé la commande',
    moment:
      'quand l’équipe écrit au client après la décision d’un départ incomplet — jamais automatiquement ; les paragraphes sont la proposition qu’elle relit avant d’envoyer',
  },
  'customer.invoice-issued': {
    title: 'Facture émise',
    recipient: 'La facturation du payeur et des sous-comptes',
    moment: 'à l’émission de la facture',
  },
  'customer.collection-notice': {
    title: 'Avis de prélèvement',
    recipient: 'La société payeuse',
    moment: 'avant un prélèvement, à sa correction ou à son annulation',
  },
  'customer.mandate-to-sign': {
    title: 'Mandat de prélèvement à signer',
    recipient: 'Le client',
    moment: 'quand son mandat SEPA est prêt à signer',
  },
  'customer.access-opened': {
    title: 'Accès ouvert',
    recipient: 'Le client',
    moment: 'à l’ouverture de son accès à l’espace',
  },
  'customer.company-attached': {
    title: 'Société ajoutée à l’espace',
    recipient: 'Le client',
    moment: 'quand une société de plus apparaît dans son espace',
  },
  'customer.login-method-linked': {
    title: 'Méthode de connexion ajoutée',
    recipient: 'Le client',
    moment: 'quand une méthode de connexion s’ajoute à son compte',
  },
  'customer.password-reset': {
    title: 'Changement de mot de passe',
    recipient: 'Le client',
    moment: 'quand il le demande depuis son profil',
  },
  'customer.sub-account-activity': {
    title: 'Commande d’un site',
    recipient: 'Les membres du compte principal',
    moment: 'quand un de leurs sites commande, annule ou ne paie pas',
  },
  'customer.sub-account-gesture': {
    title: 'Geste d’un site',
    recipient: 'Les membres du compte principal',
    moment: 'quand un de leurs sites change une adresse, un contact, un RIB…',
  },
  'staff.appointment-booked': {
    title: 'Rendez-vous réservé',
    recipient: 'La boîte de l’équipe',
    moment: 'quand un client réserve un créneau',
  },
  'staff.account-alert': {
    title: 'Alerte sur un compte',
    recipient: 'La boîte de l’équipe',
    moment: 'quand une alerte se déclenche sur un compte',
  },
  'staff.invited': {
    title: 'Invitation au back-office',
    recipient: 'Le membre de l’équipe',
    moment: 'à l’ouverture de son accès',
  },
  'staff.password-reset': {
    title: 'Nouveau mot de passe',
    recipient: 'Le membre de l’équipe',
    moment: 'quand on lui envoie un lien de mot de passe',
  },
  'staff.access-suspended': {
    title: 'Accès suspendu',
    recipient: 'Le membre de l’équipe',
    moment: 'quand son accès est fermé',
  },
  'staff.access-restored': {
    title: 'Accès rétabli',
    recipient: 'Le membre de l’équipe',
    moment: 'quand son accès est rouvert',
  },
  'staff.production-dossier': {
    title: 'Dossier du fournil',
    recipient: 'L’équipe du fournil',
    moment: 'à l’arrêt et à l’achèvement de la journée de production',
  },
  'staff.support-requested': {
    title: 'Demande de rappel',
    recipient: 'La boîte de l’équipe',
    moment: 'quand un client demande à être rappelé',
  },
  'staff.customer-request': {
    title: 'Demande d’un client',
    recipient: 'La boîte de l’équipe',
    moment: 'quand un client écrit ou signale un problème',
  },
  'ops.deploy-check': {
    title: 'Contrôle de mise en service',
    recipient: 'L’admin de secours',
    moment: 'après chaque déploiement',
  },
  'agency.vitrine-notice': {
    title: 'Annonce de la vitrine',
    recipient: 'Le contact de l’agence',
    moment: 'à chaque annonce aux abonnés de la vitrine',
  },
};

/** L'intitulé d'un e-mail ; sa clé, faute de mieux. */
export function mailLabel(mail: string): MailLabel {
  return MAIL_LABELS[mail] ?? { title: mail, recipient: '', moment: '' };
}

/** « Le client, quand il passe sa commande » — vide pour une clé inconnue. */
export function mailWhoAndWhen(mail: string): string {
  const { recipient, moment } = mailLabel(mail);
  return recipient === '' ? '' : `${recipient}, ${moment}`;
}

export const AUDIENCE_ORDER: readonly MailAudience[] = ['customer', 'team', 'agency'];
export const AUDIENCE_TITLES: Readonly<Record<MailAudience, string>> = {
  customer: 'Clients',
  team: 'Équipe',
  agency: 'Agence',
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
