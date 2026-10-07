/**
 * Profil du client professionnel — le compte d'un établissement qui commande à
 * La Folie Coffee. Aucun champ n'est `?` optionnel : les valeurs absentes sont
 * la chaîne vide (`''`) ou `null` pour le représentant. C'est un choix
 * volontaire — sous `exactOptionalPropertyTypes` un `?` interdit d'écrire
 * `undefined` explicitement, ce qui alourdit chaque formulaire ; une chaîne vide
 * se teste (`[empty]="!value"`) et se réécrit sans cérémonie.
 */

/**
 * Conditions de paiement accordées au client. `per_order` n'est pas un terme :
 * c'est l'absence de crédit, le socle offert à tout le monde. 60 et 90 jours ont
 * été retirés — ils promettaient un crédit qu'aucune mécanique ne savait
 * recouvrer (cf. `deferredTermSchema`).
 */
export type PaymentTerm = 'per_order' | 'monthly';

/** Libellés lisibles, dans l'ordre d'affichage du sélecteur. */
export const PAYMENT_TERMS: readonly { readonly value: PaymentTerm; readonly label: string }[] = [
  { value: 'per_order', label: 'À la commande' },
  { value: 'monthly', label: 'Mensuel — relevé de fin de mois' },
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
  readonly vatNumber: string;
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
export type AddressKind = 'billing' | 'delivery';

/** Une adresse postale (facturation ou point de livraison). */
export interface Address {
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
export const WEEKDAYS: readonly {
  readonly value: Weekday;
  readonly label: string;
  readonly short: string;
}[] = [
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

/** Une liste de créneaux (ou aucune, `null`) pour chacun des sept jours. */
export type SlotListByDay = Readonly<Record<Weekday, readonly DeliverySlot[] | null>>;

/**
 * Créneaux préférés de livraison — la forme `slotList` du contrat, la seule
 * depuis le retrait de l'ancien créneau unique (`plan-retrait-slots.md`,
 * 2026-10-07). Deux régimes exclusifs :
 * - `everyday` — la même liste tous les jours,
 * - `perDay` — une liste par jour.
 * Une liste vide (ou un jour `null`) = aucune préférence, le transporteur choisit.
 */
export type PreferredSlots =
  | { readonly mode: 'everyday'; readonly slots: readonly DeliverySlot[] }
  | { readonly mode: 'perDay'; readonly byDay: SlotListByDay };

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
 * optionnel. Isolé de `Address` pour que seule une livraison le porte.
 */
export interface DeliverySpecs {
  /** Consignes libres pour le livreur (code, étage, dépôt) — `''` si aucune. */
  readonly note: string;
  readonly slotList: PreferredSlots;
  /** Personne à contacter à la livraison, ou `null` (aucun contact dédié). */
  readonly deliveryContact: DeliveryContact | null;
  /** Point GPS pour un lieu difficile à localiser, ou `null`. */
  readonly gps: GpsPoint | null;
}

/** Une adresse de livraison = une adresse postale enrichie de ses consignes. */
export type DeliveryAddress = Address & DeliverySpecs;

/** Aucun créneau, pour les sept jours. */
export const EMPTY_SLOT_BY_DAY: SlotListByDay = {
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
  slotList: { mode: 'everyday', slots: [] },
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

/** Les créneaux d'un jour ; un jour `null` = aucun. */
function slotsOfDay(list: PreferredSlots, day: Weekday): readonly DeliverySlot[] {
  return list.mode === 'everyday' ? list.slots : (list.byDay[day] ?? []);
}

/**
 * Une adresse est **commandable** dès qu'elle porte au moins un créneau, un
 * jour. Sans créneau, on ne sait pas quand livrer — l'adresse est inutilisable.
 */
export function hasDeliverySlot(list: PreferredSlots): boolean {
  return WEEKDAYS.some((d) => slotsOfDay(list, d.value).length > 0);
}

/** Une ligne de la vue hebdomadaire : un jour et ses créneaux (aucun = liste vide). */
export interface WeeklySlotRow {
  readonly short: string;
  readonly label: string;
  readonly slots: readonly DeliverySlot[];
}

/**
 * Déplie les créneaux en sept lignes pour la **visualisation** d'une carte. En
 * régime `everyday`, chaque jour porte la même liste ; en `perDay`, la sienne.
 */
export function weeklySlots(list: PreferredSlots): readonly WeeklySlotRow[] {
  return WEEKDAYS.map((d) => ({
    short: d.short,
    label: d.label,
    slots: slotsOfDay(list, d.value),
  }));
}

/**
 * Résumé court des créneaux pour l'affichage d'une carte. `''` si aucune
 * préférence n'est posée.
 */
export function slotsSummary(list: PreferredSlots): string {
  const text = (slots: readonly DeliverySlot[]): string => slots.map(formatSlot).join(', ');
  if (list.mode === 'everyday') {
    return list.slots.length > 0 ? `Tous les jours ${text(list.slots)}` : '';
  }
  return WEEKDAYS.map((d) => {
    const slots = slotsOfDay(list, d.value);
    return slots.length > 0 ? `${d.short} ${text(slots)}` : null;
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
  readonly billingAddress: Address;
  readonly deliveryAddresses: readonly DeliveryAddress[];
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
