import type { LocaleCode } from '../../client-locale.service';

/**
 * **Ce que dit la porte du coursier** — « On livre où ? », ouverte depuis
 * l'accueil pro.
 *
 * 🔴 CE DIALOGUE N'A QU'UN VOLET, et c'est une correction, pas une amputation.
 * Celui de `/nouvelle-commande` en a deux : l'adresse, puis une grille d'heures
 * de livraison. Cette grille est **décorative** — `requestedWindow` ne part
 * qu'en RETRAIT, et ses heures viennent de `DELIVERY_SLOTS`, qui dit lui-même
 * n'affirmer rien de vrai. La supprimer ne retire rien de la commande.
 *
 * ⚠️ Pas de saisie d'adresse libre non plus : cette porte est celle d'un PRO,
 * dont le carnet appartient à sa société et se tient dans « Mon compte ». Un
 * champ libre y créerait une adresse que personne ne retrouverait au bon de
 * livraison suivant.
 */
export interface DeliveryAddressCopy {
  readonly kicker: string;
  readonly title: string;
  readonly lead: string;

  /** Sur l'adresse que le carnet marque par défaut. */
  readonly defaultTag: string;

  /**
   * `{fee}` — le tarif de la zone, dans sa FORME : un montant, ou un
   * pourcentage du panier. L'écran ne convertit pas l'un en l'autre : il ne
   * connaît pas le panier au moment où il l'affiche.
   */
  readonly fee: string;
  /** Une adresse dont le code postal ne tombe dans aucune zone servie. */
  readonly outOfZone: string;
  /**
   * `{window}` — la fenêtre que le CARNET déclare pour cette adresse.
   *
   * 🔴 La seule heure de livraison qui ait une source. Elle DISPARAÎT quand
   * l'adresse n'en déclare aucune : une adresse sans créneau se livre dans la
   * tournée, et annoncer une heure serait la promesse qu'on refuse d'écrire.
   *
   * ⚠️ Elle est ce que le carnet PROMET, pas ce qui sera exécuté :
   * `deliveryAddressId` ne part pas encore avec la commande (cf. le composant).
   */
  readonly window: string;

  /** Carnet vide : on le dit, et on dit où il se remplit. */
  readonly empty: {
    readonly title: string;
    readonly subtitle: string;
  };

  /**
   * **La saisie LIBRE** — pour qui n'a pas de carnet (Hugo, 2026-09-21 : « le
   * visiteur doit pouvoir taper son adresse »).
   *
   * 🔴 Elle ne s'ouvre qu'à qui n'a PAS de société. Un pro qui taperait une
   * adresse ici créerait une livraison que son carnet ne retrouverait pas au
   * bon de livraison suivant — c'est la raison qui fermait cette porte, et elle
   * reste vraie pour lui.
   *
   * ⚠️ Rien n'est ENREGISTRÉ : ces champs servent cette commande-là. Le
   * visiteur n'a pas de compte où ranger une adresse.
   */
  readonly free: {
    readonly title: string;
    readonly lead: string;
    readonly ligne1: string;
    readonly ligne1Placeholder: string;
    readonly ligne2: string;
    readonly ligne2Placeholder: string;
    readonly codePostal: string;
    readonly codePostalPlaceholder: string;
    readonly ville: string;
    readonly villePlaceholder: string;
    /** Le code postal ne tombe dans aucune zone — dit sous le champ. */
    readonly noZone: string;
  };

  /** `{fee}` — le tarif de la zone retenue. L'action PORTE le montant. */
  readonly cta: string;
  readonly ctaIdle: string;
  readonly close: string;
}

