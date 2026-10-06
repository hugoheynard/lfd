import type { AddressPointSuggestionView } from '@lfd/contracts';

/** Une suggestion de « Carnet à corriger », complète, dont on ne précise que ce qui compte. */
export function suggestionOf(
  overrides: Partial<AddressPointSuggestionView> = {},
): AddressPointSuggestionView {
  return {
    addressId: 'a1',
    kind: 'door',
    customerLabel: 'Hôtel du Parc SAS',
    addressLabel: 'Hôtel du Parc',
    addressText: '2 avenue du Parc, 73000 Chambéry',
    suggested: { lat: 45.56608, lng: 5.918 },
    recorded: { lat: 45.565, lng: 5.918 },
    reference: 'carnet',
    distanceM: 120,
    concordant: 4,
    ...overrides,
  };
}
