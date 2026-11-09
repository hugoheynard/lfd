/**
 * Les segments des textes de l'accord aux e-mails (espace `marketingConsent` :
 * les cases de l'inscription, « Mes e-mails » et la lettre du pied de page —
 * `documentation/mail/la-desinscription-et-l-accord.md`). Placé AVANT les
 * autres dans le glossaire : un segment déjà connu ailleurs garde son libellé.
 */
export const GLOSSARY_MARKETING_CONSENT: Readonly<Record<string, string>> = {
  societyV1: 'Case — les nouvelles de la maison',
  partnersV1: 'Case — les offres des partenaires',
  newsletterV1: 'Case — la lettre d’information',
  privacyLink: 'Lien vers la politique de confidentialité',
  preferencesTitle: 'Mes e-mails — titre',
  preferencesSubtitle: 'Mes e-mails — sous-titre',
  preferencesLoading: 'Mes e-mails — pendant le chargement',
  preferencesFailed: 'Mes e-mails — échec de lecture',
  preferencesRetry: 'Mes e-mails — réessayer',
  preferencesWriteFailed: 'Mes e-mails — choix non enregistré',
  spaceLfc: 'Nom de l’espace La Folie Coffee',
  stateSubscribed: 'État — inscrit',
  statePending: 'État — confirmation attendue',
  stateNotSubscribed: 'État — pas inscrit',
  stateUnsubscribed: 'État — désinscrit',
  subscribe: 'Bouton — s’inscrire',
  unsubscribe: 'Bouton — se désinscrire',
  resubscribe: 'Bouton — se réinscrire',
  partnersTitle: 'Offres des partenaires — titre',
  partnersAccept: 'Offres des partenaires — accepter',
  newsletterHead: 'Lettre du pied de page — titre',
  newsletterEmail: 'Lettre du pied de page — champ e-mail',
  newsletterSubmit: 'Lettre du pied de page — bouton',
  newsletterSending: 'Lettre du pied de page — pendant l’envoi',
  newsletterSent: 'Lettre du pied de page — e-mail de confirmation parti',
  newsletterTooMany: 'Lettre du pied de page — trop d’essais',
  newsletterInvalid: 'Lettre du pied de page — adresse invalide',
  newsletterFailed: 'Lettre du pied de page — échec',
  newsletterTrap: 'Lettre du pied de page — champ piège (lecteur d’écran)',
};
