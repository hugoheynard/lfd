import type { DeliveryAddressBookRow } from '@lfd/contracts';

/** Une adresse du carnet, complète, dont on ne précise que ce qui compte. */
export function addressBookRowOf(
  overrides: Partial<DeliveryAddressBookRow> = {},
): DeliveryAddressBookRow {
  return {
    addressId: 'a1',
    companyId: 'c1',
    tradeName: 'Hôtel du Parc',
    legalName: 'Hôtel du Parc SAS',
    addressLabel: 'Hôtel du Parc',
    ligne1: '2 avenue du Parc',
    ligne2: '',
    codePostal: '73000',
    ville: 'Chambéry',
    pays: 'FR',
    isDefault: true,
    door: { lat: 45.56608, lng: 5.918 },
    parking: null,
    note: 'Sonner à la réception',
    deliveryContact: { prenom: 'Léa', nom: 'Martin', telephone: '06 12 34 56 78' },
    depositAllowed: false,
    doorstepRule: null,
    stopMinutes: null,
    signatureRequired: false,
    signatureSource: 'company',
    hasProcedure: false,
    ...overrides,
  };
}
