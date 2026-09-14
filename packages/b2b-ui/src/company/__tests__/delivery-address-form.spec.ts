import type { DeliveryAddressView } from '@lfd/contracts';

import {
  DELIVERY_ADDRESS_FORM_LABELS_FR,
  type DeliveryAddressFormLabels,
  withDefault,
  withKnownContact,
} from '../delivery-address-form/delivery-address-form.model';
import { deliveryDraftFrom, toDeliveryPayload } from '../delivery-draft.model';
import { DELIVERY_SPECS_LABELS_FR } from '../delivery-specs/delivery-specs.labels';
import { toPostal, withPostal } from '../postal-draft.model';

/**
 * Le formulaire partagé d'une adresse de livraison (`lfd-delivery-address-form`).
 *
 * Ce runner est Node, sans banc Angular (`jest.config.cjs`) : on éprouve ici ce
 * que le composant délègue — ses libellés et chaque mise à jour du brouillon —,
 * et le build AOT des deux apps éprouve son gabarit.
 */

/** Une livraison chargée de consignes : ce qu'une correction ne doit jamais perdre. */
const CHALET: DeliveryAddressView = {
  id: 'adr_1',
  label: 'Chalet',
  ligne1: '1 route du Col',
  ligne2: '',
  codePostal: '73150',
  ville: "Val d'Isère",
  pays: 'France',
  isDefault: false,
  specs: {
    note: 'Porte bleue',
    slots: { mode: 'everyday', slot: { start: '06:00', end: '08:00' } },
    deliveryContact: { prenom: 'Léa', nom: 'Martin', telephone: '06 11 22 33 44' },
    gps: { lat: 45.4486, lng: 6.9806 },
    signatureRequired: true,
  },
};

describe('formulaire d’adresse de livraison', () => {
  describe('libellés', () => {
    /** Le texte que `DeliveryAddressPanel` écrivait en dur : le back-office ne change pas. */
    it('le défaut reprend mot pour mot le panneau d’avant la mutualisation', () => {
      expect(DELIVERY_ADDRESS_FORM_LABELS_FR).toEqual({
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
      });
    });

    it('des libellés passés se composent sans toucher au défaut', () => {
      const english: DeliveryAddressFormLabels = {
        ...DELIVERY_ADDRESS_FORM_LABELS_FR,
        defaultLabel: 'Default delivery address',
        address: { ...DELIVERY_ADDRESS_FORM_LABELS_FR.address, legend: 'Postal address' },
        specs: { ...DELIVERY_SPECS_LABELS_FR, contactLegend: 'On-site contact' },
      };
      expect(english.address.legend).toBe('Postal address');
      expect(english.specs.contactLegend).toBe('On-site contact');
      expect(DELIVERY_ADDRESS_FORM_LABELS_FR.address.legend).toBe('Adresse postale');
      expect(DELIVERY_SPECS_LABELS_FR.contactLegend).toBe('Contact sur place');
    });
  });

  describe('chaque sous-bloc met à jour le brouillon, et rien d’autre', () => {
    it('la case « par défaut » ne change que le rang', () => {
      const draft = deliveryDraftFrom(CHALET);
      const checked = withDefault(draft, true);

      expect(checked).toEqual({ ...draft, isDefault: true });
      expect(withDefault(checked, false)).toEqual(draft);
    });

    it('le postal change le lieu, la note et le point — et garde créneaux, contact, signature', () => {
      const draft = deliveryDraftFrom(CHALET);
      const moved = withPostal(draft, {
        ...toPostal(draft),
        city: 'Tignes',
        postalCode: '73320',
        note: 'Porte verte',
        latitude: '45.47',
        longitude: '6.91',
      });
      const payload = toDeliveryPayload(moved);

      expect(payload).toMatchObject({ ville: 'Tignes', codePostal: '73320' });
      expect(payload.specs).toEqual({
        ...CHALET.specs,
        note: 'Porte verte',
        gps: { lat: 45.47, lng: 6.91 },
      });
    });

    it('reprendre un contact connu recopie ses trois champs et lève « pas de contact »', () => {
      const draft = { ...deliveryDraftFrom(CHALET), noContact: true };
      const picked = withKnownContact(draft, {
        prenom: 'Hugo',
        nom: 'Heynard',
        telephone: '06 12 44 08 71',
      });

      expect(picked).toEqual({
        ...draft,
        noContact: false,
        contactPrenom: 'Hugo',
        contactNom: 'Heynard',
        contactTel: '06 12 44 08 71',
      });
    });
  });

  /** Une correction qui ne touche à rien rend exactement les consignes chargées. */
  it('conserve les consignes existantes à l’aller-retour', () => {
    expect(toDeliveryPayload(deliveryDraftFrom(CHALET))).toEqual({
      label: 'Chalet',
      ligne1: '1 route du Col',
      ligne2: '',
      codePostal: '73150',
      ville: "Val d'Isère",
      pays: 'France',
      isDefault: false,
      specs: CHALET.specs,
    });
  });
});
