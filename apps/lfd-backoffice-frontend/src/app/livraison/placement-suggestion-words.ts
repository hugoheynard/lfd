import type {
  DeliveryNoPlacementReason,
  DeliveryPlacementSuggestionView,
  DeliverySuggestedPlacementView,
} from '@lfd/contracts';

/** Ce que dit l'écran quand aucune place n'est suggérée (CA7) : le cas, et le geste. */
const NO_PLACE: Readonly<Record<DeliveryNoPlacementReason, string>> = {
  capacity: 'Aucune place suggérée : aucune tournée n’a la place dans sa caisse.',
  zone: 'Aucune place suggérée : aucun véhicule en tournée n’est autorisé sur sa zone.',
  deadline: 'Aucune place suggérée : partout, elle manquerait son échéance.',
  no_round: 'Aucune place suggérée : aucune tournée au dépôt sans bac chargé.',
  unlocated: 'Aucune place suggérée : l’adresse n’est pas située.',
};

/** « entre l'arrêt 4 et 5 », « en tête », « après l'arrêt 3 », « seul arrêt ». */
export function placeLabel(
  place: Pick<DeliverySuggestedPlacementView, 'after' | 'stopCount'>,
): string {
  if (place.stopCount === 0) {
    return 'seul arrêt';
  }
  if (place.after === 0) {
    return 'en tête';
  }
  if (place.after >= place.stopCount) {
    return `après l’arrêt ${String(place.stopCount)}`;
  }
  return `entre l’arrêt ${String(place.after)} et ${String(place.after + 1)}`;
}

/**
 * « Place suggérée : Camionnette 2, entre l'arrêt 4 et 5 (+6 min, échéance
 * tenue) » — le passage n'est dit qu'au-delà du premier. Une place n'est
 * suggérée que si elle tient toutes les échéances : le serveur la refuse
 * sinon (`deadline`).
 */
export function placementSuggestionWords(suggestion: DeliveryPlacementSuggestionView): string {
  if (suggestion.status === 'none') {
    return NO_PLACE[suggestion.reason];
  }
  const passage = suggestion.passage > 1 ? ` (passage ${String(suggestion.passage)})` : '';
  return (
    `Place suggérée : ${suggestion.vehicleName}${passage}, ${placeLabel(suggestion)} ` +
    `(+${String(suggestion.extraMinutes)} min, échéance tenue)`
  );
}
