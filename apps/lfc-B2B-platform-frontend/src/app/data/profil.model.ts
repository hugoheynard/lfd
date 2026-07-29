/**
 * Profil du client professionnel — le compte d'un établissement qui commande à
 * La Folie Coffee. Aucun champ n'est `?` optionnel : les valeurs absentes sont
 * la chaîne vide (`''`) ou `null` pour le représentant. C'est un choix
 * volontaire — sous `exactOptionalPropertyTypes` un `?` interdit d'écrire
 * `undefined` explicitement, ce qui alourdit chaque formulaire ; une chaîne vide
 * se teste (`[empty]="!value"`) et se réécrit sans cérémonie.
 */

/** Conditions de paiement accordées au client (échéance de règlement). */
export type PaymentTerm = 'per_order' | 'monthly' | 'net60' | 'net90';

/** Libellés lisibles, dans l'ordre d'affichage du sélecteur. */
export const PAYMENT_TERMS: readonly { readonly value: PaymentTerm; readonly label: string }[] = [
  { value: 'per_order', label: 'À la commande' },
  { value: 'monthly', label: 'Mensuel — relevé de fin de mois' },
  { value: 'net60', label: 'À 60 jours' },
  { value: 'net90', label: 'À 90 jours' },
];

/** Résout le libellé d'une condition de paiement (fallback = la valeur brute). */
export function paymentTermLabel(term: PaymentTerm): string {
  return PAYMENT_TERMS.find((t) => t.value === term)?.label ?? term;
}

/** Identité légale de l'établissement. */
export interface Etablissement {
  /** Raison sociale (dénomination légale). */
  readonly raisonSociale: string;
  /** Enseigne / nom commercial si différent — `''` si identique. */
  readonly enseigne: string;
  /** Forme juridique : SAS, SARL, EI… */
  readonly formeJuridique: string;
  readonly siret: string;
  /** N° de TVA intracommunautaire — `''` si non assujetti / inconnu. */
  readonly tvaIntracom: string;
}

/** Un interlocuteur — contact principal ou représentant. */
export interface Contact {
  readonly prenom: string;
  readonly nom: string;
  /** Fonction dans l'entreprise — `''` si non renseignée. */
  readonly fonction: string;
  readonly email: string;
  /** Téléphone — `''` si non renseigné. */
  readonly telephone: string;
}

/** À quoi sert une adresse. */
export type AdresseKind = 'facturation' | 'livraison';

/** Une adresse postale (facturation ou point de livraison). */
export interface Adresse {
  readonly id: string;
  /** Nom d'usage : « Siège », « Boutique Bastille »… */
  readonly label: string;
  readonly ligne1: string;
  /** Complément — `''` si aucun. */
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  /** Livraison par défaut. Une seule adresse de livraison porte `true`. */
  readonly isDefaut: boolean;
}

/** Le profil complet d'un client pro. */
export interface ClientProfile {
  readonly etablissement: Etablissement;
  /** Contact professionnel principal (le compte). */
  readonly contact: Contact;
  /**
   * Représentant optionnel — p. ex. le gestionnaire de commande interne à
   * l'entreprise, distinct du contact du compte. `null` si non renseigné.
   */
  readonly representant: Contact | null;
  readonly adresseFacturation: Adresse;
  readonly adressesLivraison: readonly Adresse[];
  readonly paymentTerm: PaymentTerm;
}

/** Un contact vierge (préremplissage d'un nouveau représentant). */
export const EMPTY_CONTACT: Contact = {
  prenom: '',
  nom: '',
  fonction: '',
  email: '',
  telephone: '',
};
