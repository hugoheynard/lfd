import {
  ADDRESS_FORM_LABELS_FR,
  type AddressFormLabels,
  entryModesOf,
} from '../address-form/address-form.labels';

describe('libellés d’AddressForm', () => {
  /** Le texte écrit en dur avant l'entrée : un écran qui ne passe rien ne change pas. */
  it('le défaut reprend mot pour mot le gabarit et les anciennes entrées', () => {
    expect(ADDRESS_FORM_LABELS_FR).toEqual({
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
    });
  });

  it('les modes de saisie du point portent les mots passés, valeurs inchangées', () => {
    expect(entryModesOf(ADDRESS_FORM_LABELS_FR)).toEqual([
      { value: 'pair', label: 'Deux champs' },
      { value: 'pasted', label: 'Point collé' },
    ]);
    const english: AddressFormLabels = {
      ...ADDRESS_FORM_LABELS_FR,
      entryModePair: 'Two fields',
      entryModePasted: 'Pasted point',
    };
    expect(entryModesOf(english)).toEqual([
      { value: 'pair', label: 'Two fields' },
      { value: 'pasted', label: 'Pasted point' },
    ]);
  });
});
