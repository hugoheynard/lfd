/**
 * Les **libellés** de `lfd-address-form` — tous : champs, exemples, mode de
 * saisie du point, et le mot « optionnel ».
 *
 * Le fragment en écrivait la plupart en dur, et n'en exposait que six en
 * entrées séparées. L'app cliente parle trois langues : une adresse à moitié
 * traduite est pire qu'une adresse en français, parce qu'elle a l'air d'un
 * oubli. Une seule entrée typée, dont le défaut est EXACTEMENT le texte
 * d'avant — les écrans qui ne passent rien ne changent pas d'un caractère.
 *
 * Pur, sans Angular : c'est ce qui laisse les tests du paquet (Jest, Node) le
 * vérifier.
 */
export interface AddressFormLabels {
  readonly label: string;
  readonly labelHint: string;
  readonly line1: string;
  readonly line1Placeholder: string;
  readonly line2: string;
  readonly line2Hint: string;
  readonly postalCode: string;
  readonly city: string;
  readonly country: string;
  readonly countryPlaceholder: string;
  /** Le mot posé à côté d'un champ ou d'un groupe facultatif. */
  readonly optional: string;
  /** Libellé de la note — un mot de l'appelant : « consignes », « note pour les livreurs »… */
  readonly noteLabel: string;
  readonly notePlaceholder: string;
  readonly coordinatesLabel: string;
  readonly coordinatesHint: string;
  /** Le nom, pour l'assistance technique, du choix entre deux champs et un point collé. */
  readonly entryModeAria: string;
  readonly entryModePair: string;
  readonly entryModePasted: string;
  readonly latitude: string;
  readonly latitudePlaceholder: string;
  readonly longitude: string;
  readonly longitudePlaceholder: string;
  readonly point: string;
  readonly pointHint: string;
  readonly pointPlaceholder: string;
}

/** Le texte d'avant l'entrée, mot pour mot — le défaut, et ce que lisent les écrans qui ne passent rien. */
export const ADDRESS_FORM_LABELS_FR: AddressFormLabels = {
  label: "Nom de l'adresse",
  labelHint: 'ex. Siège, Boutique Bastille',
  line1: 'Adresse',
  line1Placeholder: 'n° et voie',
  line2: 'Complément',
  line2Hint: 'bâtiment, étage, digicode…',
  postalCode: 'Code postal',
  city: 'Ville',
  country: 'Pays',
  countryPlaceholder: 'Choisir un pays…',
  optional: 'optionnel',
  noteLabel: 'Consignes d’accès',
  notePlaceholder: 'Digicode, étage, où déposer…',
  coordinatesLabel: 'Point GPS',
  coordinatesHint: 'pour les lieux qu’une adresse ne suffit pas à trouver',
  entryModeAria: 'Mode de saisie du point',
  entryModePair: 'Deux champs',
  entryModePasted: 'Point collé',
  latitude: 'Latitude',
  latitudePlaceholder: '48.8566',
  longitude: 'Longitude',
  longitudePlaceholder: '2.3522',
  point: 'Point',
  pointHint: 'collez « 48.8566, 2.3522 » depuis une carte',
  pointPlaceholder: '48.8566, 2.3522',
};

/** Les deux façons de saisir un point, nommées dans la langue de l'écran. */
export function entryModesOf(
  labels: AddressFormLabels,
): readonly { readonly value: string; readonly label: string }[] {
  return [
    { value: 'pair', label: labels.entryModePair },
    { value: 'pasted', label: labels.entryModePasted },
  ];
}
