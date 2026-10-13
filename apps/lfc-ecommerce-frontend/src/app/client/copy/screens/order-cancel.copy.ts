import type {
  CustomerCancellationReasonCode,
  CustomerCancellationRefusal,
} from '@lfd/contracts/shop-values';

import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit l'annulation d'une commande par le client** — le tiroir de
 * « Mes commandes » et la page invité `/annuler` (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.7,
 * C6.8).
 *
 * Les refus se disent d'après le CODE (`orders.customer_cancel.<code>`) : le
 * serveur porte aussi une phrase, qui ne sert que de repli à un code que cette
 * liste ne connaîtrait pas encore.
 */
export interface OrderCancelCopy {
  /** Le bouton du tiroir. */
  readonly action: string;
  readonly title: string;
  /** `{reference}` reçoit le numéro de la commande. */
  readonly subtitle: string;
  readonly moneyNothing: string;
  /** `{amount}` reçoit le montant remboursé, mis en forme. */
  readonly moneyRefund: string;
  readonly moneyAccount: string;
  readonly voucherBack: string;
  /** `{when}` reçoit l'échéance (cf. `when`). */
  readonly until: string;
  /** La ligne discrète d'un « trop tard » — `{when}` comme ci-dessus. */
  readonly untilPassed: string;
  /** `{day}` et `{time}` : « 14/10 à 09:00 ». */
  readonly when: string;
  readonly reasonLabel: string;
  readonly reasonPlaceholder: string;
  readonly reasons: Readonly<Record<CustomerCancellationReasonCode, string>>;
  readonly reasonText: string;
  readonly reasonTextPlaceholder: string;
  readonly confirm: string;
  readonly confirming: string;
  readonly keep: string;
  /** L'annonce et le bandeau après succès. */
  readonly done: string;
  readonly doneSubtitle: string;
  readonly contact: string;
  /** `{when}` n'est rempli que pour `too_late`. */
  readonly refusals: Readonly<Record<CustomerCancellationRefusal, string>>;
  /** Le « trop tard » d'une commande sans date : aucune échéance à dire. */
  readonly tooLateUndated: string;
  readonly refusedFallback: string;
  readonly loading: string;
  readonly loadFailed: string;
  readonly retry: string;
  readonly guestTitle: string;
  /** `{name}` reçoit le prénom. */
  readonly guestGreeting: string;
  readonly guestLead: string;
  readonly guestLinesHead: string;
  readonly guestTotal: string;
  readonly guestDay: string;
  /** `{place}` reçoit le nom du point de retrait. */
  readonly guestPickup: string;
  /** `{city}` reçoit la ville. */
  readonly guestDelivery: string;
  readonly guestPickupNoPlace: string;
  readonly guestDeliveryNoCity: string;
  readonly linkNotFoundTitle: string;
  readonly linkNotFoundSubtitle: string;
}

