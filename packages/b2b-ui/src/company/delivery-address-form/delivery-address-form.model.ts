import type { DeliveryContact } from '@lfd/contracts';

import type { DeliveryDraft } from '../delivery-draft.model';
import {
  DELIVERY_SPECS_LABELS_FR,
  type DeliverySpecsLabels,
} from '../delivery-specs/delivery-specs.labels';

/** Les mots que le formulaire passe à `lfd-address-form` pour une LIVRAISON. */
export interface DeliveryPostalLabels {
  readonly legend: string;
  readonly labelHint: string;
  readonly line2Hint: string;
  readonly noteLabel: string;
  readonly notePlaceholder: string;
  readonly coordinatesLabel: string;
  readonly coordinatesHint: string;
}

/**
 * Les **libellés** du formulaire d'une adresse de livraison, en UNE entrée : la
 * case « par défaut », le postal et les consignes.
 *
 * Une seule entrée plutôt que trois, parce que l'appelant ne choisit pas de
 * traduire la moitié d'un formulaire : l'app cliente passe sa langue en bloc,
 * le back-office ne passe rien.
 */
export interface DeliveryAddressFormLabels {
  readonly defaultLabel: string;
  readonly defaultHint: string;
  readonly address: DeliveryPostalLabels;
  readonly specs: DeliverySpecsLabels;
}

/**
 * Le texte qu'écrivait `DeliveryAddressPanel` avant la mutualisation, mot pour
 * mot — le défaut, et ce que lit le back-office.
 *
 * `labelHint` et `coordinatesLabel` n'y étaient pas passés : ce sont les défauts
 * d'`AddressForm`, recopiés ici pour que rien ne change.
 */
export const DELIVERY_ADDRESS_FORM_LABELS_FR: DeliveryAddressFormLabels = {
  defaultLabel: 'Adresse de livraison par défaut',
  defaultHint: "utilisée d'office pour les prochaines commandes",
  address: {
    legend: 'Adresse postale',
    labelHint: 'ex. Siège, Boutique Bastille',
    line2Hint: 'bâtiment, étage, instructions de livraison…',
    noteLabel: 'Note pour les livreurs',
    notePlaceholder: "Code d'accès, étage, contact sur place, consignes de dépôt…",
    coordinatesLabel: 'Point GPS',
    coordinatesHint: 'lieux difficiles à localiser',
  },
  specs: DELIVERY_SPECS_LABELS_FR,
};

/** La case « par défaut » : le rang de l'adresse, rien d'autre ne bouge. */
export function withDefault(draft: DeliveryDraft, isDefault: boolean): DeliveryDraft {
  return { ...draft, isDefault };
}

/**
 * « Reprendre un contact connu » : recopie ses trois champs et lève « pas de
 * contact ». Les créneaux, le postal et la signature restent tels quels.
 */
export function withKnownContact(draft: DeliveryDraft, contact: DeliveryContact): DeliveryDraft {
  return {
    ...draft,
    noContact: false,
    contactPrenom: contact.prenom,
    contactNom: contact.nom,
    contactTel: contact.telephone,
  };
}
