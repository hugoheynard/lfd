import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que disent les cases du consentement marketing**, et « Mes e-mails »
 * (doc `documentation/mail/la-desinscription-et-l-accord.md`, lots C2, C3,
 * C5).
 *
 * 🔴 **Un texte de case est une VERSION.** `societyV1` est le texte que
 * l'API range sous `society.v1` quand la case est cochée — c'est la preuve
 * que la CNIL demande (règles 10 et 18). Changer ce texte, c'est publier une
 * version de plus (`MARKETING_CONSENT_TEXT_VERSIONS`, `@lfd/contracts`) et
 * une clé de plus ici — jamais réécrire une version existante, que des
 * accords déjà rangés citent.
 */
export interface MarketingConsentCopy {
  /** La case de la société, version `society.v1` : qui écrit, pour quoi, et la sortie. */
  readonly societyV1: string;
  /** La case des autres sociétés du groupe, version `partners.v1` (éteinte, règle 19). */
  readonly partnersV1: string;
  /** La phrase sous le champ du pied de page, version `newsletter.v1`. */
  readonly newsletterV1: string;
  /** Le lien vers la politique de confidentialité, à la suite de la phrase. */
  readonly privacyLink: string;

  /** « Mes e-mails », dans Mon profil. */
  readonly preferencesTitle: string;
  readonly preferencesSubtitle: string;
  readonly preferencesLoading: string;
  readonly preferencesFailed: string;
  readonly preferencesRetry: string;
  /** Un geste refusé : la carte reste, la phrase le dit. */
  readonly preferencesWriteFailed: string;
  /** Le nom de chaque société, en tête de sa carte. */
  readonly spaceLfc: string;
  readonly stateSubscribed: string;
  readonly statePending: string;
  readonly stateNotSubscribed: string;
  readonly stateUnsubscribed: string;
  readonly subscribe: string;
  readonly unsubscribe: string;
  readonly resubscribe: string;
  readonly partnersTitle: string;
  readonly partnersAccept: string;

  /** Le pied de page (C5). */
  readonly newsletterHead: string;
  readonly newsletterEmail: string;
  readonly newsletterSubmit: string;
  readonly newsletterSending: string;
  /** TOUJOURS la même réponse, quelle que soit l'adresse : pas d'oracle (règle 17). */
  readonly newsletterSent: string;
  readonly newsletterTooMany: string;
  readonly newsletterInvalid: string;
  readonly newsletterFailed: string;
  /** Le nom du champ piège — jamais lu : caché aux humains et aux lecteurs d'écran. */
  readonly newsletterTrap: string;
}

const FR: MarketingConsentCopy = {
  societyV1:
    'J’accepte de recevoir par e-mail les nouveautés et les offres de La Folie Coffee. Je peux me désinscrire à tout moment.',
  partnersV1:
    'J’accepte de recevoir par e-mail les nouveautés et les offres des autres sociétés du groupe La Folie Douce, à qui mon adresse sera transmise. Je peux me désinscrire à tout moment.',
  newsletterV1:
    'En vous inscrivant, vous acceptez de recevoir par e-mail les nouveautés et les offres de La Folie Coffee. Vous pourrez vous désinscrire à tout moment, depuis chaque e-mail.',
  privacyLink: 'Ce que nous faisons de votre adresse',
  preferencesTitle: 'Mes e-mails',
  preferencesSubtitle: 'Les nouveautés et les offres que vous acceptez de recevoir.',
  preferencesLoading: 'Lecture de vos préférences…',
  preferencesFailed: 'Vos préférences n’ont pas pu être lues.',
  preferencesRetry: 'Réessayer',
  preferencesWriteFailed: 'Le changement n’a pas été enregistré. Réessayez dans un instant.',
  spaceLfc: 'La Folie Coffee',
  stateSubscribed: 'Inscrit',
  statePending: 'En attente de confirmation — vérifiez votre boîte',
  stateNotSubscribed: 'Non inscrit',
  stateUnsubscribed: 'Désinscrit',
  subscribe: 'S’inscrire',
  unsubscribe: 'Se désinscrire',
  resubscribe: 'Se réinscrire',
  partnersTitle: 'Les autres sociétés du groupe',
  partnersAccept: 'Enregistrer',
  newsletterHead: 'Recevoir nos nouvelles',
  newsletterEmail: 'Votre adresse e-mail',
  newsletterSubmit: 'S’inscrire',
  newsletterSending: 'Envoi…',
  newsletterSent:
    'Si cette adresse peut recevoir nos nouvelles, un e-mail de confirmation vient de partir.',
  newsletterTooMany: 'Trop de tentatives, réessayez dans un moment.',
  newsletterInvalid: 'Cette adresse e-mail ne semble pas valide.',
  newsletterFailed: 'L’inscription n’est pas partie. Réessayez dans un instant.',
  newsletterTrap: 'Ne pas remplir ce champ',
};

