import { WEEKDAYS } from '../delivery-format';
import {
  contactIssueOf,
  EMPTY_DELIVERY_SPECS,
  signatureIssueOf,
  withNoContact,
} from '../delivery-draft.model';
import {
  DELIVERY_SPECS_LABELS_FR,
  type DeliverySpecsLabels,
  signatureOptionsOf,
} from '../delivery-specs/delivery-specs.labels';

describe('libellés de DeliverySpecs', () => {
  /**
   * Le défaut est le texte d'avant l'entrée, mot pour mot : le back-office ne
   * passe rien, et il ne doit pas changer d'un caractère.
   */
  it('le défaut reprend le texte écrit en dur avant l’entrée', () => {
    expect(DELIVERY_SPECS_LABELS_FR).toMatchObject({
      detailLegend: 'Détail de livraison',
      slotsLegend: 'Créneaux préférés',
      sameEveryDay: 'Le même créneau tous les jours',
      everyDay: 'Tous les jours',
      slotStart: 'Début',
      slotEnd: 'Fin',
      contactLegend: 'Contact sur place',
      knownContact: 'Reprendre un contact connu',
      firstName: 'Prénom',
      lastName: 'Nom',
      phone: 'Téléphone',
      signature: 'Signature à la remise',
    });
  });

  it('les jours par défaut sont ceux de WEEKDAYS, dans le même ordre', () => {
    expect(WEEKDAYS.map((day) => DELIVERY_SPECS_LABELS_FR.weekdays[day.value])).toEqual(
      WEEKDAYS.map((day) => day.label),
    );
  });

  it('le message de contact incomplet par défaut est celui de la règle', () => {
    const incomplete = { ...EMPTY_DELIVERY_SPECS, noContact: false };
    expect(DELIVERY_SPECS_LABELS_FR.contactIncomplete).toBe(contactIssueOf(incomplete));
  });

  it('les options de signature par défaut nomment le socle hérité', () => {
    expect(signatureOptionsOf(DELIVERY_SPECS_LABELS_FR, true)).toEqual([
      { value: 'inherit', label: 'Comme la société (exigée)' },
      { value: 'yes', label: 'Exigée' },
      { value: 'no', label: 'Non exigée' },
    ]);
    expect(signatureOptionsOf(DELIVERY_SPECS_LABELS_FR, false)[0]?.label).toBe(
      'Comme la société (non exigée)',
    );
  });

  it('des libellés passés remplacent le défaut, socle compris', () => {
    const english: DeliverySpecsLabels = {
      ...DELIVERY_SPECS_LABELS_FR,
      signatureInherit: 'Same as the company ({floor})',
      signatureFloorRequired: 'required',
      signatureFloorNotRequired: 'not required',
      signatureRequired: 'Required',
      signatureNotRequired: 'Not required',
    };
    expect(signatureOptionsOf(english, false).map((option) => option.label)).toEqual([
      'Same as the company (not required)',
      'Required',
      'Not required',
    ]);
  });
});

/**
 * Hugo, 2026-09-14 : « pas de contact sur place » et « signature exigée » étaient
 * saisissables ensemble — une signature que personne ne pouvait donner.
 */
describe('pas de signature exigée sans contact sur place', () => {
  const values = (floor: boolean, noContact: boolean): readonly string[] =>
    signatureOptionsOf(DELIVERY_SPECS_LABELS_FR, floor, noContact).map((option) => option.value);

  it('propose les trois réponses tant qu’il y a un contact', () => {
    expect(values(true, false)).toEqual(['inherit', 'yes', 'no']);
    expect(values(false, false)).toEqual(['inherit', 'yes', 'no']);
  });

  it('sans contact, retire « exigée » — et l’héritage quand la société l’exige', () => {
    expect(values(false, true)).toEqual(['inherit', 'no']);
    expect(values(true, true)).toEqual(['no']);
  });

  it('cocher « pas de contact » fait tomber une exigence posée sur l’adresse', () => {
    const draft = { ...EMPTY_DELIVERY_SPECS, signatureRequired: true };
    expect(withNoContact(draft, true, false)).toMatchObject({
      noContact: true,
      signatureRequired: false,
    });
  });

  it('cocher « pas de contact » fait tomber une exigence héritée de la société', () => {
    const draft = { ...EMPTY_DELIVERY_SPECS, signatureRequired: null };
    expect(withNoContact(draft, true, true).signatureRequired).toBe(false);
  });

  it('laisse l’héritage tel quel quand la société n’exige rien', () => {
    const draft = { ...EMPTY_DELIVERY_SPECS, signatureRequired: null };
    expect(withNoContact(draft, true, false).signatureRequired).toBeNull();
  });

  it('décocher ne rétablit rien', () => {
    const draft = { ...EMPTY_DELIVERY_SPECS, noContact: true, signatureRequired: false };
    expect(withNoContact(draft, false, true)).toMatchObject({
      noContact: false,
      signatureRequired: false,
    });
  });

  it('signale une exigence explicite sans contact, et rien d’autre', () => {
    expect(
      signatureIssueOf({ ...EMPTY_DELIVERY_SPECS, noContact: true, signatureRequired: true }),
    ).not.toBe('');
    expect(
      signatureIssueOf({ ...EMPTY_DELIVERY_SPECS, noContact: false, signatureRequired: true }),
    ).toBe('');
    expect(
      signatureIssueOf({ ...EMPTY_DELIVERY_SPECS, noContact: true, signatureRequired: null }),
    ).toBe('');
  });
});
