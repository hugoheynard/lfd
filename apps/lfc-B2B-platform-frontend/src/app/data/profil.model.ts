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

/** Un jour de la semaine (clé stable, indépendante de la langue d'affichage). */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Jours ouvrés dans l'ordre d'affichage, avec libellés long et court. */
export const WEEKDAYS: readonly { readonly value: Weekday; readonly label: string; readonly short: string }[] = [
  { value: 'mon', label: 'Lundi', short: 'Lun' },
  { value: 'tue', label: 'Mardi', short: 'Mar' },
  { value: 'wed', label: 'Mercredi', short: 'Mer' },
  { value: 'thu', label: 'Jeudi', short: 'Jeu' },
  { value: 'fri', label: 'Vendredi', short: 'Ven' },
  { value: 'sat', label: 'Samedi', short: 'Sam' },
  { value: 'sun', label: 'Dimanche', short: 'Dim' },
];

/** Un créneau horaire préféré : plage `début`→`fin` au format `'HH:mm'`. */
export interface DeliverySlot {
  readonly start: string;
  readonly end: string;
}

/** Créneau (ou aucun, `null`) pour chacun des sept jours. */
export type SlotByDay = Readonly<Record<Weekday, DeliverySlot | null>>;

/**
 * Créneaux préférés de livraison. Deux régimes exclusifs :
 * - `everyday` — un créneau unique appliqué tous les jours (l'option « global » ),
 * - `perDay` — un créneau, optionnel, par jour ouvré.
 * `null` (créneau ou jour) = aucune préférence, le transporteur choisit.
 */
export type DeliverySlots =
  | { readonly mode: 'everyday'; readonly slot: DeliverySlot | null }
  | { readonly mode: 'perDay'; readonly byDay: SlotByDay };

/**
 * Contact sur place pour la livraison — la personne que le livreur appelle. Un
 * sous-ensemble d'un `Contact` (ni e-mail ni fonction). `null` = pas de contact
 * dédié, choix qui doit rester **explicite** (case à cocher côté formulaire).
 */
export interface DeliveryContact {
  readonly prenom: string;
  readonly nom: string;
  readonly telephone: string;
}

/**
 * Un point GPS pour les lieux **mal géocodés** (cour, zone artisanale, entrée de
 * service sans numéro). `lat`/`lng` en degrés décimaux.
 */
export interface GpsPoint {
  readonly lat: number;
  readonly lng: number;
}

/**
 * Ce qu'une adresse **de livraison** ajoute à une adresse postale : une note pour
 * les livreurs, les créneaux préférés, le contact sur place et un point GPS
 * optionnel. Isolé de `Adresse` pour que seule une livraison le porte.
 */
export interface DeliverySpecs {
  /** Consignes libres pour le livreur (code, étage, dépôt) — `''` si aucune. */
  readonly note: string;
  readonly slots: DeliverySlots;
  /** Personne à contacter à la livraison, ou `null` (aucun contact dédié). */
  readonly deliveryContact: DeliveryContact | null;
  /** Point GPS pour un lieu difficile à localiser, ou `null`. */
  readonly gps: GpsPoint | null;
}

/** Une adresse de livraison = une adresse postale enrichie de ses consignes. */
export type AdresseLivraison = Adresse & DeliverySpecs;

/** Aucun créneau, pour les sept jours. */
export const EMPTY_SLOT_BY_DAY: SlotByDay = {
  mon: null,
  tue: null,
  wed: null,
  thu: null,
  fri: null,
  sat: null,
  sun: null,
};

/** Consignes vierges (nouvelle adresse de livraison). */
export const EMPTY_DELIVERY_SPECS: DeliverySpecs = {
  note: '',
  slots: { mode: 'everyday', slot: null },
  deliveryContact: null,
  gps: null,
};

/** Nom complet d'un contact de livraison, espaces superflus retirés. */
export function formatDeliveryContact(contact: DeliveryContact): string {
  return `${contact.prenom} ${contact.nom}`.trim();
}

/** Point GPS lisible : `48.8566, 2.3522`. */
export function formatGps(gps: GpsPoint): string {
  return `${gps.lat}, ${gps.lng}`;
}

/** Lien vers une carte externe centrée sur le point (ouverture nouvel onglet). */
export function gpsMapUrl(gps: GpsPoint): string {
  return `https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lng}#map=18/${gps.lat}/${gps.lng}`;
}

/** Rend un créneau lisible : `08:00–10:00`. */
export function formatSlot(slot: DeliverySlot): string {
  return `${slot.start}–${slot.end}`;
}

/**
 * Une adresse est **commandable** dès qu'elle porte au moins un créneau : le
 * créneau global (régime `everyday`) ou un jour renseigné (régime `perDay`).
 * Sans créneau, on ne sait pas quand livrer — l'adresse est inutilisable.
 */
export function hasDeliverySlot(slots: DeliverySlots): boolean {
  if (slots.mode === 'everyday') {
    return slots.slot !== null;
  }
  return WEEKDAYS.some((d) => slots.byDay[d.value] !== null);
}

/** Une ligne de la vue hebdomadaire : un jour et son créneau (ou aucun). */
export interface WeeklySlotRow {
  readonly short: string;
  readonly label: string;
  readonly slot: DeliverySlot | null;
}

/**
 * Déplie les créneaux en sept lignes pour la **visualisation** d'une carte. En
 * régime `everyday`, chaque jour porte le même créneau ; en `perDay`, le sien.
 */
export function weeklySlots(slots: DeliverySlots): readonly WeeklySlotRow[] {
  return WEEKDAYS.map((d) => ({
    short: d.short,
    label: d.label,
    slot: slots.mode === 'everyday' ? slots.slot : slots.byDay[d.value],
  }));
}

/**
 * Résumé court des créneaux pour l'affichage d'une carte. `''` si aucune
 * préférence n'est posée.
 */
export function slotsSummary(slots: DeliverySlots): string {
  if (slots.mode === 'everyday') {
    return slots.slot ? `Tous les jours ${formatSlot(slots.slot)}` : '';
  }
  return WEEKDAYS.map((d) => {
    const slot = slots.byDay[d.value];
    return slot ? `${d.short} ${formatSlot(slot)}` : null;
  })
    .filter((entry): entry is string => entry !== null)
    .join(' · ');
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
  readonly adressesLivraison: readonly AdresseLivraison[];
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
