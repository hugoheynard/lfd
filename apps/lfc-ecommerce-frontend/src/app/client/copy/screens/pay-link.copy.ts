import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit la page publique d'un lien de paiement** — `/payer/:jeton`
 * (doc `documentation/payment/les-liens-de-paiement.md`).
 * Elle s'adresse à quelqu'un qui n'a pas de compte : le comptable d'un
 * client, le plus souvent.
 */
export interface PayLinkCopy {
  /** Le titre de la page, dans le bandeau. */
  readonly title: string;
  readonly loading: string;
  /** Un jeton inconnu ou révoqué : la même réponse, sans dire pourquoi. */
  readonly notFoundTitle: string;
  readonly notFoundSubtitle: string;
  readonly settledTitle: string;
  readonly settledSubtitle: string;
  readonly cancelledTitle: string;
  readonly cancelledSubtitle: string;
  /** Le prestataire ne reprend plus ce paiement : le lien est à refaire. */
  readonly renewTitle: string;
  readonly renewSubtitle: string;
  /** Une panne — jamais présentée comme un lien mort. */
  readonly unavailableTitle: string;
  readonly unavailableSubtitle: string;
  readonly retry: string;
  readonly amount: string;
  readonly payee: string;
  readonly payer: string;
  readonly reference: string;
  readonly dueOn: string;
  /** `{amount}` reçoit le montant mis en forme. */
  readonly submit: string;
  readonly submitting: string;
  /** Le repli d'un refus que le prestataire n'explique pas. */
  readonly refused: string;
  readonly unfinished: string;
  readonly paidTitle: string;
  readonly paidSubtitle: string;
}

const FR: PayLinkCopy = {
  title: 'Régler par carte',
  loading: 'Chargement du paiement…',
  notFoundTitle: 'Ce lien n’est pas ou plus valable',
  notFoundSubtitle: 'Vérifiez l’adresse reçue, ou demandez un nouveau lien à votre interlocuteur.',
  settledTitle: 'Ce paiement est déjà réglé',
  settledSubtitle: 'Il n’y a plus rien à payer avec ce lien.',
  cancelledTitle: 'Ce paiement a été annulé',
  cancelledSubtitle: 'Il n’y a plus rien à payer avec ce lien.',
  renewTitle: 'Ce lien doit être renouvelé',
  renewSubtitle: 'Demandez un nouveau lien de paiement à votre interlocuteur.',
  unavailableTitle: 'Le paiement est momentanément indisponible',
  unavailableSubtitle: 'Votre lien reste valable. Réessayez dans un instant.',
  retry: 'Réessayer',
  amount: 'Montant',
  payee: 'Bénéficiaire',
  payer: 'Payeur',
  reference: 'Référence',
  dueOn: 'Échéance',
  submit: 'Payer {amount}',
  submitting: 'Paiement en cours…',
  refused: 'Le paiement a été refusé. Vérifiez votre carte ou essayez-en une autre.',
  unfinished: 'Le paiement n’a pas abouti. Vous pouvez réessayer.',
  paidTitle: 'Paiement reçu',
  paidSubtitle: 'Merci. Une confirmation vous parviendra une fois le paiement enregistré.',
};

const EN: PayLinkCopy = {
  title: 'Pay by card',
  loading: 'Loading the payment…',
  notFoundTitle: 'This link is not or no longer valid',
  notFoundSubtitle: 'Check the address you received, or ask your contact for a new link.',
  settledTitle: 'This payment has already been made',
  settledSubtitle: 'There is nothing left to pay with this link.',
  cancelledTitle: 'This payment has been cancelled',
  cancelledSubtitle: 'There is nothing left to pay with this link.',
  renewTitle: 'This link needs to be renewed',
  renewSubtitle: 'Ask your contact for a new payment link.',
  unavailableTitle: 'Payment is temporarily unavailable',
  unavailableSubtitle: 'Your link is still valid. Please try again in a moment.',
  retry: 'Try again',
  amount: 'Amount',
  payee: 'Payee',
  payer: 'Payer',
  reference: 'Reference',
  dueOn: 'Due date',
  submit: 'Pay {amount}',
  submitting: 'Payment in progress…',
  refused: 'The payment was declined. Check your card or try another one.',
  unfinished: 'The payment did not go through. You can try again.',
  paidTitle: 'Payment received',
  paidSubtitle: 'Thank you. A confirmation will follow once the payment is recorded.',
};

const IT: PayLinkCopy = {
  title: 'Pagare con carta',
  loading: 'Caricamento del pagamento…',
  notFoundTitle: 'Questo link non è o non è più valido',
  notFoundSubtitle:
    'Verificate l’indirizzo ricevuto, o chiedete un nuovo link al vostro referente.',
  settledTitle: 'Questo pagamento è già stato saldato',
  settledSubtitle: 'Non c’è più nulla da pagare con questo link.',
  cancelledTitle: 'Questo pagamento è stato annullato',
  cancelledSubtitle: 'Non c’è più nulla da pagare con questo link.',
  renewTitle: 'Questo link deve essere rinnovato',
  renewSubtitle: 'Chiedete un nuovo link di pagamento al vostro referente.',
  unavailableTitle: 'Il pagamento è momentaneamente non disponibile',
  unavailableSubtitle: 'Il vostro link resta valido. Riprovate tra un istante.',
  retry: 'Riprova',
  amount: 'Importo',
  payee: 'Beneficiario',
  payer: 'Pagatore',
  reference: 'Riferimento',
  dueOn: 'Scadenza',
  submit: 'Paga {amount}',
  submitting: 'Pagamento in corso…',
  refused: 'Il pagamento è stato rifiutato. Verificate la carta o provatene un’altra.',
  unfinished: 'Il pagamento non è andato a buon fine. Potete riprovare.',
  paidTitle: 'Pagamento ricevuto',
  paidSubtitle: 'Grazie. Una conferma seguirà una volta registrato il pagamento.',
};

const DICTIONARIES: Record<LocaleCode, PayLinkCopy> = { fr: FR, en: EN, it: IT };

/** Les textes de la page d'un lien de paiement, dans la langue choisie. */
export function payLinkCopy(locale: LocaleCode): PayLinkCopy {
  return DICTIONARIES[locale];
}
