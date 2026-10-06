import type { AddressPointSuggestionView, GpsPoint } from '@lfd/contracts';

/**
 * Les mots et les liens de « Carnet à corriger » (`gps-y-aller-et-position.md`,
 * §6). Pur : ni horloge ni réseau.
 */

const GOOGLE_DIR = 'https://www.google.com/maps/dir/?api=1';
const GOOGLE_SEARCH = 'https://www.google.com/maps/search/?api=1';

/** « 45.56512, 5.91820 » — cinq décimales, le mètre. */
export function coordinatesOf(point: GpsPoint): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

function placeOf(point: GpsPoint): string {
  return `${String(point.lat)},${String(point.lng)}`;
}

/**
 * Le lien carte : un itinéraire À PIED du point enregistré au point suggéré,
 * pour voir les deux et l'écart d'un coup d'œil ; le seul point suggéré quand
 * rien n'est enregistré. Aucune donnée ne part du serveur : c'est un lien.
 */
export function mapHrefOf(suggestion: AddressPointSuggestionView): string {
  const suggested = placeOf(suggestion.suggested);
  return suggestion.recorded === null
    ? `${GOOGLE_SEARCH}&query=${suggested}`
    : `${GOOGLE_DIR}&origin=${placeOf(suggestion.recorded)}&destination=${suggested}&travelmode=walking`;
}

/**
 * La phrase de la carte : « La porte de livraison semble être à 120 m du point
 * enregistré (4 livraisons concordantes). »
 */
export function suggestionSentenceOf(suggestion: AddressPointSuggestionView): string {
  const what =
    suggestion.kind === 'door' ? 'La porte de livraison semble être' : 'Le livreur semble se garer';
  const where =
    suggestion.distanceM === null
      ? 'ici, et le carnet n’a aucun point pour cette adresse'
      : `à ${String(suggestion.distanceM)} m ${referenceOf(suggestion)}`;
  const deliveries =
    suggestion.kind === 'door'
      ? `${String(suggestion.concordant)} livraisons concordantes`
      : `${String(suggestion.concordant)} arrivées concordantes`;
  return `${what} ${where} (${deliveries}).`;
}

function referenceOf(suggestion: AddressPointSuggestionView): string {
  if (suggestion.kind === 'parking') {
    return suggestion.reference === 'geocode'
      ? 'de l’adresse géocodée'
      : 'du point enregistré (stationnement, sinon porte)';
  }
  return suggestion.reference === 'geocode' ? 'de l’adresse géocodée' : 'du point enregistré';
}

/** Le titre court de la carte : « Porte » ou « Stationnement ». */
export function kindLabelOf(suggestion: AddressPointSuggestionView): string {
  return suggestion.kind === 'door' ? 'Porte' : 'Stationnement';
}

/** La clé d'une suggestion : une adresse en a au plus une par genre. */
export function suggestionKeyOf(suggestion: AddressPointSuggestionView): string {
  return `${suggestion.addressId}:${suggestion.kind}`;
}