const FR: OrderCancelCopy = {
  action: 'Annuler la commande',
  title: 'Annuler ma commande',
  subtitle: 'Commande {reference}',
  moneyNothing: 'Rien n’a été prélevé : rien ne le sera.',
  moneyRefund: 'Vous serez remboursé de {amount} sur votre carte.',
  moneyAccount: 'Rien ne sera facturé ni prélevé.',
  voucherBack: 'Votre bon de fidélité vous sera rendu.',
  until: 'Annulation possible jusqu’au {when}.',
  untilPassed: 'L’annulation en ligne était possible jusqu’au {when}.',
  when: '{day} à {time}',
  reasonLabel: 'Pourquoi annulez-vous ?',
  reasonPlaceholder: 'Choisir un motif',
  reasons: {
    no_longer_needed: 'Je n’en ai plus besoin',
    wrong_date: 'Je me suis trompé de date',
    wrong_products: 'Je me suis trompé de produits',
    other: 'Autre',
  },
  reasonText: 'Précisez',
  reasonTextPlaceholder: 'En quelques mots',
  confirm: 'Annuler ma commande',
  confirming: 'Annulation…',
  keep: 'Garder ma commande',
  done: 'Commande annulée',
  doneSubtitle: 'Un e-mail de confirmation vous a été envoyé.',
  contact: 'Contacter la boutique',
  refusals: {
    already_cancelled: 'Cette commande est déjà annulée.',
    in_preparation:
      'Votre commande est déjà en préparation : elle ne peut plus être annulée. Contactez-nous si besoin.',
    ready: 'Votre commande est prête : elle ne peut plus être annulée.',
    fulfilled: 'Votre commande a déjà été retirée : elle ne peut plus être annulée.',
    too_late:
      'Il est trop tard pour annuler en ligne : c’était possible jusqu’au {when}. Contactez-nous.',
    payment_in_progress:
      'Un paiement est en cours sur cette commande. Réessayez dans quelques minutes.',
    paid_just_now:
      'Votre paiement vient d’aboutir. Rechargez la page pour annuler avec remboursement.',
    not_recorded:
      'Nous n’avons pas pu annuler votre commande. Rien n’a été prélevé de plus ; réessayez dans un instant.',
    invoiced: 'Cette commande est déjà facturée : elle ne s’annule plus en ligne. Contactez-nous.',
    voucher_reused:
      'Le bon utilisé sur cette commande a déjà resservi : contactez-nous pour l’annuler.',
    account_required: 'Connectez-vous pour gérer cette commande.',
    account_disabled: 'Contactez la boutique pour gérer cette commande.',
    not_allowed: 'Cette commande ne peut pas être annulée depuis votre compte.',
  },
  tooLateUndated: 'Il est trop tard pour annuler en ligne. Contactez-nous.',
  refusedFallback: 'La commande n’a pas pu être annulée. Réessayez dans un instant.',
  loading: 'Chargement de la commande…',
  loadFailed: 'La commande n’a pas pu être lue.',
  retry: 'Réessayer',
  guestTitle: 'Votre commande',
  guestGreeting: 'Bonjour {name},',
  guestLead: 'Voici votre commande. Vous pouvez l’annuler ici si elle ne vous sert plus.',
  guestLinesHead: 'Articles',
  guestTotal: 'Total',
  guestDay: 'Jour',
  guestPickup: 'Retrait · {place}',
  guestDelivery: 'Livraison · {city}',
  guestPickupNoPlace: 'Retrait',
  guestDeliveryNoCity: 'Livraison',
  linkNotFoundTitle: 'Ce lien est introuvable ou trop ancien',
  linkNotFoundSubtitle: 'Contactez la boutique pour toute question sur votre commande.',
};

const EN: OrderCancelCopy = {
  action: 'Cancel the order',
  title: 'Cancel my order',
  subtitle: 'Order {reference}',
  moneyNothing: 'Nothing has been charged, and nothing will be.',
  moneyRefund: 'You will be refunded {amount} on your card.',
  moneyAccount: 'Nothing will be invoiced or charged.',
  voucherBack: 'Your loyalty voucher will be returned to you.',
  until: 'You can cancel until {when}.',
  untilPassed: 'Online cancellation was possible until {when}.',
  when: '{day} at {time}',
  reasonLabel: 'Why are you cancelling?',
  reasonPlaceholder: 'Choose a reason',
  reasons: {
    no_longer_needed: 'I no longer need it',
    wrong_date: 'I picked the wrong date',
    wrong_products: 'I picked the wrong products',
    other: 'Other',
  },
  reasonText: 'Tell us more',
  reasonTextPlaceholder: 'In a few words',
  confirm: 'Cancel my order',
  confirming: 'Cancelling…',
  keep: 'Keep my order',
  done: 'Order cancelled',
  doneSubtitle: 'A confirmation e-mail has been sent to you.',
  contact: 'Contact the shop',
  refusals: {
    already_cancelled: 'This order is already cancelled.',
    in_preparation:
      'Your order is already being prepared: it can no longer be cancelled. Contact us if needed.',
    ready: 'Your order is ready: it can no longer be cancelled.',
    fulfilled: 'Your order has already been collected: it can no longer be cancelled.',
    too_late: 'It is too late to cancel online: it was possible until {when}. Contact us.',
    payment_in_progress: 'A payment is in progress on this order. Try again in a few minutes.',
    paid_just_now: 'Your payment has just gone through. Reload the page to cancel with a refund.',
    not_recorded:
      'We could not cancel your order. Nothing more has been charged; try again in a moment.',
    invoiced:
      'This order has already been invoiced: it can no longer be cancelled online. Contact us.',
    voucher_reused:
      'The voucher used on this order has already been used again: contact us to cancel it.',
    account_required: 'Sign in to manage this order.',
    account_disabled: 'Contact the shop to manage this order.',
    not_allowed: 'This order cannot be cancelled from your account.',
  },
  tooLateUndated: 'It is too late to cancel online. Contact us.',
  refusedFallback: 'The order could not be cancelled. Try again in a moment.',
  loading: 'Loading the order…',
  loadFailed: 'The order could not be loaded.',
  retry: 'Try again',
  guestTitle: 'Your order',
  guestGreeting: 'Hello {name},',
  guestLead: 'Here is your order. You can cancel it here if you no longer need it.',
  guestLinesHead: 'Items',
  guestTotal: 'Total',
  guestDay: 'Day',
  guestPickup: 'Pickup · {place}',
  guestDelivery: 'Delivery · {city}',
  guestPickupNoPlace: 'Pickup',
  guestDeliveryNoCity: 'Delivery',
  linkNotFoundTitle: 'This link cannot be found or is too old',
  linkNotFoundSubtitle: 'Contact the shop for any question about your order.',
};