export const DELIVERY_ADDRESS_FR: DeliveryAddressCopy = {
  kicker: 'Coursier · étape 1 sur 2',
  title: 'On livre où ?',
  lead: 'Les frais de coursier dépendent de la zone, jamais du contenu du panier — vous les voyez avant de composer.',
  defaultTag: 'Par défaut',
  fee: 'Frais · {fee} €',
  outOfZone: 'Hors zone — le retrait, lui, reste ouvert.',
  window: 'Livrée {window}',
  empty: {
    title: 'Aucune adresse au carnet',
    subtitle: 'Les adresses de livraison se règlent dans « Mon compte ».',
  },
  free: {
    title: 'Votre adresse',
    lead: 'Elle sert à cette commande. Les frais dépendent de la zone, jamais du contenu du panier.',
    ligne1: 'Adresse',
    ligne1Placeholder: 'Numéro et rue',
    ligne2: 'Complément',
    ligne2Placeholder: 'Bâtiment, étage, digicode',
    codePostal: 'Code postal',
    codePostalPlaceholder: '73150',
    ville: 'Ville',
    villePlaceholder: 'Val d’Isère',
    noZone: 'Nous ne livrons pas encore ce code postal — le retrait, lui, reste ouvert.',
  },
  cta: 'Composer mon panier · {fee} €',
  ctaIdle: 'Choisissez une adresse',
  close: 'Fermer',
};

export const DELIVERY_ADDRESS_EN: DeliveryAddressCopy = {
  kicker: 'Courier · step 1 of 2',
  title: 'Where do we deliver?',
  lead: 'Courier fees depend on the zone, never on what is in the basket — you see them before you shop.',
  defaultTag: 'Default',
  fee: 'Fee · {fee} €',
  outOfZone: 'Out of zone — pickup is still open.',
  window: 'Delivered {window}',
  empty: {
    title: 'No address in the book',
    subtitle: 'Delivery addresses are managed in “My account”.',
  },
  free: {
    title: 'Your address',
    lead: 'It is used for this order. Fees depend on the zone, never on what is in the basket.',
    ligne1: 'Address',
    ligne1Placeholder: 'Number and street',
    ligne2: 'Extra details',
    ligne2Placeholder: 'Building, floor, door code',
    codePostal: 'Postcode',
    codePostalPlaceholder: '73150',
    ville: 'Town',
    villePlaceholder: 'Val d’Isère',
    noZone: 'We do not deliver to this postcode yet — pickup is still open.',
  },
  cta: 'Fill my basket · {fee} €',
  ctaIdle: 'Pick an address',
  close: 'Close',
};

export const DELIVERY_ADDRESS_IT: DeliveryAddressCopy = {
  kicker: 'Corriere · passo 1 di 2',
  title: 'Dove consegniamo ?',
  lead: 'Le spese del corriere dipendono dalla zona, mai dal contenuto del carrello — le vedete prima di comporre.',
  defaultTag: 'Predefinito',
  fee: 'Spese · {fee} €',
  outOfZone: 'Fuori zona — il ritiro resta aperto.',
  window: 'Consegnata {window}',
  empty: {
    title: 'Nessun indirizzo in rubrica',
    subtitle: 'Gli indirizzi di consegna si impostano in « Il mio account ».',
  },
  free: {
    title: 'Il vostro indirizzo',
    lead: 'Serve per questo ordine. Le spese dipendono dalla zona, mai dal contenuto del carrello.',
    ligne1: 'Indirizzo',
    ligne1Placeholder: 'Numero e via',
    ligne2: 'Dettagli',
    ligne2Placeholder: 'Edificio, piano, codice',
    codePostal: 'CAP',
    codePostalPlaceholder: '73150',
    ville: 'Città',
    villePlaceholder: 'Val d’Isère',
    noZone: 'Non consegniamo ancora a questo CAP — il ritiro resta aperto.',
  },
  cta: 'Comporre il carrello · {fee} €',
  ctaIdle: 'Scegliete un indirizzo',
  close: 'Chiudi',
};

const DICTIONARIES: Readonly<Record<LocaleCode, DeliveryAddressCopy>> = {
  fr: DELIVERY_ADDRESS_FR,
  en: DELIVERY_ADDRESS_EN,
  it: DELIVERY_ADDRESS_IT,
};

/** Le dictionnaire de la langue choisie. */
export function deliveryAddressCopy(locale: LocaleCode): DeliveryAddressCopy {
  return DICTIONARIES[locale];
}
