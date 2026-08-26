/**
 * Une **adresse postale**, et rien d'autre.
 *
 * Candidate à `fold-ng` : ce fichier ne connaît ni société, ni livraison, ni
 * retrait — d'où l'API en anglais, comme le reste de fold. Ce qui relève du
 * métier (créneaux, contact sur place, point par défaut) reste chez
 * l'appelant, qui compose.
 *
 * La **note** en fait partie, et ce n'est pas évident : de l'extérieur on
 * l'appelle « note pour les livreurs », mais ce qu'elle décrit est le LIEU —
 * un digicode, un étage, où déposer quand personne n'ouvre. Elle reste vraie
 * quel que soit celui qui vient, et elle suit l'adresse quand on la réutilise.
 * Ce qui relève vraiment de la livraison — créneaux, contact sur place, point
 * par défaut — reste chez l'appelant. Elle n'est pas dans
 * {@link DEFAULT_POSTAL_FIELDS} pour autant : une adresse de facturation ne se
 * livre pas.
 *
 * Champs absents = chaîne vide, jamais `undefined` : un formulaire n'a pas
 * d'état « pas encore de champ », il a un champ vide. Les coordonnées sont
 * elles aussi des chaînes — ce type sert de brouillon de saisie autant que de
 * valeur affichée, et un champ à moitié tapé n'est pas un nombre.
 */
export interface PostalAddress {
  /** Nom d'usage — « Siège », « Boutique Bastille ». Vide = anonyme. */
  readonly label: string;
  readonly line1: string;
  /** Complément : bâtiment, étage, digicode. */
  readonly line2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly country: string;
  /** Point GPS, pour les lieux qu'une adresse ne suffit pas à trouver. */
  readonly latitude: string;
  readonly longitude: string;
  /**
   * Consignes libres sur le lieu — ce qu'une ligne d'adresse ne peut pas dire.
   * Distincte de {@link line2}, qui est le complément qu'on écrit sur une
   * enveloppe ; celle-ci ne s'écrit nulle part, elle se lit sur place.
   */
  readonly note: string;
}

/** Les champs qu'un formulaire d'adresse peut porter, tous facultatifs. */
export type PostalField =
  'label' | 'line1' | 'line2' | 'postalCode' | 'city' | 'country' | 'note' | 'coordinates';

/** Les six champs postaux — ce que montre un formulaire qui ne demande rien. */
export const DEFAULT_POSTAL_FIELDS: readonly PostalField[] = [
  'label',
  'line1',
  'line2',
  'postalCode',
  'city',
  'country',
];

/** Tous les champs — note et coordonnées comprises. */
export const ALL_POSTAL_FIELDS: readonly PostalField[] = [
  ...DEFAULT_POSTAL_FIELDS,
  'note',
  'coordinates',
];

export const EMPTY_POSTAL_ADDRESS: PostalAddress = {
  label: '',
  line1: '',
  line2: '',
  postalCode: '',
  city: '',
  country: '',
  latitude: '',
  longitude: '',
  note: '',
};

/**
 * Les lignes à écrire, dans l'ordre postal, sans le nom d'usage — celui-ci est
 * un titre, pas une ligne d'adresse. Les vides sautent : une adresse sans
 * complément ne laisse pas un trou.
 */
export function postalLines(address: PostalAddress): readonly string[] {
  const locality = `${address.postalCode} ${address.city}`.trim();
  return [address.line1, address.line2, locality, address.country]
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** La même adresse sur une ligne — récapitulatifs, listes, e-mails. */
export function formatPostalInline(address: PostalAddress): string {
  return postalLines(address).join(', ');
}

/** Ce qui manque pour que l'adresse soit postable. Vide = complète. */
export function postalIssueOf(address: PostalAddress): string {
  const complete =
    address.line1.trim() !== '' && address.postalCode.trim() !== '' && address.city.trim() !== '';
  return complete ? '' : 'Renseignez la voie, le code postal et la ville.';
}

/** Les deux coordonnées, ou aucune, et dans les bornes. Vide = valide. */
export function coordinatesIssueOf(address: PostalAddress): string {
  const lat = address.latitude.trim();
  const lng = address.longitude.trim();
  if (lat === '' && lng === '') {
    return '';
  }
  if (lat === '' || lng === '') {
    return 'Renseignez la latitude ET la longitude, ou laissez les deux vides.';
  }
  return inBounds(lat, lng) ? '' : 'Coordonnées hors limites (latitude ±90, longitude ±180).';
}

function inBounds(lat: string, lng: string): boolean {
  const nlat = Number(lat);
  const nlng = Number(lng);
  return (
    Number.isFinite(nlat) && Number.isFinite(nlng) && Math.abs(nlat) <= 90 && Math.abs(nlng) <= 180
  );
}

/** Le point sur une ligne, tel qu'on le colle d'une carte. Vide si incomplet. */
export function formatCoordinates(address: PostalAddress): string {
  const lat = address.latitude.trim();
  const lng = address.longitude.trim();
  return lat === '' || lng === '' ? '' : `${lat}, ${lng}`;
}

/**
 * Le chemin inverse : ce qu'on colle depuis une carte — « 48.8566, 2.3522 »,
 * séparé par une virgule, un point-virgule ou une espace — redevient deux
 * champs. Ce qui ne ressemble pas à un point rend `null`, et l'appelant garde
 * la frappe telle quelle plutôt que de l'effacer sous les doigts.
 */
export function parseCoordinates(pasted: string): { latitude: string; longitude: string } | null {
  const parts = pasted
    .trim()
    .split(/[;,\s]+/u)
    .filter((part) => part !== '');
  if (parts.length !== 2) {
    return null;
  }
  const [latitude, longitude] = parts;
  if (latitude === undefined || longitude === undefined || !inBounds(latitude, longitude)) {
    return null;
  }
  return { latitude, longitude };
}