const IT: OrderCancelCopy = {
  action: 'Annulla l’ordine',
  title: 'Annulla il mio ordine',
  subtitle: 'Ordine {reference}',
  moneyNothing: 'Non è stato addebitato nulla, e nulla lo sarà.',
  moneyRefund: 'Riceverete un rimborso di {amount} sulla vostra carta.',
  moneyAccount: 'Nulla sarà fatturato né addebitato.',
  voucherBack: 'Il vostro buono fedeltà vi sarà restituito.',
  until: 'Annullamento possibile fino al {when}.',
  untilPassed: 'L’annullamento online era possibile fino al {when}.',
  when: '{day} alle {time}',
  reasonLabel: 'Perché annullate?',
  reasonPlaceholder: 'Scegliete un motivo',
  reasons: {
    no_longer_needed: 'Non mi serve più',
    wrong_date: 'Ho sbagliato data',
    wrong_products: 'Ho sbagliato prodotti',
    other: 'Altro',
  },
  reasonText: 'Precisate',
  reasonTextPlaceholder: 'In poche parole',
  confirm: 'Annulla il mio ordine',
  confirming: 'Annullamento…',
  keep: 'Tengo l’ordine',
  done: 'Ordine annullato',
  doneSubtitle: 'Vi abbiamo inviato un’e-mail di conferma.',
  contact: 'Contattare il negozio',
  refusals: {
    already_cancelled: 'Questo ordine è già annullato.',
    in_preparation:
      'Il vostro ordine è già in preparazione: non può più essere annullato. Contattateci se necessario.',
    ready: 'Il vostro ordine è pronto: non può più essere annullato.',
    fulfilled: 'Il vostro ordine è già stato ritirato: non può più essere annullato.',
    too_late: 'È troppo tardi per annullare online: era possibile fino al {when}. Contattateci.',
    payment_in_progress: 'Un pagamento è in corso su questo ordine. Riprovate tra qualche minuto.',
    paid_just_now:
      'Il vostro pagamento è appena andato a buon fine. Ricaricate la pagina per annullare con rimborso.',
    not_recorded:
      'Non siamo riusciti ad annullare il vostro ordine. Non è stato addebitato altro; riprovate tra un istante.',
    invoiced: 'Questo ordine è già fatturato: non si annulla più online. Contattateci.',
    voucher_reused:
      'Il buono usato su questo ordine è già stato riutilizzato: contattateci per annullarlo.',
    account_required: 'Accedete per gestire questo ordine.',
    account_disabled: 'Contattate il negozio per gestire questo ordine.',
    not_allowed: 'Questo ordine non può essere annullato dal vostro account.',
  },
  tooLateUndated: 'È troppo tardi per annullare online. Contattateci.',
  refusedFallback: 'L’ordine non ha potuto essere annullato. Riprovate tra un istante.',
  loading: 'Caricamento dell’ordine…',
  loadFailed: 'Non è stato possibile leggere l’ordine.',
  retry: 'Riprova',
  guestTitle: 'Il vostro ordine',
  guestGreeting: 'Buongiorno {name},',
  guestLead: 'Ecco il vostro ordine. Potete annullarlo qui se non vi serve più.',
  guestLinesHead: 'Articoli',
  guestTotal: 'Totale',
  guestDay: 'Giorno',
  guestPickup: 'Ritiro · {place}',
  guestDelivery: 'Consegna · {city}',
  guestPickupNoPlace: 'Ritiro',
  guestDeliveryNoCity: 'Consegna',
  linkNotFoundTitle: 'Questo link è introvabile o troppo vecchio',
  linkNotFoundSubtitle: 'Contattate il negozio per qualsiasi domanda sul vostro ordine.',
};

const DICTIONARIES: Record<LocaleCode, OrderCancelCopy> = { fr: FR, en: EN, it: IT };

/** Le dictionnaire de la langue choisie. */
export function orderCancelCopy(locale: LocaleCode): OrderCancelCopy {
  return DICTIONARIES[locale];
}
