import type { DeliveryAddressView } from '@lfd/contracts';

import {
  deliveryDraftFrom,
  deliveryIssueOf,
  EMPTY_DELIVERY_DRAFT,
  toDeliveryPayload,
} from '../delivery-draft.model';
import {
  EMPTY_POSTAL_DRAFT,
  postalDraftFrom,
  postalIssue,
  toBillingPayload,
  toPostal,
  withPostal,
} from '../postal-draft.model';

/**
 * Ce que la **composition** promet, et qu'un compilateur ne suffit pas à tenir.
 *
 * Le brouillon d'adresse était un objet gras accompagné d'un drapeau `kind` qui
 * disait quels champs ignorer ; il est maintenant postal + consignes. Trois
 * choses doivent rester vraies après ce déplacement, et chacune casse en
 * silence : la frontière de la charge de facturation, la traversée du fragment
 * postal par un brouillon de livraison, et l'ordre des reproches.
 */
const VIEW: DeliveryAddressView = {
  id: 'adr_1',
  label: 'Boutique Bastille',
  ligne1: '12 rue de la Roquette',
  ligne2: 'Bâtiment B',
  codePostal: '75011',
  ville: 'Paris',
  pays: 'France',
  isDefault: true,
  specs: {
    note: 'Digicode 45A12, livrer au fournil',
    slots: { mode: 'everyday', slot: { start: '06:00', end: '08:00' } },
    deliveryContact: { prenom: 'Léa', nom: 'Martin', telephone: '0600000000' },
    gps: { lat: 48.8566, lng: 2.3522 },
    signatureRequired: true,
  },
};

describe('La part postale', () => {
  it('n’emporte NI note NI point GPS dans une charge de facturation', () => {
    const draft = { ...EMPTY_POSTAL_DRAFT, ligne1: '1 rue A', codePostal: '75001', ville: 'Paris' };

    const payload = toBillingPayload({ ...draft, note: 'Digicode', gpsLat: '48', gpsLng: '2' });

    // La frontière du contrat, pas une perte : une facture ne se livre pas.
    expect(Object.keys(payload).sort()).toEqual([
      'codePostal',
      'label',
      'ligne1',
      'ligne2',
      'pays',
      'ville',
    ]);
  });

  it('laisse les consignes de livraison INTACTES en traversant le fragment', () => {
    const draft = deliveryDraftFrom(VIEW);

    // Ce que rend le fragment de saisie : une adresse postale, rien de plus.
    const back = withPostal(draft, { ...toPostal(draft), city: 'Lyon' });

    expect(back.ville).toBe('Lyon');
    expect(back.contactNom).toBe('Martin');
    expect(back.signatureRequired).toBe(true);
    expect(back.everyStart).toBe('06:00');
  });

  it('préremplit un brouillon postal sans rien inventer de la livraison', () => {
    expect(postalDraftFrom(VIEW)).toEqual({
      ...EMPTY_POSTAL_DRAFT,
      label: 'Boutique Bastille',
      ligne1: '12 rue de la Roquette',
      ligne2: 'Bâtiment B',
      codePostal: '75011',
      ville: 'Paris',
      pays: 'France',
    });
  });
});

describe('Le brouillon de livraison', () => {
  it('fait l’aller-retour vue → brouillon → charge sans rien perdre', () => {
    const payload = toDeliveryPayload(deliveryDraftFrom(VIEW));

    expect(payload.isDefault).toBe(true);
    expect(payload.specs).toEqual(VIEW.specs);
  });

  it('reproche le LIEU avant les consignes', () => {
    // Une adresse sans voie ET sans contact : c'est la voie qu'on doit lire.
    const draft = { ...EMPTY_DELIVERY_DRAFT, contactPrenom: 'Léa' };

    expect(deliveryIssueOf(draft)).toBe(postalIssue(draft));
    expect(deliveryIssueOf(draft)).not.toBe('');
  });

  it('ne reproche rien à une adresse complète sans aucune consigne', () => {
    // Aucun créneau, aucun contact coché « pas de contact » : c'est valide.
    const draft = {
      ...EMPTY_DELIVERY_DRAFT,
      ligne1: '1 rue A',
      codePostal: '75001',
      ville: 'Paris',
      noContact: true,
    };

    expect(deliveryIssueOf(draft)).toBe('');
  });
});
