import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit le dialogue « Nous écrire »** (`documentation/order/plan-nous-ecrire.md`, §2.2).
 *
 * Les OBJETS proposés ne sont pas ici : ils sont réglés au back-office, en trois
 * langues, et servis par `GET /contact-subjects`.
 */
export interface ContactDialogCopy {
  readonly title: string;
  readonly subtitle: string;
  readonly subject: string;
  readonly subjectPlaceholder: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly phoneHint: string;
  readonly optional: string;
  readonly message: string;
  /** `{max}` reçoit la borne du contrat. */
  readonly tooLong: string;
  readonly cancel: string;
  readonly send: string;
  readonly sending: string;
  /** L'annonce du succès, après quoi le dialogue se ferme. */
  readonly sent: string;
  /** Le repli d'un refus dont le serveur n'a pas dit la cause. */
  readonly refused: string;
  readonly loading: string;
  readonly loadFailed: string;
  readonly retry: string;
  readonly noSubjectTitle: string;
  readonly noSubjectSubtitle: string;
}

const FR: ContactDialogCopy = {
  title: 'Nous écrire',
  subtitle: 'On vous répond par e-mail, en général dans la journée.',
  subject: 'Objet',
  subjectPlaceholder: 'Choisir un objet',
  name: 'Votre nom',
  email: 'Votre e-mail',
  phone: 'Téléphone',
  phoneHint: 'Si vous préférez qu’on vous rappelle.',
  optional: 'facultatif',
  message: 'Votre message',
  tooLong: '{max} caractères au plus.',
  cancel: 'Annuler',
  send: 'Envoyer',
  sending: 'Envoi…',
  sent: 'Message envoyé',
  refused: 'Le message n’est pas parti. Réessayez dans un instant.',
  loading: 'Chargement des objets…',
  loadFailed: 'Les objets de message n’ont pas pu être lus.',
  retry: 'Réessayer',
  noSubjectTitle: 'Aucun objet proposé',
  noSubjectSubtitle: 'Appelez-nous : on décroche de 7 h à 19 h.',
};

const EN: ContactDialogCopy = {
  title: 'Write to us',
  subtitle: 'We answer by e-mail, usually the same day.',
  subject: 'Subject',
  subjectPlaceholder: 'Choose a subject',
  name: 'Your name',
  email: 'Your e-mail',
  phone: 'Phone',
  phoneHint: 'If you would rather we call you back.',
  optional: 'optional',
  message: 'Your message',
  tooLong: '{max} characters at most.',
  cancel: 'Cancel',
  send: 'Send',
  sending: 'Sending…',
  sent: 'Message sent',
  refused: 'The message was not sent. Please try again in a moment.',
  loading: 'Loading subjects…',
  loadFailed: 'The message subjects could not be loaded.',
  retry: 'Try again',
  noSubjectTitle: 'No subject available',
  noSubjectSubtitle: 'Give us a call: we pick up from 7 am to 7 pm.',
};

const IT: ContactDialogCopy = {
  title: 'Scriveteci',
  subtitle: 'Rispondiamo via e-mail, di solito in giornata.',
  subject: 'Oggetto',
  subjectPlaceholder: 'Scegliere un oggetto',
  name: 'Il vostro nome',
  email: 'La vostra e-mail',
  phone: 'Telefono',
  phoneHint: 'Se preferite essere richiamati.',
  optional: 'facoltativo',
  message: 'Il vostro messaggio',
  tooLong: '{max} caratteri al massimo.',
  cancel: 'Annulla',
  send: 'Invia',
  sending: 'Invio…',
  sent: 'Messaggio inviato',
  refused: 'Il messaggio non è partito. Riprovate tra un istante.',
  loading: 'Caricamento degli oggetti…',
  loadFailed: 'Non è stato possibile leggere gli oggetti del messaggio.',
  retry: 'Riprova',
  noSubjectTitle: 'Nessun oggetto proposto',
  noSubjectSubtitle: 'Chiamateci: rispondiamo dalle 7 alle 19.',
};

const DICTIONARIES: Record<LocaleCode, ContactDialogCopy> = { fr: FR, en: EN, it: IT };

/** Le dictionnaire de la langue choisie. */
export function contactDialogCopy(locale: LocaleCode): ContactDialogCopy {
  return DICTIONARIES[locale];
}