const EN: MarketingConsentCopy = {
  societyV1:
    'I agree to receive news and offers from La Folie Coffee by e-mail. I can unsubscribe at any time.',
  partnersV1:
    'I agree to receive news and offers by e-mail from the other companies of the La Folie Douce group, to which my address will be passed on. I can unsubscribe at any time.',
  newsletterV1:
    'By signing up, you agree to receive news and offers from La Folie Coffee by e-mail. You can unsubscribe at any time, from any e-mail.',
  privacyLink: 'What we do with your address',
  preferencesTitle: 'My e-mails',
  preferencesSubtitle: 'The news and offers you agree to receive.',
  preferencesLoading: 'Reading your preferences…',
  preferencesFailed: 'Your preferences could not be read.',
  preferencesRetry: 'Try again',
  preferencesWriteFailed: 'The change was not saved. Please try again in a moment.',
  spaceLfc: 'La Folie Coffee',
  stateSubscribed: 'Subscribed',
  statePending: 'Awaiting confirmation — check your inbox',
  stateNotSubscribed: 'Not subscribed',
  stateUnsubscribed: 'Unsubscribed',
  subscribe: 'Subscribe',
  unsubscribe: 'Unsubscribe',
  resubscribe: 'Subscribe again',
  partnersTitle: 'The other companies of the group',
  partnersAccept: 'Save',
  newsletterHead: 'Get our news',
  newsletterEmail: 'Your e-mail address',
  newsletterSubmit: 'Subscribe',
  newsletterSending: 'Sending…',
  newsletterSent: 'If this address can receive our news, a confirmation e-mail has just been sent.',
  newsletterTooMany: 'Too many attempts, please try again in a moment.',
  newsletterInvalid: 'This e-mail address does not look valid.',
  newsletterFailed: 'The sign-up did not go through. Please try again in a moment.',
  newsletterTrap: 'Do not fill in this field',
};

const IT: MarketingConsentCopy = {
  societyV1:
    'Accetto di ricevere via e-mail le novità e le offerte di La Folie Coffee. Posso annullare l’iscrizione in qualsiasi momento.',
  partnersV1:
    'Accetto di ricevere via e-mail le novità e le offerte delle altre società del gruppo La Folie Douce, alle quali sarà trasmesso il mio indirizzo. Posso annullare l’iscrizione in qualsiasi momento.',
  newsletterV1:
    'Iscrivendovi, accettate di ricevere via e-mail le novità e le offerte di La Folie Coffee. Potrete annullare l’iscrizione in qualsiasi momento, da ogni e-mail.',
  privacyLink: 'Cosa facciamo del vostro indirizzo',
  preferencesTitle: 'Le mie e-mail',
  preferencesSubtitle: 'Le novità e le offerte che accettate di ricevere.',
  preferencesLoading: 'Lettura delle vostre preferenze…',
  preferencesFailed: 'Non è stato possibile leggere le vostre preferenze.',
  preferencesRetry: 'Riprova',
  preferencesWriteFailed: 'La modifica non è stata registrata. Riprovate tra un istante.',
  spaceLfc: 'La Folie Coffee',
  stateSubscribed: 'Iscritto',
  statePending: 'In attesa di conferma — controllate la vostra casella',
  stateNotSubscribed: 'Non iscritto',
  stateUnsubscribed: 'Iscrizione annullata',
  subscribe: 'Iscriviti',
  unsubscribe: 'Annulla l’iscrizione',
  resubscribe: 'Iscriviti di nuovo',
  partnersTitle: 'Le altre società del gruppo',
  partnersAccept: 'Salva',
  newsletterHead: 'Ricevere le nostre novità',
  newsletterEmail: 'Il vostro indirizzo e-mail',
  newsletterSubmit: 'Iscriviti',
  newsletterSending: 'Invio…',
  newsletterSent:
    'Se questo indirizzo può ricevere le nostre novità, è appena partita un’e-mail di conferma.',
  newsletterTooMany: 'Troppi tentativi, riprovate tra un momento.',
  newsletterInvalid: 'Questo indirizzo e-mail non sembra valido.',
  newsletterFailed: 'L’iscrizione non è partita. Riprovate tra un istante.',
  newsletterTrap: 'Non compilare questo campo',
};

const DICTIONARIES: Record<LocaleCode, MarketingConsentCopy> = { fr: FR, en: EN, it: IT };

/** Le dictionnaire de la langue choisie. */
export function marketingConsentCopy(locale: LocaleCode): MarketingConsentCopy {
  return DICTIONARIES[locale];
}
