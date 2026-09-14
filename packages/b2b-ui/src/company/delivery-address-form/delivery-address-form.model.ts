import type { DeliveryContact } from '@lfd/contracts';

import {
  ADDRESS_FORM_LABELS_FR,
  type AddressFormLabels,
} from '../../address/address-form/address-form.labels';
import type { DeliveryDraft } from '../delivery-draft.model';
import {
  DELIVERY_SPECS_LABELS_FR,
  type DeliverySpecsLabels,
} from '../delivery-specs/delivery-specs.labels';

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
  /** Le nom du groupe postal : ici il voisine d'autres groupes nommés, il en faut un. */
  readonly legend: string;
  readonly address: AddressFormLabels;
  readonly specs: DeliverySpecsLabels;
}

/**
 * Le texte qu'écrivait `DeliveryAddressPanel` avant la mutualisation, mot pour
 * mot — le défaut, et ce que lit le back-office.
 *
 * Le panneau ne passait que quatre mots à `AddressForm` ; les autres sont ses
 * défauts, repris de {@link ADDRESS_FORM_LABELS_FR} pour que rien ne change.
 */
export const DELIVERY_ADDRESS_FORM_LABELS_FR: DeliveryAddressFormLabels = {
  defaultLabel: 'Adresse de livraison par défaut',
  defaultHint: "utilisée d'office pour les prochaines commandes",
  legend: 'Adresse postale',
  address: {
    ...ADDRESS_FORM_LABELS_FR,
    line2Hint: 'bâtiment, étage, instructions de livraison…',
    noteLabel: 'Note pour les livreurs',
    notePlaceholder: "Code d'accès, étage, contact sur place, consignes de dépôt…",
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
